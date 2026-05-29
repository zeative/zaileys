# Security Policy — Zaileys

## Supported Versions

| Version | Supported                       |
| ------- | ------------------------------- |
| 4.x     | Yes                             |
| 3.x     | No (EOL setelah v4.0.0 GA)      |
| < 3.x   | No                              |

## Reporting Vulnerabilities

Email security disclosures ke maintainer via GitHub Issue (mark as "security")
atau private channel di repository. Jangan publish CVE details secara publik
sebelum patch tersedia.

Target response: acknowledgement dalam 72 jam, patch atau mitigation plan
dalam 14 hari untuk severity high/critical.

## Disclosed Vulnerabilities

### CVE-2026-48063 / GHSA-qvv5-jq5g-4cgg — Message spoofing via protocolMessage.type

- **Affected:** Baileys `< 7.0.0-rc12` (zaileys `v3.x` dengan `baileys ^7.0.0-rc.9` atau lebih lama)
- **Patched in zaileys:** `v4.0.0` (bumps baileys ke `^7.0.0-rc13`)
- **Severity:** Critical
- **Description:** Pre-rc12, `processMessage` dispatched on `protocolMessage.type` tanpa cek `fromMe`. Attacker bisa mengirim crafted message dengan `protocolMessage.type === HISTORY_SYNC_NOTIFICATION` (atau `APP_STATE_SYNC_KEY_SHARE`, `LID_MIGRATION_MAPPING_SYNC`, `PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE`) dan client akan memperlakukannya sebagai directive dari device sendiri — corrupt local history, swap LID mappings, atau eksfiltrasi app-state-sync keys.
- **Patch (upstream baileys ≥rc12):** `SELF_ONLY_TYPES` set enforced — incoming protocol message dengan type tersebut dan `!message.key.fromMe` akan di-drop dengan warn log `dropping spoofed self-only protocolMessage from non-self origin`.
- **Depth-in-defense (zaileys v4):** Consumer-side guard `dropSpoofedSelfOnly()` di `src/events/guards.ts` membuang upsert events yang membawa `requestId` field (indicator placeholderResendMessage spoof). Diinvoke di event dispatcher Phase 4.

## Supply Chain

Zaileys v4 mengandalkan native dep `whatsapp-rust-bridge` (via baileys).
Verifikasi prebuilds dari trusted source saat install. Lock file (`pnpm-lock.yaml`)
WAJIB di-commit; review setiap perubahan transitive deps.

## Auth Material at Rest

AuthStore default adapter (Phase 2) menyimpan credentials sebagai JSON file.
**Tidak terenkripsi.** Process yang punya akses ke working directory bisa
hijack session. Untuk production: gunakan `SqliteAuthStore` atau `RedisAuthStore`
plus filesystem-level encryption (e.g., LUKS, FileVault) di host. File permission
default adapter wajib `0600` untuk creds.json dan `0700` untuk parent directory.

## TC Tokens

Trusted Contact tokens (anti-abuse signaling untuk 1:1 chats) di-handle silent
oleh baileys upstream. Zaileys TIDAK expose API untuk issuance/expiration/pruning —
lifecycle terkelola otomatis dengan 4-bucket 7-day rolling validity (~28 hari).
Storage round-trip tetap berjalan via `AuthStore` key `tctoken` (legal kategori
di `SignalDataTypeMap`); tidak ada method tctoken-specific di public Client API.
