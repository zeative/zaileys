import { Client } from "../src";
import { readFileSync } from "fs";

const wa = new Client({
  authType: "pairing",
  phoneNumber: 6287833764462,
  citation: {
    my: [6285136635787, 120363419134907062],
  },
  fakeReply: {
    provider: "whatsapp",
  },
});

wa.on("messages", async (ctx) => {
  console.log("ctx: ", ctx);
  if (!ctx.citation?.isMy) return;

  wa.forward({
    text: "test",
    externalAdReply: {
      title: "test",
      body: "test",
      thumbnailUrl: "https://github.com/zeative.png",
      sourceUrl: "https://github.com/zeative.png",
    },
  })
});
