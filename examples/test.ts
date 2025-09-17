import { Client } from "../src";

const wa = new Client({
  authType: "pairing",
  phoneNumber: 6287833764462,
  fakeReply: {
    provider: "whatsapp",
  }
});

wa.on("messages", async (ctx) => {
  if (ctx.text == ".zanjay") {
    wa.reply("oii");
  }
});
