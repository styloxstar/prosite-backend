/**
 * ProSite transactional e-mail templates.
 *
 * Every template returns `{ subject, html, text }`. The HTML is built for e-mail clients, not
 * browsers: table layout, inline styles only, and a solid `bgcolor` behind every gradient so Outlook
 * and other clients that drop gradients still show readable white-on-colour headers and buttons.
 *
 * All dynamic values must go through `escapeHtml` before they reach the markup. Names, transaction
 * ids and so on are user-controlled, and an unescaped one could smuggle a phishing link into a mail
 * sent from the official account.
 */
const { escapeHtml } = require("../lib/validators");

const CURRENCY_SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

const BRAND = {
  name: "ProSite",
  primary: "#3B82F6",
  secondary: "#8B5CF6",
  success: "#16A34A",
  ink: "#111827",
  text: "#374151",
  muted: "#6B7280", // 4.8:1 on white, the lightest grey used for body copy
  line: "#E5E7EB",
  canvas: "#F1F3F7",
  font: "'Segoe UI', Helvetica, Arial, sans-serif",
};

const longDate = (value) => new Date(value).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

/** "₹499.00": symbol for known currencies, otherwise the code ("AED 499.00"). */
function formatMoney(amount, currency = "INR") {
  const value = Number(amount);
  const figure = Number.isFinite(value) ? value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(amount ?? "");
  const symbol = CURRENCY_SYMBOLS[currency];
  return symbol ? `${symbol}${figure}` : `${currency} ${figure}`;
}

// ── Building blocks ─────────────────────────────────────────────────────────────────────────────

/** Label / value pairs in a light panel (payment details, order info). Values must be pre-escaped. */
function detailsPanel(title, rows) {
  const body = rows.map(([label, value]) => `
          <tr>
            <td style="padding:5px 0;font-size:13px;color:${BRAND.muted};width:45%;">${label}</td>
            <td style="padding:5px 0;font-size:13px;color:${BRAND.ink};font-weight:600;word-break:break-all;">${value}</td>
          </tr>`).join("");
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border:1px solid ${BRAND.line};border-radius:12px;margin:0 0 28px;">
          <tr><td style="padding:16px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td colspan="2" style="padding:0 0 8px;font-size:11px;font-weight:700;color:${BRAND.text};text-transform:uppercase;letter-spacing:0.8px;">${title}</td></tr>${body}
            </table>
          </td></tr>
        </table>`;
}

/** Line items with a highlighted total row. Cells must be pre-escaped. */
function lineItems({ columns, rows, totalLabel, total, accent }) {
  const head = columns.map((c, i) => `<th align="${i === 0 ? "left" : "right"}" style="padding:12px 16px;font-size:11px;font-weight:700;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid ${BRAND.line};">${c}</th>`).join("");
  const body = rows.map((cells) => `<tr>${cells.map((cell, i) => `<td align="${i === 0 ? "left" : "right"}" style="padding:16px;font-size:14px;color:${BRAND.ink};font-weight:600;vertical-align:top;">${cell}</td>`).join("")}</tr>`).join("");
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.line};border-radius:12px;border-collapse:separate;overflow:hidden;margin:0 0 28px;">
          <tr style="background:#F9FAFB;">${head}</tr>
          ${body}
          <tr style="background:#F9FAFB;">
            <td colspan="${columns.length - 1}" style="padding:14px 16px;font-size:14px;font-weight:700;color:${BRAND.ink};border-top:1px solid ${BRAND.line};">${totalLabel}</td>
            <td align="right" style="padding:14px 16px;font-size:18px;font-weight:800;color:${accent};border-top:1px solid ${BRAND.line};">${total}</td>
          </tr>
        </table>`;
}

