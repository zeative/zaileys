import NodeCache from "node-cache";

const limiterCache = new NodeCache({ stdTTL: 60 * 60 });

export const LimiterHandler = async (key: string, max: number, ms: number): Promise<boolean> => {
  try {
    if (max <= 0) {
      return false;
    }

    const state = limiterCache.get<{ count: number; firstRequestTime: number }>(key);

    const now = Date.now();

    if (!state || now - state.firstRequestTime > ms) {
      const newState = {
        count: 1,
        firstRequestTime: now,
      };

      limiterCache.set(key, newState, Math.ceil(ms / 1000) + 10);
      return false;
    }

    const newState = {
      count: state.count + 1,
      firstRequestTime: state.firstRequestTime,
    };

    limiterCache.set(key, newState, Math.ceil((ms - (now - state.firstRequestTime)) / 1000) + 10);

    if (newState.count > max) {
      return true;
    }

    return false;
  } catch (err) {
    console.error("Error detecting spam:", err);
    return false;
  }
};

export const cleanupLimiters = (): void => {
  limiterCache.flushAll();
};

export const getLimiterInfo = (key: string): { count: number; firstRequestTime: number } | null => {
  return limiterCache.get<{ count: number; firstRequestTime: number }>(key) || null;
};

export const resetLimiter = (key: string): void => {
  limiterCache.del(key);
};
