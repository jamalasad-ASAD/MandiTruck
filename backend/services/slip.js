import crypto from "node:crypto";
import QRCode from "qrcode";
import { config } from "../config.js";

// Human-readable slip number: MT-YYYYMMDD-NNNNNN
export function makeSlipNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  return `MT-${ymd}-${rand}`;
}

// The verify link is DERIVED, never stored — so it stays correct even after a
// slip is read back from MongoDB (which only keeps fields declared in the schema).
export function slipVerifyUrl(slip) {
  return `${config.publicBaseUrl}/verify/${slip.slipNo}?t=${slip.verifyToken}`;
}

/**
 * Builds the payment slip record that gets persisted. Only primitives live here
 * — the verify URL and QR image are derived on read (see withQr).
 */
export async function buildSlip({ payment, trip }) {
  const slipNo = makeSlipNo();
  const verifyToken = crypto.randomBytes(16).toString("hex");

  return {
    slipNo,
    verifyToken,
    paymentId: payment.id,
    tripId: payment.tripId || null,
    truckNumber: trip ? trip.truckNumber : null,
    route: trip ? `${trip.origin.name} -> ${trip.destination.name}` : null,
    payerRole: payment.payerRole,
    payerName: payment.payerName,
    payerPhone: payment.payerPhone,
    amount: payment.amount,
    currency: payment.currency,
    quoteSummary: payment.quoteSummary,
    razorpayPaymentId: payment.paymentId || null,
    simulated: !!payment.simulated
  };
}

/**
 * Adds the derived fields the UI/PDF need (verifyUrl + QR image) to a slip that
 * was read back from the store. Use this on every slip response.
 */
export async function withQr(slip) {
  if (!slip) return slip;
  const verifyUrl = slipVerifyUrl(slip);
  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 220 });
  } catch (e) {
    console.warn("[slip] QR generation failed:", e.message);
  }
  return { ...slip, verifyUrl, qrDataUrl };
}
