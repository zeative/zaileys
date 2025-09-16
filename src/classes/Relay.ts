import { delay, proto } from "baileys";
import { ExtractorMessagesType, MessagesVerifiedPlatformType } from "../types/extractor/messages";
import { ExtractZod } from "../types/general";
import { RelayTextType } from "../types/relay/text";
import { Client } from "./Client";
import { RelayReplyType } from "../types/relay/reply";
import { z } from "zod/v4";
import { extractJids } from "../utils/helpers";
import { RelayForwardType } from "../types/relay/forward";

export class Relay {
  private client!: Client;
  private message!: z.infer<typeof ExtractorMessagesType>;

  bind(client: Client) {
    this.client = client;

    this.client.on("messages", (ctx) => {
      this.message = ctx;
    });
  }

  private async initial(isAudio?: boolean) {
    await delay(0);

    if (this.client.props?.autoPresence) {
      this.client.socket?.sendPresenceUpdate("composing", this.message?.roomId);
    }

    if (this.client.props?.autoPresence && isAudio) {
      this.client.socket?.sendPresenceUpdate("recording", this.message?.roomId);
    }
  }

  async text(props: ExtractZod<typeof RelayTextType>) {
    await this.initial();

    const params = RelayTextType.parse(props);

    let extend = { contextInfo: {} } as any;

    if (this.client.props.autoMentions) {
      extend.contextInfo.mentionedJid = extractJids(this.message.text);
    }

    if (typeof params == "string") {
      if (this.client.socket) {
        await this.client.socket.sendMessage(this.message?.roomId, {
          text: params,
          ...extend,
        });
      }
    }

    if (typeof params == "object" && params !== null) {
      if (this.client.socket && params.text) {
        await this.client.socket.sendMessage(params?.roomId || this.message?.roomId, { text: params.text, ...extend });
      }
    }
  }

  async reply(props: ExtractZod<typeof RelayReplyType>) {
    await this.initial();

    const params = RelayReplyType.parse(props);
    const quoted = this.message?.message();

    let extend = { contextInfo: {} } as any;

    if (this.client.props.autoMentions) {
      extend.contextInfo.mentionedJid = extractJids(this.message.text);
    }

    if (this.client.props?.fakeReply?.provider) {
      const provider = this.client.props.fakeReply.provider as keyof typeof MessagesVerifiedPlatformType;
      if (quoted && quoted.key) {
        quoted.key.remoteJid = MessagesVerifiedPlatformType[provider];
      }
    }

    const options = quoted ? { quoted: quoted as proto.IWebMessageInfo } : undefined;

    if (typeof params == "string") {
      if (this.client.socket) {
        await this.client.socket.sendMessage(this.message?.roomId, { text: params, ...extend }, options);
      }
    }

    if (typeof params == "object") {
      if (this.client.socket) {
        await this.client.socket.sendMessage(params?.roomId || this.message?.roomId, { text: params?.text, ...extend }, options);
      }
    }
  }

  async forward(props: ExtractZod<typeof RelayForwardType>) {
    await this.initial();

    const params = RelayForwardType.parse(props);
    const quoted = this.message?.message();

    let extend = { contextInfo: { isForwarded: true } } as any;

    if (this.client.props.autoMentions) {
      extend.contextInfo.mentionedJid = extractJids(this.message.text);
    }

    if (this.client.props?.fakeReply?.provider) {
      const provider = this.client.props.fakeReply.provider as keyof typeof MessagesVerifiedPlatformType;
      if (quoted && quoted.key) {
        quoted.key.remoteJid = MessagesVerifiedPlatformType[provider];
      }
    }

    const options = quoted ? { quoted: quoted as proto.IWebMessageInfo } : undefined;

    if (typeof params == "string") {
      if (this.client.socket) {
        await this.client.socket.sendMessage(this.message?.roomId, { text: params, ...extend }, options);
      }
    }

    if (typeof params == "object") {
      if (params.isForwardMany) {
        extend.contextInfo.forwardingScore = 999999;
      }

      if (this.client.socket) {
        await this.client.socket.sendMessage(params?.roomId || this.message?.roomId, { text: params?.text, ...extend }, options);
      }
    }
  }
}
