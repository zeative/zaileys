import { delay, proto } from "baileys";
import { ExtractorMessagesType, MessagesVerifiedPlatformType } from "../types/extractor/messages";
import { ExtractZod } from "../types/general";
import { RelayTextType } from "../types/relay/text";
import { Client } from "./Client";
import { RelayReplyType } from "../types/relay/reply";
import { z } from "zod/v4";
import { extractJids } from "../utils/helpers";
import _ from "lodash";

export class Relay {
  private client!: Client;
  private message!: z.infer<typeof ExtractorMessagesType>;

  bind(client: Client) {
    this.client = client;

    this.client.on("messages", (ctx) => {
      this.message = ctx;
    });
  }

  async text(props: ExtractZod<typeof RelayTextType>) {
    await delay(0);
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
    await delay(0);
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
}
