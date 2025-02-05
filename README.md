<div align='center'>
  <img alt="Zaileys - Simplify Typescript/Javascript WhatsApp NodeJS API" src="https://socialify.git.ci/zeative/zaileys/image?description=1&amp;descriptionEditable=Zaileys%20is%20a%20simplified%20version%20of%20the%20Baileys%20package%20%0Awhich%20is%20easier%20and%20faster.&amp;font=KoHo&amp;forks=1&amp;issues=1&amp;language=1&amp;name=1&amp;owner=1&amp;pattern=Circuit%20Board&amp;pulls=1&amp;stargazers=1&amp;theme=Auto">
</div>

<h1 align="center">Zaileys - Simplify Typescript/Javascript WhatsApp NodeJS API</h1>

<div align='center'>

[![NPM Version](https://img.shields.io/npm/v/zaileys.svg)](https://www.npmjs.com/package/zaileys)
[![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/zeative/zaileys/total)](https://www.npmjs.com/package/zaileys)
[![NPM Downloads](https://img.shields.io/npm/dw/%40zeative%2Fzaileys?label=npm&color=%23CB3837)](https://www.npmjs.com/package/zaileys)
[![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/zeative/zaileys)](https://www.npmjs.com/package/zaileys)
[![GitHub License](https://img.shields.io/github/license/zeative/zaileys)](https://github.com/zeative/zaileys)
<br>
[![GitHub Repo stars](https://img.shields.io/github/stars/zeative/zaileys)](https://github.com/zeative/zaileys)
[![GitHub forks](https://img.shields.io/github/forks/zeative/zaileys)](https://github.com/zeative/zaileys)

</div>

> [!WARNING]
> This is beta version, not recomended to use in production. Join whatsapp community for latest info [WhatsApp Channel](https://whatsapp.com/channel/0029VazENbmInlqHIWzgn33h)

Zaileys is a powerful and flexible WhatsApp API library for Node.js, built on top of [Baileys](https://github.com/WhiskeySockets/Baileys). It simplifies the process of integrating WhatsApp functionalities into your applications, providing a comprehensive set of features for building robust and scalable WhatsApp-based solutions.

## # Features

- **Multi-Device Support:** Leverage the latest WhatsApp multi-device features for enhanced reliability and performance.
- **Customizable:** Adapt the library to your specific needs with flexible configuration options and modular design.

## # Installation

```bash
npm add zaileys

pnpm add zaileys

yarn add zaileys

bun add zaileys

deno add npm:zaileys
```

## # Example Code

> [!TIP]
> If you don't want to take time for setup and configuration, use the [example.ts](https://github.com/zeative/zaileys/blob/main/test/example.ts) file that I have provided.

## # Usage & Configuration

### 📦 Import Library

```js
// ESM
import { Client } from "zaileys";

// CJS
const { Client } = require("zaileys");
```

### ⚙️ Configuration

> [!WARNING]
> Warning! in beta version this library uses built-in Baileys [`makeInMemoryStore`](https://github.com/WhiskeySockets/Baileys?tab=readme-ov-file#implementing-a-data-store) function which will most likely use quite a lot of RAM.
> If you experience this, you can delete the `.zaileys/memory.json` file then restart the server.

```ts
const wa = new Client({
  prefix: "/", // for command message, example '/'
  ignoreMe: true, // ignore messages from bot (bot phone number)
  phoneNumber: 628xxx, // fill bot phone number if auth type is 'pairing'
  authPath: ".zaileys", // auth directory path for session and chat store
  authType: "pairing", // auth type 'pairing' or 'qr'
  showLogs: true, // show logs of any chats
  autoMentions: true, // bot will be auto mentioned if text contains sender number with '@' prefix
  autoOnline: true, // bot status will be mark online
  autoRead: true, // auto read message from any chats
  autoRejectCall: true,  // auto reject call if someone call you
  citation: {
    // your citation will be boolean object based on validate with your value
    // system will be validate your value with 'senderId' and 'roomId'
    // if one is valid then the key will return 'boolean'
    // sample output: { isAuthors: boolean }

    // just sample, you can rename with any key
    authors: () => ["628xxxx"], // key 'authors' will be 'isAuthors'
    myGroups: () => ["1203633xxxxx"], // key 'myGroups' will be 'isMyGroups'
    ...otherKey // key 'otherKey' will be 'isOtherKey'
  },
});
```

<hr>

> [!NOTE]
> The functions and parameters below may change at any time considering that this library is a beta version. So when you update a library to the latest version but an error occurs, there may be changes to certain functions and parameters.

### 🛎️ Event Handler

You can find out the output type of each object in the listener below:

- ctx for [`connection`]()
- ctx for [`message`]()
- ctx for [`command`]()
- ctx for [`call`]()

```ts
wa.on("connection", (ctx) => {}); // listener for current connection
wa.on("message", (ctx) => {}); // listener for message from any chats
wa.on("command", (ctx) => {}); // listener for message that starts with prefix at beginning of word
wa.on("call", (ctx) => {}); // listener for someone call to bot
```

<hr>

### 🔹 Connection Handler

```ts
wa.on("connection", (ctx) => {
  if (ctx.status == "open") {
    // do something
  }
});
```

<hr>

### 🔹 Send Text Message

[Here](#) you can find out the complete parameters for the `.sendText()` function

```ts
wa.on("message", (ctx) => {
  if (ctx.text == "ping") {
    wa.sendText("Hello! " + ctx.senderName);
  }

  // text from reply message
  if (ctx.reply?.text == "ping") {
    wa.sendText("Pong from reply!");
  }

  // text from nested reply message
  // you can retrieve reply messages of any depth
  if (ctx.reply?.reply?.reply?.text == "ping") {
    wa.sendText("Pong from nested reply!");
  }

  // text with footer message (doesn't work on whatsapp desktop)
  if (ctx.text == "pong") {
    wa.sendText("Ping!", { footer: "Footer message" });
  }
});
```

<hr>

### 🔹 Send Reply Message

[Here](#) you can find out the complete parameters for the `.sendReply()` function

```ts
wa.on("message", (ctx) => {
  if (ctx.text == "ping") {
    wa.sendReply("Pong!");
  }

  // reply with footer message (doesn't work on whatsapp desktop)
  if (ctx.text == "pong") {
    wa.sendReply("Ping!", { footer: "Footer message" });
  }

  // reply with fake verified badge
  if (ctx.text == "fake") {
    wa.sendReply("Fake Verified!", { fakeVerified: "whatsapp" });
  }
});
```

[Here](#) you can find out all the **verified** platforms provided

<hr>

### 🔹 Send Sticker Message

[Here](#) you can find out the complete parameters for the `.sendSticker()` function

```ts
wa.on("message", async (ctx) => {
  if (ctx.chatType == "sticker") {
    const sticker = await ctx.media?.buffer!();

    wa.sendSticker(sticker);
  }

  if (ctx.text == "sticker") {
    wa.sendSticker("https://gtihub.com/zeative.png");
  }
});
```

<hr>

### 🔹 Send Image Message

[Here](#) you can find out the complete parameters for the `.sendImage()` function

```ts
wa.on("message", async (ctx) => {
  if (ctx.chatType == "image") {
    const image = await ctx.media?.buffer!();

    wa.sendImage(image);
  }

  if (ctx.text == "image") {
    wa.sendImage("https://gtihub.com/zeative.png");
  }

  if (ctx.text == "mypp") {
    const picture = await ctx.senderImage();

    wa.sendImage(picture);
  }
});
```

<hr>

### 🔹 Send Video Message

[Here](#) you can find out the complete parameters for the `.sendVideo()` function

```ts
wa.on("message", async (ctx) => {
  if (ctx.chatType == "video") {
    const video = await ctx.media?.buffer!();

    wa.sendVideo(video);
  }

  if (ctx.text == "video") {
    wa.sendVideo("https://gtihub.com/zeative.png");
  }
});
```

<hr>

### 🔹 Send Audio Message

[Here](#) you can find out the complete parameters for the `.sendAudio()` function

```ts
wa.on("message", async (ctx) => {
  if (ctx.chatType == "audio") {
    const audio = await ctx.media?.buffer!();

    wa.sendAudio(audio);
  }

  if (ctx.text == "audio") {
    wa.sendAudio("https://gtihub.com/zeative.png");
  }
});
```

<hr>

### 🔹 With Prefix Message

> [!NOTE]
> You must set `prefix` option to anything character

```ts
wa.on("message", async (ctx) => {
  // for example set prefix to "/"
  // and user text "/test"
  if (ctx.command == "test") {
    wa.sendText("From command message!");
  }
});
```

<hr>

### 🔹 Mentioned User

> [!NOTE]
> You must set `autoMentions` option to `true` and bot will send text as mentions

```ts
wa.on("message", async (ctx) => {
  if (ctx.text == "mentions") {
    wa.sendText("Here user mentioned: @0 @18002428478");
    // example output: "Here user mentioned: @WhatsApp @ChatGPT"

    // if `autoMentions` is inactive or `false`
    // output can be plain text: "Here user mentioned: @0 @18002428478"
  }
});
```

<hr>

### 🔹 Citation Handler

> [!NOTE]
> You must set `citation` like [example](https://github.com/zeative/zaileys?tab=readme-ov-file#%EF%B8%8F-configuration) above before

```ts
const wa = new Client({
  ...,

  // just example you can edit with your own
  citation: {
    authors: () => ["628xxxx"],
    myPrivateGroups: () => ["1203633xxxxx"],
    bannedUsers: async () => {
      const res = await fetch("/get/user/banned")
      const users = await res.json()

      return users // ["628xx", "628xx", "628xx"]
    }
  }
})

wa.on("message", async (ctx) => {
  const isAuthors = ctx.citation?.isAuthors;
  const isMyPrivateGroups = ctx.citation?.isMyPrivateGroups;
  const isBannedUsers = ctx.citation?.isBannedUsers;

  if (isAuthors && ctx.text == "test1") {
    wa.sendText("Message for my author: kejaa");
  }

  if (isMyPrivateGroups && ctx.text == "test2") {
    wa.sendText("Message for my private group!");
  }

  if (isBannedUsers && ctx.text) {
    wa.sendText("Your number is banned!");
  }
});
```

## # Contributing

Contributions are welcome! Please follow these steps to contribute:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix (`git checkout -b feature/your-feature-name` or `git checkout -b fix/bug-description`).
3.  Make your changes and commit them (`git commit -m 'Add some AmazingFeature'`).
4.  Push your changes to your forked repository (`git push origin feature/your-feature-name`).
5.  Submit a pull request to the main repository.

Please ensure your code follows the project's coding standards and includes appropriate tests.

## # License

This project is licensed under the [MIT License](LICENSE) - see the [LICENSE](LICENSE) file for details.

## # Acknowledgements

- [Baileys](https://github.com/WhiskeySockets/Baileys) - The WhatsApp Web API library this project is based on.
