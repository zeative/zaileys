import * as v from 'valibot';

export const ListenerCallsType = v.object({
  callId: v.string(),
  callerId: v.string(),

  roomId: v.string(),
  roomName: v.string(),

  date: v.date(),

  offline: v.boolean(),
  status: v.picklist(['accept', 'offer', 'reject', 'ringing', 'terminate', 'timeout']),

  isVideo: v.boolean(),
  isGroup: v.boolean(),
});

export type CallsContext = v.InferOutput<typeof ListenerCallsType>;
