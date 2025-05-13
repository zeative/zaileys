import Client from "../src";

// the configuration below is the default
const wa = new Client({
  prefix: "/", // for command message, example '/'
  phoneNumber: 6287833764462, // fill bot phone number if auth type is 'pairing'
  authType: "pairing", // auth type 'pairing' or 'qr'
  ignoreMe: true, // ignore messages from bot (bot phone number)
  showLogs: true, // show logs of any chats
  autoMentions: true, // bot will be auto mentioned if text contains sender number with '@' prefix
  autoOnline: true, // bot status will be mark online
  autoRead: true, // auto read message from any chats
  autoPresence: true, // auto read message from any chats
  autoRejectCall: true, // auto reject call if someone call you
  database: {
    type: "sqlite", // database type "sqlite" | "postgresql" | "mysql"
    connection: {
      url: "./session/zaileys.db", // database url
    },
  },
  citation: {
    author: async () => {
      // const res = await fetch...
      return await [6285136635787];
    },
    myGroup: () => [120363349871725249],
  },
});

wa.on("connection", (ctx) => {
  //
});

wa.on("messages", async (ctx) => {
  if (!ctx.citation?.isAuthor) return;
  console.log("🚀 ~ example.ts:35 ~ wa.on ~ ctx:", ctx);

  if (ctx.text == "p1") {
    wa.text({ image: "https://qu.ax/qMelK.webp", text: "ankiaia" }, { roomId: ctx.roomId, asViewOnce: true });
  }

  if (ctx.text == "p2") {
    await wa.text("sds", { roomId: ctx.roomId });
  }

  if (ctx.text == "p3") {
    wa.location({ title: "Zaileys Location", footer: "JL Pahlawan Bangsa 2025", latitude: 24.121231, longitude: 55.1121221 }, { roomId: ctx.roomId, quoted: ctx.message });
  }

  if (ctx.text == "p4") {
    wa.contact({ fullname: "Kejaa", whatsAppNumber: 6285136635787 }, { roomId: ctx.roomId, quoted: ctx.message });
  }

  if (ctx.text == "p5") {
    wa.reaction("💖", { roomId: ctx.roomId, message: ctx.message });
  }

  if (ctx.text == "p6") {
    wa.poll({ name: "ahhaha", answers: ["yes", "no"] }, { roomId: ctx.roomId });
  }

  if (ctx.text == "p7") {
    const msg = await wa.text("ini mau diedit", { roomId: ctx.roomId });
    await wa.edit("teks telah diedit", { roomId: ctx.roomId, message: msg?.message! });
  }

  if (ctx.text == "p8") {
    const msg = await wa.text("ini mau diapus", { roomId: ctx.roomId });
    await wa.delete({ message: msg?.message! }, { roomId: ctx.roomId });
  }

  if (ctx.text == "p9") {
    await wa.mute({ expired: "8h" }, { roomId: ctx.roomId });
  }

  if (ctx.text == "p10") {
    const p10 = await wa.profile(ctx.roomId);
    console.log("🚀 ~ example.ts:78 ~ wa.on ~ p10:", p10);
  }
});

wa.on("calls", (ctx) => {
  console.log(ctx);
});
