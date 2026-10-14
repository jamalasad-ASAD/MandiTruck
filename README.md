# MandiTruck — Tracking + Alerts + Insurance (React + Node/Express)

Mandi ke truck ke liye production-ready web app:

1. **Toll-based Tracking** — truck ki position us toll plaza se decide hoti hai jo usne last
   cross kiya. Leaflet + OpenStreetMap par route aur toll plazas dikhte hain.
2. **Alerts (SMS + WhatsApp + in-app)**
   - Toll plaza cross → **client + vendor** ko message.
   - Destination ke **NEAR_DEST_KM** (default 15 km) ke andar → **client + driver** ko
     live-location link.
3. **OTP-protected live location** — link sirf usi number par khulta hai jise SMS gaya
   (number → OTP → live map, short-lived token).
4. **Insurance quote** — vehicle + cargo details par estimated premium breakdown.
5. **Premium payment (Razorpay)** — quote se premium pay karo; payment confirm hone par ek
   **payment slip** generate hoti hai (slip number + verify QR). Vendor ne pay kiya ho to slip
   **dispatch ke time driver ko** di jaati hai. Slip **print**, **PDF download**, ya **WhatsApp pe
   PDF attach** karke bhej sakte ho. QR scan karne par public verification page khulta hai.
6. **JWT login** — dashboard (trips, notifications, insurance, payments) sirf authenticated admin ke liye.
   Public sirf: health, login, OTP-wala tracking link, aur slip verification.

---

## Architecture

```
React (Vercel)  --/api-->  Express (Render)  -->  MongoDB Atlas (trips, notifications, OTP, tokens, users)
                                |
                                +--> Twilio (SMS + WhatsApp)
                                +--> in-app feed (dashboard /api/notifications/:tripId)
```

Event flow:
- `POST /api/trips/:id/advance` (prod me FASTag/toll webhook) → `onTollCrossed()` → client + vendor.
- Position update (`POST /api/trips/:id/position`) → `checkNearDestination()` → client + driver (ek hi baar).

---

## Local dev

**Backend (port 5000):**
```bash
cd backend
npm install
cp .env.example .env      # optional — bina Mongo/Twilio bhi chalta hai
npm start
```

**Frontend (port 5173):**
```bash
cd frontend
npm install
npm run dev
```
Kholo **http://localhost:5173** → login. Dev defaults: `admin@manditruck.local` / `admin12345`
(env se override karo). Bina Twilio OTP screen par hi dikh jaata hai (dev mode).

**Tests:** `cd backend && npm test`

---

## Environment variables

**Backend** (`backend/.env.example`):

| Var | Kaam |
|-----|------|
| `NODE_ENV` | `production` me host ka `PORT` use hota hai + dev OTP band. |
| `API_PORT` | local dev port (default 5000). |
| `MONGO_URI` | MongoDB connection string (blank = in-memory, sirf local). |
| `PUBLIC_BASE_URL` | tracking link ka base — prod me Vercel URL. |
| `CORS_ORIGIN` | allowed frontend origin(s), comma-separated. |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | session signing (prod me required). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | dashboard login (startup pe seed hota hai). |
| `NEAR_DEST_KM` | geofence radius. |
| `OTP_*`, `TRACK_TOKEN_TTL_MINUTES` | OTP + access-token settings. |
| `TWILIO_*` | SMS + WhatsApp credentials. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay API keys (test keys se shuru karo). |
| `RAZORPAY_WEBHOOK_SECRET` | webhook signature verify karne ke liye. |
| `PAYMENT_CURRENCY` | default `INR`. |
| `PAYMENTS_SIMULATE` | **dev-only**: Razorpay ke bina payment complete karke slip test karo. Prod me kabhi enable na karo. |
| `API_PUBLIC_URL` | backend ka public URL (Render). Isse Twilio WhatsApp pe slip **PDF attach** kar pata hai. Blank chodo to message me sirf link jaayega. |

**Frontend** (`frontend/.env.example`): `VITE_API_BASE_URL` — prod me Render URL; local me blank (proxy).

---

## API endpoints

**Public**

| Method | Path |
|--------|------|
| GET  | `/api/health` |
| POST | `/api/auth/login` |
| GET  | `/api/track/:tripId/access` |
| POST | `/api/track/:tripId/request-otp` |
| POST | `/api/track/:tripId/verify-otp` |
| GET  | `/api/track/:tripId/live?token=...` |
| GET  | `/api/slips/:slipNo?t=...` (driver QR verify) |
| GET  | `/api/slips/:slipNo/pdf?t=...` (slip PDF) |
| POST | `/api/payments/webhook` (Razorpay → us) |

**Protected** (header: `Authorization: Bearer <token>`)

| Method | Path |
|--------|------|
| GET  | `/api/auth/me` |
| GET  | `/api/trips` · `/api/trips/:id` |
| POST | `/api/trips/:id/advance` · `/position` · `/simulate-near` · `/reset` |
| GET  | `/api/notifications/:tripId` |
| GET  | `/api/insurance/meta` · POST `/api/insurance/quote` |
| GET  | `/api/payments` · `/api/payments/:id` |
| POST | `/api/payments/order` · `/api/payments/verify` · `/api/payments/simulate` |
| GET  | `/api/payments/:id/slip/pdf` (PDF download) |
| POST | `/api/payments/:id/send-slip` (WhatsApp PDF + SMS) |

---

## Deploy to production (Render + Vercel + Atlas)

### 1. MongoDB Atlas
1. Free cluster banao → **Database Access** me user banao.
2. **Network Access** → `0.0.0.0/0` allow karo (ya Render ke outbound IPs).
3. Connection string copy karo: `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/manditruck?retryWrites=true&w=majority`

