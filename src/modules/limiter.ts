import NodeCache from "node-cache";


const limiterCache = new NodeCache({ stdTTL: 60 * 60 }); 

/**
 * Detects if a request is spam based on rate limiting
 * @param key Unique identifier for the limiter (e.g., user ID, IP address, room ID)
 * @param max Maximum number of requests allowed within the time window
 * @param ms Time window in milliseconds
 * @returns true if the request is considered spam, false otherwise
 */
export const LimiterHandler = async (key: string, max: number, ms: number): Promise<boolean> => {
  try {
    
    if (max <= 0) {
      return false;
    }

    
    const state = limiterCache.get<{ count: number; firstRequestTime: number }>(key);
    
    
    const now = Date.now();
    
    
    if (!state || (now - state.firstRequestTime) > ms) {
      const newState = {
        count: 1,
        firstRequestTime: now
      };
      
      
      limiterCache.set(key, newState, Math.ceil(ms / 1000) + 10);
      return false; 
    }
    
    
    const newState = {
      count: state.count + 1,
      firstRequestTime: state.firstRequestTime
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

/**
 * Cleanup function to prevent memory leaks
 * Clears all limiter states from cache
 */
export const cleanupLimiters = (): void => {
  limiterCache.flushAll();
};

/**
 * Get current rate limit info for a key
 * @param key Unique identifier for the limiter
 * @returns Current state or null if no state exists
 */
export const getLimiterInfo = (key: string): { count: number; firstRequestTime: number } | null => {
  return limiterCache.get<{ count: number; firstRequestTime: number }>(key) || null;
};

/**
 * Reset rate limit for a specific key
 * @param key Unique identifier for the limiter
 */
export const resetLimiter = (key: string): void => {
  limiterCache.del(key);
};