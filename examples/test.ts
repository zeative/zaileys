import { Client } from "../src";

const wa = new Client({
  authType: "pairing",
  phoneNumber: 6287833764462,
  citation: {
    my: [6285136635787, 120363419134907062, 120363418759047982],
  },
  fakeReply: {
    provider: "whatsapp",
  },
});

wa.on("messages", async (ctx) => {
  console.log("ctx: ", ctx);
  if (!ctx.citation?.isMy) return;
});
