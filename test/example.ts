import { Client } from "../dist";

const wa = new Client({
  prefix: "/",
  // phoneNumber: 6287833764462,
  authType: "qr",
  citation: {
    author: () => [6285136635787],
  },
});

wa.on("messages", async (ctx) => {
  if (!ctx.citation?.isAuthor) return;
  const roomId = ctx.roomId;
  const message = ctx.message;

  if (ctx.isPrefix) {
    // text ===>>> /image
    if (ctx.text == "image") {
      await wa.text({ image: "https://github.com/zaadevofc.png" }, { roomId });
      await wa.text({ sticker: "https://github.com/zaadevofc.png" }, { roomId });
    }

    // text ===>>> /text
    if (ctx.text == "text") {
      wa.text("Holaaa", { roomId });
    }

    // text ===>>> /location
    if (ctx.text == "location") {
      wa.location(
        {
          title: "Location Message",
          footer: "Location Footer",
          latitude: 24.121231,
          longitude: 55.1121221,
        },
        { roomId }
      );
    }

    // text ===>>> /contact
    if (ctx.text == "contact") {
      wa.contact(
        {
          fullname: "zaadevofc",
          nickname: "Kejaa",
          role: "Fullstack Developer",
          homeAddress: "Home Address",
          workAddress: "Work Address",
          organization: "Zeative Media",
          whatsAppNumber: 628123456789,
          callNumber: 628123456789,
          voiceNumber: 628123456789,
          email: "zaadevofc@gmail.com",
          website: "https://instagram.com/zaadevofc",
          avatar: "https://github.com/zaadevofc.png",
        },
        { roomId }
      );
    }
  }

  if (ctx.text == "reply") {
    wa.text("Holaaa", { roomId, quoted: message });
  }

  if (ctx.text == "combine") {
    wa.text("Verified message with forwarded", { roomId, quoted: message, verifiedReply: "whatsapp", asForwarded: true });
  }

  if (ctx.text == "combine") {
    wa.text("Verified message with forwarded", { roomId, quoted: message, verifiedReply: "whatsapp" });
  }
});
