import { AnyMessageContent, delay, proto } from "baileys";
import { ExtractorMessagesType, MessagesVerifiedPlatformType } from "../types/extractor/messages";
import { ExtractZod } from "../types/general";
import { RelayTextType } from "../types/relay/text";
import { Client } from "./Client";
import { RelayReplyType } from "../types/relay/reply";
import { z } from "zod/v4";
import { extractJids } from "../utils/helpers";
import { RelayForwardType } from "../types/relay/forward";
import { RelayImageEnumType, RelayImageType } from "../types/relay/image";
import { RelayVideoEnumType, RelayVideoType } from "../types/relay/video";
import { RelayAudioEnumType, RelayAudioType } from "../types/relay/audio";
import { RelayStickerEnumType, RelayStickerType } from "../types/relay/sticker";
import { RelayEditType } from "../types/relay/edit";
import { JsonDBInterface } from "../plugins";
import { MessagesExtractor } from "../extractor/messages";
import { RelayDeleteType } from "../types/relay/delete";
import { RelayRejectType } from "../types/relay/reject";
import { RelayPresenceType } from "../types/relay/presence";

type RelayInitialType = {
  isAudio?: boolean;
  disabledPresence?: boolean;
};

export class Relay {
  private client!: Client;
  private message!: z.infer<typeof ExtractorMessagesType>;

  db!: JsonDBInterface;
  ctx!: Client & { db: JsonDBInterface };

  bind(client: Client, db: JsonDBInterface) {
    this.client = client;
    this.db = db;

    this.ctx = client;
    this.ctx.db = db;

    this.client.on("messages", (ctx) => {
      this.message = ctx;
    });
  }

  private async initial(props?: RelayInitialType) {
    await delay(0);

    if (!props?.disabledPresence) {
      if (this.client.props?.autoPresence && props?.isAudio) {
        this.client.socket?.sendPresenceUpdate("recording", this.message?.roomId);
      } else {
        this.client.socket?.sendPresenceUpdate("composing", this.message?.roomId);
      }
    }
  }

  // GENERAL RELAY

