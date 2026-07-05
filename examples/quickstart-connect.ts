/**
 * Connect, scan the QR, and echo incoming text (with quoted-reply lookup).
 *
 * Run: bun run examples/quickstart-connect.ts
 */
import { Client } from "../src/index.js";

const client = new Client();

client.on("qr", ({ qrString }) => console.log("Scan QR:", qrString));
client.on("connect", ({ me }) => console.log("Connected as", me.id));

client.on("message", async (msg) => {
  const roomName = await msg.roomName();
  console.log("Received text:", msg);
  console.log("Main Room Name", roomName);

  const quoted = await msg.replied();

  if (quoted) {
    const quotedRoomName = await quoted.roomName();
    console.log("Quoted Room Name", quotedRoomName);
    console.log("In reply to:", quoted);
  }
});
