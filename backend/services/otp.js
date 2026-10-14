import crypto from "node:crypto";
import { config } from "../config.js";
import { createOtp, latestOtp, saveOtp, createToken } from "../db.js";

export function generateOtp() {
  const max = 10 ** config.otp.length;
  return String(crypto.randomInt(0, max)).padStart(config.otp.length, "0");
}

function hash(otp, salt) {
  return crypto.createHash("sha256").update(`${otp}:${salt}`).digest("hex");
}

export async function issueOtp({ tripId, phone }) {
  const otp = generateOtp();
  const salt = crypto.randomBytes(16).toString("hex");
  await createOtp({
    tripId,
    phone,
    salt,
    otpHash: hash(otp, salt),
    expiresAt: Date.now() + config.otp.ttlMinutes * 60_000
  });
  return otp;
}

export async function canResend(tripId, phone) {
  const rec = await latestOtp(tripId, phone);
  if (!rec) return { ok: true };
  const elapsed = (Date.now() - new Date(rec.createdAt).getTime()) / 1000;
  if (elapsed < config.otp.resendCooldownSec) {
    return { ok: false, waitSec: Math.ceil(config.otp.resendCooldownSec - elapsed) };
  }
  return { ok: true };
}

export async function verifyOtp({ tripId, phone, otp }) {
  const rec = await latestOtp(tripId, phone);
  if (!rec) return { ok: false, reason: "no_otp" };
  if (rec.consumed) return { ok: false, reason: "used" };
  if (Date.now() > rec.expiresAt) return { ok: false, reason: "expired" };
  if (rec.attempts >= config.otp.maxAttempts) return { ok: false, reason: "locked" };

  const ok = hash(String(otp), rec.salt) === rec.otpHash;
  if (!ok) {
    rec.attempts += 1;
    await saveOtp(rec);
    return { ok: false, reason: "invalid", attemptsLeft: Math.max(0, config.otp.maxAttempts - rec.attempts) };
  }
  rec.consumed = true;
  await saveOtp(rec);
  return { ok: true };
}

export async function issueToken({ tripId, phone }) {
  const token = crypto.randomBytes(32).toString("hex");
  await createToken({ token, tripId, phone, expiresAt: Date.now() + config.tokenTtlMinutes * 60_000 });
  return token;
}

export const OTP_REASON_MSG = {
  no_otp: "Pehle OTP request karein.",
  used: "Ye OTP already use ho chuka hai. Naya OTP request karein.",
  expired: "OTP expire ho gaya. Naya OTP request karein.",
  locked: "Bahut zyada galat attempts. Naya OTP request karein.",
  invalid: "OTP galat hai."
};