  async text(props: ExtractZod<typeof RelayTextType>) {
    await this.initial();

    const params = RelayTextType.parse(props);

    let extend = { contextInfo: {} } as any;

    if (this.client.props.autoMentions) {
      extend.contextInfo.mentionedJid = extractJids(this.message.text);
    }

    if (typeof params == "string") {
      if (this.client.socket) {
        const res = await this.client.socket.sendMessage(this.message?.roomId, {
          text: params,
          ...extend,
        });
        return await MessagesExtractor(this.ctx, res);
      }
    }

    if (typeof params == "object") {
      const obj = { ...extend, ...params.options };

      if (this.client.socket) {
        if (params.text != "$$media$$") {
          obj.text = params?.text;
        }

        const res = await this.client.socket.sendMessage(params?.roomId || this.message?.roomId, obj);
        return await MessagesExtractor(this.ctx, res);
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
        const res = await this.client.socket.sendMessage(this.message?.roomId, { text: params, ...extend }, options);
        return await MessagesExtractor(this.ctx, res);
      }
    }

    if (typeof params == "object") {
      const obj = { ...extend, ...params.options };

      if (this.client.socket) {
        if (params.text != "$$media$$") {
          obj.text = params?.text;
        }

        const res = await this.client.socket.sendMessage(params?.roomId || this.message?.roomId, obj, options);
        return await MessagesExtractor(this.ctx, res);
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

    if (typeof params == "string") {
      if (this.client.socket) {
        const res = await this.client.socket.sendMessage(this.message?.roomId, { text: params, ...extend });
        return await MessagesExtractor(this.ctx, res);
      }
    }

    if (typeof params == "object") {
      const obj = { ...extend, ...params.options };

      if (params.isForwardMany) {
        extend.contextInfo.forwardingScore = 999999;
      }

      if (this.client.socket) {
        if (params.text != "$$media$$") {
          obj.text = params?.text;
        }

        const res = await this.client.socket.sendMessage(params?.roomId || this.message?.roomId, obj);
        return await MessagesExtractor(this.ctx, res);
      }
    }
  }

  async edit(props: ExtractZod<typeof RelayEditType>) {
    await this.initial({ disabledPresence: true });

    const params = RelayEditType.parse(props);
    const message = params.message();

    const res = await this.client.socket.sendMessage(message?.key?.remoteJid, { text: params.text, edit: message?.key });
    return await MessagesExtractor(this.ctx, res);
  }

  async delete(props: ExtractZod<typeof RelayDeleteType>) {
    await this.initial({ disabledPresence: true });

    const params = RelayDeleteType.parse(props);
    const message = params.message();

    const res = await this.client.socket.sendMessage(message?.key?.remoteJid, { delete: message?.key });
    return await MessagesExtractor(this.ctx, res);
  }

  async reject(props: ExtractZod<typeof RelayRejectType>) {
    const params = RelayRejectType.parse(props);
    return await this.client.socket.rejectCall(params.callId, params.callerId);
  }

  async presence(props: ExtractZod<typeof RelayPresenceType>) {
    const params = RelayPresenceType.parse(props);
    const opts = {
      typing: "composing",
      recording: "recording",
      online: "available",
      offline: "unavailable",
      paused: "paused",
    } as const;

    return await this.client.socket.sendPresenceUpdate(opts[params], this.message.roomId);
  }

  // MEDIA RELAY

  async image(type: ExtractZod<typeof RelayImageEnumType>, props: ExtractZod<typeof RelayImageType>) {
    await this.initial();

    const enumType = RelayImageEnumType.parse(type);
    const params = RelayImageType.parse(props);

    const options: AnyMessageContent = { image: typeof params.image === "string" ? { url: params.image } : params.image, caption: params.text, viewOnce: params.viewOnce };

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  async sticker(type: ExtractZod<typeof RelayStickerEnumType>, props: ExtractZod<typeof RelayStickerType>) {
    await this.initial();

    const enumType = RelayStickerEnumType.parse(type);
    const params = RelayStickerType.parse(props);

    const options: AnyMessageContent = { sticker: typeof params.sticker === "string" ? { url: params.sticker } : params.sticker };

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  async video(type: ExtractZod<typeof RelayVideoEnumType>, props: ExtractZod<typeof RelayVideoType>) {
    await this.initial();

    const enumType = RelayVideoEnumType.parse(type);
    const params = RelayVideoType.parse(props);

    const options: AnyMessageContent = { video: typeof params.video === "string" ? { url: params.video } : params.video, caption: params.text, viewOnce: params.viewOnce };

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  async audio(type: ExtractZod<typeof RelayAudioEnumType>, props: ExtractZod<typeof RelayAudioType>) {
    const enumType = RelayAudioEnumType.parse(type);
    const params = RelayAudioType.parse(props);

    const options: AnyMessageContent = { audio: typeof params.audio === "string" ? { url: params.audio } : params.audio, viewOnce: params.viewOnce };

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  async voice(type: ExtractZod<typeof RelayAudioEnumType>, props: ExtractZod<typeof RelayAudioType>) {
    const enumType = RelayAudioEnumType.parse(type);
    const params = RelayAudioType.parse(props);

    const options: AnyMessageContent = { audio: typeof params.audio === "string" ? { url: params.audio } : params.audio, ptt: true, viewOnce: params.viewOnce };

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  async note(type: ExtractZod<typeof RelayVideoEnumType>, props: ExtractZod<typeof RelayVideoType>) {
    await this.initial();

    const enumType = RelayVideoEnumType.parse(type);
    const params = RelayVideoType.parse(props);

    const options: AnyMessageContent = { video: typeof params.video === "string" ? { url: params.video } : params.video, caption: params.text, ptv: true };

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  async gif(type: ExtractZod<typeof RelayVideoEnumType>, props: ExtractZod<typeof RelayVideoType>) {
    await this.initial();

    const enumType = RelayVideoEnumType.parse(type);
    const params = RelayVideoType.parse(props);

    const options: AnyMessageContent = { video: typeof params.video === "string" ? { url: params.video } : params.video, gifPlayback: true };

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }
}
