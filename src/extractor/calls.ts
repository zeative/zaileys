import { WACallEvent } from "baileys";
import { Client } from "../classes";
import { ExtractZod } from "../types/general";
import { ExtractorCallsType } from "../types/extractor/calls";

export const CallsExtractor = async (client: Client, caller: WACallEvent) => {
  const payload: ExtractZod<typeof ExtractorCallsType> = {} as never;

  payload.callId = caller.id;
  payload.roomId = caller.chatId;
  payload.callerId = caller.from;
  payload.date = caller.date;
  payload.offline = caller.offline;
  payload.status = caller.status;
  payload.isVideo = !!caller.isVideo;
  payload.isGroup = !!caller.isGroup;

  return payload;
};
