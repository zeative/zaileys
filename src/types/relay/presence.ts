import { z } from "zod/v4";

export const RelayPresenceType = z.enum(["typing", "recording", "online", "offline", "paused"]);
