# SPEC — Update the zaileys Agent Skill suite for the official Cloud API provider

## 1. Objective

The zaileys Agent Skill suite (`skills/*`, mirrored to `plugins/zaileys-official/skills/*`)
teaches AI assistants to write, scaffold, debug, and review zaileys code. It is currently
**100% baileys/unofficial** — it never mentions `provider: 'cloud'`, `wa.cloud.*`, `webhook()`,
templates, OTP, or the Cloud-API pitfalls. Since zaileys 4.8.x ships a full **official Meta Cloud
API provider**, the skill now teaches outdated, incomplete truth and will generate wrong code for
cloud users.

**Goal:** make the skill **provider-aware and correct** — so an AI using it knows both providers
exist, picks the right one, generates valid code for each, and avoids the real Cloud-API gotchas we
discovered and verified (24h window, template params, AIRich web-only, webhook-without-connect,
contact first-name, `UNSUPPORTED_ON_CLOUD`).

**Target users:** developers using the skill via `npx skills add zeative/zaileys` or the Claude Code
plugin `zaileys-official@zeative`, and the AI agents that load it.

## 2. Acceptance criteria

1. The **orchestrator** (`zaileys-assist/SKILL.md`) states up front that zaileys has **two
   providers** and routes provider-specific intents (cloud, webhook, template, OTP, campaign,
   Flows, commerce) to the new cloud reference.
2. A new **`references/cloud.md`** exists — the self-contained official-provider guide: config,
   `connect()` semantics, `webhook()` (all mounts), send differences, `sendTemplate`, OTP, campaigns,
   the full `wa.cloud.*` surface, events (`message-status`/`template-status`/`flow-response`/`order`),
   and every limit/gotcha with its fix.
3. **`references/errors.md`** gains the cloud error taxonomy: `ZaileysCloudError`
   (`CONFIG`/`AUTH`/`REQUEST_FAILED`/`RATE_LIMITED`/`NOT_IMPLEMENTED`), `ZaileysProviderError`
   (`UNSUPPORTED_ON_CLOUD`), and the common Graph codes (`131047`, `132000`, `131009`, `190`, …).
4. **`references/pitfalls.md`** gains cloud anti-patterns → correct way (cold-send without template,
   param count, `rich:true` on cloud, calling `group`/`newsletter` on cloud, forgetting the webhook,
   body-parser eating the raw body).
5. **`references/recipes.md`** gains runnable cloud recipes: cloud echo bot + webhook (Next/Hono/
   Express), send OTP, marketing campaign, receive order/flow-response.
6. **`references/troubleshooting.md`** gains cloud runtime symptoms (webhook 401/verify fails, events
   not firing, `131047`).
7. `zaileys-scaffold`, `zaileys-debug`, `zaileys-review` **SKILL.md** descriptions + bodies mention
   the provider dimension (scaffold asks which provider; debug/review know cloud errors + guards).
8. Every code snippet is **correct against zaileys 4.8.1** (verified API — the same we live-tested):
   `provider:'cloud'`, `cloud:{accessToken,phoneNumberId,wabaId,verifyToken,appSecret}`,
   `wa.webhook()`, `wa.sendTemplate(to,name,lang,components)`, `wa.cloud.*`.
9. `npm run skill:sync` mirrors canonical `skills/*` → `plugins/zaileys-official/skills/*` with no
   drift (byte-identical after sync).
10. No regression to the existing (unofficial) content — it stays accurate; cloud is **added**, the
    default provider framing (baileys) is preserved.

## 3. Commands

```bash
npm run skill:sync     # mirror skills/* → plugins/zaileys-official/skills/*
# verify no drift:
diff -r skills plugins/zaileys-official/skills   # (minus any intentional plugin-only files)
```

Content is prose/markdown — no build/test. Verification is manual review + a diff check that the
plugin copy matches canonical after sync, plus spot-checking snippets against
`references/api.md` / the live 4.8.1 API.

## 4. Project structure (files touched)

```
skills/zaileys-assist/SKILL.md               # provider-aware routing + mental model + golden rules
skills/zaileys-assist/references/cloud.md     # NEW — official Cloud API reference
skills/zaileys-assist/references/errors.md    # + cloud error taxonomy
skills/zaileys-assist/references/pitfalls.md  # + cloud anti-patterns
skills/zaileys-assist/references/recipes.md   # + cloud recipes
skills/zaileys-assist/references/troubleshooting.md # + cloud symptoms
skills/zaileys-assist/references/api.md        # + a short "provider" section pointing to cloud.md
skills/zaileys-scaffold/SKILL.md              # ask provider; scaffold cloud projects
skills/zaileys-debug/SKILL.md                 # know cloud errors
skills/zaileys-review/SKILL.md                # know cloud guards/anti-patterns
plugins/zaileys-official/skills/**            # regenerated via `npm run skill:sync` (do NOT hand-edit)
```

Design: **one dedicated `cloud.md`** (self-contained, load-on-demand) + **surgical provider-awareness**
woven into the orchestrator's routing/rules and the sibling skills. Do NOT duplicate the whole
unofficial surface per-provider — shared API stays in `api.md`; `cloud.md` documents only the
differences and cloud-exclusive surface, cross-referencing `api.md` for shared builder/events.

## 5. Code style (content style)

- Match the existing skill voice: terse, table-driven routing, "verified/exact API", copy-paste
  runnable snippets, golden rules as imperatives.
- Mirror the docs split we already shipped: **🔗 unofficial (default)** vs **☁️ official (cloud)**;
  for shared features point to the shared reference, don't re-teach.
- Every cloud snippet must be **real and current** (4.8.1) — no invented methods. When unsure, check
  `src/cloud/*` or the live docs `llms-full.txt`.
- Keep provider defaults honest: `provider` defaults to `'baileys'`; cloud needs `cloud` creds.
- Markdown only; keep reference files focused and load-on-demand (don't bloat SKILL.md).

## 6. Testing strategy

- No automated tests (prose). Verification:
  1. **Snippet correctness** — cross-check every cloud API call against `references/api.md` additions
     and the shipped `src/cloud/` surface / live-tested behavior.
  2. **Sync integrity** — run `npm run skill:sync`, then `diff -r` canonical vs plugin copy = clean.
  3. **Routing coverage** — confirm the orchestrator routes each cloud intent (webhook, template,
     OTP, campaign, Flows, commerce, `wa.cloud.*`) to `cloud.md`.
  4. **Regression** — the unofficial sections still read correctly and the baileys-default framing is
     intact.

## 7. Boundaries

- **Always**: keep baileys the documented default; add cloud as an equal second provider; keep every
  snippet valid against 4.8.1; run `skill:sync` after editing canonical `skills/*` so the plugin copy
  never drifts; reuse shared references instead of duplicating.
- **Ask first**: publishing a new skill/plugin version or npm release for this doc change; renaming or
  restructuring existing skills; changing the plugin marketplace manifest.
- **Never**: hand-edit `plugins/zaileys-official/skills/**` (generated — edit canonical + sync);
  invent Cloud-API methods or parameters the library doesn't have; claim a web-only feature works on
  cloud (e.g. AIRich, groups, polls) — state the limit + the fix; break the existing unofficial
  guidance.
```
