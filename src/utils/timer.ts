/** Node turns any setTimeout delay above 2^31-1 ms (~24.8 days) into 1 ms, so a longer wait fires at once. */
export const MAX_TIMER_DELAY_MS = 2_147_483_647

/** Bounds a delay to what setTimeout honours; NaN becomes 0 instead of Node's silent 1 ms. */
export const clampTimerDelay = (ms: number): number =>
  Number.isNaN(ms) ? 0 : Math.min(MAX_TIMER_DELAY_MS, Math.max(0, ms))
