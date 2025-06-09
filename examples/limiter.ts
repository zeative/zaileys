import { Client } from "../src";
// import { Client } from "zaileys";

const wa = new Client({
  authType: "qr", // has issue with pairing code, just use qr only

  // max 10 messages on 10 seconds
  limiter: {
    durationMs: 10000,
    maxMessages: 5,
  },
});

wa.on("messages", (ctx) => {
  const { isSpam, roomId } = ctx;

  if (isSpam) {
    wa.text("You're spamming!!", { roomId });
    return;
  }

  wa.text("Hello!", { roomId });
});
