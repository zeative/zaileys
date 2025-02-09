import { VERIFIED_PLATFORM } from "../Modules/Config";

export type FakeVerifiedEnum = keyof typeof VERIFIED_PLATFORM;

export type SendActionType = {
  asReply?: boolean;
  senderId?: string;
};

export type ReplyActionType = {
  footer?: string;
  fakeVerified?: FakeVerifiedEnum;
  senderId?: string;
};

export type MessageImageMediaType = {
  image: string | Buffer
}

export type MessageVideoMediaType = {
  video: string | Buffer
}

export type MessageActionType = {
  roomId: string;
  asReply?: boolean;
  footer?: string;
  fakeVerified?: FakeVerifiedEnum;
} & MessageImageMediaType | MessageVideoMediaType