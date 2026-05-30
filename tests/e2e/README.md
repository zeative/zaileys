# E2E Runner (opt-in)

The end-to-end suite in this directory connects to a **real WhatsApp account** and is
**disabled by default**. It is gated behind `ZAILEYS_E2E=1` via `describe.skipIf`, so the
normal `pnpm test` run (and CI) discovers the file but reports it as skipped — never failed,
never connecting.

> CI never runs these tests. There is no WhatsApp account in CI, and a real connection is
> human-driven (QR scan / pairing code). Run them locally, on demand, against a throwaway
> test account.

## Requirements

- A dedicated WhatsApp **test account** (do not use a personal/production number).
- A phone able to scan the QR code, or a phone number for pairing-code login.

## Running

QR login (scan the printed QR):

```bash
ZAILEYS_E2E=1 pnpm exec vitest run tests/e2e
```

Pairing-code login:

```bash
ZAILEYS_E2E=1 ZAILEYS_E2E_AUTH=pairing ZAILEYS_E2E_PHONE='+6281234567890' \
  pnpm exec vitest run tests/e2e
```

Also send one smoke message to a target JID after connecting:

```bash
ZAILEYS_E2E=1 ZAILEYS_E2E_TARGET='6281234567890@s.whatsapp.net' \
  pnpm exec vitest run tests/e2e
```

## Environment variables

| Var                  | Required | Default      | Purpose                                          |
| -------------------- | -------- | ------------ | ------------------------------------------------ |
| `ZAILEYS_E2E`        | yes      | —            | Must be `1` to enable the suite                  |
| `ZAILEYS_E2E_AUTH`   | no       | `qr`         | `qr` or `pairing`                                |
| `ZAILEYS_E2E_PHONE`  | pairing  | —            | E.164 phone number, required when `auth=pairing` |
| `ZAILEYS_E2E_TARGET` | no       | —            | JID to send a smoke message to after connect     |
| `ZAILEYS_E2E_SESSION`| no       | `e2e-smoke`  | Session id (auth dir under `./.zaileys/auth/`)   |

No credentials or numbers are hardcoded — everything is read from the environment.
