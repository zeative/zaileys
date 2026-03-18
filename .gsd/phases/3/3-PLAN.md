---
phase: 3
plan: 3
wave: 1
---

# Plan 3.3: Utility Transformers

## Objective
Implement utility transformers for non-media types: Stickers (WebP), Documents, Location, Contacts (VCard), and Polls.

## Context
- .gsd/SPEC.md
- tech-docs-v4.txt (Section 5.4, 5.5)

## Tasks

<task type="auto">
  <name>Implement Sticker & Document Transformers</name>
  <files>src/signal/transformers/sticker.ts, src/signal/transformers/document.ts</files>
  <action>
    Implement sticker and document processing.
    - Sticker: Handle WebP conversion and shape metadata. 
    - Document: Support filename and mimetype extraction.
  </action>
  <verify>npx vitest __tests__/signal/transformers-utility.test.ts</verify>
  <done>
    Sticker and Document payloads are correctly transformed.
  </done>
</task>

<task type="auto">
  <name>Implement Location, Contact & Poll Transformers</name>
  <files>src/signal/transformers/location.ts, src/signal/transformers/contact.ts, src/signal/transformers/poll.ts</files>
  <action>
    Implement more complex utility types.
    - Location: Shorthand for lat/lng.
    - Contact: VCard generation for single and multi-contacts.
    - Poll: Normalize semantic poll objects to Baileys creation messages.
  </action>
  <verify>npx vitest __tests__/signal/transformers-complex.test.ts</verify>
  <done>
    Complex utility payloads are correctly transformed.
  </done>
</task>

## Success Criteria
- [ ] 5 utility transformers implemented.
- [ ] VCard generation is correct for contacts.
- [ ] Poll normalization matches Baileys requirements.
