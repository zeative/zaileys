<div align="center">
  <img alt="Zaileys - Simplified WhatsApp Node.js TypeScript/JavaScript API" src="https://socialify.git.ci/zeative/zaileys/image?custom_description=Simplified+WhatsApp+Node.js+TypeScript%2FJavaScript+API&custom_language=TypeScript&description=1&font=Inter&language=1&owner=1&pattern=Charlie+Brown&theme=Auto">

  <h1 align="center">Zaileys - Simplified WhatsApp Node.js TypeScript/JavaScript API</h1>

<a href="https://www.npmjs.com/package/zaileys"><img src="https://img.shields.io/npm/v/zaileys.svg" alt="NPM Version"></a>
<a href="https://www.npmjs.com/package/zaileys"><img src="https://img.shields.io/npm/dw/zaileys?label=npm&color=%23CB3837" alt="NPM Downloads"></a>
<a href="https://github.com/zeative/zaileys/releases"><img src="https://img.shields.io/npm/dt/zaileys" alt="NPM Downloads"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/languages/code-size/zeative/zaileys" alt="GitHub Code Size"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/badge/TypeScript-5.0%2B-blue?style=flat-square&logo=typescript" alt="TypeScript"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/license/zeative/zaileys" alt="GitHub License"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/stars/zeative/zaileys" alt="GitHub Stars"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/forks/zeative/zaileys" alt="GitHub Forks"></a>

</div>

<div align="center">
  <p>
    <b>Zaileys</b> is a powerful, type-safe wrapper around Baileys, designed to simplify the development of WhatsApp bots. It provides a robust architecture with built-in state management, middleware support, and easy-to-use event handlers, making it perfect for building scalable and maintainable WhatsApp applications.
  </p>
</div>

<br>

<div align="center">

