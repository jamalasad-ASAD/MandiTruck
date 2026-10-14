import mongoose from "mongoose";
import crypto from "node:crypto";
import { config } from "./config.js";

// ---------------------------------------------------------------------------
// Mongoose models (used when MONGO_URI is set)
// ---------------------------------------------------------------------------
const TripSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    truckNumber: String,
    driver: { name: String, phone: String },
    vendor: { name: String, phone: String }, // consignor at the mandi
    client: { name: String, phone: String }, // consignee / buyer
    cargo: String,
    cargoWeightKg: Number,
    departure: String,
    expectedArrival: String,
    origin: { name: String, lat: Number, lng: Number },
    destination: { name: String, lat: Number, lng: Number },
    route: [{ lat: Number, lng: Number }],
    tolls: [
      {
        id: String,
        name: String,
        lat: Number,
        lng: Number,
        amount: Number,
        crossed: Boolean,
        crossedAt: String
      }
    ],
    nearDestNotified: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const NotificationSchema = new mongoose.Schema({
  id: { type: String, index: true },
  tripId: { type: String, index: true },
  event: String, // 'toll_crossed' | 'near_destination'
  recipientRole: String, // 'client' | 'vendor' | 'driver'
  recipientName: String,
  phone: String,
  channel: String, // 'sms' | 'whatsapp' | 'inapp'
  message: String,
  status: String, // 'sent' | 'failed' | 'skipped'
  providerId: String,
  error: String,
  createdAt: String
});

const OtpSchema = new mongoose.Schema({
  id: String,
  tripId: { type: String, index: true },
  phone: { type: String, index: true },
  otpHash: String,
  expiresAt: Number,
  attempts: { type: Number, default: 0 },
  consumed: { type: Boolean, default: false },
  createdAt: String
});

const TokenSchema = new mongoose.Schema({
  token: { type: String, unique: true, index: true },
  tripId: String,
  phone: String,
  expiresAt: Number,
  createdAt: String
});

const UserSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  email: { type: String, unique: true, index: true },
  passwordHash: String,
  name: String,
  role: { type: String, default: "admin" },
  createdAt: String
});

const PaymentSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  tripId: String,
  receipt: String,
  orderId: { type: String, index: true },
  paymentId: String,
  amount: Number,        // rupees
  amountPaise: Number,
  currency: String,
  status: String,        // 'created' | 'paid' | 'failed'
  payerRole: String,     // 'vendor' | 'client'
  payerName: String,
  payerPhone: String,
  quoteInput: Object,
  quoteSummary: Object,
  method: String,
  signature: String,
  simulated: Boolean,
  createdAt: String,
  paidAt: String
});

const SlipSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  slipNo: { type: String, unique: true, index: true },
  verifyToken: { type: String, index: true },
  paymentId: String,
  tripId: String,
  truckNumber: String,
  route: String,
  payerRole: String,
  payerName: String,
  payerPhone: String,
  amount: Number,
  currency: String,
  quoteSummary: Object,
  razorpayPaymentId: String,
  simulated: Boolean,
  issuedAt: String
});

export const Trip = mongoose.model("Trip", TripSchema);
export const Notification = mongoose.model("Notification", NotificationSchema);
export const Otp = mongoose.model("Otp", OtpSchema);
export const Token = mongoose.model("Token", TokenSchema);
export const User = mongoose.model("User", UserSchema);
export const Payment = mongoose.model("Payment", PaymentSchema);
export const Slip = mongoose.model("Slip", SlipSchema);

// ---------------------------------------------------------------------------
// In-memory fallback so local testing works without a database
// ---------------------------------------------------------------------------
const mem = { trips: [], notifications: [], otps: [], tokens: [], users: [], payments: [], slips: [] };
let useMongo = false;
export const uid = () => crypto.randomUUID();

export async function initDb() {
  if (!config.mongoUri) {
    console.warn("[db] MONGO_URI not set — using in-memory store (data lost on restart)");
    return;
  }
  try {
    await mongoose.connect(config.mongoUri);
    useMongo = true;
    console.log("[db] MongoDB connected");
  } catch (e) {
    console.warn(`[db] MongoDB connect failed (${e.message}) — falling back to in-memory store`);
    useMongo = false;
  }
}

export const isMongo = () => useMongo;

// --- trips -----------------------------------------------------------------
export async function allTrips() {
  if (useMongo) return (await Trip.find({}).lean()).map(stripMongo);
  return mem.trips;
}
export async function findTrip(id) {
  if (useMongo) {
    const t = await Trip.findOne({ id }).lean();
    return t ? stripMongo(t) : null;
  }
  return mem.trips.find((t) => t.id === id) || null;
}
export async function saveTrip(trip) {
  if (useMongo) {
    await Trip.findOneAndUpdate({ id: trip.id }, trip, { upsert: true, new: true });
    return trip;
  }
  const i = mem.trips.findIndex((t) => t.id === trip.id);
  if (i === -1) mem.trips.push(trip);
  else mem.trips[i] = trip;
  return trip;
}
export async function countTrips() {
  return useMongo ? Trip.countDocuments() : mem.trips.length;
}

