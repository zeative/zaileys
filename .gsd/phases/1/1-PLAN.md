---
phase: 1
plan: 1
wave: 1
---

# Plan 1.1: Core Utilities (Part A)

## Objective
Implement the foundational text, JID, and media utilities required for the V4 architecture. These utilities are the bedrock of the message processing pipeline.

## Context
- .gsd/SPEC.md
- tech-docs-v4.txt (Sections 7.6, 21.5)

## Tasks

<task type="auto">
  <name>Implement Text Utils</name>
  <files>src/utils/text.ts</files>
  <action>
    Implement `normalizeText` with pre-compiled regex patterns as defined in `tech-docs-v4.txt` section 7.6.
    - WHAT: Remove RTL overrides, invisible marks, zero-width chars, and non-standard whitespace.
    - WHY: V3 was re-compiling 30+ regexes per message; V4 must compile ONCE at module load for performance.
    - ESCAPE: Ensure NFKD/NFKC/NFC normalization is applied.
  </action>
  <verify>npx vitest src/utils/text.ts</verify>
  <done>
    `normalizeText` correctly cleans "z҉a҉i҉l҉e҉y҉s҉" and handles RTL overrides.
  </done>
</task>

<task type="auto">
  <name>Implement JID Utils</name>
  <files>src/utils/jid.ts</files>
  <action>
    Implement `cleanJid` and `resolveJids`.
    - `cleanJid(jid: string)`: Remove `@s.whatsapp.net` or `@g.us` if present and return clean number, or vice versa.
    - `resolveJids(input: string | string[])`: Handle mixed input and return array of clean JIDs.
  </action>
  <verify>npx vitest src/utils/jid.ts</verify>
  <done>
    `cleanJid` and `resolveJids` function correctly across various JID formats.
  </done>
</task>

<task type="auto">
  <name>Implement Media Utils</name>
  <files>src/utils/media.ts</files>
  <action>
    Implement `cleanMediaObject`.
    - Handle Buffer, URL string, or local file path.
    - Return a unified media structure for the Transformers to use.
  </action>
  <verify>npx vitest src/utils/media.ts</verify>
  <done>
    `cleanMediaObject` handles all three input types correctly.
  </done>
</task>

## Success Criteria
- [ ] `src/utils/text.ts`, `src/utils/jid.ts`, and `src/utils/media.ts` are implemented.
- [ ] Benchmarks (manual) show improved performance for text normalization.
