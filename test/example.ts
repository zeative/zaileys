import Client from "../src";

// the configuration below is the default
const wa = new Client({
  prefix: "/", // command prefix
  phoneNumber: 628123456789, // bot phone number for pairing
  authType: "pairing", // authentication method: 'pairing' | 'qr'
  ignoreMe: true, // ignore messages sent by the bot
  showLogs: true, // enable message logs
  autoMentions: true, // automatically user mentions
  autoOnline: true, // automatically set status to online
  autoRead: true, // automatically mark messages as read
  autoPresence: true, // manage presence updates 'typing' or 'recording'
  autoRejectCall: true, // automatically reject incoming calls
  database: {
    type: "sqlite", // database type: 'sqlite' | 'postgresql' | 'mysql'
    connection: { url: "./session/zaileys.db" },
  },
  citation: {
    // your own keys; will generate ctx.citation.is<Key> booleans
    author: async () => {
      // const res = await fetch(...)
      return [628123456789];
    },
    myGroup: () => [120099],
    vipUsers: () => [628123456789],
  },
});

wa.on("connection", (ctx) => {
  //
});

wa.on("messages", async (ctx) => {
  if (!ctx.citation?.isAuthor) return;
  const roomId = ctx.roomId;
  const message = ctx.message();
  console.log("🚀 ~ example.ts:35 ~ wa.on ~ ctx:", ctx);
});

wa.on("calls", (ctx) => {
  wa.rejectCall(ctx);
});
