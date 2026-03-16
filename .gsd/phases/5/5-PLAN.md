---
phase: 5
plan: 1
wave: 1
---

# Plan 5.1: Solidify FFmpeg Constants and Media File Transformers

## Objective
Refactor the media execution pipes for Video and Audio. Video needs strict pixel formats and even-dimensions to avoid decoding bugs on mobile, while Audio needs precise Opus encapsulations inside OGG. Both need cleaner buffer handling to avoid hanging node processes.

## Context
- .gsd/SPEC.md
- .gsd/ROADMAP.md
- src/Library/ffmpeg/core.ts
- src/Library/ffmpeg/audio.ts
- src/Library/ffmpeg/video.ts

## Tasks

<task type="auto">
  <name>Patch Core and Audio Modifiers</name>
  <files>src/Library/ffmpeg/core.ts, src/Library/ffmpeg/audio.ts</files>
  <action>
    - Ensure `FFMPEG_CONSTANTS` strictly uses `ogg` extension for Voice Notes (Opus).
    - In `audio.ts`, modify the FFmpeg Opus flags to strictly output `-c:a libopus`, `-b:a 48k`, and output format `-f ogg`.
  </action>
  <verify>pnpm tsc --noEmit</verify>
  <done>Audio processor perfectly isolates MP3 and OPUS buffers with no TS errors.</done>
</task>

<task type="auto">
  <name>Enhance Video Conversions</name>
  <files>src/Library/ffmpeg/video.ts, src/Library/ffmpeg/document.ts</files>
  <action>
    - Inject `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"` in `video.ts` conversions to ensure `yuv420p` format never crashes from odd-sized resolutions.
    - Clean up `document.ts` abstraction.
    - Ensure `index.ts` flawlessly exports everything.
  </action>
  <verify>pnpm tsc --noEmit</verify>
  <done>Video processor forces H264 on all variants flawlessly without odd dimension crash bugs.</done>
</task>

## Success Criteria
- [ ] Voice notes trigger Opus over OGG correctly.
- [ ] Video parsing scales safely without YUV offset crashes.
- [ ] All `src/Library/ffmpeg/*` modules pass Type checking.
