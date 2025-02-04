import EventEmitter from "events";
import { Client } from "./Client";
import { randomBytes } from "crypto";
import { generateMessageIDV2 } from "@whiskeysockets/baileys";

type ActionType = {
  config: Client["config"];
  socket: Client["socket"];
  store: Client["store"];
};

type ReplyActionType =
  | string
  | {
      text: string;
    };

export class Action extends EventEmitter {
  private provider: ActionType;

  constructor() {
    super();
  }

  protected setProvider(provider: ActionType) {
    this.provider = provider;
  }

  // async reply(payload: ReplyActionType) {
  //   const roomId = this.provider.temporary?.message!?.roomId;
  //   console.log("🚀 ~ Action ~ reply ~ roomId:", roomId)
  //   if (!roomId) return;

  //   if (typeof payload === "string") {
  //     await this.provider.socket?.sendMessage(roomId, {
  //       text: payload,
  //       footer: "hahah",
  //       contextInfo: {
  //         forwardingScore: 0,
  //         isForwarded: true,
  //         mentionedJid: [],
  //         forwardedNewsletterMessageInfo: {
  //           newsletterJid: "120363220399960108@newsletter",
  //           serverMessageId: -1,
  //           newsletterName: "✨ Nekohime Botssss",
  //         },
  //         externalAdReply: {
  //           thumbnailUrl: "https://github.com/zaadevofc.png",
  //           mediaUrl: "https://github.com/zaadevofc.png",
  //           mediaType: 0,
  //           //   sourceUrl: "https://zpi.my.id",
  //           renderLargerThumbnail: false,
  //           //   title: this.provider.socket.user!.name,
  //           //   body: "duter",
  //         },
  //       },
  //     });
  //   }
  // }
}
