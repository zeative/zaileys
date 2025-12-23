type AnyObj = Record<PropertyKey, any>;

export class ClassProxy {
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
            const v = Reflect.get(src, prop, src);
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
}