/** "Bulletproof" button: the solid bgcolor carries it where the gradient isn't supported. */
function button({ href, label, from, to }) {
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
          <tr><td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td bgcolor="${to}" style="border-radius:12px;background:${to};background-image:linear-gradient(135deg,${from},${to});">
                <a href="${href}" target="_blank" style="display:inline-block;padding:15px 40px;font-family:${BRAND.font};font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;">${label}</a>
              </td>
            </tr></table>
          </td></tr>
        </table>`;
}

/**
 * The shared frame: preheader (inbox preview line), branded header, white card, footer.
 * `accent` is `[from, to]` for the header band. `to` doubles as the solid fallback, so pick a
 * `to` that white text reads well on.
 */
function layout({ title, preheader, kicker, accent: [from, to], body, footnote }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};font-family:${BRAND.font};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.canvas}" style="background:${BRAND.canvas};padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

      <tr><td bgcolor="${to}" style="background:${to};background-image:linear-gradient(135deg,${from} 0%,${to} 100%);border-radius:16px 16px 0 0;padding:34px 40px;text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 12px;"><tr>
          <td width="44" height="44" align="center" valign="middle" bgcolor="#ffffff" style="width:44px;height:44px;border-radius:12px;background:#ffffff;font-size:22px;font-weight:900;line-height:44px;color:${to};">P</td>
        </tr></table>
        <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${BRAND.name}</div>
        <div style="color:#ffffff;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;margin-top:6px;">${kicker}</div>
      </td></tr>

      <tr><td bgcolor="#ffffff" style="background:#ffffff;padding:40px;border-left:1px solid ${BRAND.line};border-right:1px solid ${BRAND.line};">
${body}
      </td></tr>

      <tr><td bgcolor="#F9FAFB" style="background:#F9FAFB;border:1px solid ${BRAND.line};border-top:none;border-radius:0 0 16px 16px;padding:22px 40px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;color:${BRAND.muted};">&copy; ${year} ${BRAND.name}. All rights reserved.</p>
        <p style="margin:0;font-size:11px;color:${BRAND.muted};">${footnote}</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Two-up "label above value" header row (invoice number and date). Values must be pre-escaped. */
function metaRow([leftLabel, leftValue, leftColor], [rightLabel, rightValue]) {
  const label = `font-size:11px;color:${BRAND.muted};font-weight:700;text-transform:uppercase;letter-spacing:0.8px;padding-bottom:4px;`;
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr><td style="${label}">${leftLabel}</td><td align="right" style="${label}">${rightLabel}</td></tr>
          <tr>
            <td style="font-size:15px;font-weight:800;color:${leftColor};">${leftValue}</td>
            <td align="right" style="font-size:14px;font-weight:600;color:${BRAND.text};">${rightValue}</td>
          </tr>
        </table>`;
}

const greeting = (heading, html) => `
        <p style="margin:0 0 8px;font-size:20px;font-weight:800;color:${BRAND.ink};">${heading}</p>
        <p style="margin:0 0 28px;font-size:14px;color:${BRAND.text};line-height:1.65;">${html}</p>`;

// ── Templates ───────────────────────────────────────────────────────────────────────────────────

/** Receipt sent after a UPI payment is confirmed. */
function paymentReceiptEmail(invoice) {
  const number = escapeHtml(invoice.invoiceNumber);
  const name = escapeHtml(invoice.userName || "there");
  const plan = escapeHtml(invoice.planName);
  const total = escapeHtml(formatMoney(invoice.amount, invoice.currency));
  const txn = escapeHtml(invoice.upiTransactionId || "N/A");
  const order = escapeHtml(invoice.orderId);
  const date = escapeHtml(longDate(invoice.createdAt || Date.now()));
  const plainTotal = formatMoney(invoice.amount, invoice.currency);

  const html = layout({
    title: `Payment receipt ${number}`,
    preheader: `We received ${total} for ${plan}. Your plan is active.`,
    kicker: "Payment receipt",
    accent: ["#2563EB", "#6D4AE8"],
    footnote: "This is an automated receipt. Please do not reply to this e-mail.",
    body: `${greeting("Payment confirmed", `Hi <strong style="color:${BRAND.ink};">${name}</strong>, thanks for your payment. Your <strong style="color:${BRAND.ink};">${plan}</strong> plan is now active.`)}
${metaRow(["Invoice number", number, "#1D4ED8"], ["Date", date])}
${lineItems({
  columns: ["Description", "Amount"],
  rows: [[`${plan}<div style="font-size:12px;color:${BRAND.muted};font-weight:400;margin-top:3px;">Subscription plan</div>`, total]],
  totalLabel: "Total paid", total, accent: "#1D4ED8",
})}
${detailsPanel("Payment details", [["Method", "UPI"], ["Transaction ID", txn], ["Order ID", order]])}
        <p style="margin:0;font-size:13px;color:${BRAND.muted};line-height:1.7;">
          A PDF copy of this invoice is in the <strong style="color:${BRAND.text};">Billing</strong> section of your ProSite dashboard.
        </p>`,
  });

  const text = [
    `Payment confirmed`,
    ``,
    `Hi ${invoice.userName || "there"}, thanks for your payment. Your ${invoice.planName} plan is now active.`,
    ``,
    `Invoice: ${invoice.invoiceNumber}`,
    `Date: ${longDate(invoice.createdAt || Date.now())}`,
    `Plan: ${invoice.planName}`,
    `Total paid: ${plainTotal}`,
    `Method: UPI`,
    `Transaction ID: ${invoice.upiTransactionId || "N/A"}`,
    `Order ID: ${invoice.orderId}`,
    ``,
    `A PDF copy of this invoice is in the Billing section of your ProSite dashboard.`,
  ].join("\n");

  return { subject: `Payment Receipt - ${invoice.invoiceNumber} | ProSite`, html, text };
}

