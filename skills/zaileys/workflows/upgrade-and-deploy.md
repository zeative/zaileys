# Workflow: upgrade zaileys or deploy a bot

Goal: move the bot to a newer zaileys release or onto a server without breaking its behaviour, losing the
linked session, or running out of memory.

## Upgrade

```text
- [ ] 1. Measure the gap
- [ ] 2. Read what changed in between
- [ ] 3. Apply the changes
- [ ] 4. Verify
```

1. **Measure the gap.** Installed version from `node_modules/zaileys/package.json`, the declared range in
   `package.json`, and the target (the user's request, or `npm view zaileys version`). Run the doctor with
   `--online` to see both and the known breaking patterns:
   ```bash
   node <this skill's directory>/scripts/doctor.mjs . --online
   ```
2. **Read what changed in between.** The migration reference lists every behaviour change and break in the
   v4 line with a search pattern for each. Search the project for every pattern in the gap, not only the ones
   that look relevant — breaks often sit in files nobody mentions (plugins, Docker config, the webhook route).
3. **Apply the changes.** Update the dependency with the project's package manager, then fix each hit. Two
   changes deserve care:
   - A `sessionId` that must be renamed points the bot at a new, empty session folder. Rename
     `./.zaileys/auth/<old>` to the new id too (or migrate the row in a database store), so the bot stays linked.
   - Cloud API webhooks reject unsigned deliveries: make sure `appSecret` is configured in the code and in the
     deployment's environment, and document it in `.env.example`.
4. **Verify.** `npx tsc --noEmit`, the doctor again, and the project's tests. Tell the user what to watch on the
   first run (`[zaileys] Connected as …` without a new QR; webhook deliveries answered `200`).

## Deploy

```text
- [ ] 1. Size the server for the workload
- [ ] 2. Make the session and data survive restarts
- [ ] 3. Configure the process
- [ ] 4. Verify on the server
```

1. **Size the server.** Use the production reference: text-only bots fit in 256 MB; video conversion needs
   `media.maxConcurrentFfmpeg` lowered on 512 MB–1 GB servers; keep message history on disk (SQLite message
   store) or bounded with auto-delete on small servers; cap large images with `media.maxImagePixels`.
2. **Persist the session (WhatsApp Web).** Containers and many platforms start with an empty disk: mount a
   volume at the session folder (or use an absolute `FileAuthStore` `basePath` on the volume), or use a
   database auth store. Run exactly one process per session — no PM2 cluster mode, no replicas above 1.
3. **Configure the process.** Restart policy on crash, `SIGTERM` → `client.disconnect()`, environment
   variables for secrets, logs that don't need to render a QR code (use a pairing code or render the `qr`
   event yourself). zaileys bundles ffmpeg: don't install a system ffmpeg by default. Exception: when animated
   stickers are needed and the doctor reports the ffmpeg in use lacks libwebp (for example on Apple Silicon),
   install one with libwebp and set `FFMPEG_PATH`.
   Cloud API: HTTPS in front of the webhook, the raw body passed to `client.webhook()`, a health route, and
   the Meta callback URL updated to the server's domain.
4. **Verify on the server.** Run the doctor there, start the bot, and confirm the log lines: linked without a
   new QR after a restart (WhatsApp Web) or a `200` on Meta's test delivery (Cloud API). Restart it once on
   purpose to prove the session survives.
