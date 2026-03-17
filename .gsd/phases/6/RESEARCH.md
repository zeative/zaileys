# Phase 6 Research: Media Processing DX Overhaul

## Context
While the underlying media encoding logic (Sharp, LMDB, FFMPEG) has been fully optimized, the resulting Developer Experience (DX) for interacting with media remains clunky. 
The current `MediaModifier` exposes utilities via awkwardly nested objects:
```typescript
await mediaModifier.video(buffer).toMp4();
await mediaModifier.image(buffer).toJpeg();
```
While functional, this approach lacks the intuition of modern chainable APIs. 

## Proposed DX Strategy
Transition to a **Factory/Builder** pattern that abstracts the type inference gracefully.
Developers should be able to instantiate a core wrapper around any media and fluently pipe it to formatting engines:

### Example Idea:
```typescript
import { Media } from 'zaileys';

// Create a wrapper
const media = new Media(buffer);

// Fluid formatting
const mp4 = await media.toVideo().toMp4();
const jpeg = await media.toImage().toJpeg();
const thumbnail = await media.getThumbnail();
```

### Implementation Rules:
- Abstract `src/Library/media-modifier.ts` into a `Media` class.
- Encapsulate the raw `MediaInput` securely.
- Ensure intellisense correctly exposes `Audio`, `Video`, `Image`, and `Sticker` transformation namespaces cleanly without confusing the parent prototype chain.
- Remove redundant boilerplate from the old `MediaModifier` constants.
