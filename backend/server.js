import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { config, twilioConfigured, resolveSecrets } from "./config.js";
import { razorpayConfigured } from "./services/payments.js";
import { initDb, countTrips, countUsers, findUserByEmail, createUser, saveTrip } from "./db.js";
import { hashPassword, requireAuth } from "./services/auth.js";
import { seedTrips } from "./data/seed.js";
import authRouter from "./routes/auth.js";
import tripsRouter from "./routes/trips.js";
import trackRouter from "./routes/track.js";
import insuranceRouter from "./routes/insurance.js";
import notificationsRouter from "./routes/notifications.js";
import paymentsRouter, { razorpayWebhook } from "./routes/payments.js";
import slipsRouter from "./routes/slips.js";

const app = express();

// Render / any reverse proxy sits in front of us — needed for correct client IP
// (rate limiting) and secure cookies/headers.
app.set("trust proxy", 1);

app.use(helmet());

// CORS: only the origins listed in CORS_ORIGIN may call the API.
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin / curl / server-to-server
      if (config.corsOrigins.includes("*") || config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin not allowed by CORS: ${origin}`));
    }
  })
);

// Razorpay webhook needs the RAW body for signature verification, so it is
// registered before express.json() parses the body.
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), razorpayWebhook);

app.use(express.json({ limit: "100kb" }));

// Lightweight request log (skipped during automated tests).
app.use((req, res, next) => {
  if (process.env.NO_LISTEN === "1") return next();
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// Global soft rate limit for the whole API.
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.RATE_LIMIT_OFF === "1",
    message: { error: "Bahut zyada requests. Thoda ruk kar try karein." }
  })
);

// --- public ---
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "mandi-truck-backend",
    twilio: twilioConfigured(),
    razorpay: razorpayConfigured(),
    time: new Date().toISOString()
  });
});

app.get("/", (_req, res) => {
  res.json({
    service: "mandi-truck-backend",
    ok: true,
    public: [
      "GET  /api/health",
      "POST /api/auth/login",
      "GET  /api/track/:tripId/access",
      "POST /api/track/:tripId/request-otp",
      "POST /api/track/:tripId/verify-otp",
      "GET  /api/track/:tripId/live?token=...",
      "GET  /api/slips/:slipNo?t=..."
    ],
    protected: [
      "GET  /api/auth/me",
      "GET  /api/trips",
      "GET  /api/trips/:id",
      "POST /api/trips/:id/advance",
      "POST /api/trips/:id/position",
      "POST /api/trips/:id/simulate-near",
      "POST /api/trips/:id/reset",
      "GET  /api/notifications/:tripId",
      "GET  /api/insurance/meta",
      "POST /api/insurance/quote",
      "GET  /api/payments",
      "POST /api/payments/order",
      "POST /api/payments/verify",
      "GET  /api/payments/:id"
    ]
  });
});

// --- public: auth + OTP-protected tracking ---
app.use("/api/auth", authRouter);
app.use("/api/track", trackRouter);

// --- protected: dashboard surface ---
app.use("/api/trips", requireAuth, tripsRouter);
app.use("/api/notifications", requireAuth, notificationsRouter);
app.use("/api/insurance", requireAuth, insuranceRouter);
app.use("/api/payments", requireAuth, paymentsRouter);
app.use("/api/slips", slipsRouter); // public: driver scans the slip QR

async function seedAdmin() {
  const existing = await findUserByEmail(config.admin.email);
  if (existing) return;
  await createUser({
    email: config.admin.email,
    name: config.admin.name,
    passwordHash: await hashPassword(config.admin.password)
  });
  console.log(`[seed] admin user created: ${config.admin.email}`);
}

async function start() {
  resolveSecrets();
  await initDb();

  if ((await countTrips()) === 0) {
    for (const t of seedTrips) await saveTrip(structuredClone(t));
    console.log(`[seed] inserted ${seedTrips.length} sample trips`);
  }
  if ((await countUsers()) === 0) await seedAdmin();

  if (process.env.NO_LISTEN === "1") return null;

  const server = app.listen(config.port, () => {
    console.log(`Mandi-truck backend running on http://localhost:${config.port}`);
    if (!twilioConfigured()) console.log("[notify] SMS/WhatsApp disabled (set Twilio env vars to enable)");
  });

  const shutdown = (sig) => {
    console.log(`${sig} received — shutting down`);
    server.close(async () => {
      try {
        await mongoose.connection.close(false);
      } catch (_) {}
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server;
}

await start();

export default app;
