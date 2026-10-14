import dotenv from "dotenv";
dotenv.config();

const num = (v, d) => (v === undefined || v === "" ? d : Number(v));

// Port resolution:
//  - Production (Render etc.): the host provides PORT and expects us to bind it.
//  - Local dev: use API_PORT and IGNORE the generic PORT, which many shells and
//    containers pre-set to 8080 — that mismatch is what caused the earlier 500s.
const isProd = process.env.NODE_ENV === "production";
const resolvedPort = isProd
  ? num(process.env.PORT, num(process.env.API_PORT, 5000))
  : num(process.env.API_PORT, 5000);

export const config = {
  port: resolvedPort,

  // Mongo connection string. If empty, the app falls back to an in-memory store
  // so you can still test locally without a database.
  mongoUri: process.env.MONGO_URI || "",

  // Base URL used when building tracking links that go out over SMS/WhatsApp.
  // Must be a public HTTPS URL in production (the client/driver open it from their phone).
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "http://localhost:5173").replace(/\/$/, ""),

  // How close to the destination (in km) triggers the "near destination" alert.
  nearDestKm: num(process.env.NEAR_DEST_KM, 15),

  otp: {
    length: num(process.env.OTP_LENGTH, 6),
    ttlMinutes: num(process.env.OTP_TTL_MINUTES, 5),
    maxAttempts: num(process.env.OTP_MAX_ATTEMPTS, 5),
    resendCooldownSec: num(process.env.OTP_RESEND_COOLDOWN_SEC, 30)
  },

  tokenTtlMinutes: num(process.env.TRACK_TOKEN_TTL_MINUTES, 60),

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    smsFrom: process.env.TWILIO_SMS_FROM || "",           // e.g. +1xxxxxxxxxx
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || ""  // e.g. +14155238886
  },

  // Dashboard auth
  jwt: {
    secret: process.env.JWT_SECRET || "",
    expiresIn: process.env.JWT_EXPIRES_IN || "12h"
  },
  admin: {
    email: (process.env.ADMIN_EMAIL || "").toLowerCase().trim(),
    password: process.env.ADMIN_PASSWORD || "",
    name: process.env.ADMIN_NAME || "Admin"
  },

  // Comma-separated list of allowed frontend origins (CORS).
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Payments (Razorpay)
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || ""
  },
  currency: process.env.PAYMENT_CURRENCY || "INR",

  // Public URL of THIS backend (Render URL). Used to build media URLs that
  // Twilio fetches when sending the slip PDF over WhatsApp. Optional — if
  // empty, messages carry only the verify link.
  apiPublicUrl: (process.env.API_PUBLIC_URL || "").replace(/\/$/, "")
};

// In production, secrets must be provided. In dev, fall back to safe defaults
// so the app runs out of the box.
export function resolveSecrets() {
  if (devMode) {
    if (!config.jwt.secret) {
      config.jwt.secret = "dev-only-insecure-secret-change-me";
      console.warn("[config] JWT_SECRET not set — using an insecure dev secret");
    }
    if (!config.admin.email || !config.admin.password) {
      config.admin.email = config.admin.email || "admin@manditruck.local";
      config.admin.password = config.admin.password || "admin12345";
      console.warn(`[config] ADMIN_EMAIL/PASSWORD not set — using dev admin (${config.admin.email} / ${config.admin.password})`);
    }
  } else {
    const missing = [];
    if (!config.jwt.secret) missing.push("JWT_SECRET");
    if (!config.admin.email) missing.push("ADMIN_EMAIL");
    if (!config.admin.password) missing.push("ADMIN_PASSWORD");
    if (missing.length) throw new Error(`Missing required production env vars: ${missing.join(", ")}`);
  }
}

export function twilioConfigured() {
  return Boolean(config.twilio.accountSid && config.twilio.authToken);
}

// In dev we surface the OTP in the API response so you can test without a
// real SMS provider. This is force-disabled when NODE_ENV=production.
export const devMode = process.env.NODE_ENV !== "production";
