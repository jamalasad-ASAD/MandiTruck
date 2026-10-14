import { getToken, setToken } from "./token.js";

// In production set VITE_API_BASE_URL to your backend (e.g. Render URL).
// Left blank in dev, so requests go to /api and Vite proxies them.
const BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function handle(res) {
  if (res.status === 401) {
    setToken("");
    window.dispatchEvent(new Event("auth:logout"));
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const d = await res.json();
      if (d && d.error) msg = d.error;
    } catch (_) {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function call(method, path, body) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  }).then(handle);
}

// Downloads a file (PDF) with the auth header attached, then saves it.
export async function downloadFile(path, filename) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { headers });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Full URL for a public slip PDF (opened in a new tab, no auth header needed).
export const publicSlipPdfUrl = (slipNo, token) =>
  `${BASE}/api/slips/${encodeURIComponent(slipNo)}/pdf?t=${encodeURIComponent(token)}`;

export const api = {
  // auth
  login: (email, password) => call("POST", "/api/auth/login", { email, password }),
  me: () => call("GET", "/api/auth/me"),

  // dashboard (protected)
  listTrips: () => call("GET", "/api/trips"),
  getTrip: (id) => call("GET", `/api/trips/${id}`),
  advanceTrip: (id) => call("POST", `/api/trips/${id}/advance`),
  resetTrip: (id) => call("POST", `/api/trips/${id}/reset`),
  simulateNear: (id) => call("POST", `/api/trips/${id}/simulate-near`),
  notifications: (id) => call("GET", `/api/notifications/${id}`),

  insuranceMeta: () => call("GET", "/api/insurance/meta"),
  quote: (payload) => call("POST", "/api/insurance/quote", payload),

  // payments
  createOrder: (payload) => call("POST", "/api/payments/order", payload),
  verifyPayment: (payload) => call("POST", "/api/payments/verify", payload),
  simulatePayment: (paymentDbId) => call("POST", "/api/payments/simulate", { paymentDbId }),
  listPayments: () => call("GET", "/api/payments"),
  getPayment: (id) => call("GET", `/api/payments/${id}`),
  sendSlip: (id, recipients) => call("POST", `/api/payments/${id}/send-slip`, { recipients }),

  // public slip verification (driver scans the QR)
  getSlip: (slipNo, token) =>
    call("GET", `/api/slips/${encodeURIComponent(slipNo)}?t=${encodeURIComponent(token)}`),

  // public tracking (OTP protected)
  trackAccess: (id) => call("GET", `/api/track/${id}/access`),
  requestOtp: (id, phone) => call("POST", `/api/track/${id}/request-otp`, { phone }),
  verifyOtp: (id, phone, otp) => call("POST", `/api/track/${id}/verify-otp`, { phone, otp }),
  live: (id, token) => call("GET", `/api/track/${id}/live?token=${encodeURIComponent(token)}`)
};
