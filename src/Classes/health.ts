import makeWASocket from 'baileys';
import { store } from '../Modules/store';
import { repairSessionKeys } from '../Utils/session';
import { Client } from './client';

type WASocket = ReturnType<typeof makeWASocket>;

export interface HealthOptions {
  checkIntervalMs?: number;
  staleThresholdMs?: number;
  cooldownMs?: number;
  maxRetries?: number;
}

const DEFAULT_OPTIONS: Required<HealthOptions> = {
  checkIntervalMs: 60_000,
  staleThresholdMs: 120_000,
  cooldownMs: 60_000,
  maxRetries: 3,
};

export class HealthManager {
  private lastActivityTime = Date.now();
  private lastRecoveryTime = 0;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRecovering = false;
  private retryCount = 0;
  private options: Required<HealthOptions>;

  constructor(private client: Client, options: HealthOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  start() {
    if (this.checkInterval) return;

    this.lastActivityTime = Date.now();
    this.setupActivityListeners();

    this.checkInterval = setInterval(() => this.check(), this.options.checkIntervalMs);
    store.spinner.success(' Health manager monitoring started');
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
    const socket = this.client.socket;
    if (!socket?.ev) return;

    const activityEvents = ['messages.upsert', 'message-receipt.update', 'presence.update', 'chats.update', 'connection.update'] as const;

    for (const event of activityEvents) {
      socket.ev.on(event as any, () => this.touch());
    }
  }

  private async check() {
    if (this.isRecovering) return;

    const now = Date.now();
    const staleTime = now - this.lastActivityTime;

    if (staleTime > this.options.staleThresholdMs) {
      store.spinner.warn(` Connection stale for ${Math.round(staleTime / 1000)}s. Triggering recovery...`);
      await this.recover();
    }
  }

  private isInCooldown(): boolean {
    const now = Date.now();
    return now - this.lastRecoveryTime < this.options.cooldownMs;
  }

  async recover() {
    if (this.isRecovering) return;

    if (this.isInCooldown()) {
      store.spinner.warn(' Recovery in cooldown, skipping...');
      return;
    }

    if (this.retryCount >= this.options.maxRetries) {
      store.spinner.error(` Max health recovery retries (${this.options.maxRetries}) reached.`);
      return;
    }

    this.isRecovering = true;
    this.lastRecoveryTime = Date.now();
    this.retryCount++;

    try {
      store.spinner.warn(` Health recovery attempt ${this.retryCount}/${this.options.maxRetries}...`);

      const socket = this.client.socket;

      // Check if socket is actually dead or just quiet
      if ((socket as any)?.ws?.readyState === 1) {
        try {
          // Simple ping-like check
          await socket.fetchStatus(socket.user?.id || '');
          this.touch();
          store.spinner.success(' Health check passed, session is alive');
          return;
        } catch {
          store.spinner.warn(' Health check failed, session unresponsive');
        }
      }

      // If we're here, we need to repair and reconnect
      await repairSessionKeys(this.client.options.session);

      store.spinner.warn(' Re-initializing client connection...');
      await this.client.initialize();

      this.touch();
      store.spinner.success(' Health recovery successful');
    } catch (err) {
      store.spinner.error(` Health recovery failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.isRecovering = false;
    }
  }
}
