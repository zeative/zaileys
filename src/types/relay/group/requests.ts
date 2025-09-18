import { z } from "zod/v4";

export const RelayGroupRequestsListType = z.object({
  roomId: z.string(),
});

export const RelayGroupRequestsApproveType = z.object({
  roomId: z.string(),
  members: z.string().array()
});

export const RelayGroupRequestsRejectType = z.object({
  roomId: z.string(),
  members: z.string().array()
});
