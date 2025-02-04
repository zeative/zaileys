import { Client } from "../src";

const PREFIX = "/";

const wa = new Client({
  prefix: PREFIX,
  ignoreMe: true,
  phoneNumber: 6287833764462,
  authPath: ".zaileys",
  authType: "pairing",
  showLogs: true,
  autoMentions: true,
  autoOnline: true,
  autoRead: true,
  autoRejectCall: true,
  citation: {
    authors: () => ["6285136635787"],
    myGroups: () => ["120363349871725249", "120363349997524081", "120363329888828085"],
  },
});

wa.on("connection", (ctx) => {
  if (ctx.status == "open") {
    // do something
  }
});

wa.on("message", async (ctx) => {
  console.log("🚀 ~ wa.on ~ ctx:", ctx);
  if (!ctx.citation!.isMyGroups) return;

  if (ctx.text == "ping") {
    wa.sendText(`Pong 🏓`, { footer: "njaii" });
  }

  if (ctx.command == "command") {
    wa.sendText(`This is command message with prefix => *${PREFIX}*`);
  }

  if (ctx.text == "reply") {
    wa.sendReply(`This is reply message from *${ctx.senderName}*`);
  }

  if (ctx.command == "tags") {
    wa.sendReply(ctx.text.slice(6));
  }

  if (ctx.command == "image") {
    const buffer1 = await ctx.media?.buffer!();
    const buffer2 = await ctx.reply?.media?.buffer!();
    const url = ctx.text.split(" ")[1];

    wa.sendImage(buffer1 || buffer2 || url || "https://github.com/zaadevofc.png", { asReply: true });
  }

  if (ctx.text == "button.reply") {
    wa.sendReply(`This is reply message from *${ctx.senderName}*`);
  }

  if (ctx.chatType == "sticker") {
    const buffer = await ctx.media?.buffer!();

    wa.sendSticker(buffer!);
  }

  if (ctx.chatType == "video") {
    const buffer = await ctx.media?.buffer!();

    wa.sendVideo(buffer!);
  }

  if (ctx.chatType == "audio") {
    const buffer = await ctx.media?.buffer!();

    wa.sendAudio(buffer!);
  }

  if (ctx.chatType == "ptv") {
    const buffer = await ctx.media?.buffer!();

    wa.sendVideo(buffer!);
  }
});
