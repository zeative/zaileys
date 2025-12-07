import z from 'zod';

export const ListenerCallsType = z.object({
  callId: z.string(),
  callerId: z.string(),
  callerName: z.string(),

  roomId: z.string(),
  roomName: z.string(),

  date: z.date(),

  offline: z.boolean(),
  status: z.enum(['accept', 'offer', 'reject', 'ringing', 'terminate', 'timeout']),

  isVideo: z.boolean(),
  isGroup: z.boolean(),
});