// --- notifications ---------------------------------------------------------
export async function addNotification(n) {
  const doc = { id: uid(), createdAt: new Date().toISOString(), ...n };
  if (useMongo) await Notification.create(doc);
  else mem.notifications.unshift(doc);
  return doc;
}
export async function notificationsByTrip(tripId) {
  if (useMongo) return (await Notification.find({ tripId }).sort({ createdAt: -1 }).lean()).map(stripMongo);
  return mem.notifications.filter((n) => n.tripId === tripId);
}

// --- OTP sessions ----------------------------------------------------------
export async function createOtp(o) {
  const doc = { id: uid(), createdAt: new Date().toISOString(), attempts: 0, consumed: false, ...o };
  if (useMongo) await Otp.create(doc);
  else mem.otps.unshift(doc);
  return doc;
}
export async function latestOtp(tripId, phone) {
  if (useMongo) {
    const o = await Otp.findOne({ tripId, phone }).sort({ createdAt: -1 }).lean();
    return o ? stripMongo(o) : null;
  }
  return mem.otps.find((o) => o.tripId === tripId && o.phone === phone) || null;
}
export async function saveOtp(o) {
  if (useMongo) await Otp.updateOne({ id: o.id }, o);
  else {
    const i = mem.otps.findIndex((x) => x.id === o.id);
    if (i !== -1) mem.otps[i] = o;
  }
}

// --- access tokens ---------------------------------------------------------
export async function createToken(t) {
  const doc = { createdAt: new Date().toISOString(), ...t };
  if (useMongo) await Token.create(doc);
  else mem.tokens.push(doc);
  return doc;
}
export async function findToken(token) {
  if (useMongo) {
    const t = await Token.findOne({ token }).lean();
    return t ? stripMongo(t) : null;
  }
  return mem.tokens.find((t) => t.token === token) || null;
}

// --- payments --------------------------------------------------------------
export async function createPayment(p) {
  const doc = { id: uid(), createdAt: new Date().toISOString(), status: "created", ...p };
  if (useMongo) await Payment.create(doc);
  else mem.payments.unshift(doc);
  return doc;
}
export async function findPayment(id) {
  if (useMongo) {
    const p = await Payment.findOne({ id }).lean();
    return p ? stripMongo(p) : null;
  }
  return mem.payments.find((p) => p.id === id) || null;
}
export async function findPaymentByOrderId(orderId) {
  if (useMongo) {
    const p = await Payment.findOne({ orderId }).lean();
    return p ? stripMongo(p) : null;
  }
  return mem.payments.find((p) => p.orderId === orderId) || null;
}
export async function savePayment(p) {
  if (useMongo) await Payment.updateOne({ id: p.id }, p);
  else {
    const i = mem.payments.findIndex((x) => x.id === p.id);
    if (i !== -1) mem.payments[i] = p;
  }
  return p;
}
export async function listPayments() {
  if (useMongo) return (await Payment.find({}).sort({ createdAt: -1 }).lean()).map(stripMongo);
  return mem.payments;
}

// --- slips ------------------------------------------------------------------
export async function createSlip(s) {
  const doc = { id: uid(), issuedAt: new Date().toISOString(), ...s };
  if (useMongo) await Slip.create(doc);
  else mem.slips.unshift(doc);
  return doc;
}
export async function findSlipByNo(slipNo) {
  if (useMongo) {
    const s = await Slip.findOne({ slipNo }).lean();
    return s ? stripMongo(s) : null;
  }
  return mem.slips.find((s) => s.slipNo === slipNo) || null;
}
export async function findSlipByPayment(paymentId) {
  if (useMongo) {
    const s = await Slip.findOne({ paymentId }).lean();
    return s ? stripMongo(s) : null;
  }
  return mem.slips.find((s) => s.paymentId === paymentId) || null;
}
export async function countSlips() {
  return useMongo ? Slip.countDocuments() : mem.slips.length;
}

// --- users -----------------------------------------------------------------
export async function createUser(u) {
  const doc = { id: uid(), role: "admin", createdAt: new Date().toISOString(), ...u };
  if (useMongo) await User.create(doc);
  else mem.users.push(doc);
  return doc;
}
export async function findUserByEmail(email) {
  if (useMongo) {
    const u = await User.findOne({ email }).lean();
    return u ? stripMongo(u) : null;
  }
  return mem.users.find((u) => u.email === email) || null;
}
export async function countUsers() {
  return useMongo ? User.countDocuments() : mem.users.length;
}

function stripMongo(doc) {
  const { _id, __v, createdAt, updatedAt, ...rest } = doc;
  return rest;
}