### 2. Twilio (SMS + WhatsApp)
- Account SID + Auth Token → `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`.
- SMS-capable number → `TWILIO_SMS_FROM`. **India:** DLT registration + approved sender/template zaroori.
- WhatsApp sender → `TWILIO_WHATSAPP_FROM`. Business-initiated messages ke liye **approved template** chahiye (24-hour window ke bahar free-form allowed nahi). Testing ke liye Twilio WhatsApp sandbox use kar sakte ho.

### 2b. Razorpay (payments)
1. Razorpay dashboard → **Settings → API Keys** → generate karo. **Test mode keys se shuru karo**,
   phir live keys se swap karo.
2. **Settings → Webhooks** → webhook add karo:
   - URL: `https://<your-render-url>/api/payments/webhook`
   - Event: `payment.captured`
   - Secret → `RAZORPAY_WEBHOOK_SECRET` me daalo.
3. Local me gateway ke bina slip flow test karna ho to `PAYMENTS_SIMULATE=true` set karo
   (dev me hi chalta hai — prod me automatic off).
4. Slip PDF ko WhatsApp pe **attach** karke bhejne ke liye `API_PUBLIC_URL` ko apne Render URL
   par set karo (e.g. `https://mandi-truck-api.onrender.com`). Iske bina message me sirf
   verification link jaayega, PDF nahi.
   > WhatsApp pe business-initiated document bhejne ke liye bhi **approved template** chahiye.

### 3. Backend → Render
1. Repo GitHub par push karo.
2. Render → **New → Blueprint** → repo select karo (`backend/render.yaml` auto-detect hoga).
3. Secret env vars bharo: `MONGO_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PUBLIC_BASE_URL`,
   `CORS_ORIGIN`, `TWILIO_*`. (`JWT_SECRET` auto-generate hota hai.)
4. Deploy → URL note karo, e.g. `https://mandi-truck-api.onrender.com`.
5. Verify: browser me `https://mandi-truck-api.onrender.com/api/health` → `{"ok":true,...}`.

### 4. Frontend → Vercel
1. Vercel → **New Project** → repo import karo.
2. **Root Directory = `frontend`**, framework **Vite**.
3. Env var: `VITE_API_BASE_URL = https://mandi-truck-api.onrender.com`
4. Deploy → URL note karo, e.g. `https://manditruck.vercel.app`.

### 5. Dono ko jodo
Render par wapas jaake set karo (phir redeploy):
- `PUBLIC_BASE_URL = https://manditruck.vercel.app`
- `CORS_ORIGIN = https://manditruck.vercel.app`

### 6. Test
Vercel URL kholo → `/login` → admin credentials → dashboard. Ek trip par "Cross next toll"
dabao → Twilio configured hai to client/vendor ko SMS+WhatsApp jaayega.

> **Render free tier** inactivity ke baad sleep hota hai — pehla request 30–60s le sakta hai.

---

## Production hardening — kya already hai

- `helmet` security headers, CORS allowlist, `trust proxy` (Render), JSON body size limit.
- Global API rate limit + strict limits on login aur OTP endpoints.
- Passwords bcrypt-hashed; JWT sessions; OTP sha256-hashed with expiry + attempt cap.
- Login same error for unknown user / wrong password (no user enumeration).
- Admin routes auth-protected; tracking token trip-scoped + expiring.
- Secrets sirf env se — repo me kabhi nahi. `.env` gitignored.
- Graceful shutdown on SIGTERM/SIGINT (Render deploys ke liye).
- Payments: amount **server par recompute** hota hai (client ka amount kabhi trust nahi);
  Razorpay checkout signature HMAC-SHA256 se verify hoti hai; webhook raw body + signature verified
  aur idempotent; slip verify link me secret token (enumeration-proof).

## Abhi bhi karna hoga (real integrations)

- `POST /api/trips/:id/advance` ko **FASTag / toll-gate webhook** se trigger karo.
- `POST /api/trips/:id/position` ko **telematics device / driver app GPS** se feed karo.
- `backend/data/seed.js` hata kar apna real trips + vendor/client/driver numbers use karo.
- `backend/data/insurance.js` ke rates apne insurer/IRDAI-compliant tariff se replace karo.
- Twilio status callbacks wire karo (delivery monitoring).
- Data retention/privacy policy (DPDP Act) phone numbers + location logs ke liye.

---

## Troubleshooting

- **`{"error":"Missing required production env vars: ..."}`** → Render par woh env vars set karo.
- **CORS error browser me** → `CORS_ORIGIN` me apna exact Vercel origin daalo (trailing slash ke bina).
- **Login 401** → `ADMIN_EMAIL`/`ADMIN_PASSWORD` check karo. Admin user sirf pehli baar (jab koi user na ho) seed hota hai — password badla to DB me user delete karke restart karo.
- **SMS/WhatsApp nahi ja raha** → Twilio env vars + notification log me `skipped`/`failed` reason dekho.
- **"Request failed (500)"** local me → backend reachable nahi; `http://localhost:5000/api/health` check karo.
- **Port mismatch local me** → dono jagah same `API_PORT` do (backend `npm start` + frontend `npm run dev`).

---

## Tech stack

- Frontend: React 18, Vite 5, react-router-dom, Leaflet + react-leaflet (OpenStreetMap)
- Backend: Node 20, Express 4, Mongoose 8 (MongoDB Atlas), Twilio, jsonwebtoken, bcryptjs, helmet, express-rate-limit
