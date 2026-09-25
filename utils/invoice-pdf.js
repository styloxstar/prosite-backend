const PDFDocument = require("pdfkit");

// PDFKit's built-in fonts (Helvetica) use WinAnsi encoding: "$", "€" and "£" exist there, but the
// rupee sign does not and used to print as garbage. Currencies without a glyph use their ISO code,
// which is also the convention on invoices ("INR 499.00").
const PDF_CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£" };

const COLORS = {
  brandFrom: "#2563EB",
  brandTo: "#6D4AE8",
  ink: "#111827",
  text: "#374151",
  muted: "#6B7280",
  line: "#E5E7EB",
  panel: "#F9FAFB",
  accent: "#1D4ED8",
};

const STATUS_STYLES = {
  paid: { label: "PAID", fill: "#DCFCE7", text: "#166534" },
  pending: { label: "PENDING", fill: "#FEF3C7", text: "#92400E" },
  failed: { label: "FAILED", fill: "#FEE2E2", text: "#991B1B" },
  refunded: { label: "REFUNDED", fill: "#E0E7FF", text: "#3730A3" },
};

const PAGE = { width: 595.28, height: 841.89, margin: 50 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

function formatMoney(amount, currency = "INR") {
  const value = Number(amount);
  const figure = Number.isFinite(value)
    ? value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(amount ?? "");
  const symbol = PDF_CURRENCY_SYMBOLS[currency];
  return symbol ? `${symbol}${figure}` : `${currency || "INR"} ${figure}`;
}

const longDate = (value) => new Date(value || Date.now()).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

/** Single-line text clipped with an ellipsis, so long names/ids can't spill into other columns. */
function fitText(doc, value, x, y, width, options = {}) {
  doc.text(String(value ?? ""), x, y, { width, height: doc.currentLineHeight(), ellipsis: true, lineBreak: false, ...options });
}

function header(doc, invoice) {
  const band = doc.linearGradient(0, 0, PAGE.width, 120);
  band.stop(0, COLORS.brandFrom).stop(1, COLORS.brandTo);
  doc.rect(0, 0, PAGE.width, 120).fill(band);

  // Logo tile + wordmark
  doc.roundedRect(PAGE.margin, 38, 44, 44, 10).fill("#FFFFFF");
  doc.fillColor(COLORS.brandTo).font("Helvetica-Bold").fontSize(24).text("P", PAGE.margin, 49, { width: 44, align: "center" });
  doc.fillColor("#FFFFFF").fontSize(22).text("ProSite", PAGE.margin + 58, 40);
  doc.fillOpacity(0.85).font("Helvetica").fontSize(10).text("Website builder platform", PAGE.margin + 58, 67).fillOpacity(1);

  // Document title on the right
  const right = { width: 200, align: "right" };
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(24).text("INVOICE", PAGE.width - PAGE.margin - 200, 38, right);
  doc.fillOpacity(0.85).font("Helvetica").fontSize(10);
  fitText(doc, invoice.invoiceNumber, PAGE.width - PAGE.margin - 200, 68, 200, { align: "right" });
  doc.fillOpacity(1);
}

function statusPill(doc, status, x, y) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.paid;
  doc.font("Helvetica-Bold").fontSize(9);
  const width = doc.widthOfString(style.label) + 20;
  doc.roundedRect(x, y, width, 20, 10).fill(style.fill);
  doc.fillColor(style.text).text(style.label, x, y + 6, { width, align: "center" });
}

/** "Billed to" and invoice details side by side. Returns the y below the block. */
function parties(doc, invoice, top) {
  const colWidth = CONTENT_WIDTH / 2 - 10;
  const label = (text, x, y) => doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8.5).text(text.toUpperCase(), x, y, { characterSpacing: 0.8 });

  label("Billed to", PAGE.margin, top);
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(12);
  fitText(doc, invoice.userName || "Customer", PAGE.margin, top + 16, colWidth);
  if (invoice.userEmail) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10);
    fitText(doc, invoice.userEmail, PAGE.margin, top + 34, colWidth);
  }

  const x = PAGE.margin + CONTENT_WIDTH / 2 + 10;
  const rows = [["Invoice date", longDate(invoice.createdAt)], ["Invoice no.", invoice.invoiceNumber], ["Order ID", invoice.orderId]];
  label("Invoice details", x, top);
  rows.forEach(([name, value], i) => {
    const y = top + 16 + i * 17;
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10).text(name, x, y);
    doc.fillColor(COLORS.ink).font("Helvetica-Bold");
    fitText(doc, value, x + 80, y, colWidth - 80, { align: "right" });
  });
  statusPill(doc, invoice.status, x, top + 16 + rows.length * 17 + 4);
  return top + 16 + rows.length * 17 + 34;
}

