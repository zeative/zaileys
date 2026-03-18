---
phase: 3
plan: 2
wave: 1
---

# Plan 3.2: Basic Transformers (Text & Media)

## Objective
Implement the primary transformers for text (with auto-mentions) and basic media types (image, video, audio) with automatic metadata handling.

## Context
- .gsd/SPEC.md
- tech-docs-v4.txt (Section 5.3)

## Tasks

<task type="auto">
  <name>Implement Text & Image Transformers</name>
  <files>src/signal/transformers/text.ts, src/signal/transformers/image.ts</files>
  <action>
    Implement text and image processing.
    - Text: Handle auto-mentions and link previews.
    - Image: Use `Media` utility to standardize buffer/URL and handle thumbnails.
  </action>
  <verify>npx vitest __tests__/signal/transformers-basic.test.ts</verify>
  <done>
    Text and Image payloads are correctly transformed for Baileys.
  </done>
</task>

<task type="auto">
  <name>Implement Video & Audio Transformers</name>
  <files>src/signal/transformers/video.ts, src/signal/transformers/audio.ts</files>
  <action>
    Implement video and audio processing.
    - Video: Support PTV (Note) switch and captions.
    - Audio: Support PTT (Voice Note) toggle and Opus normalization if needed.
  </action>
  <verify>npx vitest __tests__/signal/transformers-media.test.ts</verify>
  <done>
    Video and Audio payloads are correctly transformed for Baileys.
  </done>
</task>

## Success Criteria
- [ ] Text transformer handles mentions.
- [ ] Image, Video, and Audio transformers standardize input via `Media` utility.
