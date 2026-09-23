/**
 * Minimal fixed-window rate limiter (no external dependency).
 *
 * [SECURITY FIX 2026-09-23] There was no rate limiting anywhere, so `/auth/login` could be
 * brute-forced, `/auth/register` could be used for mass account creation, and
 * `/billing/activate-free` could be used to e-mail-bomb any inbox from the company Gmail account.
 *
 * Note: counters live in process memory. On serverless (Vercel) each warm instance keeps its own
 * counters, so this is a best-effort brake, not a hard guarantee. For a hard guarantee back it with a
 * shared store (e.g. Redis / Upstash) using the same interface.
 */

const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * `req.ip` honours `app.set("trust proxy", 1)` in server.js, so behind Vercel it is the real client IP.
 * Reading X-Forwarded-For directly would let any client pick a fresh "IP" per request and bypass limits.
 */
function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * @param {object} options
 * @param {number} options.windowMs   Length of the counting window.
 * @param {number} options.max        Requests allowed per key per window.
 * @param {string} options.message    Error returned once the limit is hit.
 * @param {(req) => string} [options.keyGenerator] Defaults to client IP.
 */
function rateLimit({ windowMs, max, message, keyGenerator = clientIp }) {
  const hits = new Map(); // key -> { count, resetAt }
  let lastSweep = Date.now();

  function sweepExpired(now) {
    if (now - lastSweep < SWEEP_INTERVAL_MS) return;
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
    lastSweep = now;
  }

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    sweepExpired(now);

    const key = keyGenerator(req);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

/** Login: 10 attempts / 15 min per IP. */
const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 10,
  message: "Too many login attempts. Please try again in a few minutes.",
});

/** Registration: 10 accounts / hour per IP. */
const registerLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 10,
  message: "Too many accounts created from this network. Please try again later.",
});

/** Outgoing e-mail triggers: 5 / hour per user. Must run after `authenticate`. */
const emailLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 5,
  message: "Too many e-mails requested. Please try again later.",
  keyGenerator: (req) => (req.user ? `user:${req.user._id}` : clientIp(req)),
});

/** Payment confirmation attempts: 10 / hour per user (slows transaction-ID guessing). */
const paymentLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 10,
  message: "Too many payment attempts. Please try again later.",
  keyGenerator: (req) => (req.user ? `user:${req.user._id}` : clientIp(req)),
});

/** Generic API ceiling: 1000 requests / 15 min per IP (high enough for builder autosave). */
const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 1000,
  message: "Too many requests. Please slow down.",
});

module.exports = { rateLimit, loginLimiter, registerLimiter, emailLimiter, paymentLimiter, apiLimiter };
