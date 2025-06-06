<div align="center">
  <img alt="Zaileys - Simplified WhatsApp Node.js API" src="https://socialify.git.ci/zeative/zaileys/image?description=1&descriptionEditable=Zaileys%20is%20a%20simplified%20version%20of%20the%20Baileys%20package%20%0Awhich%20is%20easier%20and%20faster.&font=KoHo&forks=1&issues=1&language=1&name=1&owner=1&pattern=Circuit%20Board&pulls=1&stargazers=1&theme=Auto">
</div>

<h1 align="center">Zaileys - Simplified WhatsApp Node.js API</h1>

<div align="center">
  <a href="https://www.npmjs.com/package/zaileys">
    <img src="https://img.shields.io/npm/v/zaileys.svg" alt="NPM Version">
  </a>
  <a href="https://www.npmjs.com/package/zaileys">
    <img src="https://img.shields.io/npm/dw/zaileys?label=npm&color=%23CB3837" alt="NPM Downloads">
  </a>
  <a href="https://github.com/zeative/zaileys">
    <img src="https://img.shields.io/github/languages/code-size/zeative/zaileys" alt="GitHub Code Size">
  </a>
  <a href="https://github.com/zeative/zaileys">
    <img src="https://img.shields.io/github/license/zeative/zaileys" alt="GitHub License">
  </a>
  <a href="https://github.com/zeative/zaileys">
    <img src="https://img.shields.io/github/stars/zeative/zaileys" alt="GitHub Stars">
  </a>
  <a href="https://github.com/zeative/zaileys">
    <img src="https://img.shields.io/github/forks/zeative/zaileys" alt="GitHub Forks">
  </a>
</div>

