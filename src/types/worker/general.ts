import { Readable } from "stream";
import { z } from "zod";

export const MediaInputWorkerType = z.union([z.string().url(), z.instanceof(Buffer).or(z.instanceof(Readable))]);

export const TextWorkerBaseType = z.union([
  z.string(),
  z.object({ image: MediaInputWorkerType, text: z.string().optional() }).strict(),
  z.object({ video: MediaInputWorkerType, text: z.string().optional() }).strict(),
  z.object({ videoNote: MediaInputWorkerType }).strict(),
  z.object({ gif: MediaInputWorkerType, text: z.string().optional() }).strict(),
  z.object({ audio: MediaInputWorkerType }).strict(),
  z.object({ audioNote: MediaInputWorkerType }).strict(),
  z.object({ sticker: MediaInputWorkerType }).strict(),
]);

export const TextWorkerOptionsType = z.object({
  roomId: z.string(),
  asForwarded: z.boolean().optional(),
  asViewOnce: z.boolean().optional(),
  asAI: z.boolean().optional(),
  verifiedReply: z.enum(["whatsapp", "meta", "chatgpt", "copilot", "instagram", "tiktok"]).optional(),
  quoted: z.function().returns(z.record(z.string(), z.any())).optional(),
});

export const LocationWorkerOptionsType = TextWorkerOptionsType;
export const LocationWorkerBaseType = z.object({
  latitude: z.number(),
  longitude: z.number(),
  title: z.string().optional(),
  footer: z.string().optional(),
});

export const ContactWorkerOptionsType = TextWorkerOptionsType;
export const ContactWorkerBaseType = z.object({
  fullname: z.string(),
  nickname: z.string().optional(),
  organization: z.string().optional(),
  role: z.string().optional(),
  email: z.string().email().optional(),
  whatsAppNumber: z.number(),
  callNumber: z.number().optional(),
  voiceNumber: z.number().optional(),
  website: z.string().url().optional(),
  homeAddress: z.string().optional(),
  workAddress: z.string().optional(),
  avatar: z.string().url().optional(),
});

export const ReactionWorkerOptionsType = z.object({
  message: z.function().returns(z.record(z.string(), z.any())),
});
export const ReactionWorkerBaseType = z.string();

export const PinWorkerOptionsType = z.object({
  message: z.function().returns(z.record(z.string(), z.any())),
});
export const PinWorkerBaseType = z.object({
  action: z.enum(["pin", "unpin"]),
  expired: z.enum(["24h", "7d", "30d"]),
});

export const PollWorkerOptionsType = TextWorkerOptionsType.pick({ roomId: true });
export const PollWorkerBaseType = z.object({
  name: z.string(),
  answers: z.string().array(),
  multipleAnswers: z.boolean().optional(),
});

export const EditWorkerOptionsType = z.object({
  message: z.function().returns(z.record(z.string(), z.any())),
});
export const EditWorkerBaseType = z.string();

export const DeleteWorkerBaseType = z.object({
  message: z.function().returns(z.record(z.string(), z.any())),
});

export const RejectCallWorkerBaseType = z.object({
  callId: z.string(),
  callerId: z.string(),
});

export const MuteWorkerOptionsType = TextWorkerOptionsType.pick({ roomId: true });
export const MuteWorkerBaseType = z.object({
  expired: z.enum(["remove", "8h", "7d"]),
});

export const ProfileWorkerBaseType = z.string();
export const ProfileWorkerBaseOutputType = z.object({
  type: z.enum(["group", "user"]),
  id: z.string(),
  name: z.string(),
  bio: z.string(),
  avatar: z.string().url(),
  ephemeralDuration: z.number().optional(),
  isRestrict: z.boolean().optional(),
  isAnnounce: z.boolean().optional(),
  isCommunity: z.boolean().optional(),
  isCommunityAnnounce: z.boolean().optional(),
  isJoinApprovalMode: z.boolean().optional(),
  isMemberAddMode: z.boolean().optional(),
  owner: z
    .object({
      type: z.literal("user"),
      id: z.string(),
    })
    .nullable(),
  roomCreatedAt: z.number().optional(),
  nameUpdatedAt: z.number().optional(),
  bioUpdatedAt: z.number().optional(),
  membersLength: z.number().optional(),
  members: z
    .object({
      type: z.enum(["user", "admin", "superadmin"]),
      id: z.string(),
    })
    .array()
    .optional(),
});

export const PresenceWorkerOptionsType = TextWorkerOptionsType.pick({ roomId: true });
export const PresenceWorkerBaseType = z.enum(["typing", "recording", "online", "offline", "paused"]);
