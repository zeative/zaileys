import { ConnectionState, delay, DisconnectReason, jidNormalizedUser, proto, WACallEvent } from "baileys";
import chalk from "chalk";
import QRCode from "qrcode";
import { CallsExtractor } from "../extractor/calls";
import { MessagesExtractor } from "../extractor/messages";
import { toJson } from "../utils/helpers";
import { Client } from "./Client";
import { JsonDBInterface } from "../plugins/JsonDB";
import _ from "lodash";

export class Listener {
  client!: Client & { db: JsonDBInterface };

  async bind(client: Client, db: JsonDBInterface) {
    this.client = client;
    this.client.db = db;

    this.client.socket?.ev.on("connection.update", async (update) => {
      await this.connection(update);
    });

    this.client.socket?.ev.on("messages.upsert", async ({ messages }) => {
      for (const message of messages) {
        await this.messages(message);
      }
    });

    this.client.socket?.ev.on("call", async (callers) => {
      for (const caller of callers) {
        await this.calls(caller);
      }
    });

    this.client.socket?.ev.on("creds.update", () => {});

    if (this.client.socket?.ws) {
      const originalEmit = this.client.socket.ws.emit.bind(this.client.socket.ws);
      this.client.socket.ws.emit = (event: string, ...args: unknown[]) => {
        if (event === "error" && args[0]) {
          const errorMessage = (args[0] as Error).message || args[0]?.toString();
          if (
            _.includes(errorMessage, "Closing open session in favor of incoming prekey bundle") ||
            _.includes(errorMessage, "Closing stale open session for new outgoing prekey bundle") ||
            _.includes(errorMessage, "Closing session: SessionEntry")
          ) {
            this.handleSessionClosing();
          }
        }
        return originalEmit(event, ...args);
      };
    }
  }

  private async handleSessionClosing() {
    this.client.spinner.start("Processing session changes...");
    await delay(3000);
    this.client.spinner.success("Session processing completed");
  }

  async connection(update: Partial<ConnectionState>) {
    const { connection, lastDisconnect, qr } = update;
    this.client.emit("connection", { status: "connecting" });

    if (this.client.props.authType === "qr" && qr) {
      this.client.spinner.info(`Please scan the QR\n\n${await QRCode.toString(qr, { type: "terminal", small: true })}`);
      return;
    }

    if (connection === "close") {
      const code = toJson<{ output?: { statusCode?: number } }>(lastDisconnect?.error)?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || "";
      const isReconnect = typeof code === "number" && code !== DisconnectReason.loggedOut;

      if (
        _.includes(errorMessage, "Closing open session in favor of incoming prekey bundle") ||
        _.includes(errorMessage, "Closing stale open session for new outgoing prekey bundle") ||
        _.includes(errorMessage, "Closing session: SessionEntry")
      ) {
        this.client.spinner.start("Processing session changes...");

        await new Promise((resolve) => setTimeout(resolve, 2000));

        this.client.spinner.success("Session processing completed");
        return;
      }

      this.client.spinner.error(`[Connection Closed] [${code}] ${errorMessage}`);

      if (code === 401 || code === 405 || code === 500) {
        this.client.spinner.error("Invalid session, please delete manually");
        this.client.spinner.error(`Session "${this.client.props.session}" has not valid, please delete it`);
        return;
      }

      if (isReconnect) {
        this.client.spinner.warn("Connection lost. Attempting auto-reload...");
        const clientRecord = this.client as unknown as Record<string, unknown>;
        if (typeof clientRecord.autoReload === "function") {
          await clientRecord.autoReload();
        }
      }
    } else if (connection === "open") {
      if (this.client.socket?.user) {
        const id = jidNormalizedUser(this.client.socket.user.id).split("@")[0];
        const name = this.client.socket.user.name || this.client.socket.user.verifiedName;

        const clientRecord = this.client as unknown as Record<string, unknown>;
        if (typeof clientRecord.resetRetryCount === "function") {
          clientRecord.resetRetryCount();
        }
        this.client.spinner.success(`Connected as ${chalk.green(name || id)}`);
        this.client.emit("connection", { status: "open" });
      }
    }
  }

  async messages(message: proto.IWebMessageInfo) {
    if (this.client.props?.autoRead && this.client.socket) {
      if (message?.key) {
        await this.client.socket.readMessages([message.key]);
      }
    }

    const extract = await MessagesExtractor(this.client, message);

    if (extract) {
      this.client.emit("messages", extract);
    }
  }

  async calls(caller: WACallEvent) {
    if (this.client.props?.autoRejectCall && this.client.socket) {
      await this.client.socket.rejectCall(caller.id, caller.from);
    }

    const extract = await CallsExtractor(this.client, caller);
    this.client.emit("calls", extract);
  }
}
