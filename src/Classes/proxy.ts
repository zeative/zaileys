type AnyObj = Record<PropertyKey, any>;

export class NativeProxy {
  classInjection<B extends AnyObj, M extends AnyObj[]>(base: B, mixins: [...M]): B & M[number] {
    const len = mixins.length;

    return new Proxy(base, {
      get(target, prop, receiver) {
        if (prop in target) {
          const v = Reflect.get(target, prop, receiver);
          return typeof v === 'function' ? (v as Function).bind(target) : v;
        }

        for (let i = 0; i < len; i++) {
          const src = mixins[i];
          if (prop in src) {
            const v = Reflect.get(src, prop, receiver);
            return typeof v === 'function' ? (v as Function).bind(src) : v;
          }
        }
        return undefined;
      },

      set(target, prop, value, receiver) {
        if (prop in target) return Reflect.set(target, prop, value, receiver);

        for (let i = 0; i < len; i++) {
          const src = mixins[i];
          if (prop in src) return Reflect.set(src, prop, value, receiver);
        }
        return Reflect.set(target, prop, value, receiver);
      },

      has(_, prop) {
        if (prop in base) return true;
        for (let i = 0; i < len; i++) {
          if (prop in mixins[i]) return true;
        }
        return false;
      },

      ownKeys() {
        const keys: (string | symbol)[] = [];

        for (const k of Reflect.ownKeys(base)) {
          keys.push(k as string | symbol);
        }
        for (let i = 0; i < len; i++) {
          for (const k of Reflect.ownKeys(mixins[i])) {
            if (!keys.includes(k as string | symbol)) {
              keys.push(k as string | symbol);
            }
          }
        }
        return keys;
      },

      getOwnPropertyDescriptor(_, prop) {
        let desc = Object.getOwnPropertyDescriptor(base, prop);
        if (desc) return desc;

        for (let i = 0; i < len; i++) {
          desc = Object.getOwnPropertyDescriptor(mixins[i], prop);
          if (desc) return desc;
        }
        return undefined;
      },
    }) as B & M[number];
  }

  functionInjection<T extends (...args: any[]) => any>(
    fn: T,
    options: {
      inject?: (variables: Record<string, any>) => void;
      before?: (args: any[]) => void;
      after?: (result: any, variables: Record<string, any>) => any;
    },
  ): T {
    const originalFn = fn;

    return ((...args: any[]) => {
      // Create scope object untuk variable tracking
      const scope: Record<string, any> = {};

      // Before hook
      if (options.before) {
        options.before(args);
      }

      // Wrap original function untuk intercept variable creation
      const wrappedFn = new Proxy(originalFn, {
        apply(target, thisArg, argumentsList) {
          // Inject variables SEBELUM function execute
          if (options.inject) {
            // Parse function body untuk extract variable names
            const fnStr = target.toString();
            const varMatches = fnStr.match(/(?:let|const|var)\s+(\w+)/g) || [];

            // Initialize variables in scope
            varMatches.forEach((match) => {
              const varName = match.split(/\s+/)[1];
              // Initialize dengan default values berdasarkan pattern di code
              if (fnStr.includes(`${varName} = ""`)) scope[varName] = '';
              else if (fnStr.includes(`${varName} = []`)) scope[varName] = [];
              else if (fnStr.includes(`${varName} = {}`)) scope[varName] = {};
              else scope[varName] = undefined;
            });

            // Execute injection
            options.inject(scope);
          }

          // Execute original function
          let result = Reflect.apply(target, thisArg, argumentsList);

          // After hook with access to result and variables
          if (options.after) {
            result = options.after(result, scope) ?? result;
          }

          return result;
        },
      });

      return wrappedFn(...args);
    }) as T;
  }