/** Free-trial confirmation with the activation link. */
function trialActivationEmail(user, activationLink, trialDays) {
  const rawName = user.name || user.username || "there";
  const name = escapeHtml(rawName);
  const link = escapeHtml(activationLink);
  const reference = "FREE-" + Date.now().toString().slice(-8);
  const date = escapeHtml(longDate(Date.now()));
  const expiry = escapeHtml(longDate(Date.now() + trialDays * 24 * 60 * 60 * 1000));
  const days = escapeHtml(trialDays);
  const green = BRAND.success;

  const html = layout({
    title: "Activate your ProSite free trial",
    preheader: `One click to start your ${days}-day ProSite trial. No card needed.`,
    kicker: "Free trial",
    accent: ["#15803D", "#166534"],
    footnote: "This is an automated order confirmation. Please do not reply to this e-mail.",
    body: `${greeting("Your free trial is ready", `Hi <strong style="color:${BRAND.ink};">${name}</strong>, activate your <strong style="color:#15803D;">${days}-day free trial</strong> of ProSite Starter with the button below. No credit card required.`)}
${button({ href: link, label: "Activate my free trial &rarr;", from: "#15803D", to: "#166534" })}
        <p style="margin:0 0 28px;font-size:12px;color:${BRAND.muted};text-align:center;">This link expires in 72 hours.</p>
${metaRow(["Order reference", reference, "#15803D"], ["Date", date])}
${lineItems({
  columns: ["Description", "Duration", "Amount"],
  rows: [[
    `ProSite Starter, free trial<div style="font-size:12px;color:${BRAND.muted};font-weight:400;margin-top:3px;">3 pages &middot; 6 themes &middot; Basic components</div>`,
    `${days} days<div style="font-size:11px;color:${BRAND.muted};font-weight:400;margin-top:3px;">Until ${expiry}</div>`,
    `<span style="color:${green};">FREE</span>`,
  ]],
  totalLabel: "Total due today", total: escapeHtml(formatMoney(0, "INR")), accent: "#15803D",
})}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;margin:0 0 24px;">
          <tr><td style="padding:16px 20px;">
            <div style="padding:0 0 8px;font-size:11px;font-weight:700;color:#15803D;text-transform:uppercase;letter-spacing:0.8px;">Included in your trial</div>
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:3px 18px 3px 0;font-size:13px;color:${BRAND.text};">&#10003;&nbsp; Up to 3 pages</td>
                <td style="padding:3px 0;font-size:13px;color:${BRAND.text};">&#10003;&nbsp; 6 free themes</td>
              </tr>
              <tr>
                <td style="padding:3px 18px 3px 0;font-size:13px;color:${BRAND.text};">&#10003;&nbsp; Basic components</td>
                <td style="padding:3px 0;font-size:13px;color:${BRAND.text};">&#10003;&nbsp; No credit card needed</td>
              </tr>
            </table>
          </td></tr>
        </table>
        <p style="margin:0 0 6px;font-size:12px;color:${BRAND.muted};line-height:1.7;">Button not working? Paste this link into your browser:</p>
        <p style="margin:0 0 18px;font-size:12px;line-height:1.6;word-break:break-all;"><a href="${link}" style="color:#1D4ED8;">${link}</a></p>
        <p style="margin:0;font-size:12px;color:${BRAND.muted};line-height:1.7;">
          If you didn't request this trial you can ignore this e-mail. Nothing will be charged.
        </p>`,
  });

  const text = [
    `Your free trial is ready`,
    ``,
    `Hi ${rawName}, activate your ${trialDays}-day free trial of ProSite Starter. No credit card required.`,
    ``,
    `Activate: ${activationLink}`,
    `(This link expires in 72 hours.)`,
    ``,
    `Order reference: ${reference}`,
    `Trial ends: ${longDate(Date.now() + trialDays * 24 * 60 * 60 * 1000)}`,
    `Included: up to 3 pages, 6 free themes, basic components.`,
    ``,
    `If you didn't request this trial you can ignore this e-mail. Nothing will be charged.`,
  ].join("\n");

  return { subject: "Your Free Trial Order Confirmation - ProSite", html, text };
}

