import { MiddlewareContextType } from '../Types/middleware';

export type MiddlewareNext = () => Promise<void> | void;
export type MiddlewareHandler<T> = (ctx: MiddlewareContextType, next: MiddlewareNext) => Promise<void> | void;

export class Middleware<T> {
  private stack: MiddlewareHandler<T>[] = [];

  use(handler: MiddlewareHandler<T>) {
    this.stack.push(handler);
    return this;
  }

  async run(ctx: MiddlewareContextType) {
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw 'next() called multiple times';
      index = i;

      const fn = this.stack[i];
      if (!fn) return;

      try {
        await fn(ctx, () => dispatch(i + 1));
      } catch (err) {
        console.error('Middleware error:', err);
        throw err;
      }
    };

    await dispatch(0);
  }
}
