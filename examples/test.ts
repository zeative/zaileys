import { delay } from "baileys";
import { Client } from "../src";
import * as fs from "fs";

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
  if (!ctx.citation?.isMy) return;

  const tes = await wa.reply("galloo");

  await delay(3000);

  const efi = await wa.delete({ message: tes?.message });
  console.log("efi: ", efi);
});
