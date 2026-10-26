const MILLISECONDS_PER_SECOND = 1000;

export function createRateLimiter({ max, windowMs, now }) {
  const windows = new Map();
  return (req, res, next) => {
    const currentTime = now();
    const key = req.ip;
    let window = windows.get(key);
    if (!window || currentTime >= window.startedAt + windowMs) {
      window = { startedAt: currentTime, count: 0 };
      windows.set(key, window);
    }
    if (window.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((window.startedAt + windowMs - currentTime) / MILLISECONDS_PER_SECOND));
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ error: "rate limit exceeded" });
    }
    window.count += 1;
    return next();
  };
}
