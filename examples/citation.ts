import { Client } from "../src";
// import { Client } from "zaileys";

const wa = new Client({
  authType: "qr", // has issue with pairing code, just use qr only,
  citation: {
    authors: () => [62858000000, 628580000],
    otherNumbers: () => [62830000000, 628300000],
    premiumUsers: async () => {
      const numbers = await fetch("https://api.npoint.io/cd9d2eeb80838a6c86bb").then((x) => x.json()).catch(() => []);
      return numbers;
    },
  },
});

wa.on("messages", (ctx) => {
  const { citation, roomId } = ctx;

  // from 'author' to 'isAuthors'
  console.log(citation?.isAuthors); // boolean

  if (citation?.isPremiumUsers) {
    wa.text("Hello premium users!", { roomId });
  }
});
