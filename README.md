<div align='center'>
  <img alt="Zaileys - Simplify Typescript/Javascript WhatsApp NodeJS API" src="https://socialify.git.ci/zeative/zaileys/image?description=1&amp;descriptionEditable=Zaileys%20is%20a%20simplified%20version%20of%20the%20Baileys%20package%20%0Awhich%20is%20easier%20and%20faster.&amp;font=KoHo&amp;forks=1&amp;issues=1&amp;language=1&amp;name=1&amp;owner=1&amp;pattern=Circuit%20Board&amp;pulls=1&amp;stargazers=1&amp;theme=Auto">
</div>

<h1 align="center">Zaileys - Simplify Typescript/Javascript WhatsApp NodeJS API</h1>

<div align='center'>

[![NPM Version](https://img.shields.io/npm/v/zaileys.svg)](https://www.npmjs.com/package/zaileys)
[![NPM Downloads](https://img.shields.io/npm/dw/zaileys?label=npm&color=%23CB3837)](https://www.npmjs.com/package/zaileys)
[![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/zeative/zaileys)](https://www.npmjs.com/package/zaileys)
[![GitHub License](https://img.shields.io/github/license/zeative/zaileys)](https://github.com/zeative/zaileys)
[![GitHub Repo stars](https://img.shields.io/github/stars/zeative/zaileys)](https://github.com/zeative/zaileys)
[![GitHub forks](https://img.shields.io/github/forks/zeative/zaileys)](https://github.com/zeative/zaileys)

</div>

> [!NOTE]
> Join whatsapp community for latest info [WhatsApp Channel](https://whatsapp.com/channel/0029VazENbmInlqHIWzgn33h)

> **Zaileys** is a simplified, high-performance wrapper around the Baileys library for building WhatsApp bots and integrations with TypeScript/JavaScript. Designed for simplicity, speed, and scalability—perfect for beginners and pros alike.


## 📋 Table of Contents

1. [🚀 Features](#🚀-features)
2. [💻 Installation](#💻-installation)
3. [⚡ Quick Start](#⚡-quick-start)
4. [🔍 Core Concepts](#🔍-core-concepts)
   - [Client](#client)
   - [Sessions & Authentication](#sessions--authentication)
   - [Messages & Events](#messages--events)
   - [Citation Concept](#citation-concept)
5. [⚙️ Configuration & Options](#⚙️-configuration--options)
6. [📁 Examples](#📁-examples)
7. [📢 Event Handling](#📢-event-handling)
8. [👾 Worker Actions](#👾-worker-actions)
   - [Sending Messages](#sending-messages)
   - [Sending Media](#sending-media)
   - [Presence Update](#presence-update)
   - [Get Profile](#get-profile)
   - [Reject Call](#reject-call)
9. [🐞 Issues & Feedback](#🐞-issues--feedback)
10. [❤️ Funding & Support](#❤️-funding--support)
11. [📄 License](#📄-license)
12. [🙏 Acknowledgements](#🙏-acknowledgements)


## 🚀 Features

- 🎯 **Simplified API**: Minimal boilerplate—get up and running in minutes.
- 🔒 **Secure Multi-Device**: Full multi-device support via Baileys.
- ⚙️ **Modular & Extensible**: Plug-and-play middleware, transports, and storage layers.
- ~~📈 **Built-in Logging**: Integrated with Pino for structured logs.~~
- 📟 **Live QRs**: Automatically generate and display WhatsApp QR codes in terminal.
- 🛠️ **TypeScript First**: Full type definitions (`.d.ts`) and zero-config TS support.


## 💻 Installation

Install with your preferred package manager:

```bash
npm install zaileys
# or
yarn add zaileys
# or
pnpm add zaileys

# just install, don't run with these runtime
bun add zaileys
deno add npm:zaileys
```

> ❗ **Compatibility Notice**
>
> - Zaileys does **not** support **Deno** and **Bun** runtimes at runtime due to `better-sqlite3` incompatibility. You may install dependencies with these runtimes, but execution requires **Node.js**.
> - Supports both **CommonJS (CJS)** and **ECMAScript Modules (ESM)**.

Ensure you are running Node.js **>= 18** as specified in `package.json`.


## ⚡ Quick Start

Basic usage of Zaileys based on [`test/example.ts`](https://github.com/zeative/zaileys/blob/main/test/example.ts):

```ts
// cjs
// const Client = require("zaileys");

// esm
import Client from "zaileys";

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

// Connection updates
wa.on("connection", (ctx) => {
  //
});

// Message events
wa.on("messages", async (ctx) => {
  // Example: checking generated flags
  if (!ctx.citation?.isAuthor) return;
  if (ctx.citation.isVipUsers) {
    // VIP handling
  }

  if (ctx.text === "test") {
    wa.text("Helloo", { roomId: ctx.roomId });
  }
});

// Call events
wa.on("calls", (ctx) => {
  //
});
```

### Simplify Version

```js
// auth with pairing code
const wa = new Client({
  phoneNumber: 628123456789,
  authType: "pairing",
});

// auth with qr
const wa = new Client({
  authType: "qr",
});

wa.on("messages", (ctx) => {
  wa.reply('hello')
})
```

## 📁 Examples

Refer to [`test/example.ts`](https://github.com/zeative/zaileys/blob/main/test/example.ts) for complete example usage.


## 🔍 Core Concepts

### Sessions & Authentication

Zaileys persists authentication credentials in your specified `session`. Re-running your bot will reuse credentials—no QR scan or pairing code required each time.

#### Citation Concept

Zaileys provides a flexible **citation** mechanism. Define any metadata provider functions under the `citation` option. Each key will automatically generate a boolean on `ctx.citation`, prefixed with `is` and formatted in camelCase.

Providers can be **async** or **sync**, and Zaileys will await Promises:

```ts
citation: {
  // async provider
  authorAsync: async () => await fetchAuthorizedAuthors(),
  // sync provider
  vipList: () => [1234567890]
}
```

Results in:

- `ctx.citation.isAuthorAsync`
- `ctx.citation.isVipList`

Use them in handlers:

```ts
wa.on("messages", (ctx) => {
  if (!ctx.citation?.isAuthorAsync) return;
  if (ctx.citation.isVipList) {
    // VIP logic
  }
});
```

## 📢 Event Handling

```js
// Connection updates
wa.on("connection", (ctx) => {});

// Message events
wa.on("messages", (ctx) => {});

// Call events
wa.on("calls", (ctx) => {});
```

## 👾 Worker Actions

### Sending Messages

```js
const roomId = ctx.roomId;
const message = ctx.message;

// sending text message
wa.text("Hallo test", { roomId });

// sending reply message
wa.text("Test reply", { roomId, quoted: message });

// sending text message as forwarded
wa.text("Test forwarded", { roomId, asForwarded: true });

// sending reply message as verified number
wa.text("Test verified reply", { roomId, quoted: message, verifiedReply: "whatsapp" });

// also combine verified number and forwarded
wa.text("Test verified reply", { roomId, quoted: message, verifiedReply: "meta", asForwarded: true });

// sending view once message
// support: image, video, audio
wa.text({ image: "https://github.com/zaadevofc.png", text: "Test view once" }, { roomId, asViewOnce: true });

// sending reaction message
// empty string for removing reaction
wa.reaction("🐞", { message });

// editing message
const msg1 = await wa.text("Test edit", { roomId });
wa.edit("Editing success", { message: msg1?.message });

// deleting message
const msg2 = await wa.text("Test delete", { roomId });
wa.delete("Deleting success", { message: msg2?.message });

// sending location message
wa.location({ latitude: 24.121231, longitude: 55.1121221, ...other }, { roomId });

// sending contact message
wa.contact({ fullname: "Kejaa", whatsAppNumber: 628123456789, ...other }, { roomId });

// sending polling message
wa.poll({ name: "Are you love me?", answers: ["yes", "maybe", "no"] }, { roomId });
```

### Sending Media

```js
// sending image message
wa.text({ image: "https://github.com/zaadevofc.png", text: "Test image message" }, { roomId });
// buffer
wa.text({ image: fs.readFileSync("example/file.png"), text: "Test image message" }, { roomId });

// sending sticker message
wa.text({ sticker: "https://github.com/zaadevofc.png" }, { roomId });

// sending gif message
wa.text({ gif: "https://qu.ax/nTFwh.mp4" }, { roomId });

// sending video message
wa.text({ video: "https://qu.ax/nTFwh.mp4", text: "Test video message" }, { roomId });

// sending video note message
wa.text({ videoNote: "https://qu.ax/nTFwh.mp4" }, { roomId });

// sending audio message
// use .ogg format for better device support
wa.text({ audio: "https://qu.ax/oeSCG.ogg" }, { roomId });

// sending voice note message
// use .ogg format for better device support
wa.text({ audioNote: "https://qu.ax/oeSCG.ogg" }, { roomId });
```

### Presence Update

```js
// available presence types:
// typing | recording | online | offline | paused
wa.presence("typing", { roomId });
```

### Get Profile

```js
// get user profile
wa.profile("6281223456789@s.whatsapp.net");

// get group profile
wa.profile("1209999@g.us");
```

### Reject Call

```js
wa.on("calls", (ctx) => {
  wa.rejectCall({ callId: ctx.callId, callerId: ctx.callerId });

  // for simplify
  wa.rejectCall(ctx);
});
```

## 🐞 Issues & Feedback

If you encounter any problems or have feature requests, please open an issue:
[https://github.com/zeative/zaileys/issues](https://github.com/zeative/zaileys/issues)

## ❤️ Funding & Support

If you find Zaileys useful, consider supporting development:

- [Buy me a coffee ☕](https://saweria.co/zaadevofc)
- ⭐ Star the repo on GitHub

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](https://github.com/zeative/zaileys/blob/main/LICENSE) for details.

## 🙏 Acknowledgements

This project stands on the shoulders of the original [Baileys](https://github.com/WhiskeySockets/Baileys) library by Whiskey Sockets. Thank you for your incredible work and inspiration!"

> Happy coding! 🚀
