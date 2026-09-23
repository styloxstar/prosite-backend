/**
 * Centralised, validated runtime configuration.
 *
 * [SECURITY FIX 2026-09-23] Previously every file read `process.env.JWT_SECRET || "prosite_secret"`.
 * If the env var was ever missing (new deployment, typo, preview env) the app silently fell back to a
 * public, hard-coded secret, letting anyone forge a JWT for any user (including admins).
 * All secrets are now read in ONE place and the app refuses to start without a strong secret.
 */
require("dotenv").config();

const MIN_JWT_SECRET_LENGTH = 32;

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production" || Boolean(process.env.VERCEL);

function readJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set and at least ${MIN_JWT_SECRET_LENGTH} characters long. ` +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    );
  }
  return secret;
}

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const config = Object.freeze({
  NODE_ENV,
  IS_PRODUCTION,
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/prosite",
  JWT_SECRET: readJwtSecret(),
  /** Comma-separated list of frontend origins allowed by CORS. */
  CLIENT_URL,
  /** The first CLIENT_URL entry is the public frontend URL used in e-mail links. */
  PRIMARY_CLIENT_URL: CLIENT_URL.split(",")[0].trim(),
  UPI_PAYEE_ID: process.env.UPI_PAYEE_ID || "",
  UPI_PAYEE_NAME: process.env.UPI_PAYEE_NAME || "",
  EMAIL_USER: process.env.EMAIL_USER || "",
  EMAIL_PASS: process.env.EMAIL_PASS || "",
});

module.exports = config;
