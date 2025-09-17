import { z } from "zod/v4";

export const RelayPrivacyUpdateControlType = z.object({
  action: z.literal("control"),
  type: z.enum(["block", "unblock"]),
  senderId: z.string(),
});

export const RelayPrivacyUpdateLastSeenType = z.object({
  action: z.literal("lastSeen"),
  type: z.enum(["all", "contacts", "contact_blacklist", "none"]),
});

export const RelayPrivacyUpdateOnlineType = z.object({
  action: z.literal("online"),
  type: z.enum(["all", "match_last_seen"]),
});

export const RelayPrivacyUpdateAvatarType = z.object({
  action: z.literal("avatar"),
  type: z.enum(["all", "contacts", "contact_blacklist", "none"]),
});

export const RelayPrivacyUpdateStoryType = z.object({
  action: z.literal("story"),
  type: z.enum(["all", "contacts", "contact_blacklist", "none"]),
});

export const RelayPrivacyUpdateReadType = z.object({
  action: z.literal("read"),
  type: z.enum(["all", "none"]),
});

export const RelayPrivacyGroupsAddType = z.object({
  action: z.literal("groupsAdd"),
  type: z.enum(["all", "contacts", "contact_blacklist"]),
});

export const RelayPrivacyEphemeralType = z.object({
  action: z.literal("ephemeral"),
  type: z.enum(["remove", "24h", "7d", "90d"]),
});

export const RelayPrivacyUpdateType = z.discriminatedUnion("action", [
  RelayPrivacyUpdateControlType,
  RelayPrivacyUpdateLastSeenType,
  RelayPrivacyUpdateOnlineType,
  RelayPrivacyUpdateAvatarType,
  RelayPrivacyUpdateStoryType,
  RelayPrivacyUpdateReadType,
  RelayPrivacyGroupsAddType,
  RelayPrivacyEphemeralType,
]);