/** Password reset link (sent on request; the link expires after `minutes`). */
function passwordResetEmail(user, resetLink, minutes) {
  const rawName = user.name || user.username || "there";
  const name = escapeHtml(rawName);
  const link = escapeHtml(resetLink);
  const mins = escapeHtml(minutes);
  const html = layout({
    title: "Reset your ProSite password",
    preheader: `Use this link within ${mins} minutes to choose a new password.`,
    kicker: "Password reset",
    accent: ["#2563EB", "#6D4AE8"],
    footnote: "You received this because a password reset was requested for your ProSite account.",
    body: `${greeting("Reset your password", `Hi <strong style="color:${BRAND.ink};">${name}</strong>, we received a request to reset the password for your ProSite account (<strong style="color:${BRAND.ink};">${escapeHtml(user.username)}</strong>). Click the button below to choose a new one.`)}
${button({ href: link, label: "Choose a new password &rarr;", from: "#2563EB", to: "#6D4AE8" })}
        <p style="margin:0 0 28px;font-size:12px;color:${BRAND.muted};text-align:center;">This link expires in ${mins} minutes and can only be used once.</p>
${detailsPanel("Didn't ask for this?", [["Your account", "is safe: nothing changes until you pick a new password"], ["What to do", "simply ignore this e-mail"]])}
        <p style="margin:0 0 6px;font-size:12px;color:${BRAND.muted};line-height:1.7;">Button not working? Paste this link into your browser:</p>
        <p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;"><a href="${link}" style="color:#1D4ED8;">${link}</a></p>`,
  });
  const text = [
    "Reset your password",
    "",
    `Hi ${rawName}, we received a request to reset the password for your ProSite account (${user.username}).`,
    "",
    `Choose a new password: ${resetLink}`,
    `(This link expires in ${minutes} minutes and can only be used once.)`,
    "",
    "Didn't ask for this? Ignore this e-mail: your password stays the same.",
  ].join("\n");
  return { subject: "Reset your ProSite password", html, text };
}

/** Security notice after a password change (so an unexpected change doesn't go unnoticed). */
function passwordChangedEmail(user, when = new Date()) {
  const rawName = user.name || user.username || "there";
  const time = new Date(when).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }) + " UTC";
  const html = layout({
    title: "Your ProSite password was changed",
    preheader: "Your password was just changed. If this was you, no action is needed.",
    kicker: "Security notice",
    accent: ["#15803D", "#166534"],
    footnote: "This is an automated security notice. Please do not reply to this e-mail.",
    body: `${greeting("Your password was changed", `Hi <strong style="color:${BRAND.ink};">${escapeHtml(rawName)}</strong>, the password for your ProSite account (<strong style="color:${BRAND.ink};">${escapeHtml(user.username)}</strong>) was just changed. For your security, you've been signed out on your other devices.`)}
${detailsPanel("Change details", [["When", escapeHtml(time)], ["Account", escapeHtml(user.username)]])}
        <p style="margin:0;font-size:13px;color:${BRAND.muted};line-height:1.7;">
          <strong style="color:${BRAND.ink};">Wasn't you?</strong> Reset your password right away from the sign-in page ("Forgot password?") and contact us.
        </p>`,
  });
  const text = [
    "Your password was changed",
    "",
    `Hi ${rawName}, the password for your ProSite account (${user.username}) was changed on ${time}.`,
    "You've been signed out on your other devices.",
    "",
    "Wasn't you? Reset your password right away from the sign-in page (\"Forgot password?\").",
  ].join("\n");
  return { subject: "Your ProSite password was changed", html, text };
}

module.exports = { paymentReceiptEmail, trialActivationEmail, passwordResetEmail, passwordChangedEmail, formatMoney, CURRENCY_SYMBOLS };
