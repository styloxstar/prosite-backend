const nodemailer = require("nodemailer");

const CURRENCY_SYMBOLS = { INR: "\u20B9", USD: "$", EUR: "\u20AC", GBP: "\u00A3" };

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

function buildPaymentEmailHTML(invoice) {
  const symbol = CURRENCY_SYMBOLS[invoice.currency] || "\u20B9";
  const date = new Date(invoice.createdAt).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f4f4f7;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#3B82F6,#8B5CF6);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;">ProSite</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Payment Confirmation</p>
    </div>

    <!-- Body -->
    <div style="background:#fff;padding:32px;border-radius:0 0 16px 16px;border:1px solid #e5e7eb;border-top:none;">
      <p style="color:#374151;font-size:16px;margin:0 0 24px;">Hi <strong>${invoice.userName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Thank you for your purchase! Your payment has been confirmed and your plan has been activated.
      </p>

      <!-- Invoice Card -->
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
          <span style="color:#6b7280;font-size:13px;">Invoice Number</span>
          <span style="color:#111827;font-weight:700;font-size:13px;">${invoice.invoiceNumber}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
          <span style="color:#6b7280;font-size:13px;">Date</span>
          <span style="color:#111827;font-weight:600;font-size:13px;">${date}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
          <span style="color:#6b7280;font-size:13px;">Plan</span>
          <span style="color:#111827;font-weight:600;font-size:13px;">${invoice.planName}</span>
        </div>
        <div style="border-top:1px solid #e5e7eb;padding-top:16px;display:flex;justify-content:space-between;">
          <span style="color:#111827;font-weight:700;font-size:15px;">Total Paid</span>
          <span style="color:#3B82F6;font-weight:800;font-size:18px;">${symbol}${invoice.amount}</span>
        </div>
      </div>

      <!-- Payment Details -->
      <div style="margin-bottom:24px;">
        <p style="color:#374151;font-weight:700;font-size:13px;margin:0 0 8px;">Payment Details</p>
        <p style="color:#6b7280;font-size:13px;margin:0;line-height:1.8;">
          Method: UPI<br>
          Transaction ID: ${invoice.upiTransactionId || "N/A"}<br>
          Order ID: ${invoice.orderId}
        </p>
      </div>

      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
        You can download your invoice anytime from your <strong>Billing</strong> page in the ProSite dashboard.
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:24px 0;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        This is an automated email from ProSite. Please do not reply.
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function sendPaymentConfirmationEmail(invoice, userEmail) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("Email not configured (EMAIL_USER/EMAIL_PASS not set), skipping notification");
    return;
  }
  if (!userEmail) {
    console.warn("No user email provided, skipping notification");
    return;
  }

  const transporter = createTransporter();
  const html = buildPaymentEmailHTML(invoice);

  await transporter.sendMail({
    from: `"ProSite" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: `Payment Confirmation - ${invoice.invoiceNumber} | ProSite`,
    html,
  });

  console.log(`Payment confirmation email sent to ${userEmail} for ${invoice.invoiceNumber}`);
}

module.exports = { sendPaymentConfirmationEmail };
