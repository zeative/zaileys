import { Client } from "../src";

const wa = new Client({
  prefix: ".",
  authType: "qr",
});

wa.on("messages", async (ctx) => {
  if (!ctx.isPrefix) return;

  if (ctx.text == "text") {
    wa.text("Hello @628123456789 @0");
  }

  if (ctx.text == "reply") {
    wa.reply("Test reply message...");
  }
});
