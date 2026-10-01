/**
 * JWT helpers — the only place tokens are signed or verified.
 *
 * [SECURITY FIX 2026-09-23] Token confusion: the free-trial activation token was signed with the same
 * secret as login tokens and carried a `userId` claim, so an activation link (e-mailed, printed to the
 * server log) was ALSO a valid 72h login token for that account. Every token now carries a `purpose`
 * claim and each verifier only accepts its own purpose. The algorithm is pinned to HS256 so a token
 * can never be verified with a different algorithm than the one it was signed with.
 */
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./config");

const ALGORITHM = "HS256";

const TOKEN_PURPOSE = Object.freeze({
  AUTH: "auth",
  PLAN_ACTIVATION: "plan-activation",
  PASSWORD_RESET: "password-reset",
});

const AUTH_TOKEN_TTL = "7d";
const ACTIVATION_TOKEN_TTL = "72h";
/** Reset links are short-lived: they are as good as the password while they last. */
const PASSWORD_RESET_TTL_MINUTES = 30;

function sign(payload, expiresIn) {
  return jwt.sign(payload, JWT_SECRET, { algorithm: ALGORITHM, expiresIn });
}

function verify(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: [ALGORITHM] });
}

function signAuthToken(userId) {
  return sign({ userId: String(userId), purpose: TOKEN_PURPOSE.AUTH }, AUTH_TOKEN_TTL);
}

/**
 * Verifies a login token. Tokens issued before this fix have no `purpose` claim; they are still
 * accepted (they expire within 7 days) unless they look like an activation token (`planId` claim).
 */
function verifyAuthToken(token) {
  const decoded = verify(token);
  const isLegacyAuthToken = decoded.purpose === undefined && decoded.planId === undefined;
  if (decoded.purpose !== TOKEN_PURPOSE.AUTH && !isLegacyAuthToken) {
    throw new jwt.JsonWebTokenError("Token is not a login token");
  }
  if (!decoded.userId) {
    throw new jwt.JsonWebTokenError("Token has no subject");
  }
  return decoded;
}

function signActivationToken(userId, planId) {
  return sign(
    { userId: String(userId), planId, purpose: TOKEN_PURPOSE.PLAN_ACTIVATION },
    ACTIVATION_TOKEN_TTL
  );
}

/** Accepts new activation tokens and not-yet-expired ones issued before the `purpose` claim existed. */
function verifyActivationToken(token) {
  const decoded = verify(token);
  const isLegacyActivationToken = decoded.purpose === undefined && decoded.planId !== undefined;
  if (decoded.purpose !== TOKEN_PURPOSE.PLAN_ACTIVATION && !isLegacyActivationToken) {
    throw new jwt.JsonWebTokenError("Token is not an activation token");
  }
  return decoded;
}

/**
 * A short fingerprint of the user's current password hash. A reset token carries it and is only
 * accepted while it still matches, so every reset link stops working the moment the password changes
 * (including through that very link: tokens are single-use) without storing anything server-side.
 */
function passwordFingerprint(user) {
  return crypto.createHash("sha256").update(`${user.password}|${user._id}`).digest("base64url").slice(0, 22);
}

function signPasswordResetToken(user) {
  return sign(
    { userId: String(user._id), purpose: TOKEN_PURPOSE.PASSWORD_RESET, pf: passwordFingerprint(user) },
    `${PASSWORD_RESET_TTL_MINUTES}m`
  );
}

/** Verifies signature, expiry and purpose. The caller must still check `pf` against the user. */
function verifyPasswordResetToken(token) {
  const decoded = verify(token);
  if (decoded.purpose !== TOKEN_PURPOSE.PASSWORD_RESET || !decoded.userId || !decoded.pf) {
    throw new jwt.JsonWebTokenError("Token is not a password reset token");
  }
  return decoded;
}

module.exports = {
  PASSWORD_RESET_TTL_MINUTES,
  passwordFingerprint,
  signPasswordResetToken,
  verifyPasswordResetToken,
  signAuthToken,
  verifyAuthToken,
  signActivationToken,
  verifyActivationToken,
};
