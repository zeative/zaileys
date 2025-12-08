<div align="center">
  <h1 align="center">Zaileys - Simplified WhatsApp Node.js TypeScript/JavaScript API</h1>

<a href="https://www.npmjs.com/package/zaileys"><img src="https://img.shields.io/npm/v/zaileys.svg" alt="NPM Version"></a>
<a href="https://www.npmjs.com/package/zaileys"><img src="https://img.shields.io/npm/dw/zaileys?label=npm&color=%23CB3837" alt="NPM Downloads"></a>
<a href="https://github.com/zeative/zaileys/releases"><img src="https://img.shields.io/npm/dt/zaileys" alt="NPM Downloads"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/languages/code-size/zeative/zaileys" alt="GitHub Code Size"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/badge/TypeScript-5.0%2B-blue?style=flat-square&logo=typescript" alt="TypeScript"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/license/zeative/zaileys" alt="GitHub License"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/stars/zeative/zaileys" alt="GitHub Stars"></a>
<a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/forks/zeative/zaileys" alt="GitHub Forks"></a>

  <img alt="Zaileys - Simplified WhatsApp Node.js TypeScript/JavaScript API" src="https://socialify.git.ci/zeative/zaileys/image?description=1&descriptionEditable=Zaileys%20is%20a%20simplified%20version%20of%20the%20Baileys%20package%20%0Awhich%20is%20easier%20and%20faster.&font=KoHo&forks=1&issues=1&language=1&name=1&owner=1&pattern=Circuit%20Board&pulls=1&stargazers=1&theme=Auto">
</div>

<div align="center">
  <p>
    <b>Zaileys</b> is a powerful, type-safe wrapper around Baileys, designed to simplify the development of WhatsApp bots. It provides a robust architecture with built-in state management, middleware support, and easy-to-use event handlers, making it perfect for building scalable and maintainable WhatsApp applications.
  </p>
</div>

---

## 🚀 Overview

> Zaileys solves the complexity of managing raw WhatsApp socket connections by providing a high-level, opinionated API. It is built for developers who need to create bots, customer support agents, or automated notification systems without getting bogged down in protocol details.

Targeting **Node.js** and **TypeScript** developers, Zaileys integrates essential features like rate limiting, session management, and input validation out of the box.

## ✨ Features

- 🛡️ **Type-Safe Architecture**: Built with TypeScript and Zod for robust runtime validation and excellent IDE autocomplete.
- 🔌 **Middleware System**: Express-style middleware support (`.use()`) for intercepting and processing messages globally.
- 💾 **Built-in State Management**: Integrated `lowdb` support for easy JSON-based data persistence (chats, contacts, messages).
- 📡 **Event-Driven API**: Simplified event listeners for `connection`, `messages`, and `calls` with rich context objects.
- 🚦 **Rate Limiting**: Built-in protection against spam and excessive API usage.
- 🤖 **Auto-Automation**: Configurable options for auto-read, auto-online presence, auto-rejecting calls, and more.
- 📱 **Multi-Device Support**: Full support for WhatsApp Multi-Device (MD) via QR code or Pairing Code.

## 🏗️ Concepts & Architecture

Zaileys is built around a few core concepts:

- **Client**: The main entry point. It extends the underlying signal handling and manages the connection lifecycle. It uses a **Proxy** pattern to inject modules dynamically.
- **Context (ctx)**: Every event (like a message) comes with a rich `ctx` object containing all relevant data (sender, text, room ID) and helper methods (reply, react).
- **Middleware**: A pipeline that processes events before they reach your main handlers, useful for logging, auth checks, or spam filtering.
- **Store**: A local JSON database (powered by `lowdb`) that automatically syncs chats and contacts, accessible via `client.db()`.

## 📦 Installation

Install `zaileys` using your preferred package manager:

```bash
npm install zaileys
# or
pnpm add zaileys
# or
yarn add zaileys
```

> **Note**: Requires Node.js v18+ and TypeScript for best experience.

## ⚡ Quick Start

Here is a minimal example to get your bot running with QR code authentication:

