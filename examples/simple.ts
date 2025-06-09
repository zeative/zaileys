import { Client } from "../src";
// import { Client } from "zaileys";

const wa = new Client({
  authType: "qr", // has issue with pairing code, just use qr only
});

wa.on("messages", (ctx) => {
  wa.text("Hello!", { roomId: ctx.roomId });
});

wa.on("calls", (ctx) => {
  if (ctx.status == "terminate") {
    wa.text("Why call me!?", { roomId: ctx.roomId });
  }
});