  runtimeInjection<T extends (...args: any[]) => any>(
    fn: T,
    options: {
      inject?: string; // Raw code to inject
      position?: 'start' | 'end' | 'before-return'; // Where to inject
      before?: (args: any[]) => void;
      after?: (result: any) => any;
    },
  ): T {
    const fnStr = fn.toString();

    // Find function body boundaries (robust untuk semua format)
    const firstBrace = fnStr.indexOf('{');
    const lastBrace = fnStr.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) {
      console.error('Cannot parse function: no braces found');
      console.error('Function string:', fnStr.substring(0, 200) + '...');
      return fn;
    }

    let body = fnStr.substring(firstBrace + 1, lastBrace);

    // Extract parameters (handle various formats)
    let params: string[] = [];

    // Try arrow function format: (a,b,c)=>
    let paramMatch = fnStr.match(/^(?:async\s+)?\((.*?)\)\s*=>/);

    // Try regular function format: function name(a,b,c)
    if (!paramMatch) {
      paramMatch = fnStr.match(/^(?:async\s+)?function\s*\w*\s*\((.*?)\)/);
    }

    if (paramMatch) {
      params = paramMatch[1]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          // Extract just the parameter name, remove defaults and types
          // Handle: "jid", "content", "options={}"
          const cleanParam = p.split('=')[0].split(':')[0].trim();
          return cleanParam;
        });
    }

    // Inject code based on position
    let modifiedBody = body;

    if (options.inject) {
      const injectionCode = options.inject;

      switch (options.position || 'start') {
        case 'start':
          modifiedBody = `\n${injectionCode}\n${body}`;
          break;

        case 'end':
          modifiedBody = `${body}\n${injectionCode}\n`;
          break;

        case 'before-return':
          // Find last return statement (simple search)
          const lastReturnPos = body.lastIndexOf('return');

          if (lastReturnPos >= 0) {
            modifiedBody = body.substring(0, lastReturnPos) + '\n' + injectionCode + '\n' + body.substring(lastReturnPos);
          } else {
            // No return found, inject at end
            modifiedBody = `${body}\n${injectionCode}\n`;
          }
          break;
      }
    }

    // Check if async
    const isAsync = fnStr.startsWith('async');

    // Build new function
    try {
      const newFn = isAsync ? new (Function as any)(...params, `return (async function() { ${modifiedBody} })();`) : new Function(...params, modifiedBody);

      // Wrap with before/after hooks
      return ((...args: any[]) => {
        if (options.before) options.before(args);
        let result = newFn(...args);
        if (options.after) result = options.after(result) ?? result;
        return result;
      }) as T;
    } catch (error) {
      console.error('Error creating injected function:', error);
      console.error('Params:', params);
      console.error('Modified body preview:', modifiedBody.substring(0, 500) + '...');
      return fn; // Fallback
    }
  }

  wrapWithInjection<T extends (...args: any[]) => any>(
    fn: T,
    injector: {
      modifyArgs?: (args: any[]) => any[];
      modifyResult?: (result: any) => any;
      beforeCall?: (args: any[]) => void;
      afterCall?: (result: any, args: any[]) => void;
    },
  ): T {
    const isAsync = fn.constructor.name === 'AsyncFunction';

    if (isAsync) {
      return (async (...args: any[]) => {
        if (injector.beforeCall) injector.beforeCall(args);

        const modifiedArgs = injector.modifyArgs ? injector.modifyArgs(args) : args;
        let result = await (fn as any)(...modifiedArgs);

        if (injector.afterCall) injector.afterCall(result, args);
        if (injector.modifyResult) result = injector.modifyResult(result);

        return result;
      }) as T;
    } else {
      return ((...args: any[]) => {
        if (injector.beforeCall) injector.beforeCall(args);

        const modifiedArgs = injector.modifyArgs ? injector.modifyArgs(args) : args;
        let result = fn(...modifiedArgs);

        if (injector.afterCall) injector.afterCall(result, args);
        if (injector.modifyResult) result = injector.modifyResult(result);

        return result;
      }) as T;
    }
  }
}
