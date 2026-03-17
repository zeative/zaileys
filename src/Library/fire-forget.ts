import crypto from 'node:crypto';

export const Priority = {
  CRITICAL: 20,  // time-sensitive
  HIGH:     10,  // user-facing
  NORMAL:    0,  // default
  LOW:      -10, // background
} as const;

export interface FireAndForgetOptions {
  concurrency?: number;
  timeout?: number;
  onError?: (error: Error, task: Task) => void | Promise<void>;
}

export interface TaskOptions {
  priority?: number;
  timeout?: number;
  maxRetries?: number;
}

export interface Task {
  id: string;
  fn: () => Promise<any>;
  priority: number;
  timeout: number;
  retries: number;
  maxRetries: number;
  createdAt: number;
}

export interface QueueStats {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  total: number;
}

export interface BulkTask {
  fn: () => Promise<any>;
  options?: TaskOptions;
}

export class FireAndForget {
  concurrency: number;
  timeout: number;
  onError: (error: Error, task: Task) => void | Promise<void>;

  queue: Task[];
  running: Set<Task>;
  completed: number;
  failed: number;
  isClosing: boolean;
  closeResolve: ((value: void | PromiseLike<void>) => void) | null;
  private _idleResolvers: Array<() => void> = [];

  constructor(options?: FireAndForgetOptions) {
    this.concurrency = options?.concurrency || 20;
    this.timeout = options?.timeout || 30000; // 30s default
    this.onError = options?.onError || this._defaultErrorHandler;

    this.queue = [];
    this.running = new Set();
    this.completed = 0;
    this.failed = 0;
    this.isClosing = false;
    this.closeResolve = null;
  }

  add(fn: () => Promise<any>, options?: TaskOptions) {
    if (this.isClosing) {
      throw new Error('Queue is closing, cannot add new tasks');
    }

    const task = {
      id: this._generateId(),
      fn,
      priority: options?.priority || 0,
      timeout: options?.timeout || this.timeout,
      retries: 0,
      maxRetries: options?.maxRetries || 0,
      createdAt: Date.now(),
    };

    // Insert by priority (higher = first)
    const idx = this.queue.findIndex((t) => t.priority < task.priority);
    if (idx === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(idx, 0, task);
    }

    void this._process();
    return task.id;
  }

  addBulk(tasks: BulkTask[]) {
    return tasks.map(({ fn, options }) => this.add(fn, options));
  }

  async _process() {
    while (this.running.size < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      this.running.add(task);
      this._executeTask(task);
    }

    // Check if closing and all done
    if (this.isClosing && this.running.size === 0 && this.queue.length === 0) {
      this.closeResolve?.();
    }

    if (this.isIdle()) {
      this._idleResolvers.forEach((r) => r());
      this._idleResolvers = [];
    }
  }

  async _executeTask(task: Task) {
    try {
      await this._withTimeout(task.fn(), task.timeout);
      this.completed++;
    } catch (err) {
      if (task.retries < task.maxRetries) {
        task.retries++;
        const delay = Math.min(500 * (2 ** task.retries), 30000);
        setTimeout(() => {
          if (!this.isClosing) {
            this.queue.unshift(task);
            void this._process();
          }
        }, delay);
      } else {
        this.failed++;
        this.onError(err as Error, task);
      }
    } finally {
      this.running.delete(task);
      void this._process();
    }
  }

  _withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Task timeout')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async close(maxWait = 0) {
    this.isClosing = true;

    // Nothing to wait for
    if (this.running.size === 0 && this.queue.length === 0) {
      return;
    }

    const closePromise = new Promise<void>((resolve) => {
      this.closeResolve = resolve;
    });

    if (maxWait > 0) {
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, maxWait));
      await Promise.race([closePromise, timeoutPromise]);
    } else {
      await closePromise;
    }
  }

  forceClose() {
    this.queue = [];
    this.running.clear();
    this.isClosing = true;
    this.closeResolve?.();
  }

  getStats() {
    return {
      queued: this.queue.length,
      running: this.running.size,
      completed: this.completed,
      failed: this.failed,
      total: this.completed + this.failed,
    };
  }

  isIdle() {
    return this.queue.length === 0 && this.running.size === 0;
  }

  async waitUntilIdle(): Promise<void> {
    if (this.isIdle()) return;
    return new Promise<void>((resolve) => {
      this._idleResolvers.push(resolve);
    });
  }

  _defaultErrorHandler(err: Error, task: Task) {
    console.error(`[FireForget] Task ${task.id} failed:`, err.message);
  }

  _generateId() {
    return crypto.randomUUID();
  }
}

export const fireForget = new FireAndForget();
