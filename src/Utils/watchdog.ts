import makeWASocket from 'baileys';
import { store } from '../Modules/store';
import { repairSessionKeys } from './session';

type WASocket = ReturnType<typeof makeWASocket>;
type WatchdogOptions = {
  session: string;
  checkIntervalMs?: number;
  staleThresholdMs?: number;
  cooldownMs?: number;
  maxRetries?: number;
  onRecovery?: () => Promise<void>;
};

const DEFAULT_CHECK_INTERVAL = 60_000;
const DEFAULT_STALE_THRESHOLD = 120_000;
const DEFAULT_COOLDOWN = 60_000;
const DEFAULT_MAX_RETRIES = 3;

export class SessionWatchdog {
  private lastActivityTime = Date.now();
  private lastRecoveryTime = 0;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRecovering = false;
  private retryCount = 0;
  private options: Required<WatchdogOptions>;

  constructor(options: WatchdogOptions) {
    this.options = {
      checkIntervalMs: DEFAULT_CHECK_INTERVAL,
      staleThresholdMs: DEFAULT_STALE_THRESHOLD,
      cooldownMs: DEFAULT_COOLDOWN,
      maxRetries: DEFAULT_MAX_RETRIES,
      onRecovery: async () => {},
      ...options,
    };
  }

  start() {
    if (this.checkInterval) return;

    this.lastActivityTime = Date.now();
    this.setupActivityListeners();

    this.checkInterval = setInterval(() => this.check(), this.options.checkIntervalMs);

    store.spinner.success(' Session watchdog started');
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  touch() {
    this.lastActivityTime = Date.now();
    this.retryCount = 0;
  }

  private setupActivityListeners() {
    const socket = store.get('socket') as WASocket;
    if (!socket?.ev) return;

    const activityEvents = ['messages.upsert', 'message-receipt.update', 'presence.update', 'chats.update'] as const;

    for (const event of activityEvents) {
      socket.ev.on(event as any, () => this.touch());
    }
  }

  private async check() {
    if (this.isRecovering) return;

    const now = Date.now();
    const staleTime = now - this.lastActivityTime;

    if (staleTime > this.options.staleThresholdMs) {
      await this.recover();
    }
  }

  private isInCooldown(): boolean {
    const now = Date.now();
    const timeSinceLastRecovery = now - this.lastRecoveryTime;
    return timeSinceLastRecovery < this.options.cooldownMs;
  }

  private async recover() {
    if (this.isRecovering) return;
    if (this.isInCooldown()) {
      store.spinner.warn(' Recovery in cooldown, skipping...');
      return;
    }
    if (this.retryCount >= this.options.maxRetries) {
      store.spinner.error(` Max recovery retries (${this.options.maxRetries}) reached. Manual restart required.`);
      return;
    }

    this.isRecovering = true;
    this.lastRecoveryTime = Date.now();
    this.retryCount++;

    try {
      store.spinner.warn(` Session recovery attempt ${this.retryCount}/${this.options.maxRetries}...`);

      const socket = store.get('socket') as WASocket;

      const wsState = (socket as any)?.ws?.readyState;
      if (wsState === 1) {
        try {
          await socket.fetchStatus(socket.user?.id || '');
          this.touch();
          store.spinner.success(' Session health check passed');
          return;
        } catch {}
      }

      await repairSessionKeys(this.options.session);

      store.spinner.warn(' Forcing reconnection...');
      await this.options.onRecovery();

      this.touch();
    } catch (err) {
      store.spinner.error(' Recovery failed');
    } finally {
      this.isRecovering = false;
    }
  }

  async forceRecovery() {
    if (this.isInCooldown()) {
      store.spinner.warn(' Recovery blocked by cooldown');
      return;
    }
    await this.recover();
  }
}

let watchdogInstance: SessionWatchdog | null = null;

export const createWatchdog = (options: WatchdogOptions): SessionWatchdog => {
  if (watchdogInstance) {
    watchdogInstance.stop();
  }
  watchdogInstance = new SessionWatchdog(options);
  return watchdogInstance;
};

export const getWatchdog = (): SessionWatchdog | null => watchdogInstance;
