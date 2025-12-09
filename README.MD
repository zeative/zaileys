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
    <b>Zaileys</b> is a powerful, type-safe wrapper around <a href="https://github.com/WhiskeySockets/Baileys">Baileys</a>, designed to simplify the development of WhatsApp bots. It provides a robust architecture with built-in state management, middleware support, and easy-to-use event handlers, making it perfect for building scalable and maintainable WhatsApp applications.
  </p>
</div>

<br>

<div align="center">

[🚀 Overview](#-overview) &nbsp;&nbsp;•&nbsp;&nbsp;
[🪶 Features](#-features) &nbsp;&nbsp;•&nbsp;&nbsp;
[📦 Installation](#-installation) &nbsp;&nbsp;•&nbsp;&nbsp;
[⚡ Quick Start](#-quick-start) &nbsp;&nbsp;•&nbsp;&nbsp;
[🧩 Plugins](#-plugins) &nbsp;&nbsp;•&nbsp;&nbsp;
[📨 Sending Messages](#-sending-messages) &nbsp;&nbsp;•&nbsp;&nbsp;
[👥 Group Management](#-group-management) &nbsp;&nbsp;•&nbsp;&nbsp;
[📰 Newsletter Management](#-newsletter-channel) &nbsp;&nbsp;•&nbsp;&nbsp;
[🌐 Community Management](#-community-management) &nbsp;&nbsp;•&nbsp;&nbsp;
[🔒 Privacy](#-privacy-settings) &nbsp;&nbsp;•&nbsp;&nbsp;
[🤝 Contributing](#-contributing)

</div>

<br>

---

## 🚀 Overview

> Zaileys solves the complexity of managing raw WhatsApp socket connections by providing a high-level, opinionated API. It is built for developers who need to create bots, customer support agents, or automated notification systems without getting bogged down in protocol details.

Targeting **Node.js** and **TypeScript** developers, Zaileys integrates essential features like rate limiting, session management, and input validation out of the box.

## 🪶 Features

- 🛡️ **Type-Safe** - Full TypeScript + Zod validation with autocomplete
- 🏓 **Middleware** - Intercept and process events globally
- 🧩 **Plugin System** - Drop-in file-based plugins
- 💾 **State Management** - Built-in `lowdb` for data persistence
- 🔔 **Event-Driven** - Clean listeners for `connection`, `messages`, `calls`
- 📢 **Rate Limiting** - Anti-spam protection out of the box
- 🤖 **Auto-Everything** - Auto-read, auto-reject calls, auto-mentions
- 📲 **Multi-Device** - QR code or Pairing Code authentication
- 🎬 **Built-in FFmpeg** - No external dependencies for media processing
- 🔘 **Interactive Buttons** - Simple buttons, URL, copy code, call buttons, and lists

## 🎨 Concepts & Architecture

**Client** - Your bot's brain. Manages connections, events, and the entire lifecycle.

**Context** - Rich event objects with all the data and helpers you need.

**Middleware** - Pre-process events for logging, auth, spam filtering, or custom logic.

**Plugins** - Drop files in `plugins/` directory. Auto-loaded, zero config.

**Store** - JSON database (`lowdb`) that auto-syncs chats, contacts, and messages.

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
// or
const { Client } = require('zaileys');

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

> **Quick Jump:** [Text](#send-text) · [Reply](#reply-to-message) · [Forward](#forward-message) · [Media](#send-media) · [Banner](#send-with-banner) · [Location](#send-location) · [Contact](#send-contact) · [Poll](#send-poll) · [Reaction](#send-reaction) · [Presence](#update-presence) · [Mentions](#mentions) · [Edit & Delete](#edit--delete-messages) · [Buttons](#interactive-buttons)

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

### Send Location

Send location with coordinates.

```typescript
await wa.send(ctx.roomId, {
  location: {
    latitude: -6.2,
    longitude: 106.816666,
    title: 'Jakarta',
    footer: 'Capital of Indonesia',
    url: 'https://maps.google.com/?q=-6.200000,106.816666',
  },
});
```

### Send Contact

Send one or multiple contacts.

```typescript
await wa.send(ctx.roomId, {
  title: 'My Contacts',
  contacts: [
    {
      fullname: 'John Doe',
      phoneNumber: 6281234567890,
      organization: 'Company Inc.',
    },
    {
      fullname: 'Jane Smith',
      phoneNumber: 6289876543210,
    },
  ],
});
```

### Send Poll

Create a poll with multiple options.

```typescript
await wa.send(ctx.roomId, {
  poll: {
    name: 'What is your favorite color?',
    answers: ['Red', 'Blue', 'Green', 'Yellow'],
    isMultiple: false,
  },
});
```

### Send Reaction

React to a message with an emoji.

```typescript
await wa.reaction(ctx.message(), '👍');

await wa.reaction(ctx.message(), '❤️');
```

### Update Presence

Update your presence status in a chat.

```typescript
await wa.presence(ctx.roomId, 'typing');

await wa.presence(ctx.roomId, 'recording');
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

> ✅ Simple button has support Android/iPhone/Desktop

```typescript
await wa.button(ctx.roomId, {
  text: 'Choose an option:',
  buttons: {
    type: 'simple',
    footer: 'Footer text',
    data: [
      { id: 'btn1', text: 'Option 1' },
      { id: 'btn2', text: 'Option 2' },
      { id: 'btn3', text: 'Option 3' },
    ],
  },
});
```

**Interactive Buttons:**

> ⚠️ Experimental, only support Android/iPhone

```typescript
await wa.button(ctx.roomId, {
  text: 'Interactive menu:',
  buttons: {
    type: 'interactive',
    footer: 'Footer text',
    data: [
      { type: 'quick_reply', id: 'reply1', text: 'Quick Reply' },
      { type: 'cta_url', text: 'Visit Website', url: 'https://example.com' },
      { type: 'cta_copy', id: 'copy1', text: 'Copy Code', copy: 'PROMO123' },
      { type: 'cta_call', text: 'Call Us', phoneNumber: '+6281234567890' },
    ],
  },
});
```

**Lists Buttons:**

> ⚠️ Experimental, not supported on some devices. Don't use in production!

```typescript
await wa.button(ctx.roomId, {
  text: 'Choose an option:',
  buttons: {
    type: 'interactive',
    footer: 'Footer text',
    data: [
      {
        type: 'single_select',
        text: 'Choose an option:',
        section: [
          {
            title: 'Section 1',
            rows: [
              { id: 'btn1', title: 'Option 1' },
              { id: 'btn2', title: 'Option 2' },
              { id: 'btn3', title: 'Option 3' },
            ],
          },
        ],
      },
    ],
  },
});
```

## 👥 Group Management

> **Quick Jump:** [Create](#create-group) · [Participants](#manage-participants) · [Profile](#group-profile) · [Settings](#group-settings) · [Invite Code](#invite-code) · [Metadata](#group-metadata) · [Join Requests](#join-requests) · [Fetch All](#fetch-all-groups) · [Ephemeral](#ephemeral-messages) · [Leave](#leave-group)

Manage groups, participants, and settings easily.

### Create Group

Create a new group with initial participants.

```typescript
// Create group with name and participants
const group = await wa.group.create('My Group', ['senderId']);
console.log('Group created:', group);
```

### Manage Participants

Add, remove, promote, or demote participants.

```typescript
const groupId = '1234567890@g.us';

// Add participants
await wa.group.participant(groupId, ['senderId'], 'add');

// Remove participants
await wa.group.participant(groupId, [...], 'remove');

// Promote to admin
await wa.group.participant(groupId, [...], 'promote');

// Demote to member
await wa.group.participant(groupId, [...], 'demote');
```

### Group Profile

Update group subject, description, or icon.

```typescript
// Update subject
await wa.group.profile(groupId, 'New Group Name', 'subject');

// Update description
await wa.group.profile(groupId, 'This is the new description', 'description');

// Update group avatar (from URL or Buffer)
await wa.group.profile(groupId, 'https://example.com/icon.jpg', 'avatar');
```

### Group Settings

Configure group permissions.

```typescript
// All members can send messages
await wa.group.setting(groupId, 'open');

// Only admins can send messages
await wa.group.setting(groupId, 'close');

// Only admins can edit group info
await wa.group.setting(groupId, 'locked');

// All members can edit group info
await wa.group.setting(groupId, 'unlocked');

// Only admins can add members
await wa.group.setting(groupId, 'admin_add');

// All members can add members
await wa.group.setting(groupId, 'all_member_add');
```

### Invite Code

Manage group invite links.

```typescript
// Get current invite code
const code = await wa.group.inviteCode(groupId, 'code');
console.log('Invite link:', `https://chat.whatsapp.com/${code}`);

// Revoke invite code
await wa.group.inviteCode(groupId, 'revoke');

// Get invite info
const info = await wa.group.inviteCode('INVITE_CODE', 'info');

// Join group via invite code
await wa.group.inviteCode('INVITE_CODE', 'accept');
```

### Group Metadata

Get full group metadata.

```typescript
const metadata = await wa.group.metadata(groupId);
console.log(metadata);
```

### Join Requests

Manage pending join requests.

```typescript
// Get list of pending requests
const requests = await wa.group.requestJoinList(groupId);

// Approve requests
await wa.group.requestJoin(groupId, ['senderId'], 'approve');

// Reject requests
await wa.group.requestJoin(groupId, [...], 'reject');
```

### Fetch All Groups

Get all groups the bot is part of.

```typescript
const groups = await wa.group.fetchAllGroups();
console.log('Joined groups:', Object.keys(groups).length);
```

### Ephemeral Messages

Set disappearing messages in groups.

```typescript
// Turn off disappearing messages
await wa.group.ephemeral(groupId, 'off');

// Set to 24 hours
await wa.group.ephemeral(groupId, '24h');

// Set to 7 days
await wa.group.ephemeral(groupId, '7d');

// Set to 90 days
await wa.group.ephemeral(groupId, '90d');
```

### Leave Group

Leave group.

```typescript
await wa.group.leave(groupId);
```

## 📰 Newsletter (Channel)

Create and manage WhatsApp Channels (Newsletters).

> **Quick Jump:** [Create](#create-channel) · [Actions](#channel-actions) · [Update](#update-channel) · [Info](#channel-info) · [Messages](#manage-messages) · [Admin](#admin-actions)

### Create Channel

```typescript
const channel = await wa.newsletter.create('My Channel', 'Description here');
console.log('Channel created:', channel);
```

### Channel Actions

Follow, unfollow, mute, or unmute a channel.

```typescript
const channelId = '1234567890@newsletter';

// Follow
await wa.newsletter.action(channelId, 'follow');

// Unfollow
await wa.newsletter.action(channelId, 'unfollow');

// Mute
await wa.newsletter.action(channelId, 'mute');

// Unmute
await wa.newsletter.action(channelId, 'unmute');
```

### Update Channel

Update channel info.

```typescript
// Update name
await wa.newsletter.update(channelId, 'New Name', 'name');

// Update description
await wa.newsletter.update(channelId, 'New Description', 'description');

// Update picture (URL/Buffer)
await wa.newsletter.update(channelId, 'https://example.com/image.jpg', 'picture');

// Remove picture
await wa.newsletter.removePicture(channelId);
```

### Channel Info

Get channel details.

```typescript
// Get metadata by ChannelId
const meta = await wa.newsletter.metadata(channelId, 'jid');

// Get metadata by Invite Code
const metaInvite = await wa.newsletter.metadata('INVITE_CODE', 'invite');

// Get subscribers
const subs = await wa.newsletter.subscribers(channelId);

// Get admin count
const adminCount = await wa.newsletter.adminCount(channelId);
```

### Manage Messages

Fetch messages or react to them.

```typescript
// Fetch messages
const since = new Date() - 1000 * 60 * 60 * 24; // 1 day
const after = new Date();

const count = 10;

const messages = await wa.newsletter.fetchMessages(channelId, count, since, after);

// React to message
await wa.newsletter.reaction(channelId, 'chatId', '👍');
```

### Admin Actions

Manage channel ownership and admins.

```typescript
// Change owner
await wa.newsletter.changeOwner(channelId, 'senderId');

// Demote admin
await wa.newsletter.demote(channelId, 'senderId');

// Delete channel
await wa.newsletter.delete(channelId);
```

## 🌐 Community Management

Create and manage WhatsApp Communities.

> **Quick Jump:** [Create](#create-community) · [Create Group](#create-group-in-community) · [Groups](#manage-groups) · [Info](#community-info) · [Participants](#manage-participants-1) · [Invite](#invite-code-1) · [Settings](#community-settings) · [Leave](#leave-community)

### Create Community

```typescript
const community = await wa.community.create('My Community', 'Description here');
console.log('Community created:', community);
```

### Create Group in Community

Create a new group linked to a community.

```typescript
const communityId = '1234567890@g.us';
const group = await wa.community.createGroup('New Group', ['senderId'], communityId);
```

### Manage Groups

Link or unlink groups from a community.

```typescript
const groupId = '0987654321@g.us';

// Link group
await wa.community.group(communityId, 'link', groupId);

// Unlink group
await wa.community.group(communityId, 'unlink', groupId);

// Get linked groups
const linkedGroups = await wa.community.group(communityId, 'linked');
```

### Community Info

Get metadata or update info.

```typescript
// Get metadata
const meta = await wa.community.metadata(communityId);

// Update subject
await wa.community.update(communityId, 'subject', 'New Name');

// Update description
await wa.community.update(communityId, 'description', 'New Description');
```

### Manage Participants

Manage community participants.

```typescript
// List participants
const participants = await wa.community.participants(communityId, 'list');

// Add participant
await wa.community.participants(communityId, 'update', 'add', ['senderId']);

// Remove participant
await wa.community.participants(communityId, 'update', 'remove', ['senderId']);

// Promote to admin
await wa.community.participants(communityId, 'update', 'promote', ['senderId']);

// Demote to member
await wa.community.participants(communityId, 'update', 'demote', ['senderId']);
```

### Invite Code

Manage community invite links.

```typescript
// Get invite code
const code = await wa.community.invite(communityId, 'code');

// Revoke invite code
await wa.community.invite(communityId, 'revoke');

// Get invite info
const info = await wa.community.invite('INVITE_CODE', 'info');

// Join via invite code
await wa.community.invite('INVITE_CODE', 'accept');
```

### Community Settings

Configure community settings.

```typescript
// Toggle ephemeral messages
await wa.community.settings(communityId, 'ephemeral', 86400); // 24 hours

// Who can add members? 'all_member_add' or 'admin_add'
await wa.community.settings(communityId, 'memberAdd', 'admin_add');

// Join approval mode? 'on' or 'off'
await wa.community.settings(communityId, 'approval', 'on');
```

### Leave Community

Leave a community.

```typescript
await wa.community.leave(communityId);
```

## 🔒 Privacy Settings

Manage your privacy settings and block list.

> **Quick Jump:** [Block/Unblock](#blockunblock) · [Configuration](#privacy-configuration) · [Get Settings](#get-settings)

### Block/Unblock

```typescript
// Block user
await wa.privacy.block('senderId');

// Unblock user
await wa.privacy.unblock('senderId');

// Get blocklist
const blocklist = await wa.privacy.blocklist();
```

### Privacy Configuration

Update privacy settings.

```typescript
// Last Seen: 'all', 'contacts', 'contact_blacklist', 'none'
await wa.privacy.lastSeen('contacts');

// Online: 'all', 'match_last_seen'
await wa.privacy.online('match_last_seen');

// Profile Picture: 'all', 'contacts', 'contact_blacklist', 'none'
await wa.privacy.picture('all');

// Status: 'all', 'contacts', 'contact_blacklist', 'none'
await wa.privacy.status('contacts');

// Read Receipts: 'all', 'none'
await wa.privacy.readReceipt('all');

// Group Add: 'all', 'contacts', 'contact_blacklist', 'none'
await wa.privacy.groupsAdd('contacts');

// Default Disappearing Mode: 'off', '24h', '7d', '90d'
await wa.privacy.ephemeral('90d');
```

### Get Settings

Fetch current privacy settings.

```typescript
const settings = await wa.privacy.getSettings();
console.log(settings);
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1.  Fork the repository.
2.  Create new branch: `git checkout -b feature/my-feature`.
3.  Commit your changes: `git commit -m 'Add some feature'`.
4.  Push to the branch: `git push origin feature/my-feature`.
5.  Open Pull Request.

### 🎯 Issues & Feedback

**If you encounter any problems or have feature requests, please open an [issue](https://github.com/zeative/zaileys/issues)**

- [Buy me coffee ☕](https://saweria.co/zaadevofc)
- [Ko-Fi](https://ko-fi.com/zaadevofc)
- [Trakteer](https://trakteer.id/zaadevofc)
- ⭐ Star the repo on GitHub

### 📜 License

Distributed under the **MIT License**. See [`LICENSE`](https://github.com/zeative/zaileys/blob/main/LICENSE) for details.
