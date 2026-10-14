import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { slipVerifyUrl } from "./slip.js";

// pdfkit's built-in fonts are WinAnsi-encoded, so we must strip/replace
// characters outside Latin-1 (e.g. the rupee sign or arrows) or they render
// as garbage in the PDF.
function safe(s) {
  return String(s ?? "")
    .replace(/\u20B9/g, "Rs ")            // ₹
    .replace(/\u2192/g, "->")             // →
    .replace(/[\u2013\u2014]/g, "-")      // en/em dash
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x00-\xFF]/g, "");
}

const inr = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch (_) {
    return safe(iso);
  }
};

/** Builds the payment slip as a PDF buffer. */
export async function buildSlipPdf(slip) {
  // Derive the verify URL — never rely on a stored copy (Mongo strips it).
  const verifyUrl = slipVerifyUrl(slip);
  let qrBuf = null;
  try {
    qrBuf = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 300 });
  } catch (e) {
    console.warn("[slipPdf] QR generation failed:", e.message);
  }

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const L = 50;
  const R = 545;

  // --- header ---
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#14202c").text("MandiTruck", L, 50);
  doc.font("Helvetica").fontSize(11).fillColor("#5b6b7c")
    .text(safe("Insurance Premium - Payment Slip"), L, 78);

  doc.font("Helvetica").fontSize(8.5).fillColor("#5b6b7c")
    .text("SLIP NO.", L, 50, { width: R - L, align: "right" });
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#14202c")
    .text(safe(slip.slipNo), L, 63, { width: R - L, align: "right" });

  doc.moveTo(L, 100).lineTo(R, 100).lineWidth(2).strokeColor("#14202c").stroke();

  let y = 112;
  if (slip.simulated) {
    doc.rect(L, y, R - L, 22).fill("#fff3cd");
    doc.fillColor("#7a5b00").font("Helvetica-Bold").fontSize(9)
      .text("SIMULATED / TEST PAYMENT - not a real gateway transaction", L + 8, y + 7, { width: R - L - 16 });
    y += 34;
  }

  // --- fields + QR ---
  const startY = y + 8;
  const rows = [
    ["Paid by", `${slip.payerName} (${slip.payerRole})`],
    ["Phone", slip.payerPhone],
    ["Truck", slip.truckNumber || "-"],
    ["Route", slip.route || "-"],
    ["Cover", slip.quoteSummary?.vehicleTypeLabel || "-"],
    ["Cargo", slip.quoteSummary?.cargoTypeLabel || "-"],
    ["Issued", fmtDate(slip.issuedAt)],
    ["Payment ID", slip.razorpayPaymentId || "-"]
  ];

  let fy = startY;
  for (const [k, v] of rows) {
    doc.font("Helvetica").fontSize(8.5).fillColor("#5b6b7c")
      .text(safe(k).toUpperCase(), L, fy, { width: 100 });
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#14202c")
      .text(safe(v), L + 110, fy - 2, { width: 245 });
    fy += 26;
  }

  if (qrBuf) {
    doc.image(qrBuf, R - 140, startY, { width: 130, height: 130 });
    doc.font("Helvetica").fontSize(8.5).fillColor("#5b6b7c")
      .text("Scan to verify", R - 140, startY + 136, { width: 130, align: "center" });
  } else {
    doc.font("Helvetica").fontSize(9).fillColor("#5b6b7c")
      .text("QR unavailable", R - 140, startY + 60, { width: 130, align: "center" });
  }

  // --- amount ---
  let ay = Math.max(fy, startY + 152) + 14;
  doc.moveTo(L, ay).lineTo(R, ay).lineWidth(2).strokeColor("#14202c").stroke();
  ay += 16;
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#14202c").text("Amount Paid", L, ay + 8);
  doc.font("Helvetica-Bold").fontSize(26).fillColor("#14202c")
    .text(inr(slip.amount), L, ay, { width: R - L, align: "right" });

  // --- footer ---
  doc.font("Helvetica").fontSize(9).fillColor("#5b6b7c").text(
    safe("Ye slip dispatch ke time driver ko di jaaye. QR scan karne par verification page khulta hai."),
    L,
    ay + 62,
    { width: R - L }
  );

  doc.end();
  return done;
}
