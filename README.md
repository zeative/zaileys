# ⚡ Zaileys V4
> The next-generation WhatsApp bot engine. Fast, declarative, and developer-friendly.

Zaileys V4 is a complete rewrite of the Zaileys engine, focusing on performance, modularity, and a modern developer experience inspired by Elysia and Hono.

## ✨ Key Features
- **🚀 High Performance**: Built with `eventemitter3` and optimized namespaced storage.
- **🛠 Declarative API**: Simple, chainable, and type-safe command routing.
- **🔌 Plugin-first Architecture**: Modularize your logic with ease.
- **📂 Multi-Account ready**: Native support for multiple WhatsApp sessions.
- **💬 Rich Media & Interaction**: Built-in support for buttons, lists, and media signals.

## 🚀 Quick Start
```bash
npm install @zeative/zaileys
```

```typescript
import { createBot } from '@zeative/zaileys'

const bot = createBot(socket)

bot.command('ping', async (ctx) => {
  await ctx.send('pong!')
})

bot.command({
  name: 'hello',
  description: 'Say hello'
}, async (ctx) => {
  await ctx.send(`Hello ${ctx.sender.pushName}!`)
})
```

## 📦 Installation
```bash
npm install @zeative/zaileys @whiskeysockets/baileys
```

## 🔄 Migrating from V3
V4 includes a `compat` layer to make migration easy. 

```typescript
import { Zaileys, createCompatContext } from '@zeative/zaileys'

bot.on('messages.upsert', async (upsert) => {
  // Wrap V4 context to support V3 properties like ctx.roomId
  const ctx = createCompatContext(v4Context)
  console.log(ctx.roomId) // Works but logs a warning
})
```

## 📚 Documentation
For more details, check out the `examples/` directory or visit our [online documentation](https://zaileys.js.org).

## 📄 License
MIT © Zeative Labs
