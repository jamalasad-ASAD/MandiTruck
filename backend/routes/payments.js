import express from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { calculateQuote } from "../data/insurance.js";
import {
  createPayment,
  findPayment,
  findPaymentByOrderId,
  savePayment,
  listPayments,
  createSlip,
  findSlipByPayment,
  findTrip
} from "../db.js";
import {
  razorpayConfigured,
  simulateEnabled,
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature
} from "../services/payments.js";
import { buildSlip, withQr } from "../services/slip.js";
import { buildSlipPdf } from "../services/slipPdf.js";
import { send } from "../services/notify.js";

const r = express.Router();

// Mark a payment paid and issue the slip (idempotent — safe to call twice).
async function completePayment(payment, razorpayPaymentId, signature) {
  if (payment.status === "paid") return findSlipByPayment(payment.id);

  payment.status = "paid";
  payment.paymentId = razorpayPaymentId || payment.paymentId;
  if (signature) payment.signature = signature;
  payment.paidAt = new Date().toISOString();
  await savePayment(payment);

  const trip = payment.tripId ? await findTrip(payment.tripId) : null;
  const slipData = await buildSlip({ payment, trip });
  return createSlip(slipData);
}

// --- list ------------------------------------------------------------------
r.get("/", async (_req, res) => {
  const payments = await listPayments();
  res.json(
    payments.map((p) => ({
      id: p.id,
      tripId: p.tripId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      payerRole: p.payerRole,
      payerName: p.payerName,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      simulated: !!p.simulated
    }))
  );
});

// --- create order ----------------------------------------------------------
r.post("/order", async (req, res) => {
  const { quoteInput, payerRole, payerName, payerPhone, tripId } = req.body || {};

  if (!quoteInput) return res.status(400).json({ error: "quoteInput required" });
  if (!["vendor", "client"].includes(payerRole)) {
    return res.status(400).json({ error: "payerRole 'vendor' ya 'client' hona chahiye" });
  }
  if (!payerName || !payerPhone) {
    return res.status(400).json({ error: "payerName aur payerPhone required hain" });
  }

  // Recompute the premium on the server — NEVER trust a client-supplied amount.
  const quote = calculateQuote(quoteInput);
  const amount = quote.totalPremiumRounded;
  if (!(amount > 0)) return res.status(400).json({ error: "Invalid premium amount" });

  const receipt = `mt_${Date.now()}`;
  const payment = await createPayment({
    tripId: tripId || null,
    receipt,
    amount,
    amountPaise: amount * 100,
    currency: config.currency,
    payerRole,
    payerName,
    payerPhone,
    quoteInput,
    quoteSummary: {
      vehicleTypeLabel: quote.input.vehicleTypeLabel,
      cargoTypeLabel: quote.input.cargoTypeLabel,
      totalPremium: quote.totalPremiumRounded,
      breakdown: quote.breakdown
    }
  });

  if (!razorpayConfigured()) {
    if (simulateEnabled()) {
      return res.json({
        simulated: true,
        paymentDbId: payment.id,
        amount,
        currency: config.currency,
        note: "PAYMENTS_SIMULATE=true (dev) — POST /api/payments/simulate se complete karein."
      });
    }
    return res.status(503).json({
      error: "Payment gateway configured nahi hai (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)."
    });
  }

  try {
    const order = await createOrder({
      amountPaise: amount * 100,
      receipt,
      notes: { paymentDbId: payment.id, tripId: tripId || "", payerRole }
    });
    payment.orderId = order.id;
    await savePayment(payment);
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: config.razorpay.keyId,
      paymentDbId: payment.id
    });
  } catch (e) {
    console.error("[payments] order create failed:", e.message);
    res.status(502).json({ error: "Payment gateway se order nahi bana. Thodi der baad try karein." });
  }
});

// --- verify checkout result ------------------------------------------------
r.post("/verify", async (req, res) => {
  const { paymentDbId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  const payment = await findPayment(paymentDbId);
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  if (payment.status === "paid") {
    const existing = await findSlipByPayment(payment.id);
    return res.json({ alreadyPaid: true, slip: existing ? await withQr(existing) : null });
  }
  if (!razorpayConfigured()) {
    return res.status(503).json({ error: "Payment gateway configured nahi hai" });
  }
  if (payment.orderId && razorpay_order_id !== payment.orderId) {
    return res.status(400).json({ error: "Order mismatch" });
  }

  const ok = verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature
  });
  if (!ok) return res.status(400).json({ error: "Payment signature verify nahi hui" });

  const slip = await completePayment(payment, razorpay_payment_id, razorpay_signature);
  res.json({ slip: await withQr(slip) });
});

