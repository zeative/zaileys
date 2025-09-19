import { AnyMessageContent, delay, proto } from "baileys";
import { ExtractorMessagesType, MessagesVerifiedPlatformType } from "../types/extractor/messages";
import { ExtractZod } from "../types/general";
import { RelayTextType } from "../types/relay/text";
import { Client } from "./Client";
import { RelayReplyType } from "../types/relay/reply";
import { z } from "zod/v4";
import { extractJids, toString } from "../utils/helpers";
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
import { RelayReactionType } from "../types/relay/reaction";
import { RelayLocationEnumType, RelayLocationType } from "../types/relay/location";
import { RelayContactEnumType, RelayContactType } from "../types/relay/contact";
import { RelayPollEnumType, RelayPollType } from "../types/relay/poll";
import { RelayDocumentEnumType, RelayDocumentType } from "../types/relay/document";
import { RelayButtonEnumType, RelayButtonType } from "../types/relay/button";
import { RelayGroupCreateType } from "../types/relay/group/create";
import { RelayGroupActionType } from "../types/relay/group/action";
import { RelayGroupUpdateType } from "../types/relay/group/update";
import { RelayGroupSettingsType } from "../types/relay/group/settings";
import { RelayGroupLeaveType } from "../types/relay/group/leave";
import { RelayGroupLinksType } from "../types/relay/group/links";
import { RelayGroupInviteType } from "../types/relay/group/invite";
import { RelayGroupRequestsApproveType, RelayGroupRequestsListType, RelayGroupRequestsRejectType } from "../types/relay/group/requests";
import { RelayGroupMetadataType } from "../types/relay/group/metadata";
import { RelayPrivacyUpdateType } from "../types/relay/privacy/update";
import { RelayProfileBioType } from "../types/relay/profile/bio";
import { RelayProfileUpdateType } from "../types/relay/profile/update";
import { RelayProfileCheckType } from "../types/relay/profile/check";

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
      if (this.client.props?.autoPresence) {
        if (props?.isAudio) {
          this.client.socket?.sendPresenceUpdate("recording", this.message?.roomId);
        } else {
          this.client.socket?.sendPresenceUpdate("composing", this.message?.roomId);
        }
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
      if (params.externalAdReply) {
        obj.contextInfo = { externalAdReply: params.externalAdReply };
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

      if (params.externalAdReply) {
        obj.contextInfo = { externalAdReply: params.externalAdReply };
      }

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

      if (params.externalAdReply) {
        obj.contextInfo.externalAdReply = params.externalAdReply;
      }

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
    await this.initial({ disabledPresence: true });

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

  async reaction(props: ExtractZod<typeof RelayReactionType>) {
    await this.initial({ disabledPresence: true });

    const params = RelayReactionType.parse(props);
    const message = typeof params == "string" ? this.message.message() : params.message();
    const text = typeof params == "string" ? params : params.emoticon;

    const res = await this.client.socket.sendMessage(message?.key?.remoteJid!, { react: { text, key: message?.key } });
    return await MessagesExtractor(this.ctx, res);
  }

  // MEDIA RELAY

  async document(type: ExtractZod<typeof RelayDocumentEnumType>, props: ExtractZod<typeof RelayDocumentType>) {
    await this.initial();

    const enumType = RelayDocumentEnumType.parse(type);
    const params = RelayDocumentType.parse(props);

    const options: AnyMessageContent = {
      document: typeof params.document === "string" ? { url: params.document } : params.document,
      caption: params.text,
      mimetype: params.mimetype,
      fileName: params.fileName,
      contextInfo: { externalAdReply: params.externalAdReply },
    };

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  async image(type: ExtractZod<typeof RelayImageEnumType>, props: ExtractZod<typeof RelayImageType>) {
    await this.initial();

    const enumType = RelayImageEnumType.parse(type);
    const params = RelayImageType.parse(props);

    const options: AnyMessageContent = {
      image: typeof params.image === "string" ? { url: params.image } : params.image,
      caption: params.text,
      viewOnce: params.viewOnce,
      contextInfo: { externalAdReply: params.externalAdReply, isQuestion: true },
    };

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

    const options: AnyMessageContent = {
      video: typeof params.video === "string" ? { url: params.video } : params.video,
      caption: params.text,
      viewOnce: params.viewOnce,
    };

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  async audio(type: ExtractZod<typeof RelayAudioEnumType>, props: ExtractZod<typeof RelayAudioType>) {
    const enumType = RelayAudioEnumType.parse(type);
    const params = RelayAudioType.parse(props);

    const options: AnyMessageContent = {
      audio: typeof params.audio === "string" ? { url: params.audio } : params.audio,
      viewOnce: params.viewOnce,
      contextInfo: { externalAdReply: params.externalAdReply },
    };

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  async voice(type: ExtractZod<typeof RelayAudioEnumType>, props: ExtractZod<typeof RelayAudioType>) {
    const enumType = RelayAudioEnumType.parse(type);
    const params = RelayAudioType.parse(props);

    const options: AnyMessageContent = {
      audio: typeof params.audio === "string" ? { url: params.audio } : params.audio,
      ptt: true,
      viewOnce: params.viewOnce,
      mimetype: "audio/ogg; codecs=opus",
      contextInfo: { externalAdReply: params.externalAdReply },
    };

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

  async location(type: ExtractZod<typeof RelayLocationEnumType>, props: ExtractZod<typeof RelayLocationType>) {
    await this.initial();

    const enumType = RelayLocationEnumType.parse(type);
    const params = RelayLocationType.parse(props);

    const options: AnyMessageContent = {
      location: {
        degreesLatitude: params.latitude,
        degreesLongitude: params.longitude,
        url: params.title,
        address: params.footer,
        name: params.title,
      },
      contextInfo: { externalAdReply: params.externalAdReply },
    };

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  async contacts(type: ExtractZod<typeof RelayContactEnumType>, props: ExtractZod<typeof RelayContactType>) {
    await this.initial();

    const enumType = RelayContactEnumType.parse(type);
    const params = RelayContactType.parse(props);

    const contacts = params.contacts.map((x) => {
      const vcard = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${x.fullname}`,
        `ORG:${x.organization || ""}`,
        `TEL;type=CELL;type=VOICE;waid=${x.phoneNumber}:${x.phoneNumber}`,
        "END:VCARD",
      ].join("\n");

      return { displayName: x.fullname, vcard };
    });

    const options: AnyMessageContent = {
      contacts: {
        displayName: params?.title,
        contacts,
      },
    };

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  async poll(type: ExtractZod<typeof RelayPollEnumType>, props: ExtractZod<typeof RelayPollType>) {
    await this.initial();

    const enumType = RelayPollEnumType.parse(type);
    const params = RelayPollType.parse(props);
    const options = {} as any;

    if (params.action == "create") {
      options.poll = {
        name: params.name,
        values: params.answers,
        selectableCount: !!params.isMultiple ? 1 : 0,
        toAnnouncementGroup: true,
      };
    }

    // if (params.type == "result") {
    //   options.pollResult = {
    //     name: params.name,
    //     votes: params.votes,
    //   };
    // }

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  async button(type: ExtractZod<typeof RelayButtonEnumType>, props: ExtractZod<typeof RelayButtonType>) {
    await this.initial();

    const enumType = RelayButtonEnumType.parse(type);
    const params = RelayButtonType.parse(props);
    const options: AnyMessageContent = {
      text: params.text,
      footer: params.footer,
    };

    if (params.type == "simple") {
      options.buttons = params.buttons.map((x) => ({ buttonId: x.id, buttonText: { displayText: x.text } }));
    }

    if (params.type == "interactive") {
      options.interactiveButtons = params.buttons.map((x) => {
        let schema = { name: x.type } as any;

        if (x.type == "quick_reply") {
          schema.buttonParamsJson = toString({
            id: x.id,
            display_text: x.text,
          });
        }

        if (x.type == "cta_url") {
          schema.buttonParamsJson = toString({
            id: x.id,
            display_text: x.text,
            url: x.url,
            merchant_url: x.url,
          });
        }

        if (x.type == "cta_copy") {
          schema.buttonParamsJson = toString({
            id: x.id,
            display_text: x.text,
            copy_code: x.copy,
          });
        }

        if (x.type == "cta_call") {
          schema.buttonParamsJson = toString({
            id: x.id,
            display_text: x.text,
            phone_number: x.phoneNumber,
          });
        }

        return schema;
      });
    }

    this[enumType]({ text: "$$media$$", roomId: params.roomId, options });
  }

  // GROUP RELAY

  group() {
    const client = this.ctx;

    const create = async (props: ExtractZod<typeof RelayGroupCreateType>) => {
      const params = RelayGroupCreateType.parse(props);

      try {
        return await client.socket.groupCreate(params.title, params.members);
      } catch (error) {
        client.spinner.error("Failed create group. Make sure members has valid number.\n\n" + error);
        return null;
      }
    };

    const action = async (props: ExtractZod<typeof RelayGroupActionType>) => {
      const params = RelayGroupActionType.parse(props);
      const opts = {
        add: "add",
        kick: "remove",
        promote: "promote",
        demote: "demote",
      } as const;

      try {
        return await client.socket.groupParticipantsUpdate(params.roomId, params.members, opts[params.action]);
      } catch (error) {
        client.spinner.error("Failed update user. Make sure this number is in the group and as admin.\n\n" + error);
        return null;
      }
    };

    const update = async (props: ExtractZod<typeof RelayGroupUpdateType>) => {
      const params = RelayGroupUpdateType.parse(props);
      const opts = {
        subject: "groupUpdateSubject",
        description: "groupUpdateDescription",
      } as const;

      try {
        return await client.socket[opts[props.action]](params.roomId, props.text);
      } catch (error) {
        client.spinner.error("Failed update group. Make sure this number is in the group and as admin.\n\n" + error);
        return null;
      }
    };

    const settings = async (props: ExtractZod<typeof RelayGroupSettingsType>) => {
      const params = RelayGroupSettingsType.parse(props);
      const opts = {
        open: "not_announcement",
        close: "announcement",
        lock: "locked",
        unlock: "unlocked",
      } as const;

      try {
        return await client.socket.groupSettingUpdate(params.roomId, opts[params.action]);
      } catch (error) {
        client.spinner.error("Failed settings group. Make sure this number is in the group and as admin.\n\n" + error);
        return null;
      }
    };

    const leave = async (props: ExtractZod<typeof RelayGroupLeaveType>) => {
      const params = RelayGroupLeaveType.parse(props);

      try {
        return await client.socket.groupLeave(params.roomId);
      } catch (error) {
        client.spinner.error("Failed leave group. Make sure this number is in the group.\n\n" + error);
        return null;
      }
    };

    const links = async (props: ExtractZod<typeof RelayGroupLinksType>) => {
      const params = RelayGroupLinksType.parse(props);
      const opts = {
        get: "groupInviteCode",
        revoke: "groupRevokeInvite",
      } as const;

      try {
        const code = await client.socket[opts[params.action]](params.roomId);
        return `https://chat.whatsapp.com/` + code;
      } catch (error) {
        client.spinner.error("Failed get group link. Make sure this number is in the group and as admin.\n\n" + error);
        return null;
      }
    };

    const invite = async (props: ExtractZod<typeof RelayGroupInviteType>) => {
      const params = RelayGroupInviteType.parse(props);
      const opts = {
        join: "groupAcceptInvite",
        info: "groupGetInviteInfo",
      } as const;

      try {
        const code = params.url.split("https://chat.whatsapp.com/");
        return await client.socket[opts[params.action]](code[1]);
      } catch (error) {
        client.spinner.error("Failed get group link. Make sure this number is in the group and as admin.\n\n" + error);
        return null;
      }
    };

    const metadata = async (props: ExtractZod<typeof RelayGroupMetadataType>) => {
      const params = RelayGroupMetadataType.parse(props);

      try {
        const meta = await client.socket.groupMetadata(params.roomId);
        return meta;
      } catch (error) {
        client.spinner.error("Failed get group metadata. Make sure this number is in the group and as admin.\n\n" + error);
        return null;
      }
    };

    const requests = {
      list: async (props: ExtractZod<typeof RelayGroupRequestsListType>) => {
        const params = RelayGroupRequestsListType.parse(props);
        return await client.socket.groupRequestParticipantsList(params.roomId);
      },
      approve: async (props: ExtractZod<typeof RelayGroupRequestsApproveType>) => {
        const params = RelayGroupRequestsApproveType.parse(props);
        return await client.socket.groupRequestParticipantsUpdate(params.roomId, params.members, "approve");
      },
      reject: async (props: ExtractZod<typeof RelayGroupRequestsRejectType>) => {
        const params = RelayGroupRequestsRejectType.parse(props);
        return await client.socket.groupRequestParticipantsUpdate(params.roomId, params.members, "reject");
      },
    };

    return {
      create,
      action,
      update,
      settings,
      leave,
      links,
      invite,
      metadata,
      requests,
    };
  }

  // PRIVACY RELAY

  privacy() {
    const client = this.ctx;

    const update = async (props: ExtractZod<typeof RelayPrivacyUpdateType>) => {
      const params = RelayPrivacyUpdateType.parse(props);

      try {
        if (params.action == "control") {
          return await client.socket.updateBlockStatus(params.senderId, params.type);
        }

        if (params.action == "lastSeen") {
          return await client.socket.updateLastSeenPrivacy(params.type);
        }

        if (params.action == "online") {
          return await client.socket.updateOnlinePrivacy(params.type);
        }

        if (params.action == "avatar") {
          return await client.socket.updateProfilePicturePrivacy(params.type);
        }

        if (params.action == "story") {
          return await client.socket.updateStatusPrivacy(params.type);
        }

        if (params.action == "read") {
          return await client.socket.updateReadReceiptsPrivacy(params.type);
        }

        if (params.action == "groupsAdd") {
          return await client.socket.updateGroupsAddPrivacy(params.type);
        }

        if (params.action == "ephemeral") {
          const opts = { remove: 0, "24h": 86_400, "7d": 604_800, "90d": 7_776_000 } as const;
          return await client.socket.updateDefaultDisappearingMode(opts[params.type]);
        }
      } catch (error) {
        client.spinner.error("Failed update privacy, please try again.\n\n" + error);
        return null;
      }
    };

    const fetch = {
      settings: async () => {
        return await client.socket.fetchPrivacySettings(true);
      },
      blocklists: async () => {
        return await client.socket.fetchBlocklist();
      },
    };

    return {
      update,
      fetch,
    };
  }

  // PROFILE RELAY

  profile() {
    const client = this.ctx;

    const bio = async (props: ExtractZod<typeof RelayProfileBioType>) => {
      const params = RelayProfileBioType.parse(props);

      try {
        return await client.socket.fetchStatus(params.senderId);
      } catch (error) {
        client.spinner.error("Failed fetch profile bio. Make sure senderId is valid.\n\n" + error);
        return null;
      }
    };

    const avatar = async (props: ExtractZod<typeof RelayProfileBioType>) => {
      const params = RelayProfileBioType.parse(props);

      try {
        return await client.socket.profilePictureUrl(params.senderId);
      } catch (error) {
        client.spinner.error("Failed fetch profile avatar. Make sure senderId is valid.\n\n" + error);
        return null;
      }
    };

    const business = async (props: ExtractZod<typeof RelayProfileBioType>) => {
      const params = RelayProfileBioType.parse(props);

      try {
        return await client.socket.getBusinessProfile(params.senderId);
      } catch (error) {
        client.spinner.error("Failed fetch profile business. Make sure senderId is valid.\n\n" + error);
        return null;
      }
    };

    const update = async (props: ExtractZod<typeof RelayProfileUpdateType>) => {
      const params = RelayProfileUpdateType.parse(props);

      try {
        if (params.type == "name") {
          return await client.socket.updateProfileName(params.text);
        }

        if (params.type == "bio") {
          return await client.socket.updateProfileStatus(params.text);
        }

        if (params.type == "avatar") {
          if (params.avatar == "remove") {
            return await client.socket.removeProfilePicture(params.roomId);
          }

          const avatar = typeof params.avatar == "string" ? { url: params.avatar } : params.avatar;
          return await client.socket.updateProfilePicture(params.roomId, avatar);
        }
      } catch (error) {
        client.spinner.error("Failed update profile. Make sure senderId is valid.\n\n" + error);
        return null;
      }
    };

    const check = async (props: ExtractZod<typeof RelayProfileCheckType>) => {
      const params = RelayProfileCheckType.parse(props);

      try {
        const [wa] = await client.socket.onWhatsApp(params.senderId);
        if (!wa) return { isOnWhatsApp: false };

        const pic = await avatar({ senderId: wa.jid });
        const status = await bio({ senderId: wa.jid });
        const obj = {
          isOnWhatsApp: true,
          avatar: pic,
          bio: status,
          ...wa,
        };

        return obj;
      } catch (error) {
        client.spinner.error("Failed check profile. Make sure senderId is valid.\n\n" + error);
        return null;
      }
    };

    return {
      bio,
      avatar,
      business,
      update,
      check,
    };
  }
}
