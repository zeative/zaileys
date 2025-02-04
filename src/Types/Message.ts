import { proto, WABusinessProfile } from "@whiskeysockets/baileys";
import { MESSAGE_TYPE } from "../Modules/Config";
import { CitationConfig } from "./General";

export type MessageTypeEnum = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];
export type DeviceTypeEnum = "unknown" | "android" | "ios" | "desktop" | "web";

export type ExtractCitationType<T> = { [K in keyof T as `is${Capitalize<K & string>}`]: boolean };

export type MessageBaseContent<T> = {
  fromMe: boolean;
  chatId: string;
  roomId: string;
  roomImage: () => Promise<string | null>;
  senderId: string;
  senderName: string;
  senderDevice: DeviceTypeEnum;
  senderBio: () => Promise<string | null>;
  senderImage: () => Promise<string | null>;
  senderBusiness: () => Promise<WABusinessProfile | null>;
  chatType: MessageTypeEnum;
  timestamp: number;
  text: string;
  command: string;
  mentions: string[] | null;
  isGroup: boolean;
  isStory: boolean;
  isEdited: boolean;
  isChannel: boolean;
  isBroadcast: boolean;
  isEphemeral: boolean;
  isForwarded: boolean;
  citation: { [key: string]: unknown } | null;
  media: {
    buffer?: () => Promise<Buffer | null>;
    stream?: () => Promise<Buffer | null>;
    [key: string]: unknown;
  } | null;
  reply: MessageBaseContent<T> | null;
  key: () => proto.IMessageKey;
  message: () => proto.IWebMessageInfo;
};
