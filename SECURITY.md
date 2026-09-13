# Security Policy — Zaileys

## Supported Versions

| Version | Supported                          |
| ------- | ---------------------------------- |
| 4.0.x   | Yes (current — CVE-2026-48063 patched) |
| 3.x     | No (EOL pada v4.0.0 GA)             |
| < 3.x   | No                                 |

Versi yang didukung saat ini adalah **`4.0.0`** (current). Semua perbaikan keamanan
ditargetkan ke baris `4.0.x`.

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
plus filesystem-level encryption (e.g., LUKS, FileVault) di host.

Sejak 4.15, `FileAuthStore` **menegakkan** permission ini sendiri: direktori dibuat `0700`,
file credential dan signal ditulis `0600` (termasuk file sementara, jadi tidak ada jendela
world-readable). Penulisan credential di-`fsync` sebelum rename, dan `creds.json` yang korup
dipulihkan dari snapshot terbaru.

## TC Tokens

Trusted Contact tokens (anti-abuse signaling untuk 1:1 chats) di-handle silent
oleh baileys upstream. Zaileys TIDAK expose API untuk issuance/expiration/pruning —
lifecycle terkelola otomatis dengan 4-bucket 7-day rolling validity (~28 hari).
Storage round-trip tetap berjalan via `AuthStore` key `tctoken` (legal kategori
di `SignalDataTypeMap`); tidak ada method tctoken-specific di public Client API.


## Session Lifecycle (4.15)

Kredensial hanya dihapus oleh **logout eksplisit**. Kode disconnect lain — termasuk `bad-session`
(500), `connection-replaced` (440), dan `forbidden` (403) — tidak lagi menghapus sesi. Alasannya:
baileys memakai 500 sebagai nilai default untuk stream error dan WebSocket error yang tidak dikenal,
jadi 500 bukan sinyal bahwa sesi rusak; sedangkan 440 justru berarti kredensialnya masih valid dan
sedang dipakai koneksi lain.

Perilaku lama bisa dikembalikan per-alasan:

```ts
new Client({ session: { clearAuthOn: ['logged-out', 'forbidden'] } })
```

Sebelum setiap penghapusan, kredensial di-*quarantine* lebih dulu lewat `backupCreds()` opsional di
`AuthCredsStore` (`creds.revoked-<ISO>.json` pada adapter file, baris/key terpisah pada adapter DB),
sehingga penghapusan yang keliru masih bisa dipulihkan.

`connect()` memuat kredensial **sebelum** socket dibuat. Sebelumnya socket lahir dengan objek kosong,
sehingga `routingInfo` selalu hilang dan store yang lambat bisa membuat client mendaftar sebagai
device baru lalu menimpa sesi yang valid.

**Isolasi store vs auth.** `RedisMessageStore.clear()` dan `ConvexMessageStore.clear()` kini terbatas
pada key milik masing-masing. Keduanya sebelumnya memakai namespace default `zaileys` yang sama dengan
auth store, jadi membersihkan riwayat chat ikut menghapus sesi.

## Untrusted Input

- **Quoted message tidak terautentikasi.** `MessageContext.verified` bernilai `false` bila konteks
  dibangun ulang dari `contextInfo` milik pengirim. Untuk keputusan otorisasi, wajib cek `verified`
  sebelum mempercayai `isFromMe`, `text`, atau `senderId` dari `msg.replied()`.
- **Perbandingan identitas sadar namespace.** LID (`@lid`) tidak pernah cocok dengan nomor telepon
  (`@s.whatsapp.net`) meski digitnya sama. Berlaku untuk `citation.banned`, `citation.authors`,
  guard admin grup, dan allow list `autoRejectCall`.
- **Media dari input user.** String biasa masih diperlakukan sebagai path lokal, tapi path yang
  resolve ke dalam direktori auth ditolak — jadi bot yang meneruskan teks user tidak bisa dipaksa
  mengirim `creds.json`-nya sendiri. Alamat privat/loopback/link-local diblokir, ada batas ukuran
  dan timeout. Mode ketat: `loadMedia(src, { allowLocalPaths: false })` — belum tersedia sebagai opsi `Client`.
