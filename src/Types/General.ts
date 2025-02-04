import { MessageBaseContent } from "./Message";

export type AuthType = "pairing" | "qr";

export type CitationConfig = {
  [key: string]: (() => string[]) | (() => Promise<string[]>);
};

export interface BaseClientConfig {
  prefix?: string;
  ignoreMe?: boolean;
  authPath?: string;
  authType: AuthType;
  showLogs?: boolean;
  autoMentions?: boolean;
  autoOnline?: boolean;
  autoRead?: boolean;
  autoRejectCall?: boolean;
  citation?: CitationConfig;
}

export interface PairingClientConfig extends BaseClientConfig {
  authType: "pairing";
  phoneNumber: number;
}

export interface QRClientConfig extends BaseClientConfig {
  authType: "qr";
}

export type ClientConfig = PairingClientConfig | QRClientConfig;

export interface BaseContext {
  // citation: CitationConfig;
  // send: (recipients: any[], message: string) => void;
}

export interface ConnectionContext extends BaseContext {
  status: "connecting" | "open" | "close";
}

export interface ErrorContext extends BaseContext {
  error: Error;
}

export interface ClientEvents<B> {
  connection: (ctx: ConnectionContext) => void;
  message: (ctx: MessageBaseContent<B>) => void;
  error: (ctx: ErrorContext) => void;
}
