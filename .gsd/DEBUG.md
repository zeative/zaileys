# Debug Session: WhatsApp Desktop Interactive Buttons

## Symptom
Interactive and List buttons fail to display on WhatsApp Desktop. Instead of rendering, they show standard deprecation/incompatibility placeholders: "This message couldn't load. Open the message on your phone to view it."

**When:** Whenever the bot sends an interactive button or list message (powered by native `wa.button()`) and the receiver attempts to view it specifically on the WhatsApp Web or Desktop application.
**Expected:** The buttons should render uniformly across all devices natively, including desktop clients.
**Actual:** They render perfectly on Android and iOS (as tested and observed before) but fail and block rendering on the Desktop client.

## Hypotheses

| # | Hypothesis | Likelihood | Status |
|---|------------|------------|--------|
| 1 | WhatsApp Desktop no longer parses old Baileys button payloads and strictly expects the newer 'interactiveMessage' Node structures wrapped in viewOnce. | 80% | ELIMINATED (Broke on both Mobile & Desktop) |
| 2 | WhatsApp Desktop requires specific `biz` / `bot` binary nodes alongside the `interactiveMessage` payload to whitelist rendering. | 60% | UNTESTED |
| 3 | Baileys natively supports it but we are structuring the proto JSON incorrectly based on current Baileys version. | 40% | UNTESTED |

---

## Attempts

### Attempt 1
**Testing:** H1 — Wrap interactiveMessage tightly inside viewOnceMessage.
**Action:** Modified `src/Classes/button.ts` to push `{ viewOnceMessage: { message: { interactiveMessage: content } } }` instead of bare `interactiveMessage`.
**Result:** Buttons broke entirely on both Mobile ("Terdeteksi viewonce") and Desktop ("This message couldn't load").
**Conclusion:** ELIMINATED
