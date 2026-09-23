const User = require("../models/User");
const { verifyAuthToken } = require("../lib/tokens");

// [SECURITY FIX 2026-09-23] Removed the hard-coded `"prosite_secret"` fallback; token handling now
// lives in lib/tokens.js (purpose-checked, algorithm-pinned).

const BEARER_PREFIX = "Bearer ";

/** True when the token was issued before the user's most recent password change. */
function isIssuedBeforePasswordChange(decoded, user) {
  if (!user.passwordChangedAt) return false;
  const issuedAtMs = decoded.iat * 1000;
  // 1s tolerance: the new token handed out on password change is issued in the same second.
  return issuedAtMs < user.passwordChangedAt.getTime() - 1000;
}

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (typeof authHeader !== "string" || !authHeader.startsWith(BEARER_PREFIX)) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.slice(BEARER_PREFIX.length).trim();
    const decoded = verifyAuthToken(token);

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // [SECURITY FIX 2026-09-23] Changing your password now revokes every previously issued token,
    // so a stolen token stops working as soon as the victim changes their password.
    if (isIssuedBeforePasswordChange(decoded, user)) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

const requirePlan = (...allowedPlans) => {
  return (req, res, next) => {
    if (!allowedPlans.includes(req.user.plan.id) && req.user.role !== "admin") {
      return res.status(403).json({ error: "Upgrade your plan to access this feature" });
    }
    next();
  };
};

module.exports = { authenticate, requireAdmin, requirePlan };
