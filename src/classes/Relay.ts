import { delay } from "baileys";
import { ExtractorMessagesType } from "../types/extractor/messages";
import { ExtractZod } from "../types/general";
import { MessagesVerifiedPlatformType } from "../types/extractor/messages";
import { RelayTextType } from "../types/relay/text";
import { toJson } from "../utils/helpers";
import { Client } from "./Client";
import { RelayReplyType } from "../types/relay/reply";
import { z } from "zod/v4";

export class Relay {
  private client: Client
  private message: z.infer<typeof ExtractorMessagesType>

  bind(client: Client) {
    this.client = client;

    this.client.on('messages', ctx => {
      this.message = ctx
    })
  }

  async text(props: ExtractZod<typeof RelayTextType>) {
    await delay(0);
    const params = RelayTextType.parse(props)

    if (typeof params == 'string') {
      await this.client.socket.sendMessage(this.message?.roomId, { text: params });
    }

    if (typeof params == 'object') {
      await this.client.socket.sendMessage(params?.roomId || this.message?.roomId,{ text: params?.text });
    }
  }

  async reply(props: ExtractZod<typeof RelayReplyType>) {
    await delay(0);
    const params = RelayReplyType.parse(props)
    const quoted = this.message?.message()

    if (this.client.props?.fakeReply?.provider) {
      quoted.key.remoteJid = MessagesVerifiedPlatformType[this.client.props.fakeReply.provider]
    }

    if (typeof params == 'string') {
      await this.client.socket.sendMessage(this.message?.roomId, { text: params }, { quoted });
    }

    if (typeof params == 'object') {
      await this.client.socket.sendMessage(params?.roomId || this.message?.roomId, { text: params?.text }, { quoted });
    }
  }
}
