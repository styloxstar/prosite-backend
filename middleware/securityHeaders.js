/**
 * [SECURITY FIX 2026-09-23] The API sent no security headers and advertised "X-Powered-By: Express".
 * This sets the defensive headers that `helmet` would set for a JSON API, without adding a dependency.
 * The API only returns JSON / file downloads, so a locked-down CSP is safe here.
 */
function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); // frontend lives on another origin
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

/** Stops browsers/proxies caching authenticated JSON responses (profiles, invoices, admin data). */
function noStore(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

module.exports = { securityHeaders, noStore };
