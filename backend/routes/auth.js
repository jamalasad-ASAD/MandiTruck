import express from "express";
import rateLimit from "express-rate-limit";
import { findUserByEmail } from "../db.js";
import { verifyPassword, signToken, requireAuth } from "../services/auth.js";

const r = express.Router();

// Slow down credential stuffing / brute force.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.RATE_LIMIT_OFF === "1",
  message: { error: "Bahut zyada login attempts. 15 minute baad try karein." }
});

r.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email aur password required hain" });

  const user = await findUserByEmail(String(email).toLowerCase().trim());
  // Same message for unknown user and wrong password (avoid user enumeration).
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

r.get("/me", requireAuth, (req, res) => {
  res.json({ user: { id: req.user.sub, email: req.user.email, name: req.user.name, role: req.user.role } });
});

export default r;
