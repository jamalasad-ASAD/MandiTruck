import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import MapView from "../components/MapView.jsx";

export default function LiveTrack() {
  const { tripId } = useParams();
  const [step, setStep] = useState("phone"); // phone -> otp -> live
  const [access, setAccess] = useState(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [token, setToken] = useState("");
  const [live, setLive] = useState(null);
  const [devOtp, setDevOtp] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    api
      .trackAccess(tripId)
      .then(setAccess)
      .catch((e) => setError(e.message));
  }, [tripId]);

  // Poll live location while on the live step
  useEffect(() => {
    if (step !== "live" || !token) return;
    const load = () => api.live(tripId, token).then(setLive).catch((e) => setError(e.message));
    load();
    timer.current = setInterval(load, 20000);
    return () => clearInterval(timer.current);
  }, [step, token, tripId]);

  async function sendOtp(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const r = await api.requestOtp(tripId, phone.trim());
      setDevOtp(r.devOtp || "");
      setInfo(
        r.devOtp
          ? "Dev mode: Twilio set nahi hai, isliye OTP neeche dikhaya gaya hai."
          : `OTP bheja gaya ${r.phone} par.`
      );
      setStep("otp");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.verifyOtp(tripId, phone.trim(), otp.trim());
      setToken(r.token);
      setStep("live");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Live Location</h1>
      <p className="sub">
        {access ? `${access.truckNumber} — ${access.destination}` : "Loading…"}
      </p>

      {error && <p className="err">{error}</p>}
      {info && !error && <p className="hint">{info}</p>}

      {step === "phone" && (
        <div className="card" style={{ maxWidth: 460 }}>
          <h2>Step 1 · Verify your number</h2>
          <p className="sub">
            Sirf wahi numbers tracking dekh sakte hain jinko SMS/WhatsApp link mila tha:
          </p>
          <ul className="tolls">
            {(access?.allowed || []).map((a) => (
              <li key={a.role}>
                <span className="toll-name">
                  {a.name} <span className="toll-amt">({a.role})</span>
                </span>
                <span className="toll-amt">{a.phone}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={sendOtp} style={{ marginTop: 14 }}>
            <div className="field">
              <label>Your phone number (with country code)</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+9198xxxxxxxx"
                autoComplete="tel"
              />
            </div>
            <button className="btn-primary" type="submit" disabled={busy || !phone.trim()}>
              {busy ? "Sending…" : "Send OTP"}
            </button>
          </form>
        </div>
      )}

      {step === "otp" && (
        <div className="card" style={{ maxWidth: 460 }}>
          <h2>Step 2 · Enter OTP</h2>
          {devOtp && (
            <p className="hint">
              Dev OTP: <b>{devOtp}</b>
            </p>
          )}
          <form onSubmit={verify}>
            <div className="field">
              <label>OTP</label>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit code"
                inputMode="numeric"
                maxLength={6}
              />
            </div>
            <div className="btn-row">
              <button className="btn-primary" type="submit" disabled={busy || otp.trim().length < 4}>
                {busy ? "Verifying…" : "View live location"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setStep("phone"); setOtp(""); setError(""); }}>
                Change number
              </button>
            </div>
          </form>
        </div>
      )}

      {step === "live" && live && (
        <div className="grid two">
          <div className="card" style={{ padding: 12 }}>
            <MapView trip={live} />
            <p className="hint">Har 20 second me auto-refresh hota hai.</p>
          </div>
          <div className="card">
            <h2>Live status</h2>
            <div className="row"><span className="k">Truck</span><span className="v">{live.truckNumber}</span></div>
            <div className="row"><span className="k">Driver</span><span className="v">{live.driver.name}</span></div>
            <div className="row"><span className="k">Cargo</span><span className="v">{live.cargo}</span></div>
            <div className="row"><span className="k">Status</span><span className="v"><span className="badge amber">{live.status}</span></span></div>
            <div className="row"><span className="k">Current position</span><span className="v">{live.currentPosition.label}</span></div>
            <div className="row"><span className="k">Next toll</span><span className="v">{live.nextToll ? `${live.nextToll.name} (₹${live.nextToll.amount})` : "—"}</span></div>
            <div className="row"><span className="k">Toll paid</span><span className="v">₹{live.totalTollPaid}</span></div>
            <div className="row"><span className="k">Expected arrival</span><span className="v">{new Date(live.expectedArrival).toLocaleString("en-IN")}</span></div>
            <div className="progress"><span style={{ width: `${live.progressPct}%` }} /></div>
            <p className="hint">Updated: {new Date(live.updatedAt).toLocaleTimeString("en-IN")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
