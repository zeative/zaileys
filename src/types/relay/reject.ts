import { ExtractorCallsType } from "../extractor/calls";

export const RelayRejectType = ExtractorCallsType.pick({
  callId: true,
  callerId: true,
});
