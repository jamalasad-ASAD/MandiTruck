import http from "node:http";
process.env.NO_LISTEN = "1";
process.env.RATE_LIMIT_OFF = "1";
process.env.JWT_SECRET = "test-secret";
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-pass-123";
process.env.PAYMENTS_SIMULATE = "true";
const { default: app } = await import("./server.js");
// Imported AFTER env vars are set, so config.js is loaded with the test values.
const { buildSlipPdf } = await import("./services/slipPdf.js");
const { withQr } = await import("./services/slip.js");

const server = app.listen(0);
const port = server.address().port;
let TOKEN = "";

function req(method, path, body, auth = false) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(data);
    }
    if (auth && TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
    const r = http.request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(buf); } catch (_) {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}
const get = (p, auth) => req("GET", p, null, auth);
const post = (p, b, auth) => req("POST", p, b, auth);

// Raw GET that returns bytes (for PDF responses).
function rawGet(path, auth = false) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (auth && TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
    const r = http.request({ host: "127.0.0.1", port, path, method: "GET", headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks) }));
    });
    r.on("error", reject);
    r.end();
  });
}

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
}

const CLIENT = "+919800000201";
const DRIVER = "+919800000021";

console.log("--- public ---");
const health = await get("/api/health");
check("health ok + twilio/razorpay flags", health.status === 200 && health.body.ok === true && health.body.twilio === false && health.body.razorpay === false);

console.log("--- auth ---");
const noAuth = await get("/api/trips");
check("protected route without token -> 401", noAuth.status === 401);

const badLogin = await post("/api/auth/login", { email: "admin@test.local", password: "wrong" });
check("login with wrong password -> 401", badLogin.status === 401);

const login = await post("/api/auth/login", { email: "admin@test.local", password: "test-pass-123" });
check("login with correct password -> token", login.status === 200 && typeof login.body.token === "string");
TOKEN = login.body.token;

const me = await get("/api/auth/me", true);
check("/api/auth/me returns the user", me.status === 200 && me.body.user.email === "admin@test.local");

console.log("--- core (authed) ---");
const trips = await get("/api/trips", true);
check("2 trips listed with token", trips.status === 200 && trips.body.length === 2);

const t = await get("/api/trips/TRK-1024", true);
check("trip detail: In transit, 33%", t.body.status === "In transit" && t.body.progressPct === 33);
check("masked recipient phones", t.body.client.phone.includes("\u2022"));

console.log("--- toll cross -> client + vendor alerts ---");
const adv = await post("/api/trips/TRK-1024/advance", null, true);
check("advance crossed Kasara", adv.body.crossedToll.name.includes("Kasara"));
const tollNotifs = adv.body.notifications.filter((n) => n.event === "toll_crossed");
check("toll_crossed alerts = 2 x 3 = 6", tollNotifs.length === 6, "got " + tollNotifs.length);
check("  recipients client + vendor", tollNotifs.every((n) => ["client", "vendor"].includes(n.recipientRole)));
check("  sms skipped (no Twilio)", tollNotifs.filter((n) => n.channel === "sms").every((n) => n.status === "skipped"));

console.log("--- near destination -> client + driver link ---");
const near = await post("/api/trips/TRK-1024/simulate-near", null, true);
const nearNotifs = near.body.notifications.filter((n) => n.event === "near_destination");
check("within geofence", near.body.distanceToDestinationKm <= 15, "got " + near.body.distanceToDestinationKm);
check("near_destination alerts = 2 x 3 = 6", nearNotifs.length === 6);
check("  recipients client + driver", nearNotifs.every((n) => ["client", "driver"].includes(n.recipientRole)));
check("  message has /track/ link", nearNotifs.every((n) => n.message.includes("/track/TRK-1024")));
const near2 = await post("/api/trips/TRK-1024/simulate-near", null, true);
check("geofence fires only once", near2.body.notifications.filter((n) => n.event === "near_destination").length === 0);

const feed = await get("/api/notifications/TRK-1024", true);
check("notification feed has 12", feed.body.length === 12, "got " + feed.body.length);

console.log("--- OTP-protected live location (public) ---");
const access = await get("/api/track/TRK-1024/access");
check("access lists 3 allowed (masked)", access.body.allowed.length === 3 && access.body.allowed[0].phone.includes("\u2022"));

const badNum = await post("/api/track/TRK-1024/request-otp", { phone: "+919999999999" });
check("unauthorised number -> 403", badNum.status === 403);

const otpReq = await post("/api/track/TRK-1024/request-otp", { phone: CLIENT });
check("authorised -> devOtp in dev mode", otpReq.status === 200 && /^\d{6}$/.test(otpReq.body.devOtp || ""));
const devOtp = otpReq.body.devOtp;

check("wrong OTP -> 400", (await post("/api/track/TRK-1024/verify-otp", { phone: CLIENT, otp: "000000" })).status === 400);

