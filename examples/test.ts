import { Client } from "../src";

const wa = new Client({
  authType: "pairing",
  phoneNumber: 6287833764462,
  fakeReply: {
    provider: "whatsapp",
  },
});

wa.on("messages", async (ctx) => {
  if (ctx.text == ".zanjay") {
    wa.reply({
      text: "Test ads text",
      externalAdReply: {
        title: "Test ads title",
        body: "Test ads body",
        thumbnailUrl: "https://github.com/zaadevofc.png",
        mediaUrl: "https://github.com/zaadevofc.png",
      },
    });
  }
});
