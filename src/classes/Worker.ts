import { AnyMessageContent, jidNormalizedUser, MiscMessageGenerationOptions } from "baileys";
import * as levenshtein from "fast-levenshtein";
import { sql } from "kysely";
import NodeCache from "node-cache";
import { z } from "zod";
import { extractJids, toJson } from "../helpers/utils";
import { addRAGType, llmMessagesTable, llmPersonalizationTable, llmRAGTable, llmsAdapter } from "../types/adapter/llms";
import { MessagesVerifiedPlatformType } from "../types/parser/messages";
import {
  ContactWorkerBaseType,
  ContactWorkerOptionsType,
  DeleteWorkerBaseType,
  EditWorkerBaseType,
  EditWorkerOptionsType,
  LocationWorkerBaseType,
  LocationWorkerOptionsType,
  MuteWorkerBaseType,
  MuteWorkerOptionsType,
  PinWorkerBaseType,
  PinWorkerOptionsType,
  PollWorkerBaseType,
  PollWorkerOptionsType,
  PresenceWorkerBaseType,
  PresenceWorkerOptionsType,
  ProfileWorkerBaseOutputType,
  ProfileWorkerBaseType,
  ReactionWorkerBaseType,
  ReactionWorkerOptionsType,
  RejectCallWorkerBaseType,
  TextWorkerBaseType,
  TextWorkerOptionsType,
} from "../types/worker/general";
import Client from "./Client";
import Parser from "./Parser";

export default class Worker {
  private parser: Parser;
  private caching = new NodeCache({ stdTTL: 600, checkperiod: 120, maxKeys: 1000 });

  constructor(private wa: { client: Client; db: Client["db"]; socket: Client["socket"] }) {
    this.parser = new Parser(wa.socket!, wa.client, wa.db!);
  }

  private async sendMessage(jid: string, content: AnyMessageContent, options?: MiscMessageGenerationOptions) {
    let mentions = [] as string[];
    if (this.wa.client.options?.autoMentions) {
      mentions = extractJids((content as any)?.text || (content as any)?.caption);
    }

    if (this.wa.client.options?.autoPresence) {
      this.wa.socket?.sendPresenceUpdate("composing", jid);
    }

    if (this.wa.client.options?.autoPresence && ((content as any)?.audio || (content as any)?.audioNote)) {
      this.wa.socket?.sendPresenceUpdate("recording", jid);
    }

    const obj = content as any;
    const asForwarded = { contextInfo: { isForwarded: !!obj?.asForwarded } };

    if (typeof obj?.quoted == "function") {
      let message = obj?.quoted();
      message.key.remoteJid = MessagesVerifiedPlatformType[obj?.verifiedReply as never] || message.key.remoteJid;
      const worker = await this.wa.socket?.sendMessage(jid, { ...obj, mentions, ...asForwarded }, { quoted: message, ...options });
      return await this.parser.messages(worker!);
    } else {
      const worker = await this.wa.socket?.sendMessage(jid, { ...obj, mentions, ...asForwarded }, options);
      return await this.parser.messages(worker!);
    }
  }