const ok = await post("/api/track/TRK-1024/verify-otp", { phone: CLIENT, otp: devOtp });
check("correct OTP -> token", ok.status === 200 && typeof ok.body.token === "string");
const trackToken = ok.body.token;

check("OTP cannot be reused", (await post("/api/track/TRK-1024/verify-otp", { phone: CLIENT, otp: devOtp })).status === 400);

const live = await get(`/api/track/TRK-1024/live?token=${trackToken}`);
check("live with valid token -> 200", live.status === 200 && live.body.truckNumber === "MH-15-AB-1234");
check("live with bad token -> 401", (await get("/api/track/TRK-1024/live?token=deadbeef")).status === 401);
check("token scoped to its trip -> 401", (await get(`/api/track/TRK-2057/live?token=${trackToken}`)).status === 401);

console.log("--- insurance (authed) ---");
const q = await post("/api/insurance/quote", { vehicleType: "truck2", vehicleAgeYears: 2, idv: 1200000, cargoType: "perishable", cargoValue: 300000, ncbPercent: 20, addOns: ["zeroDep", "rsa", "cargo"] }, true);
check("insurance quote total > 0", q.body.totalPremium > 0);
check("insurance without token -> 401", (await get("/api/insurance/meta")).status === 401);

console.log("--- payments (Razorpay, simulated) ---");
const quoteInput = { vehicleType: "truck2", vehicleAgeYears: 2, idv: 1200000, cargoType: "perishable", cargoValue: 300000, ncbPercent: 20, comprehensive: true, addOns: ["zeroDep", "rsa", "cargo"] };

check("payments/order without token -> 401", (await post("/api/payments/order", { quoteInput })).status === 401);

// NB: we deliberately pass amount:1 to prove the server ignores client amounts.
const order = await post("/api/payments/order", {
  quoteInput, payerRole: "vendor", payerName: "Nashik Mandi Traders",
  payerPhone: "+919800000101", tripId: "TRK-1024", amount: 1
}, true);
check("order created (simulated, no Razorpay keys)", order.status === 200 && order.body.simulated === true && typeof order.body.paymentDbId === "string", JSON.stringify(order.body));
check("  amount recomputed server-side (client amount:1 ignored)", order.body.amount > 1000, "got " + order.body.amount);
check("invalid payerRole -> 400", (await post("/api/payments/order", { quoteInput, payerRole: "hacker", payerName: "x", payerPhone: "+91" }, true)).status === 400);
check("order with no quoteInput -> 400", (await post("/api/payments/order", { payerRole: "vendor", payerName: "x", payerPhone: "+91" }, true)).status === 400);

const sim = await post("/api/payments/simulate", { paymentDbId: order.body.paymentDbId }, true);
check("simulate -> slip issued", sim.status === 200 && sim.body.slip && !!sim.body.slip.slipNo, JSON.stringify(sim.body).slice(0, 160));
const slip = sim.body.slip;
check("  slip has QR data URL", typeof slip.qrDataUrl === "string" && slip.qrDataUrl.startsWith("data:image/png"));
check("  slip verify link carries token", String(slip.verifyUrl).includes(`/verify/${slip.slipNo}?t=`));
check("  slip payerRole = vendor", slip.payerRole === "vendor");
check("  slip amount matches payment", slip.amount === order.body.amount);

const pay = await get(`/api/payments/${order.body.paymentDbId}`, true);
check("payment now 'paid' with slip attached", pay.body.payment.status === "paid" && pay.body.slip.slipNo === slip.slipNo);
check("  slip response carries derived qrDataUrl", String(pay.body.slip.qrDataUrl).startsWith("data:image/png"));

const list = await get("/api/payments", true);
check("payments list includes it as paid", list.body.some((p) => p.id === order.body.paymentDbId && p.status === "paid"));

const simAgain = await post("/api/payments/simulate", { paymentDbId: order.body.paymentDbId }, true);
check("completing twice is idempotent (same slip)", simAgain.body.slip.slipNo === slip.slipNo);

console.log("--- public slip verification ---");
const v = await get(`/api/slips/${slip.slipNo}?t=${slip.verifyToken}`);
check("verify with token -> valid", v.status === 200 && v.body.valid === true);
check("  verify response carries qrDataUrl", String(v.body.qrDataUrl).startsWith("data:image/png"));
check("verify without token -> 403", (await get(`/api/slips/${slip.slipNo}`)).status === 403);
check("verify with wrong token -> 403", (await get(`/api/slips/${slip.slipNo}?t=wrong`)).status === 403);
check("unknown slip -> 404", (await get("/api/slips/MT-00000000-000000?t=x")).status === 404);