- **Webhook Cloud API wajib bertanda tangan.** POST tanpa `appSecret` ditolak. Untuk development
  lokal: `cloud: { allowUnsigned: true }`.
- **`sessionId`** wajib cocok `/^[A-Za-z0-9_-]{1,64}$/` — ia diinterpolasi ke path yang dihapus
  rekursif.

## Beban & Deployment (4.15)

- **Multi-tenant pada satu database.** Adapter Postgres dan SQLite menerima `tablePrefix`, sehingga
  beberapa sesi bisa berbagi satu database tanpa saling menimpa. Tanpa prefix, nama tabel tetap sama
  seperti sebelumnya, jadi data lama langsung terbaca tanpa migrasi. Prefix divalidasi ketat karena
  masuk ke identifier SQL.
- **Backpressure pesan masuk.** Pesan yang menunggu resolusi LID dibatasi (`maxPendingResolutions`,
  default 256) dan antreannya dibatasi berdasarkan bobot (`maxQueuedResolutions`, default 20.000;
  pesan biasa berbobot 1, mention dan teks panjang menambah bobot). Lookup LID yang sama dijalankan
  sekali. Pesan yang masuk antrean hanya me-resolve pengirimnya. Kalau antrean penuh, pesan dibuang
  dan dicatat — **tidak pernah** diproses dengan identitas yang belum ter-resolve, supaya banjir pesan
  tidak bisa dipakai untuk melewati ban list.
- **`connect()` setelah `disconnect()`.** `disconnect()` tetap menutup store (supaya proses bisa exit),
  dan `connect()` berikutnya membuka kembali lewat `reopen()` opsional yang dimiliki semua adapter
  bawaan. Adapter kustom tanpa `reopen()` mendapat pesan error yang menjelaskan.
- **ffmpeg/ffprobe.** Binary bawaan yang tidak executable (postinstall diblokir pnpm 10/bun) diperbaiki
  otomatis dengan `chmod u+x`, atau jatuh ke binary sistem di `PATH`. `FFMPEG_PATH`/`FFPROBE_PATH`
  dihormati. Binary yang dipakai tidak lagi bergantung urutan job.
- **Antrean ffmpeg dibatasi.** Maksimal 4 proses bersamaan, 64 job menunggu, 120 detik waktu tunggu;
  job berlebih ditolak dengan pesan jelas. Bisa diatur lewat `media` di `ClientOptions`.
- **Opsi media dari `Client`.** `media: { maxBytes, allowLocalPaths, allowPrivateNetwork, deniedDirs,
  maxImagePixels, maxConcurrentFfmpeg, maxQueuedFfmpeg, ffmpegQueueTimeoutMs }`. Berlaku untuk seluruh
  proses — kalau ada beberapa `Client`, yang terakhir dibuat yang berlaku. Folder `FileAuthStore`
  (termasuk `basePath` kustom) selalu dilindungi dari pembacaan media.

## Yang Belum Ditutup

- **Stiker animasi di Apple Silicon dengan ffmpeg bawaan.** Build darwin-arm64 dari
  `@ffmpeg-installer/ffmpeg` tidak punya encoder `libwebp`. Pakai ffmpeg sendiri yang menyertakan
  libwebp lewat `FFMPEG_PATH`. (ffmpeg 7+ sebelumnya juga gagal karena `-vsync` — sudah diperbaiki.)
- **Format key Convex.** Bagian `:` di key pesan tidak di-escape. Dengan JID yang valid tabrakan tidak
  bisa terjadi (JID selalu berakhir di `@server`), jadi format tidak diubah demi menghindari migrasi
  data. Parsing JID saat pruning sudah diperbaiki.
- **`MemoryMessageStore` tumbuh mengikuti jumlah pesan.** Inheren untuk message store di memori;
  batasi dengan `autoDelete.maxAgeMs` atau pakai store di disk.
