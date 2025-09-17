<div align="center">
  <img alt="Zaileys - Simplified WhatsApp Node.js API" src="https://socialify.git.ci/zeative/zaileys/image?description=1&descriptionEditable=Zaileys%20is%20a%20simplified%20version%20of%20the%20Baileys%20package%20%0Awhich%20is%20easier%20and%20faster.&font=KoHo&forks=1&issues=1&language=1&name=1&owner=1&pattern=Circuit%20Board&pulls=1&stargazers=1&theme=Auto">

  <h1 align="center">Zaileys - Simplified WhatsApp Node.js API</h1>

<a href="https://www.npmjs.com/package/zaileys"><img src="https://img.shields.io/npm/v/zaileys.svg" alt="NPM Version"></a>
<a href="https://www.npmjs.com/package/zaileys"><img src="https://img.shields.io/npm/dw/zaileys?label=npm&color=%23CB3837" alt="NPM Downloads"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/languages/code-size/zeative/zaileys" alt="GitHub Code Size"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/license/zeative/zaileys" alt="GitHub License"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/stars/zeative/zaileys" alt="GitHub Stars"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/forks/zeative/zaileys" alt="GitHub Forks"></a>

</div>

**Zaileys** is a lightweight, user-friendly wrapper around the [Baileys](https://github.com/WhiskeySockets/Baileys) library, designed to simplify building WhatsApp bots and integrations with TypeScript or ESM JavaScript. It offers a streamlined API, robust multi-device support, and seamless database integration for session management.

> [!TIP]
> Stay updated and get support by joining our [WhatsApp Channel](https://whatsapp.com/channel/0029VazENbmInlqHIWzgn33h).

> [!IMPORTANT]
> There is no assurance that you won’t get blocked when using this approach. WhatsApp does not permit bots or unofficial clients, so use it at your own risk.

### 💠 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Example Projects](#-example-projects)
- [Connecting Methods](#-connecting-methods)
  - [QR Code](#qr-code)
  - [Pairing Code](#pairing-code)
- [Quick Start](#-quick-start)
- [Core Concepts](#-core-concepts)
  - [Citation](#citation)
  - [Limiter](#limiter)
  - [Fake Reply](#fake-reply)
- [Event Handling](#-event-handling)
- [Relay Handling](#-relay-handling)
  - [General](#general)
    - [Text Message](#text-message)
    - [Reply Message](#reply-message)
    - [Forward Message](#forward-message)
    - [Edit Message](#edit-message)
    - [Delete Message](#delete-message)
    - [Reaction Message](#reaction-message)
    - [Presence](#presence)
    - [Reject](#reject)
  - [Media](#media)
    - [Document Message](#document-message)
    - [Image Message](#image-message)
    - [Sticker Message](#sticker-message)
    - [Video Message](#video-message)
    - [Audio Message](#audio-message)
    - [Voice Message](#voice-message)
    - [Note Message](#note-message)
    - [Gif Message](#gif-message)
    - [Location Message](#location-message)
    - [Contacts Message](#contacts-message)
    - [Poll Message](#poll-message)
    - [Button Message](#button-message)
  - [Group Control](#group-control)
    - [Group Create](#group-create)
    - [Group Action](#group-action)
    - [Group Invite](#group-invite)
    - [Group Update](#group-update)
    - [Group Settings](#group-settings)
    - [Group Leave](#group-leave)
    - [Group Links](#group-links)
    - [Group Invite](#group-invite)
    - [Group Metadata](#group-metadata)
  - [Privacy Control](#privacy-control)
    - [Privacy Update](#privacy-update)
    - [Privacy Fetch](#privacy-fetch)
  - [Profile Control](#profile-control)
    - [Profile Bio](#profile-bio)
    - [Profile Avatar](#profile-avatar)
    - [Profile Business](#profile-business)
    - [Profile Update](#profile-update)
    - [Profile Check](#profile-check)
- [Issues & Feedback](#-issues---feedback)

### 💠 Features

- 🎯 **Simplified API**: Minimal boilerplate get up and running in minutes.
- 🔒 **Secure Multi-Device**: Full multi-device support via Baileys.
- ⚙️ **Modular & Extensible**: Plug-and-play middleware, transports, and storage layers.
- 📟 **Multi Auth (QR and Pairing Code)**: Connect to whatsapp with QR code or Pairing Code.
- 🛠️ **TypeScript First**: Full type definitions and zero-config TS support.
- ~~📈 **Built-in Logging**: Integrated with Pino for structured logs.~~

### 💠 Installation

> [!WARNING]
> Ensure you are running [Node.js](https://nodejs.org/) **>= 20** as specified in `package.json`.

Install with your preferred package manager:

```bash
npm install zaileys
# or
yarn add zaileys
# or
pnpm add zaileys
# or
bun add zaileys
deno add npm:zaileys
```

Then import your code using:

```js
import { Client } from "zaileys";
// or
const { Client } = require("zaileys");
```

### 💠 Example Projects

Explore the `examples` for practical use cases:

- [Simple Setup](https://github.com/zeative/zaileys/blob/main/examples/simple.ts): A minimal setup for quick prototyping.
- [Citation Example](https://github.com/zeative/zaileys/blob/main/examples/citation.ts): Demonstrates custom metadata with the citation mechanism.
- [Rate Limiting Example](https://github.com/zeative/zaileys/blob/main/examples/limiter.ts): Shows how to implement spam detection.
- [AI Integration with Groq](https://github.com/zeative/zaileys/blob/main/examples/llms.ts): Integrates AI capabilities using Groq.
- [Voice Note with AI](https://github.com/zeative/zaileys/blob/main/examples/speech.ts): Interacts with AI using voice notes.

### 💠 Connecting Methods

> [!TIP]
> You can connect to WhatsApp using either a QR code or a pairing code.

### `QR Code`

```js
const wa = new Client({
  authType: "qr",
});
```

### `Pairing Code`

```js
const wa = new Client({
  authType: "pairing",
  phoneNumber: 628123456789,
});
```

### 💠 Quick Start

here is minimal example of how to run:

```js
const wa = new Client({ authType: "qr" });

wa.on("messages", (ctx) => {
  if (ctx.text == "ping") {
    wa.text("pong");
  }
});
```

### 💠 Core Concepts

### `Citation`

Define custom metadata providers for dynamic boolean flags in `ctx.citation`. See `citation.ts`.

```js
const wa = new Client({
  ...,
  citation: {
    admins: [628123456789]
  }
})

wa.on("messages", (ctx) => {
  // from 'admins' to 'isAdmins'
  // from 'test' to 'isTest'
  if (ctx.citation?.isAdmins) {
    wa.text("Admin access granted")
  }
})
```

### `Limiter`

Detect and prevent spam with the built-in limiter. See limiter.ts.

```js
const wa = new Client({
  ...,
  // max 5 messages on 10 seconds
  limiter: {
    durationMs: 10000,
    maxMessages: 5
  }
})

wa.on("messages", (ctx) => {
  if (ctx.isSpam) {
    wa.text("You're spamming!!");
  }
})
```

### `Fake Reply`

Make it look like the number verified by manipulation.

```js
const wa = new Client({
  ...,
  fakeReply: {
    provider: "whatsapp", // meta | chatgpt | copilot | instagram | tiktok
  }
})

wa.on("messages", (ctx) => {
  if (ctx.text == "test") {
    wa.reply("Test reply...");
  }
})
```

### 💠 Event Handling

Types of events handled.

```js
/* Monitor connection status */
wa.on("connection", (ctx) => {});

/* Handle incoming messages */
wa.on("messages", (ctx) => {});

/* Handle incoming calls */
wa.on("calls", (ctx) => {});
```

### 💠 Relay Handling

### `General`

#### *Text Message*

```js
wa.text("Hello World!")
// or
wa.text({ text: "Hello World!" })

/* custom roomId */
wa.text({ text: "Hello World!", roomId: "12345@xxx" })
```

auto mentions user/group (works for both):

```js
wa.text("Hello @628123456789 @0")
```

external ads preview (works for both):

```js
wa.text({
  text: "Test ads text",
  externalAdReply: {
    title: "Test ads title",
    body: "Test ads body",
    thumbnailUrl: "https://github.com/zaadevofc.png",
    mediaUrl: "https://zpi.my.id",
  }
})
```

#### *Reply Message*

```js
wa.reply("Test reply message...")
```

#### *Forward Message*

```js
wa.forward("Test forward message...")
```

#### *Edit Message*

```js
const msg = await wa.text("Test edit message...")
await wa.edit({ text: "Edit success!", message: msg.message })
```

#### *Delete Message*

```js
const msg = await wa.text("Test delete message...")
await wa.delete({ message: msg.message })
```

#### *Reaction Message*

```js
wa.reaction("🎯")
// or
wa.reaction({ emoticon: "🎯" });
```

#### *Presence*

```js
wa.presence("typing") // online | offline | recording | paused
```

#### *Reject Call*

```js
wa.on("calls", (ctx) => {
  wa.reject(ctx);
  // or
  wa.reject({ callId: ctx.callId, callerId: ctx.callerId });
})
```

### 💠 Issues & Feedback

**If you encounter any problems or have feature requests, please open an [issue](https://github.com/zeative/zaileys/issues)**

- [Buy me a coffee ☕](https://saweria.co/zaadevofc)
- [Ko-Fi](https://ko-fi.com/zaadevofc)
- [Trakteer](https://trakteer.id/zaadevofc)
- ⭐ Star the repo on GitHub

### 💠 License

Distributed under the **MIT License**. See [`LICENSE`](https://github.com/zeative/zaileys/blob/main/LICENSE) for details.