```typescript
import { Client } from 'zaileys';

// Initialize the client
const wa = new Client({
  authType: 'qr',
  session: 'my-session',
});

// Listen for connection updates
wa.on('connection', (ctx) => {
  console.log('Connection status:', ctx.status);
});

// Handle incoming messages
wa.on('messages', async (ctx) => {
  // Ignore messages from self or if no text
  if (ctx.fromMe || !ctx.text) return;

  console.log(`Received message from ${ctx.senderName}: ${ctx.text}`);

  // Simple command handler
  if (ctx.text === '/ping') {
    await wa.send(ctx.roomId, 'Pong! 🏓');
  }
});
```

## 🛠️ Configuration

The `Client` constructor accepts a configuration object. Below are the valid options based on the library's type definitions.

### Authentication Options

You must choose one of the following authentication methods:

**1. QR Code Auth**

```typescript
{
  authType: 'qr';
}
```

**2. Pairing Code Auth**

```typescript
{
  authType: 'pairing',
  phoneNumber: 6281234567890 // Number required for pairing
}
```

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
| `autoMarkAI`     | `boolean` | `true`  | Automatically mark AI responses.                           |
| `autoMentions`   | `boolean` | `true`  | Automatically handle mentions.                             |
| `autoRejectCall` | `boolean` | `true`  | Automatically reject incoming calls.                       |

### Advanced Configuration

| Option      | Type     | Description                                                                     |
| :---------- | :------- | :------------------------------------------------------------------------------ |
| `limiter`   | `object` | Rate limiting configuration. Default: `{ maxMessages: 20, durationMs: 10000 }`. |
| `fakeReply` | `object` | Configuration for fake reply provider.                                          |
| `sticker`   | `object` | Default metadata for sticker creation (`packageName`, `authorName`, `quality`). |
| `citation`  | `object` | Custom citation sources.                                                        |

## 💡 Advanced Usage

### Middleware & Spam Protection

You can use middleware to filter messages or add custom logic before your handlers run.

```typescript
// Add a global spam check middleware
wa.use(async (ctx, next) => {
  if (ctx.isSpam) {
    console.warn(`Spam detected from ${ctx.senderName}`);
    return; // Stop processing
  }

  // Continue to next middleware or event handler
  await next();
});
```

### Interactive Buttons

Send interactive messages with buttons or lists (where supported).

```typescript
wa.on('messages', async (ctx) => {
  if (ctx.text === '/menu') {
    await wa.button(ctx.roomId, {
      text: `Hello ${ctx.senderName}, choose an option:`,
      buttons: {
        type: 'interactive',
        data: [
          {
            type: 'single_select',
            text: 'Main Menu',
            section: [
              {
                title: 'Features',
                rows: [
                  { id: 'opt1', title: 'Check Status' },
                  { id: 'opt2', title: 'Get Info' },
                ],
              },
            ],
          },
        ],
      },
    });
  }
});
```

### Using the Built-in Database

Access the internal JSON store to manage data easily.

```typescript
// Get chat metadata
const chat = await wa.db('chats').get(ctx.roomId);
console.log('Chat Name:', chat?.name);

// Get all messages in a chat
const messages = await wa.getMessageByChatId(ctx.roomId);
```

## 📊 Project Stats

- **Core**: ~20 source files
- **Language**: 100% TypeScript
- **Runtime**: Node.js
- **Dependencies**: `baileys`, `zod`, `lowdb`, `sharp`, `fluent-ffmpeg`

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1.  Fork the repository.
2.  Create a new branch: `git checkout -b feature/my-feature`.
3.  Commit your changes: `git commit -m 'Add some feature'`.
4.  Push to the branch: `git push origin feature/my-feature`.
5.  Open a Pull Request.

### Issues & Feedback

If you encounter any bugs or have feature requests, please open an issue on [GitHub Issues](https://github.com/zeative/zaileys/issues).

## 📄 License

Distributed under the **MIT** License. See [LICENSE](LICENSE) for more information.

## 👏 Credits

- **Author**: [zaadevofc](https://github.com/zaadevofc)
- **Core Library**: [Baileys](https://github.com/WhiskeySockets/Baileys)