// --- dev-only: complete a payment without Razorpay --------------------------
r.post("/simulate", async (req, res) => {
  if (!simulateEnabled()) return res.status(403).json({ error: "Simulation disabled" });
  const payment = await findPayment((req.body || {}).paymentDbId);
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  payment.simulated = true;
  const slip = await completePayment(payment, `sim_${crypto.randomBytes(6).toString("hex")}`, "simulated");
  res.json({ simulated: true, slip: await withQr(slip) });
});

// --- slip as PDF (download / attach) ---------------------------------------
r.get("/:id/slip/pdf", async (req, res) => {
  const payment = await findPayment(req.params.id);
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const slip = await findSlipByPayment(payment.id);
  if (!slip) return res.status(404).json({ error: "Slip nahi mili (payment abhi paid nahi hai)" });

  const pdf = await buildSlipPdf(slip);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${slip.slipNo}.pdf"`);
  res.send(pdf);
});

// --- send the slip over WhatsApp (PDF attached) + SMS ----------------------
r.post("/:id/send-slip", async (req, res) => {
  const payment = await findPayment(req.params.id);
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  if (payment.status !== "paid") return res.status(400).json({ error: "Payment abhi paid nahi hai" });
  const slip = await findSlipByPayment(payment.id);
  if (!slip) return res.status(404).json({ error: "Slip nahi mili" });

  const want = Array.isArray(req.body?.recipients) && req.body.recipients.length ? req.body.recipients : ["payer"];
  const targets = [];
  if (want.includes("payer")) {
    targets.push({ role: payment.payerRole, name: payment.payerName, phone: payment.payerPhone });
  }
  const trip = payment.tripId ? await findTrip(payment.tripId) : null;
  if (want.includes("driver") && trip?.driver) {
    targets.push({ role: "driver", name: trip.driver.name, phone: trip.driver.phone });
  }
  if (!targets.length) return res.status(400).json({ error: "Koi valid recipient nahi mila" });

  const verifyLink = `${config.publicBaseUrl}/verify/${slip.slipNo}?t=${slip.verifyToken}`;
  // Twilio fetches this URL to attach the PDF to the WhatsApp message.
  const mediaUrl = config.apiPublicUrl
    ? `${config.apiPublicUrl}/api/slips/${slip.slipNo}/pdf?t=${slip.verifyToken}`
    : null;
  const body = `MandiTruck: Insurance premium slip ${slip.slipNo} - Rs ${slip.amount} paid. Verify: ${verifyLink}`;

  const results = [];
  for (const t of targets) {
    for (const channel of ["whatsapp", "sms"]) {
      const r = await send({ channel, to: t.phone, body, mediaUrl: channel === "whatsapp" ? mediaUrl : null });
      results.push({ to: t.phone, role: t.role, channel, status: r.status, error: r.error || undefined });
    }
  }
  res.json({ sent: results, mediaAttached: Boolean(mediaUrl) });
});

// --- one payment (+ its slip) ----------------------------------------------
r.get("/:id", async (req, res) => {
  const payment = await findPayment(req.params.id);
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const slip = await findSlipByPayment(payment.id);
  res.json({ payment, slip: slip ? await withQr(slip) : null });
});

// --- Razorpay webhook (mounted with express.raw, before express.json) ------
export async function razorpayWebhook(req, res) {
  const signature = req.headers["x-razorpay-signature"];
  const raw = req.body; // Buffer

  if (!verifyWebhookSignature(raw, signature)) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  let event;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch (_) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const entity = event?.payload?.payment?.entity;
  if (event.event === "payment.captured" && entity?.order_id) {
    const payment = await findPaymentByOrderId(entity.order_id);
    if (payment && payment.status !== "paid") {
      await completePayment(payment, entity.id, null);
      console.log(`[payments] webhook captured ${entity.id} for order ${entity.order_id}`);
    }
  }
  res.json({ received: true });
}

export default r;
