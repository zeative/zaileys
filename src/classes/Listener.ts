import { ConnectionState, DisconnectReason, jidNormalizedUser, proto, WACallEvent } from "baileys";
import chalk from "chalk";
import QRCode from "qrcode";
import { CallsExtractor } from "../extractor/calls";
import { MessagesExtractor } from "../extractor/messages";
import { DatabaseHandler } from "../modules/database";
import { toJson } from "../utils/helpers";
import { Client } from "./Client";

export class Listener {
  client: Client & { db: any };

  async bind(client: Client) {
    this.client = client as never;
    this.client.db = await DatabaseHandler(client.props);

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

    // Listen for session-related events
    this.client.socket?.ev.on("creds.update", () => {
      // Check if we're in the middle of session processing
      if (this.client.spinner.text && this.client.spinner.text.includes("Processing session changes")) {
        return; // Don't interfere with ongoing session processing
      }
    });

    // Monitor for session closing events in the underlying socket
    if (this.client.socket?.ws) {
      const originalEmit = this.client.socket.ws.emit.bind(this.client.socket.ws);
      this.client.socket.ws.emit = (event: string, ...args: any[]) => {
        if (event === "error" && args[0]) {
          const errorMessage = args[0].message || args[0].toString();
          if (
            errorMessage.includes("Closing open session in favor of incoming prekey bundle") ||
            errorMessage.includes("Closing stale open session for new outgoing prekey bundle") ||
            errorMessage.includes("Closing session: SessionEntry")
          ) {
            this.handleSessionClosing();
          }
        }
        return originalEmit(event, ...args);
      };
    }
  }

  private async handleSessionClosing() {
    if (!this.client.spinner.text || !this.client.spinner.text.includes("Processing session changes")) {
      this.client.spinner.start("Processing session changes...");

      // Wait for session processing to complete
      await new Promise((resolve) => setTimeout(resolve, 3000));

      this.client.spinner.success("Session processing completed");
    }
  }

  async connection(update: Partial<ConnectionState>) {
    const { connection, lastDisconnect, qr } = update;
    this.client.emit("connection", { status: "connecting" });

    if (this.client.props.authType === "qr" && qr) {
      this.client.spinner.info(`Please scan the QR\n\n${await QRCode.toString(qr, { type: "terminal", small: true })}`);
      return;
    }

    if (connection === "close") {
      const code = toJson(lastDisconnect?.error)?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || "";
      const isReconnect = code !== DisconnectReason.loggedOut || code === DisconnectReason.restartRequired;

      // Handle session closing scenarios with spinner
      if (
        errorMessage.includes("Closing open session in favor of incoming prekey bundle") ||
        errorMessage.includes("Closing stale open session for new outgoing prekey bundle") ||
        errorMessage.includes("Closing session: SessionEntry")
      ) {
        this.client.spinner.start("Processing session changes...");

        // Wait for session processing to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));

        this.client.spinner.success("Session processing completed");
        return;
      }

      this.client.spinner.error(`[Connection Closed] [${code}]\n${errorMessage} \n`);

      if (code === 401 || code === 405 || code === 500) {
        this.client.spinner.error("Invalid session, please delete manually");
        this.client.spinner.error(`Session "${this.client.props.session}" has not valid, please delete it`);
        return;
      }

      if (isReconnect) {
        // Use auto-reload mechanism instead of direct initialize
        this.client.spinner.warn("Connection lost. Attempting auto-reload...");
        await (this.client as any).autoReload();
      }
    } else if (connection === "open") {
      const id = jidNormalizedUser(this.client.socket.user.id).split("@")[0];
      const name = this.client.socket.user.name || this.client.socket.user.verifiedName;

      // Reset retry count on successful connection
      (this.client as any).resetRetryCount();
      this.client.spinner.success(`Connected as ${chalk.green(name || id)}\n`);
      this.client.emit("connection", { status: "open" });
    }
  }

  async messages(message: proto.IWebMessageInfo) {
    if (this.client.props?.autoRead) {
      await this.client.socket.readMessages([message?.key]);
    }

    const extract = await MessagesExtractor(this.client, message);
    if (extract) {
      this.client.emit("messages", extract);
    }
  }

  async calls(caller: WACallEvent) {
    if (this.client.props?.autoRejectCall) {
      await this.client.socket.rejectCall(caller.id, caller.from);
    }

    const extract = await CallsExtractor(this.client, caller);
    this.client.emit("calls", extract);
  }
}
