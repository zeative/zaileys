# Phase 5 Research: FFmpeg WhatsApp Compliance

## Context
WhatsApp demands strict formats for Media (Voice Notes, Videos, Documents).
The existing FFmpeg pipeline in `zaileys` was functional but lacked constraints specifically targeted to avoid WhatsApp server validation rejections, specifically on Video encodings and Audio `ogg/opus` specs.

## Audio (`audio.ts`)
### Goal:
Ensure voice notes and regular audio tracks strictly comply with OPUS / MP3 payloads.
### Solution:
WhatsApp Voice Notes exclusively decode `audio/ogg; codecs=opus`.
- Command options must strictly enforce: `-codec:a libopus`, `-b:a 48k`, `-f ogg`.
- We should ensure `audio.ts` forces this correctly when Opus is requested.

## Video (`video.ts`)
### Goal:
Ensure Video MP4 wrappers don't exceed max resolutions or incompatible pixel formats.
### Solution:
- H.264 is mandatory.
- We must enforce even-dimensions during scaling (`scale=trunc(iw/2)*2:trunc(ih/2)*2`) because `yuv420p` pixel format throws `divisible by 2` errors otherwise.

## Core & Document (`core.ts`, `document.ts`, `index.ts`)
- Keep wrappers clean. Wait for streams to fully resolve.
- Expose clear abstractions.