// Regression: a slip read back from MongoDB only has fields declared in the
// schema — no verifyUrl / qrDataUrl. Both the PDF and withQr must derive them.
console.log("--- regression: slip read back from DB (no derived fields) ---");
const bareSlip = {
  slipNo: "MT-20260101-000001",
  verifyToken: "tok123",
  payerName: "Test Payer",
  payerRole: "vendor",
  payerPhone: "+919800000101",
  amount: 1000,
  currency: "INR",
  issuedAt: new Date().toISOString(),
  quoteSummary: {},
  simulated: false
};
const barePdf = await buildSlipPdf(bareSlip);
check("PDF builds from a slip WITHOUT stored verifyUrl/qrDataUrl", barePdf.slice(0, 5).toString() === "%PDF-", "got " + barePdf.slice(0, 5).toString());
check("  bare-slip PDF is non-trivial", barePdf.length > 1500, "got " + barePdf.length);
const enriched = await withQr(bareSlip);
check("withQr derives verifyUrl", String(enriched.verifyUrl).includes(bareSlip.slipNo) && String(enriched.verifyUrl).includes("tok123"));
check("withQr derives qrDataUrl", String(enriched.qrDataUrl).startsWith("data:image/png"));

// Faithful simulation of what MongoDB actually stores: Mongoose drops any
// field not declared in the schema. new Slip(...).toObject() applies that.
console.log("--- regression: real Mongoose schema stripping ---");
const { Slip } = await import("./db.js");
const richSlip = await withQr({
  slipNo: "MT-20260101-000002",
  verifyToken: "tok456",
  route: "A -> B",
  payerName: "Test Payer",
  payerRole: "vendor",
  payerPhone: "+919800000101",
  amount: 500,
  currency: "INR",
  issuedAt: new Date().toISOString(),
  quoteSummary: {},
  simulated: false
});
const persisted = new Slip(richSlip).toObject(); // exactly what Mongo would keep
check("Mongoose strips verifyUrl + qrDataUrl (the original crash)", !("verifyUrl" in persisted) && !("qrDataUrl" in persisted));
check("  schema keeps route", persisted.route === "A -> B");
check("  schema keeps verifyToken", persisted.verifyToken === "tok456");
const persistedPdf = await buildSlipPdf(persisted);
check("  PDF builds from the Mongo-shaped doc", persistedPdf.slice(0, 5).toString() === "%PDF-");
check("  withQr re-derives from the Mongo-shaped doc", String((await withQr(persisted)).qrDataUrl).startsWith("data:image/png"));

console.log("--- slip PDF ---");
const pdf = await rawGet(`/api/payments/${order.body.paymentDbId}/slip/pdf`, true);
check("slip PDF (authed) -> 200 + application/pdf", pdf.status === 200 && String(pdf.headers["content-type"]).includes("application/pdf"), "status " + pdf.status);
check("  PDF magic bytes", pdf.buf.slice(0, 5).toString() === "%PDF-");
check("  PDF non-trivial size", pdf.buf.length > 2000, "got " + pdf.buf.length);
check("slip PDF without token -> 401", (await rawGet(`/api/payments/${order.body.paymentDbId}/slip/pdf`)).status === 401);

const pubPdf = await rawGet(`/api/slips/${slip.slipNo}/pdf?t=${slip.verifyToken}`);
check("public slip PDF with token -> 200 PDF", pubPdf.status === 200 && pubPdf.buf.slice(0, 5).toString() === "%PDF-");
check("public slip PDF without token -> 403", (await rawGet(`/api/slips/${slip.slipNo}/pdf`)).status === 403);
check("public slip PDF unknown slip -> 404", (await rawGet("/api/slips/MT-00000000-000000/pdf?t=x")).status === 404);

console.log("--- send slip (WhatsApp + SMS) ---");
const sendRes = await post(`/api/payments/${order.body.paymentDbId}/send-slip`, { recipients: ["payer", "driver"] }, true);
check("send-slip -> 2 recipients x 2 channels = 4 attempts", sendRes.status === 200 && sendRes.body.sent.length === 4, JSON.stringify(sendRes.body).slice(0, 200));
check("  all skipped (no Twilio creds)", sendRes.body.sent.every((s) => s.status === "skipped"));
check("  includes the driver", sendRes.body.sent.some((s) => s.role === "driver"));
check("  includes whatsapp + sms", sendRes.body.sent.some((s) => s.channel === "whatsapp") && sendRes.body.sent.some((s) => s.channel === "sms"));

const unpaid = await post("/api/payments/order", { quoteInput, payerRole: "client", payerName: "X", payerPhone: "+919800000202" }, true);
check("send-slip on unpaid payment -> 400", (await post(`/api/payments/${unpaid.body.paymentDbId}/send-slip`, {}, true)).status === 400);
check("slip PDF for unpaid payment -> 404", (await rawGet(`/api/payments/${unpaid.body.paymentDbId}/slip/pdf`, true)).status === 404);

console.log("--- webhook ---");
check("webhook with bad signature -> 400", (await post("/api/payments/webhook", { event: "payment.captured" })).status === 400);

console.log(`\n${failures === 0 ? "ALL TESTS PASSED" : failures + " TEST(S) FAILED"}`);
server.close();
process.exit(failures === 0 ? 0 : 1);
