import https from "node:https";
import crypto from "node:crypto";
import { config, devMode } from "../config.js";

export const razorpayConfigured = () =>
  Boolean(config.razorpay.keyId && config.razorpay.keySecret);

// Lets you exercise the pay -> slip flow locally without hitting Razorpay.
// Only ever active in dev AND when explicitly switched on.
export const simulateEnabled = () =>
  devMode && process.env.PAYMENTS_SIMULATE === "true";

// Minimal HTTPS JSON call — avoids pulling in an HTTP client dependency.
function httpsJson({ method, host, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host, path, method, headers }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(buf); } catch (_) {}
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else {
          const desc = parsed?.error?.description || parsed?.error?.reason || parsed?.error || buf.slice(0, 200);
          reject(new Error(`Razorpay error (${res.statusCode}): ${typeof desc === "string" ? desc : JSON.stringify(desc)}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// Create a Razorpay order (server-side). Amount is in paise.
export async function createOrder({ amountPaise, receipt, notes }) {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString("base64");
  const body = JSON.stringify({
    amount: amountPaise,
    currency: config.currency,
    receipt,
    notes: notes || {}
  });
  return httpsJson({
    method: "POST",
    host: "api.razorpay.com",
    path: "/v1/orders",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body)
    },
    body
  });
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Checkout handshake: HMAC-SHA256("order_id|payment_id", key_secret)
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!config.razorpay.keySecret) return false;
  const expected = crypto
    .createHmac("sha256", config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return timingSafeEqualHex(expected, signature);
}

// Webhook: HMAC-SHA256(raw body, webhook_secret)
export function verifyWebhookSignature(rawBody, signature) {
  if (!config.razorpay.webhookSecret || !rawBody) return false;
  const expected = crypto
    .createHmac("sha256", config.razorpay.webhookSecret)
    .update(rawBody)
    .digest("hex");
  return timingSafeEqualHex(expected, signature);
}