  async text(text: z.infer<typeof TextWorkerBaseType>, options: z.infer<typeof TextWorkerOptionsType>) {
    text = TextWorkerBaseType.parse(text);
    options = TextWorkerOptionsType.parse(options);

    if (typeof text == "string") {
      return await this.sendMessage(options.roomId, { text, ...options });
    }

    if (typeof text == "object") {
      const key = Object.keys(text);
      const obj = text as any;

      if (key.includes("image")) {
        const media = typeof obj.image == "string" ? { url: obj.image } : obj.image;
        return await this.sendMessage(options.roomId, { caption: obj?.text, image: media, viewOnce: !!options.asViewOnce, ...options });
      }

      if (key.includes("video")) {
        const media = typeof obj.video == "string" ? { url: obj.video } : obj.video;
        return await this.sendMessage(options.roomId, { caption: obj?.text, video: media, ptv: false, viewOnce: !!options.asViewOnce, ...options });
      }

      if (key.includes("videoNote")) {
        const media = typeof obj.videoNote == "string" ? { url: obj.videoNote } : obj.videoNote;
        return await this.sendMessage(options.roomId, { caption: obj?.text, video: media, ptv: true, ...options });
      }

      if (key.includes("gif")) {
        const media = typeof obj.gif == "string" ? { url: obj.gif } : obj.gif;
        return await this.sendMessage(options.roomId, { caption: obj?.text, video: media, gifPlayback: true, viewOnce: !!options.asViewOnce, ...options });
      }

      if (key.includes("audio")) {
        const media = typeof obj.audio == "string" ? { url: obj.audio } : obj.audio;
        return await this.sendMessage(options.roomId, { caption: obj?.text, audio: media, viewOnce: !!options.asViewOnce, ...options });
      }

      if (key.includes("audioNote")) {
        const media = typeof obj.audioNote == "string" ? { url: obj.audioNote } : obj.audioNote;
        return await this.sendMessage(options.roomId, { caption: obj?.text, audio: media, ptt: true, viewOnce: !!options.asViewOnce, ...options });
      }

      if (key.includes("sticker")) {
        const media = typeof obj.sticker == "string" ? { url: obj.sticker } : obj.sticker;
        return await this.sendMessage(options.roomId, { caption: obj?.text, sticker: media, ...options });
      }
    }
  }

  async location(loc: z.infer<typeof LocationWorkerBaseType>, options: z.infer<typeof LocationWorkerOptionsType>) {
    loc = LocationWorkerBaseType.parse(loc);
    options = LocationWorkerOptionsType.parse(options);

    return await this.sendMessage(options.roomId, {
      location: {
        degreesLatitude: loc.latitude,
        degreesLongitude: loc.longitude,
        url: loc.title,
        address: loc.footer,
        name: loc.title,
      },
      ...options,
    });
  }

