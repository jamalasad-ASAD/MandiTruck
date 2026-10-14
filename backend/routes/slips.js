import express from "express";
import { findSlipByNo } from "../db.js";
import { buildSlipPdf } from "../services/slipPdf.js";
import { withQr } from "../services/slip.js";

const r = express.Router();

// PUBLIC — the driver scans the QR on the printed slip, which lands here.
// The link carries a secret token so slip numbers can't be enumerated.
r.get("/:slipNo", async (req, res) => {
  const slip = await findSlipByNo(req.params.slipNo);
  if (!slip) return res.status(404).json({ error: "Slip not found" });

  const token = req.query.t;
  if (!token || token !== slip.verifyToken) {
    return res.status(403).json({ error: "Invalid verification link" });
  }

  // Return only what a verifier needs to see (plus the QR image for display).
  const enriched = await withQr(slip);
  res.json({
    valid: true,
    qrDataUrl: enriched.qrDataUrl,
    slipNo: slip.slipNo,
    truckNumber: slip.truckNumber,
    route: slip.route,
    payerRole: slip.payerRole,
    payerName: slip.payerName,
    amount: slip.amount,
    currency: slip.currency,
    quoteSummary: slip.quoteSummary,
    razorpayPaymentId: slip.razorpayPaymentId,
    issuedAt: slip.issuedAt,
    simulated: !!slip.simulated
  });
});

// PUBLIC — the slip as a PDF. Used both by the "Download PDF" button and by
// Twilio as the WhatsApp media attachment.
r.get("/:slipNo/pdf", async (req, res) => {
  const slip = await findSlipByNo(req.params.slipNo);
  if (!slip) return res.status(404).json({ error: "Slip not found" });

  const token = req.query.t;
  if (!token || token !== slip.verifyToken) {
    return res.status(403).json({ error: "Invalid verification link" });
  }

  const pdf = await buildSlipPdf(slip);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${slip.slipNo}.pdf"`);
  res.send(pdf);
});

export default r;
