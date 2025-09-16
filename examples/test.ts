import { Client } from "../src";

const wa = new Client({
  authType: "pairing",
  phoneNumber: 6287833764462,
  citation: {
    my: [6285136635787],
  },
  fakeReply: {
    provider: "whatsapp",
  },
});

wa.on("messages", (ctx) => {
  if (!ctx.citation?.isMy) return;
  console.log("ctx :", ctx);
});








