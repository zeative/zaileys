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
- [Issues & Feedback](#-issues---feedback)


### 💠 Features

- 🎯 **Simplified API**: Minimal boilerplate—get up and running in minutes.
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

#### - QR Code

```js
const wa = new Client({
  authType: "qr"
})
```

#### - Pairing Code

```js
const wa = new Client({
  authType: "pairing",
  phoneNumber: 6281234567890
})
```

### 💠 Issues & Feedback

**If you encounter any problems or have feature requests, please open an issue:
[https://github.com/zeative/zaileys/issues](https://github.com/zeative/zaileys/issues)**


- [Buy me a coffee ☕](https://saweria.co/zaadevofc)
- ⭐ Star the repo on GitHub

### 💠 License

Distributed under the **MIT License**. See [`LICENSE`](https://github.com/zeative/zaileys/blob/main/LICENSE) for details.