import Bottleneck from "bottleneck";
import NodeCache from "node-cache";

const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

export const limiter = async (key: string, max: number, ms: number) => {
  const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 0,
    reservoir: max,
    reservoirRefreshAmount: max,
    reservoirRefreshInterval: ms,
  });

  const now = Date.now();
  const user: any = cache.get(key) || { count: 0, last: 0 };

  if (now - user.last > ms) {
    user.count = 0;
  }

  user.count += 1;
  user.last = now;
  cache.set(key, user);

  try {
    return await limiter.schedule(async () => {
      if (user.count > max) {
        cache.set(key, { ...user, blacklisted: now + ms });
        return true;
      }
      return await false;
    });
  } catch (err) {
    console.error("Error detecting spam:", err);
    return false;
  }
};
