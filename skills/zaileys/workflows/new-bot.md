# Workflow: start a new bot

Goal: a small project that type-checks against the installed zaileys, runs, and tells the user exactly what
they still have to do (scan a QR, fill in Meta credentials). Copy this checklist and tick it off:

```text
- [ ] 1. Look at what already exists
- [ ] 2. Settle the choices that change the code
- [ ] 3. Start from the template
- [ ] 4. Build the requested behaviour
- [ ] 5. Verify
- [ ] 6. Hand off
```

## 1. Look at what already exists

- An existing `package.json`, lockfile, `tsconfig.json`, or framework (Express, Hono, Next.js) means you are
  adding a bot to a project: keep its package manager, module system, and layout, and add only what's missing.
- `node -v` must be 20 or newer.
- If zaileys is already installed, read `node_modules/zaileys/package.json` for the version.

## 2. Settle the choices that change the code

Decide from the request when you can; ask only about what you can't infer, in one short message.

| Choice | Default | Pick differently when |
| --- | --- | --- |
| Provider | WhatsApp Web | The user says official/resmi/Cloud API/business API, needs templates or no ban risk, or hosts on serverless — see the provider reference |
| Login (WhatsApp Web) | QR code in the terminal | The terminal QR can't be scanned (Docker/PM2 logs, remote server): pairing code with the bot's number |
| Session storage (WhatsApp Web) | File store in `./.zaileys` | Containers without a volume, several instances, or a hosting platform with an ephemeral disk: a database auth store |
| Message history | In memory | Servers with ≤ 512 MB RAM or long uptimes: SQLite message store |
| Webhook server (Cloud API) | Hono template | The project already uses Express (raw body on the webhook route) or Next.js (route handler) |

## 3. Start from the template

Copy `assets/templates/web/` or `assets/templates/cloud/` from this skill's directory into the project,
without overwriting files that already exist (merge `package.json` dependencies and scripts instead).
Then install with the project's package manager, letting it resolve the current v4 release:

```bash
npm install zaileys                              # WhatsApp Web
npm install zaileys hono @hono/node-server       # Cloud API template
npm install -D typescript tsx @types/node
```

Don't pin an exact zaileys version and don't copy one from memory; `^4` in the template is enough.
Copy `.env.example` to `.env` and keep `.env` and `.zaileys/` out of git (the template `.gitignore` does).

## 4. Build the requested behaviour

- Put handlers where the project keeps its code; a single `src/bot.ts` is fine for a new project.
- Answer with `msg.reply()` or `client.send(msg.roomId ?? msg.senderId)`, wrap async handler bodies in
  `try`/`catch`, and read credentials from environment variables.
- Commands and plugins only exist on WhatsApp Web. On the Cloud API, match text in a `text` handler.
- When you need an API you haven't used yet, search `node_modules/zaileys/dist/index.d.ts` for it first.

## 5. Verify

Run these and fix what they report before handing off:

```bash
npx tsc --noEmit
node <this skill's directory>/scripts/doctor.mjs .
```

A type error on a zaileys call means the assumed API is wrong: look it up, don't cast around it. If you can
run the bot, start it: WhatsApp Web prints a QR code or pairing code, then `[zaileys] Connected as …` after
linking; the Cloud API logs `connect` once Meta accepts the token.

## 6. Hand off

End with the steps only the user can do, specific to their choices:

- **WhatsApp Web:** `npm run dev`, then WhatsApp → Settings → Linked devices → Link a device (or "Link with
  phone number instead" for a pairing code). Test from a different WhatsApp account — the bot ignores its own
  messages. The session is saved in `.zaileys/auth/<sessionId>`; deleting it or changing `sessionId` means
  linking again. Use a number they can afford to lose.
- **Cloud API:** fill in `.env` (a system user token for production), expose the port over HTTPS (e.g.
  `ngrok http 3000`), then in Meta → WhatsApp → Configuration set the callback URL to `https://…/webhook`, the
  verify token to `WA_VERIFY_TOKEN`, click Verify and save, and subscribe to the `messages` field. With Meta's
  test number, add the recipient phone under API Setup first. Replies only work within 24 hours of the
  customer's last message; anything later needs an approved template.
