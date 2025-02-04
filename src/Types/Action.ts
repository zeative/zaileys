import { VERIFIED_PLATFORM } from "../Modules/Config";

export type FakeVerifiedEnum = keyof typeof VERIFIED_PLATFORM;

export type SendActionType = {
  asReply?: boolean;
};

export type ReplyActionType = {
  footer?: string;
  fakeVerified?: FakeVerifiedEnum;
};