[🚀 Overview](#-overview) &nbsp;&nbsp;•&nbsp;&nbsp;
[🪶 Features](#-features) &nbsp;&nbsp;•&nbsp;&nbsp;
[📦 Installation](#-installation) &nbsp;&nbsp;•&nbsp;&nbsp;
[⚡ Quick Start](#-quick-start) &nbsp;&nbsp;•&nbsp;&nbsp;
[📨 Sending Messages](#-sending-messages) &nbsp;&nbsp;•&nbsp;&nbsp;
[🧩 Plugins](#-plugins) &nbsp;&nbsp;•&nbsp;&nbsp;
[🤝 Contributing](#-contributing)

</div>

<br>

---

## 🚀 Overview

> Zaileys solves the complexity of managing raw WhatsApp socket connections by providing a high-level, opinionated API. It is built for developers who need to create bots, customer support agents, or automated notification systems without getting bogged down in protocol details.

Targeting **Node.js** and **TypeScript** developers, Zaileys integrates essential features like rate limiting, session management, and input validation out of the box.

## 🪶 Features

- 🛡️ **Type-Safe Architecture**: Built with TypeScript and Zod for robust runtime validation and autocomplete.
- 🏓 **Middleware System**: Middleware support for intercepting and processing events globally.
- 🧩 **Plugin System**: Modularize your bot's logic with a file-based plugin architecture.
- 💾 **Built-in State Management**: Integrated `lowdb` support for easy JSON-based data persistence (chats, contacts, messages).
- 🔔 **Event-Driven API**: Simplified event listeners for `connection`, `messages`, and `calls` with rich context objects.
- 📢 **Rate Limiting**: Built-in protection against spam and excessive API usage.
- 🤖 **Auto-Automation**: Configurable options for auto-read, auto-rejecting calls, and more.
- 📲 **Multi-Device Support**: Full support for WhatsApp Multi-Device (MD) via QR code or Pairing Code.
- 🎬 **Built-in FFmpeg**: No need to install FFmpeg separately - it's bundled for media processing.

## 🎨 Concepts & Architecture

Zaileys is built around a few core concepts:

- **Client**: The main entry point. It extends the underlying signal handling and manages the connection lifecycle.
- **Context**: Every event comes with a rich object containing all relevant data and helper methods.
- **Middleware**: A pipeline that processes events before they reach your main handlers, useful for logging, auth checks, or spam filtering.
- **Plugins**: Reusable units of logic that can be dropped into the `plugins` directory.
- **Store**: A local JSON database (powered by `lowdb`) that automatically syncs chats and contacts.

## 📦 Installation

Install `zaileys` using your preferred package manager:

```bash
npm install zaileys
# or
pnpm add zaileys
# or
yarn add zaileys
```

> **Note**: Requires Node.js v20+ and TypeScript for best experience.

> **FFmpeg**: No need to install FFmpeg separately! It's already bundled with Zaileys for seamless media processing (audio, video, stickers).

## ⚡ Quick Start

Here is a minimal example to get your bot running with QR code authentication:

```typescript
import { Client } from 'zaileys';

const wa = new Client({
  authType: 'qr',
});

wa.on('messages', async (ctx) => {
  if (ctx.text == 'ping') {
    await wa.send(ctx.roomId, 'Pong! 🏓');
  }
});
```

## 🛠️ Configuration

The `Client` constructor accepts a configuration object. Below are the valid options based on the library's type definitions.

### General Options

These options apply to both authentication methods:

| Option            | Type      | Default     | Description                             |
| :---------------- | :-------- | :---------- | :-------------------------------------- |
| `session`         | `string`  | `'zaileys'` | Name of the session folder.             |
| `prefix`          | `string`  | `undefined` | Command prefix (e.g., `'/'`).           |
| `showLogs`        | `boolean` | `true`      | Enable internal logging.                |
| `ignoreMe`        | `boolean` | `true`      | Ignore messages sent by the bot itself. |
| `syncFullHistory` | `boolean` | `true`      | Sync full chat history on startup.      |

### Automation Options

| Option           | Type      | Default | Description                                                |
| :--------------- | :-------- | :------ | :--------------------------------------------------------- |
| `autoRead`       | `boolean` | `true`  | Automatically mark messages as read.                       |
| `autoOnline`     | `boolean` | `true`  | Automatically set presence to online.                      |
| `autoPresence`   | `boolean` | `true`  | Automatically send presence updates (composing/recording). |
| `autoMentions`   | `boolean` | `true`  | Automatically handle mentions.                             |
| `autoRejectCall` | `boolean` | `true`  | Automatically reject incoming calls.                       |

### Advanced Configuration

| Option      | Type     | Description                                                                     |
| :---------- | :------- | :------------------------------------------------------------------------------ |
| `limiter`   | `object` | Rate limiting configuration. Default: `maxMessages: 20, durationMs: 10_000`.    |
| `fakeReply` | `object` | Configuration for fake reply provider.                                          |
| `sticker`   | `object` | Default metadata for sticker creation (`packageName`, `authorName`, `quality`). |
| `citation`  | `object` | Custom citation sources.                                                        |

## 💡 Advanced Usage

### Middleware & Spam Protection

You can use middleware to filter messages or add custom logic before your handlers run.

```typescript
wa.use(async (ctx, next) => {
  if (ctx.messages.isSpam) {
    console.warn(`Spam detected from ${ctx.messages.senderName}`);
    return;
  }

  await next();
});
```

### 🧩 Plugins

Zaileys features a built-in file-based plugin system. By default, it looks for plugins in the `plugins` directory of your project root.

**1. Create a plugin file** (e.g., `plugins/hello.ts`):

```typescript
import { definePlugins } from 'zaileys';

export default definePlugins(
  async (wa, ctx) => {
    await wa.send(ctx.roomId, 'Hello from plugin!');
  },
  {
    matcher: ['/hello', '!hello'], // Trigger commands
    metadata: {
      description: 'A simple hello world plugin',
    },
  },
);
```

**2. That's it!** The client automatically loads and executes plugins that match the incoming message.

**3. Extract plugin information** (optional):

```typescript
const pluginsInfo = wa.plugins.getPluginsInfo();

/* Example output 
[
  {
    matcher: ['/hello', '!hello'],
    metadata: {
      description: 'A simple hello world plugin',
    },
  }
]
*/
```

This returns an array of all loaded plugins with their `matcher` and `metadata`, useful for generating help menus or listing available commands.

### 🔐 Citation (Custom Authorization)

Citation allows you to define custom authorization logic by creating named checkers that verify if a user is in a specific list (e.g., premium users, banned users).

**1. Configure citation sources** in the client options:

```typescript
const wa = new Client({
  authType: 'qr',
  citation: {
    premium: async () => {
      // const numbers = await fetch...
      return [6280000000, 12388888888];
    },
    banned: async () => {
      return [6285555555555];
    },
  },
});
```

**2. Use citation in your message handlers**:

```typescript
wa.on('messages', async (ctx) => {
  const isBanned = await ctx.citation.banned();
  const isPremium = await ctx.citation.premium();

  if (isBanned) return;

  if (isPremium) {
    await wa.send(ctx.roomId, 'Premium feature unlocked!');
  }
});
```

Each citation function returns `true` if the sender matches any ID in the returned list, `false` otherwise.

**How it works:**

Citation functions return an array of phone numbers, group id and lid Internally, Zaileys compares the sender's ID against this list by checking:

- `roomId` - The chat/group ID
- `senderId` - The sender's WhatsApp ID
- `senderLid` - The sender's LID

If any of these match a number in your returned array, the citation check returns `true`. This makes it flexible for both individual chats and group scenarios.

## 📫 Sending Messages

> **Quick Jump:** [Text](#send-text) · [Reply](#reply-to-message) · [Forward](#forward-message) · [Media](#send-media) · [Banner](#send-with-banner) · [Mentions](#mentions) · [Edit & Delete](#edit--delete-messages) · [Buttons](#interactive-buttons)

### Send Text

Send a simple text message to any chat.

```typescript
await wa.send(ctx.roomId, 'Hello World!');

await wa.send(ctx.roomId, {
  text: 'Hello with options!',
});
```

### Reply to Message

Reply to a specific message using the `replied` option.

```typescript
await wa.send(ctx.roomId, {
  text: 'This is a reply!',
  replied: ctx.message(),
});
```

### Forward Message

Forward message to any chat.

```typescript
await wa.forward(ctx.roomId, {
  text: 'Forwarded message',
  isForwardedMany: true,
});
```

### Send Media

Send images, videos, audio, stickers, or documents. Media can be a URL, Buffer, or base64 string.

**Image:**

```typescript
await wa.send(ctx.roomId, {
  image: 'https://example.com/image.jpg',
  caption: 'Check this out!',
});

await wa.send(ctx.roomId, {
  image: fs.readFileSync('./image.jpg'),
  caption: 'Image from buffer',
  isViewOnce: true,
});
```

**Video:**

```typescript
await wa.send(ctx.roomId, {
  video: 'https://example.com/video.mp4',
  caption: 'Cool video!',
  ptv: true,
});
```

**Audio:**

```typescript
await wa.send(ctx.roomId, {
  audio: 'https://example.com/audio.mp3',
  ptt: true,
});
```

**Sticker:**

```typescript
// support gif and video
await wa.send(ctx.roomId, {
  sticker: 'https://example.com/sticker.mp4',
});
```

**Document:**

```typescript
await wa.send(ctx.roomId, {
  document: 'https://example.com/file.pdf',
  fileName: 'document.pdf',
  caption: 'Here is the file',
});
```

### Send with Banner

Send messages with an external ad reply banner (link preview).

```typescript
await wa.send(ctx.roomId, {
  text: 'Banner message!',
  banner: {
    thumbnailUrl: 'https://github.com/zeative.png',
    sourceUrl: 'https://jaa.web.id',
    title: 'Test Banner',
    body: 'Hello World!',
  },
});
```

### Mentions

Mentions are automatically detected when `autoMentions` is enabled (default: `true`).

```typescript
// support lid
await wa.send(ctx.roomId, 'Hello @6281234567890!');
```

### Edit & Delete Messages

**Edit message:**

```typescript
const sent = await wa.send(ctx.roomId, 'Original text');

setTimeout(async () => {
  await wa.edit(sent, 'Edited text');
}, 2000);
```

**Delete message:**

```typescript
const sent = await wa.send(ctx.roomId, 'This will be deleted');

setTimeout(async () => {
  await wa.delete(sent);
}, 2000);

// or multiple messages
await wa.delete([sent1, sent2]);
```

### Interactive Buttons

Send messages with interactive buttons.

**Simple Buttons:**

Simple button has support Android/iPhone/Desktop

```typescript
await wa.button(ctx.roomId, {
  text: 'Choose an option:',
  buttons: {
    type: 'simple',
    data: [
      { id: 'btn1', text: 'Option 1' },
      { id: 'btn2', text: 'Option 2' },
      { id: 'btn3', text: 'Option 3' },
    ],
    footer: 'Footer text',
  },
});
```

**Advanced Buttons:**

> ⚠️ Experimental, only support Android/iPhone

```typescript
await wa.button(ctx.roomId, {
  text: 'Interactive menu:',
  buttons: {
    type: 'interactive',
    data: [
      { type: 'quick_reply', id: 'reply1', text: 'Quick Reply' },
      { type: 'cta_url', text: 'Visit Website', url: 'https://example.com' },
      { type: 'cta_copy', id: 'copy1', text: 'Copy Code', copy: 'PROMO123' },
      { type: 'cta_call', text: 'Call Us', phoneNumber: '+6281234567890' },
    ],
  },
});
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1.  Fork the repository.
2.  Create a new branch: `git checkout -b feature/my-feature`.
3.  Commit your changes: `git commit -m 'Add some feature'`.
4.  Push to the branch: `git push origin feature/my-feature`.
5.  Open a Pull Request.

### 🎯 Issues & Feedback

**If you encounter any problems or have feature requests, please open an [issue](https://github.com/zeative/zaileys/issues)**

- [Buy me a coffee ☕](https://saweria.co/zaadevofc)
- [Ko-Fi](https://ko-fi.com/zaadevofc)
- [Trakteer](https://trakteer.id/zaadevofc)
- ⭐ Star the repo on GitHub

### 📜 License

Distributed under the **MIT License**. See [`LICENSE`](https://github.com/zeative/zaileys/blob/main/LICENSE) for details.