/** Line item table plus totals. Returns the y below it. */
function items(doc, invoice, top) {
  const amount = formatMoney(invoice.amount, invoice.currency);
  const cols = { desc: PAGE.margin + 14, qty: PAGE.margin + 300, amount: PAGE.margin + CONTENT_WIDTH - 134 };

  doc.roundedRect(PAGE.margin, top, CONTENT_WIDTH, 30, 6).fill("#F3F4F6");
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(9);
  doc.text("DESCRIPTION", cols.desc, top + 11, { characterSpacing: 0.6 });
  doc.text("QTY", cols.qty, top + 11, { width: 50, align: "center", characterSpacing: 0.6 });
  doc.text("AMOUNT", cols.amount, top + 11, { width: 120, align: "right", characterSpacing: 0.6 });

  const rowY = top + 44;
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(11);
  fitText(doc, `${invoice.planName} plan`, cols.desc, rowY, 270);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9.5).text("Monthly subscription", cols.desc, rowY + 16);
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(11).text("1", cols.qty, rowY, { width: 50, align: "center" });
  doc.font("Helvetica-Bold").text(amount, cols.amount, rowY, { width: 120, align: "right" });
  doc.moveTo(PAGE.margin, rowY + 40).lineTo(PAGE.margin + CONTENT_WIDTH, rowY + 40).lineWidth(1).strokeColor(COLORS.line).stroke();

  // Totals, right-aligned
  const boxX = PAGE.margin + CONTENT_WIDTH - 230;
  let y = rowY + 56;
  const line = (name, value) => {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10).text(name, boxX, y);
    doc.fillColor(COLORS.ink).text(value, boxX + 100, y, { width: 130, align: "right" });
    y += 18;
  };
  line("Subtotal", amount);
  line("Tax", formatMoney(0, invoice.currency));
  doc.roundedRect(boxX - 12, y + 4, 242, 38, 8).fill("#EEF2FF");
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(12).text("Total", boxX, y + 17);
  doc.fillColor(COLORS.accent).fontSize(14).text(amount, boxX + 90, y + 15, { width: 128, align: "right" });
  return y + 62;
}

function paymentInfo(doc, invoice, top) {
  doc.roundedRect(PAGE.margin, top, CONTENT_WIDTH, 78, 10).fillAndStroke(COLORS.panel, COLORS.line);
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(9).text("PAYMENT INFORMATION", PAGE.margin + 16, top + 14, { characterSpacing: 0.8 });
  const rows = [["Method", "UPI"], ["Transaction ID", invoice.upiTransactionId || "N/A"]];
  rows.forEach(([name, value], i) => {
    const y = top + 34 + i * 17;
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10).text(name, PAGE.margin + 16, y);
    doc.fillColor(COLORS.ink).font("Helvetica-Bold");
    fitText(doc, value, PAGE.margin + 130, y, CONTENT_WIDTH - 146);
  });
}

function footer(doc) {
  const y = PAGE.height - 110;
  doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + CONTENT_WIDTH, y).lineWidth(1).strokeColor(COLORS.line).stroke();
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10).text("Thank you for choosing ProSite!", PAGE.margin, y + 16, { width: CONTENT_WIDTH, align: "center" });
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5)
    .text("This is a computer-generated invoice and does not require a signature.", PAGE.margin, y + 34, { width: CONTENT_WIDTH, align: "center" });
}

async function generateInvoicePDF(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE.margin,
      info: { Title: `Invoice ${invoice.invoiceNumber}`, Author: "ProSite", Subject: `${invoice.planName} plan` },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      header(doc, invoice);
      const afterParties = parties(doc, invoice, 150);
      const afterItems = items(doc, invoice, afterParties + 10);
      paymentInfo(doc, invoice, afterItems);
      footer(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateInvoicePDF, formatMoney };
