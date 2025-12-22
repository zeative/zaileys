export interface FireAndForgetOptions {
  concurrency?: number;
  timeout?: number;
  onError?: (error: Error, task: Task) => void | Promise<void>;
}

export interface TaskOptions {
  [x: string]: number;
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

  constructor(options?: FireAndForgetOptions) {
    this.concurrency = options?.concurrency || 10;
    this.timeout = options?.timeout || 30000; // 30s default
    this.onError = options?.onError || this._defaultErrorHandler;

    this.queue = [];
    this.running = new Set();
    this.completed = 0;
    this.failed = 0;
    this.isClosing = false;
    this.closeResolve = null;
  }

  /**
   * Add task to queue (fire and forget)
   * @param {Function} fn - Async function to execute
   * @param {Object} options - Task options
   * @returns {string} Task ID
   */
  add(fn: () => Promise<any>, options?: TaskOptions) {
    if (this.isClosing) {
      throw new Error('Queue is closing, cannot add new tasks');
    }

    const task = {
      id: this._generateId(),
      fn,
      priority: options?.priority || 0,
      timeout: options?.timeout || this.timeout,
      retries: options?.retries || 0,
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

    this._process();
    return task.id;
  }

  /**
   * Add multiple tasks at once
   */
  addBulk(tasks: BulkTask[]) {
    return tasks.map(({ fn, options }) => this.add(fn, options));
  }

  /**
   * Process queue
   */
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
  }

  /**
   * Execute single task with timeout and retry
   */
  async _executeTask(task: Task) {
    try {
      await this._withTimeout(task.fn(), task.timeout);
      this.completed++;
    } catch (err) {
      // Retry logic
      if (task.retries < task.maxRetries) {
        task.retries++;
        this.queue.unshift(task); // Add to front
      } else {
        this.failed++;
        this.onError(err, task);
      }
    } finally {
      this.running.delete(task);
      this._process();
    }
  }

  /**
   * Execute with timeout
   */
  _withTimeout(promise: Promise<any>, ms: number) {
    return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Task timeout')), ms))]);
  }

  /**
   * Graceful shutdown - wait for all tasks
   * @param {number} maxWait - Maximum wait time in ms (0 = infinite)
   * @returns {Promise<void>}
   */
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

  /**
   * Force shutdown - kill all tasks immediately
   */
  forceClose() {
    this.queue = [];
    this.running.clear();
    this.isClosing = true;
    this.closeResolve?.();
  }

  /**
   * Get queue stats
   */
  getStats() {
    return {
      queued: this.queue.length,
      running: this.running.size,
      completed: this.completed,
      failed: this.failed,
      total: this.completed + this.failed,
    };
  }

  /**
   * Check if queue is idle
   */
  isIdle() {
    return this.queue.length === 0 && this.running.size === 0;
  }

  /**
   * Wait until idle
   */
  async waitUntilIdle(checkInterval = 100) {
    while (!this.isIdle()) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }
  }

  /**
   * Default error handler
   */
  _defaultErrorHandler(err: Error, task: Task) {
    console.error(`[FireAndForget] Task ${task.id} failed:`, err);
  }

  /**
   * Generate unique ID
   */
  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