> [!NOTE]
> Join our [WhatsApp Channel](https://whatsapp.com/channel/0029VazENbmInlqHIWzgn33h) for updates and support.

**Zaileys** is a lightweight, high-performance wrapper around the Baileys library for building WhatsApp bots and integrations using TypeScript or ESM JavaScript. Designed for simplicity, speed, and scalability.

> [!WARNING]
> Pairing code authentication is currently experiencing issues and is not supported. Use QR code authentication instead.

## 📋 Table of Contents

1. [🚀 Features](#features)
2. [💻 Installation](#installation)
3. [⚡ Quick Start](#quick-start)
   - [Simplify Version](#simplify-version)
4. [🔍 Core Concepts](#core-concepts)
5. [📢 Event Handling](#event-handling)
6. [👾 Worker Actions](#worker-actions)
7. [🐞 Issues & Feedback](#issues--feedback)
8. [❤️ Support](#support)
9. [📄 License](#license)
10. [🙏 Acknowledgements](#acknowledgements)

## 🚀 Features

- 🎯 **Simplified API**: Minimal setup for rapid development.
- 🔒 **Secure Multi-Device**: Full multi-device support via Baileys.
- ⚙️ **Modular Design**: Extensible with middleware and storage layers.
- 📟 **QR Code Authentication**: Seamless QR-based login in terminal.
- 🛠️ **TypeScript/ESM Only**: Full type definitions and ESM support.
- 💾 **Database-Driven**: SQLite, PostgreSQL, or MySQL for session storage.

## 💻 Installation

Install via your preferred package manager:

```bash
npm install zaileys
# or
yarn add zaileys
# or
pnpm add zaileys
```

> [!IMPORTANT]
>
> - Requires **Node.js >= 18**.
> - Only supports **ESM** and **TypeScript** (no CommonJS).
> - QR code authentication only (pairing code not supported).
> - Deno and Bun are not supported at runtime due to `better-sqlite3` incompatibility.

## ⚡ Quick Start

For a complete example, see [`/test/example.ts`](https://github.com/zeative/zaileys/blob/main/test/example.ts).

```ts
import { Client } from "zaileys";

const wa = new Client({
  prefix: "/", // Command prefix
  ignoreMe: true, // Ignore bot's own messages
  autoRead: true, // Auto-mark messages as read
  autoOnline: true, // Auto-set status to online
  autoPresence: true, // Auto-manage presence (typing/recording)
  autoRejectCall: true, // Auto-reject incoming calls
  database: {
    type: "sqlite",
    connection: { url: "./session/zaileys.db" },
  },
});

wa.on("messages", async (ctx) => {
  if (ctx.text === "test") {
    await wa.text("Hello!", { roomId: ctx.roomId });
  }
});

wa.on("connection", (ctx) => {
  console.log("Connection status:", ctx.status);
});
```

### Simplify Version

```ts
import { Client } from "zaileys";

const wa = new Client({
  authType: "qr",
});

wa.on("messages", (ctx) => {
  wa.text("Hello", { roomId: ctx.roomId });
});
```

## 🔍 Core Concepts

### Sessions & Authentication

Zaileys uses QR code authentication and stores session data in a database (SQLite, PostgreSQL, or MySQL) for seamless reconnections without repeated QR scans.

```ts
import { Client } from "zaileys";

const wa = new Client({
  database: {
    type: "sqlite",
    connection: { url: "./session/zaileys.db" },
  },
});
```

### Citation Mechanism

Define custom metadata providers in the `citation` option. Each key generates a boolean on `ctx.citation` (e.g., `isKeyName`).

```ts
const wa = new Client({
  citation: {
    admins: async () => [628123456789],
    vips: () => [628123456789],
  },
});

wa.on("messages", (ctx) => {
  if (ctx.citation?.isAdmins) {
    wa.text("Admin access granted", { roomId: ctx.roomId });
  }
});
```

## 📢 Event Handling

```ts
wa.on("connection", (ctx) => {
  console.log("Connection:", ctx.status);
});

wa.on("messages", (ctx) => {
  console.log("Message:", ctx.text);
});

wa.on("calls", (ctx) => {
  wa.rejectCall(ctx);
});
```

## 👾 Worker Actions

### Sending Messages

```ts
const roomId = ctx.roomId;
const message = ctx.message;

wa.text("Hello", { roomId });
wa.text("Reply", { roomId, quoted: message });
wa.text("Forwarded", { roomId, asForwarded: true });
wa.text("Verified reply", { roomId, quoted: message, verifiedReply: "whatsapp" });
wa.text({ image: "https://example.com/image.png", text: "View once" }, { roomId, asViewOnce: true });
wa.reaction("👍", { message });
wa.edit("Edited", { message: await wa.text("Original", { roomId })?.message });
wa.delete("Deleted", { message: await wa.text("To delete", { roomId })?.message });
wa.location({ latitude: 24.121231, longitude: 55.1121221 }, { roomId });
wa.contact({ fullname: "Kejaa", whatsAppNumber: 628123456789 }, { roomId });
wa.poll({ name: "Do you love me?", answers: ["Yes", "Maybe", "No"] }, { roomId });
```

### Sending Media

Supports URLs and local files (via Buffer).

```ts
import fs from "fs";

// Image (URL or file)
wa.text({ image: "https://example.com/image.png", text: "Image" }, { roomId });
wa.text({ image: fs.readFileSync("example/image.png"), text: "Image" }, { roomId });

// Sticker
wa.text({ sticker: "https://example.com/sticker.png" }, { roomId });
wa.text({ sticker: fs.readFileSync("example/sticker.png") }, { roomId });

// GIF
wa.text({ gif: "https://example.com/video.mp4" }, { roomId });
wa.text({ gif: fs.readFileSync("example/video.mp4") }, { roomId });

// Video
wa.text({ video: "https://example.com/video.mp4", text: "Video" }, { roomId });
wa.text({ video: fs.readFileSync("example/video.mp4"), text: "Video" }, { roomId });

// Video Note
wa.text({ videoNote: "https://example.com/video.mp4" }, { roomId });
wa.text({ videoNote: fs.readFileSync("example/video.mp4") }, { roomId });

// Audio (use .ogg for better compatibility)
wa.text({ audio: "https://example.com/audio.ogg" }, { roomId });
wa.text({ audio: fs.readFileSync("example/audio.ogg") }, { roomId });

// Voice Note (use .ogg for better compatibility)
wa.text({ audioNote: "https://example.com/audio.ogg" }, { roomId });
wa.text({ audioNote: fs.readFileSync("example/audio.ogg") }, { roomId });
```

### Presence Update

```ts
wa.presence("typing", { roomId }); // Options: typing, recording, online, offline, paused
```

### Get Profile

```ts
wa.profile("628123456789@s.whatsapp.net"); // User profile
wa.profile("1209999@g.us"); // Group profile
```

### Reject Call

```ts
wa.on("calls", (ctx) => {
  wa.rejectCall({ callId: ctx.callId, callerId: ctx.callerId });
});
```

## 🐞 Issues & Feedback

Report issues or request features at [GitHub Issues](https://github.com/zeative/zaileys/issues).

## ❤️ Support

Support the project:

- [Buy me a coffee ☕](https://saweria.co/zaadevofc)
- ⭐ Star the repo on [GitHub](https://github.com/zeative/zaileys).

## 📄 License

[MIT License](https://github.com/zeative/zaileys/blob/main/LICENSE).

## 🙏 Acknowledgements

Built on [Baileys](https://github.com/WhiskeySockets/Baileys) by Whiskey Sockets.

> Happy coding! 🚀
