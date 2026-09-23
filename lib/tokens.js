/**
 * JWT helpers — the only place tokens are signed or verified.
 *
 * [SECURITY FIX 2026-09-23] Token confusion: the free-trial activation token was signed with the same
 * secret as login tokens and carried a `userId` claim, so an activation link (e-mailed, printed to the
 * server log) was ALSO a valid 72h login token for that account. Every token now carries a `purpose`
 * claim and each verifier only accepts its own purpose. The algorithm is pinned to HS256 so a token
 * can never be verified with a different algorithm than the one it was signed with.
 */
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./config");

const ALGORITHM = "HS256";

const TOKEN_PURPOSE = Object.freeze({
  AUTH: "auth",
  PLAN_ACTIVATION: "plan-activation",
});

const AUTH_TOKEN_TTL = "7d";
const ACTIVATION_TOKEN_TTL = "72h";

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

module.exports = {
  signAuthToken,
  verifyAuthToken,
  signActivationToken,
  verifyActivationToken,
};
