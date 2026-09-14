# Workflow: add a feature to an existing bot

Goal: the smallest change that does what the user asked, written the way the project already writes code, and
proven to type-check against the zaileys version the project actually has.

```text
- [ ] 1. Read the project before writing
- [ ] 2. Check the feature exists on this provider
- [ ] 3. Find the exact API in the installed package
- [ ] 4. Write it in the project's style
- [ ] 5. Verify
```

## 1. Read the project before writing

- Find the client: `grep -rn "new Client(" --include=*.ts --include=*.js .` (skip `node_modules`). Note the
  provider, `sessionId`, stores, `commandPrefix`, and plugin folder.
- Find how handlers are organised — one file, a `handlers/` folder with register functions, `client.command`
  calls, or `definePlugin` files — and follow that pattern. A feature that looks like the existing ones is
  easier for the user to maintain than a better structure they didn't ask for.
- Note conventions: import style (`.js` suffixes under NodeNext), config objects vs `process.env`, logging,
  error handling, language of user-facing text.
- Read `node_modules/zaileys/package.json` for the installed version.

## 2. Check the feature exists on this provider

The Cloud API has no groups, channels, polls, albums, carousels, commands, plugins, broadcast, scheduling, or
edits/deletes; WhatsApp Web has no templates, delivery statuses, or Flows. If the request needs something the
provider lacks, say so and offer the nearest alternative (a list instead of a poll, a `text` handler instead of
a command, a paced `sendTemplate()` loop instead of `broadcast()`) before writing code.

## 3. Find the exact API in the installed package

Use the topic reference for the feature, then confirm names and option shapes in
`node_modules/zaileys/dist/index.d.ts` — the installed version wins over any example. Details that commonly
go wrong:

- Destination: `msg.reply()` or `client.send(msg.roomId ?? msg.senderId)`; `msg.chatId` is the message ID.
- Media sources: a URL, a file path, or a `Buffer`; captions go in the options object (`{ caption }`).
- Received media: narrow with `msg.media?.type === 'image'` before `msg.media.buffer()`.
- `text` doesn't fire for captions, button taps, or list picks — listen for `message`, `image`,
  `button-click`, or `list-select` as needed.
- Anything sent to many chats goes through `client.broadcast()` (WhatsApp Web) so it's paced.

## 4. Write it in the project's style

- Add a new file or function next to the similar ones and register it the way they are registered.
- Wrap async handler bodies that call the network in `try`/`catch`, matching how the project logs errors.
- Keep secrets and IDs in the project's config or environment, not inline.
- Don't refactor, rename, or reformat unrelated code, and don't upgrade zaileys as a side effect.

## 5. Verify

```bash
npx tsc --noEmit
node <this skill's directory>/scripts/doctor.mjs .
```

Fix type errors by correcting the API use, not with `as any`. Then tell the user how to try the feature (the
message to send, from which account or group) and anything it needs that the code can't provide, such as an
approved template name, admin rights in the group, or a media file at the configured path.
