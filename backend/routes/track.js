import express from "express";
import rateLimit from "express-rate-limit";
import { findTrip, findToken } from "../db.js";
import { config, devMode } from "../config.js";
import { issueOtp, verifyOtp, issueToken, canResend, OTP_REASON_MSG } from "../services/otp.js";
import { send } from "../services/notify.js";
import { currentPosition, tripStatus, tripProgressPct, nextToll, totalTollPaid } from "../services/trips.js";

const r = express.Router();

// Brute-force protection on the OTP endpoints (skipped during automated tests).
const otpLimiter = rateLimit({
  windowMs: 60_000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.RATE_LIMIT_OFF === "1",
  message: { error: "Bahut zyada requests. 1 minute baad try karein." }
});

const maskPhone = (p = "") => p.replace(/.(?=.{3})/g, "\u2022");

function recipientsOf(trip) {
  return [
    trip.client && { role: "client", ...trip.client },
    trip.driver && { role: "driver", ...trip.driver },
    trip.vendor && { role: "vendor", ...trip.vendor }
  ].filter(Boolean);
}

// Which numbers are allowed to view this trip (masked, for the UI)
r.get("/:tripId/access", async (req, res) => {
  const trip = await findTrip(req.params.tripId);
  if (!trip) return res.status(404).json({ error: "Trip not found" });
  res.json({
    tripId: trip.id,
    truckNumber: trip.truckNumber,
    destination: trip.destination.name,
    allowed: recipientsOf(trip).map((x) => ({ role: x.role, name: x.name, phone: maskPhone(x.phone) }))
  });
});

// Step 1: request an OTP to the number that received the SMS/WhatsApp link
r.post("/:tripId/request-otp", otpLimiter, async (req, res) => {
  const { phone } = req.body || {};
  const trip = await findTrip(req.params.tripId);
  if (!trip) return res.status(404).json({ error: "Trip not found" });
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  const allowed = recipientsOf(trip).map((x) => x.phone);
  if (!allowed.includes(phone)) {
    return res.status(403).json({ error: "Ye number is trip ke liye authorised nahi hai." });
  }

  const cd = await canResend(trip.id, phone);
  if (!cd.ok) return res.status(429).json({ error: `${cd.waitSec} second baad dobara try karein.` });

  const otp = await issueOtp({ tripId: trip.id, phone });
  const body = `MandiTruck: Aapka tracking OTP ${otp} hai (valid ${config.otp.ttlMinutes} min). Kisi ke saath share na karein.`;
  const sent = await send({ channel: "sms", to: phone, body });
  console.log(`[track] OTP for ${phone} on ${trip.id}: ${otp} (sms: ${sent.status})`);

  res.json({
    sent: true,
    phone: maskPhone(phone),
    smsStatus: sent.status,
    ...(devMode && sent.status !== "sent"
      ? { devOtp: otp, note: "Twilio configured nahi hai — dev mode me OTP yahan diya gaya hai." }
      : {})
  });
});

// Step 2: verify the OTP -> get a short-lived access token
r.post("/:tripId/verify-otp", otpLimiter, async (req, res) => {
  const { phone, otp } = req.body || {};
  const trip = await findTrip(req.params.tripId);
  if (!trip) return res.status(404).json({ error: "Trip not found" });
  if (!phone || !otp) return res.status(400).json({ error: "phone aur otp dono required hain" });

  const v = await verifyOtp({ tripId: trip.id, phone, otp });
  if (!v.ok) {
    return res.status(400).json({ error: OTP_REASON_MSG[v.reason] || "OTP verify nahi hua", attemptsLeft: v.attemptsLeft });
  }

  const token = await issueToken({ tripId: trip.id, phone });
  res.json({ token, expiresInMin: config.tokenTtlMinutes });
});

// Step 3: live location, gated by the token
r.get("/:tripId/live", async (req, res) => {
  const rec = await findToken(String(req.query.token || ""));
  if (!rec || rec.tripId !== req.params.tripId || Date.now() > rec.expiresAt) {
    return res.status(401).json({ error: "Link invalid ya expire ho gaya. Naya OTP request karein." });
  }

  const trip = await findTrip(req.params.tripId);
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  const pos = currentPosition(trip);
  const nxt = nextToll(trip);
  res.json({
    tripId: trip.id,
    truckNumber: trip.truckNumber,
    driver: { name: trip.driver.name },
    cargo: trip.cargo,
    origin: trip.origin,
    destination: trip.destination,
    route: trip.route,
    tolls: trip.tolls,
    status: tripStatus(trip),
    progressPct: tripProgressPct(trip),
    currentPosition: { lat: pos.lat, lng: pos.lng, label: pos.label },
    nextToll: nxt ? { name: nxt.name, amount: nxt.amount } : null,
    totalTollPaid: totalTollPaid(trip),
    expectedArrival: trip.expectedArrival,
    updatedAt: new Date().toISOString()
  });
});

export default r;