  async contact(vcard: z.infer<typeof ContactWorkerBaseType>, options: z.infer<typeof ContactWorkerOptionsType>) {
    vcard = ContactWorkerBaseType.parse(vcard);
    options = ContactWorkerOptionsType.parse(options);

    const contacts = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:;${vcard.fullname};;;`,
      `FN:${vcard.fullname}`,
      vcard.nickname ? `NICKNAME:${vcard.nickname}` : "",
      vcard.organization || vcard.role ? `ORG:${vcard.organization ?? ""};` : "",
      vcard.role ? `TITLE:${vcard.role}` : "",
      `TEL;TYPE=CELL,VOICE;waid=${vcard.whatsAppNumber}:+${vcard.whatsAppNumber}`,
      vcard.callNumber ? `TEL;TYPE=WORK,VOICE:+${vcard.callNumber}` : "",
      vcard.voiceNumber ? `TEL;TYPE=VOICE:+${vcard.voiceNumber}` : "",
      vcard.email ? `EMAIL;TYPE=INTERNET:${vcard.email}` : "",
      vcard.website ? `URL;TYPE=WORK:${vcard.website}` : "",
      vcard.homeAddress ? `ADR;TYPE=HOME:;;${vcard.homeAddress};;;;` : "",
      vcard.workAddress ? `ADR;TYPE=WORK:;;${vcard.workAddress};;;;` : "",
      vcard.avatar ? `PHOTO;VALUE=URI;TYPE=JPEG:${vcard.avatar}` : "",
      "END:VCARD",
    ].join("\n");

    return await this.sendMessage(options.roomId, {
      contacts: {
        displayName: vcard.fullname,
        contacts: [{ vcard: contacts }],
      },
      ...options,
    });
  }

  async reaction(emoticon: z.infer<typeof ReactionWorkerBaseType>, options: z.infer<typeof ReactionWorkerOptionsType>) {
    emoticon = ReactionWorkerBaseType.parse(emoticon);
    options = ReactionWorkerOptionsType.parse(options);

    return await this.sendMessage(options.message()?.key?.remoteJid!, {
      react: {
        text: emoticon,
        key: options.message()?.key,
      },
      ...options,
    });
  }

  async pin(pin: z.infer<typeof PinWorkerBaseType>, options: z.infer<typeof PinWorkerOptionsType>) {
    pin = PinWorkerBaseType.parse(pin);
    options = PinWorkerOptionsType.parse(options);

    const exp = {
      "24h": 86400,
      "7d": 604800,
      "30d": 2592000,
    };

    return await this.sendMessage(options.message()?.key?.remoteJid!, {
      pin: {
        type: pin.action == "pin" ? 1 : 0,
        time: exp[pin.expired],
        key: options.message()?.key,
      },
      ...options,
    } as never);
  }

  async poll(poll: z.infer<typeof PollWorkerBaseType>, options: z.infer<typeof PollWorkerOptionsType>) {
    poll = PollWorkerBaseType.parse(poll);
    options = PollWorkerOptionsType.parse(options);

    return await this.sendMessage(options.roomId, {
      poll: {
        name: poll.name,
        values: poll.answers,
        selectableCount: !!poll.multipleAnswers ? 1 : 0,
        toAnnouncementGroup: true,
      },
      ...options,
    });
  }

  async edit(text: z.infer<typeof EditWorkerBaseType>, options: z.infer<typeof EditWorkerOptionsType>) {
    text = EditWorkerBaseType.parse(text);
    options = EditWorkerOptionsType.parse(options);

    return await this.sendMessage(options.message()?.key?.remoteJid!, {
      text,
      edit: options.message()?.key,
      ...options,
    });
  }

  async delete(del: z.infer<typeof DeleteWorkerBaseType>) {
    del = DeleteWorkerBaseType.parse(del);

    return await this.sendMessage(del.message()?.key?.remoteJid!, {
      delete: del.message()?.key,
    });
  }

  async rejectCall(call: z.infer<typeof RejectCallWorkerBaseType>) {
    call = RejectCallWorkerBaseType.parse(call);

    return await this.wa.socket?.rejectCall(call.callId, call.callerId);
  }

  async mute(mute: z.infer<typeof MuteWorkerBaseType>, options: z.infer<typeof MuteWorkerOptionsType>) {
    mute = MuteWorkerBaseType.parse(mute);
    options = MuteWorkerOptionsType.parse(options);

    const opts = {
      remove: null,
      "8h": 86400000,
      "7d": 604800000,
    } as any;

    return await this.wa.socket?.chatModify({ mute: opts[mute.expired] }, options.roomId);
  }

  async profile(roomId: z.infer<typeof ProfileWorkerBaseType>): Promise<z.infer<typeof ProfileWorkerBaseOutputType> | null> {
    roomId = ProfileWorkerBaseType.parse(roomId);
    const isGroup = roomId.includes("@g.us");

    const payload: z.infer<typeof ProfileWorkerBaseOutputType> = {} as never;
    payload.id = roomId;

    const isBot = jidNormalizedUser(this.wa.socket?.user?.id) == roomId;
    if (isBot) {
      payload.name = (this.wa.socket?.user?.name || this.wa.socket?.user?.verifiedName)!;
    } else {
      if (isGroup) {
        const metadata = await this.wa.socket?.groupMetadata(roomId);
        payload.type = "group";
        payload.name = metadata?.subject!;
        payload.bio = metadata?.desc!;
        payload.avatar = (await this.wa.socket?.profilePictureUrl(roomId))!;
        payload.ephemeralDuration = metadata?.ephemeralDuration!;
        payload.isRestrict = metadata?.restrict!;
        payload.isAnnounce = metadata?.announce!;
        payload.isCommunity = metadata?.isCommunity!;
        payload.isCommunityAnnounce = metadata?.isCommunityAnnounce!;
        payload.isJoinApprovalMode = metadata?.joinApprovalMode!;
        payload.isMemberAddMode = metadata?.memberAddMode!;
        payload.owner = {
          type: "user",
          id: metadata?.owner!,
        };
        payload.roomCreatedAt = metadata?.creation!;
        payload.nameUpdatedAt = metadata?.subjectTime!;
        payload.membersLength = metadata?.size;
        payload.members = metadata?.participants.map((x) => ({
          id: x.id,
          type: x.admin == "admin" ? x.admin : x.admin == "superadmin" ? x.admin : "user",
        }));
      } else {
        const db = await this.wa.db?.selectFrom("chats").select("value").where("id", "=", roomId).executeTakeFirst();
        const value = toJson(db?.value!);
        const bio = ((await this.wa?.socket?.fetchStatus(roomId)) as any)![0]?.status;

        payload.type = "user";
        payload.name = value?.name;
        payload.bio = bio?.status;
        payload.avatar = (await this.wa?.socket?.profilePictureUrl(roomId))!;
        payload.bioUpdatedAt = new Date(bio?.setAt).getTime();
      }
    }

    return payload;
  }

  async presence(action: z.infer<typeof PresenceWorkerBaseType>, options: z.infer<typeof PresenceWorkerOptionsType>) {
    action = PresenceWorkerBaseType.parse(action);
    options = PresenceWorkerOptionsType.parse(options);

    const opts = {
      typing: "composing",
      recording: "recording",
      online: "available",
      offline: "unavailable",
      paused: "paused",
    };

    return await this.wa.socket?.sendPresenceUpdate(opts[action] as never, options.roomId);
  }

  async addCompletion(props: z.infer<typeof llmMessagesTable>) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    props = llmMessagesTable.parse(props);
    const result = await this.wa.db?.insertInto("llm_messages").values(props).executeTakeFirst();
    if (!result) throw new Error("Failed to add completion");
    return props;
  }

  async deleteCompletion(uniqueId: string) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    const result = await this.wa.db?.deleteFrom("llm_messages").where("uniqueId", "=", uniqueId).executeTakeFirst();
    if (!result) throw new Error("Failed to delete completion");
    return true;
  }

  async updateCompletion(uniqueId: string, props: Partial<z.infer<typeof llmMessagesTable>>) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    const validatedProps = llmMessagesTable.partial().parse(props);
    const result = await this.wa.db?.updateTable("llm_messages").set(validatedProps).where("uniqueId", "=", uniqueId).returningAll().executeTakeFirst();
    if (!result) throw new Error("Failed to update completion");
    return llmMessagesTable.parse(result);
  }

  async clearCompletions(channelId: string) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    const result = await this.wa.db?.deleteFrom("llm_messages").where("channelId", "=", channelId).executeTakeFirst();
    if (!result) throw new Error("Failed to clear completions");
    return true;
  }

  async getCompletion(uniqueId: string) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    const result = await this.wa.db?.selectFrom("llm_messages").selectAll().where("uniqueId", "=", uniqueId).executeTakeFirst();
    return result ? llmMessagesTable.parse(result) : null;
  }

  async getCompletions(channelId: string) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    const results = await this.wa.db?.selectFrom("llm_messages").selectAll().where("channelId", "=", channelId).execute();
    return results?.map((result) => llmMessagesTable.parse(result)) || [];
  }

  async addPersonalization(props: z.infer<typeof llmPersonalizationTable>) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    props = llmPersonalizationTable.parse(props);
    const result = await this.wa.db?.insertInto("llm_personalization").values(props).executeTakeFirst();
    if (!result) throw new Error("Failed to add completion");
    return props;
  }

  async deletePersonalization(uniqueId: string) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    const result = await this.wa.db?.deleteFrom("llm_personalization").where("uniqueId", "=", uniqueId).executeTakeFirst();
    if (!result) throw new Error("Failed to delete completion");
    return true;
  }

  async clearPersonalization(senderId: string) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    const result = await this.wa.db?.deleteFrom("llm_personalization").where("senderId", "=", senderId).executeTakeFirst();
    if (!result) throw new Error("Failed to clear completions");
    return true;
  }

  async getPersonalization(senderId: string) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    const results = await this.wa.db?.selectFrom("llm_personalization").selectAll().where("senderId", "=", senderId).execute();
    return results?.map((result) => llmPersonalizationTable.parse(result)) || [];
  }

  async addRAG(props: z.infer<typeof addRAGType>) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    props = llmRAGTable.parse(props);
    const result = await this.wa.db
      ?.insertInto("llm_rag")
      .values({
        pageContent: props.pageContent.toLowerCase(),
        ["metadata.id" as any]: (props as any).metadata?.id!,
      } as any)
      .executeTakeFirst();
    if (!result) throw new Error("Failed to add RAG");
    return props as any;
  }

  async deleteRAG(id: string) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    const result = await this.wa.db
      ?.deleteFrom("llm_rag")
      .where(sql`"metadata.id"`, "=", id)
      .executeTakeFirst();
    if (!result) throw new Error("Failed to delete RAG");
    return true;
  }

  async updateRAG(id: string) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    const result = await this.wa.db
      ?.updateTable("llm_rag")
      .set({ metadata: { id } })
      .where(sql`"metadata.id"`, "=", id)
      .returningAll()
      .executeTakeFirst();
    if (!result) throw new Error("Failed to update RAG");
    return llmRAGTable.parse(result);
  }

  async clearRAGs() {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    const result = await this.wa.db?.deleteFrom("llm_rag").executeTakeFirst();
    if (!result) throw new Error("Failed to clear RAGs");
    return true;
  }

  async getRAG(id: string) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas are not loaded. Please enable loadLLMSchemas in Client options.");
    const result = await this.wa.db
      ?.selectFrom("llm_rag")
      .selectAll()
      .where(sql`"metadata.id"`, "=", id)
      .executeTakeFirst();
    return result ? llmRAGTable.parse(result) : null;
  }

  async getRAGs(keyword: string) {
    if (!this.wa.client.options?.loadLLMSchemas) throw new Error("LLM schemas not loaded");

    const key = keyword.toLowerCase().trim();
    const cached = this.caching.get<z.infer<typeof llmRAGTable>[]>(key);
    if (cached) return cached;

    const keywords = key.split(/\s+/).filter((word) => word.length > 0);
    if (!keywords.length) return [];

    const allDocs = await this.wa.db
      ?.selectFrom("llm_rag")
      .select([sql`"metadata.id"`.as("metadata.id"), "pageContent"])
      .where("pageContent", "!=", "")
      .limit(10000)
      .execute()
      .then((rows) => rows.map((row) => llmRAGTable.parse({ ...row, metadata: { id: row["metadata.id"] } })))
      .then((docs) =>
        docs.filter((doc) => {
          const contentWords = doc.pageContent.toLowerCase().split(/\s+/);
          return keywords.some((keyword) => contentWords.some((word) => levenshtein.get(keyword, word) <= Math.max(1, Math.floor(keyword.length / 4))));
        })
      );

    this.caching.set(key, allDocs);
    return allDocs || [];
  }

  llms: llmsAdapter = {
    addCompletion: this.addCompletion.bind(this),
    deleteCompletion: this.deleteCompletion.bind(this),
    updateCompletion: this.updateCompletion.bind(this),
    clearCompletions: this.clearCompletions.bind(this),
    getCompletion: this.getCompletion.bind(this),
    getCompletions: this.getCompletions.bind(this),

    addPersonalization: this.addPersonalization.bind(this),
    deletePersonalization: this.deletePersonalization.bind(this),
    clearPersonalization: this.clearPersonalization.bind(this),
    getPersonalization: this.getPersonalization.bind(this),

    addRAG: this.addRAG.bind(this),
    deleteRAG: this.deleteRAG.bind(this),
    updateRAG: this.updateRAG.bind(this),
    clearRAGs: this.clearRAGs.bind(this),
    getRAG: this.getRAG.bind(this),
    getRAGs: this.getRAGs.bind(this),
  };
}
