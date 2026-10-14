import { useEffect, useState, useCallback } from "react";
import { api } from "../api.js";
import MapView from "../components/MapView.jsx";

const CHANNEL_LABEL = { sms: "SMS", whatsapp: "WhatsApp", inapp: "In-app" };
const EVENT_LABEL = { toll_crossed: "Toll crossed", near_destination: "Near destination" };

function ChannelChip({ channel, status }) {
  return (
    <span className={"chip " + channel + " " + status} title={`${CHANNEL_LABEL[channel]}: ${status}`}>
      {CHANNEL_LABEL[channel]}
    </span>
  );
}

export default function Tracking() {
  const [trips, setTrips] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [trip, setTrip] = useState(null);
  const [feed, setFeed] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async (id) => {
    if (!id) return;
    const [t, f] = await Promise.all([api.getTrip(id), api.notifications(id)]);
    setTrip(t);
    setFeed(f);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.listTrips();
        setTrips(list);
        if (list.length) {
          setSelectedId(list[0].id);
          await refresh(list[0].id);
        }
      } catch (e) {
        setError(e.message + " — backend chal raha hai?");
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  async function selectTrip(id) {
    setSelectedId(id);
    setAlerts([]);
    try {
      await refresh(id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function run(action) {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      const r = await action(selectedId);
      setAlerts(r.notifications || []);
      await refresh(selectedId);
      setTrips(await api.listTrips());
    } catch (e) {
      setError(e.message);
      setAlerts([]);
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/track/${selectedId}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (loading) return <p className="sub">Loading…</p>;

  return (
    <div>
      <h1>Toll-based Tracking</h1>
      <p className="sub">
        Toll cross hone par client + vendor ko alert jaata hai; destination ke paas pahunchne par
        client + driver ko OTP-protected live-location link milta hai.
      </p>

      {error && <p className="err">{error}</p>}

      <div className="field" style={{ maxWidth: 420 }}>
        <label>Trip / Truck select karein</label>
        <select value={selectedId || ""} onChange={(e) => selectTrip(e.target.value)}>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.truckNumber} — {t.origin} → {t.destination} ({t.status})
            </option>
          ))}
        </select>
      </div>

      {trip && (
        <>
          <div className="grid two">
            <div className="card" style={{ padding: 12 }}>
              <MapView trip={trip} />
              <div className="btn-row">
                <button className="btn-primary" onClick={() => run(api.advanceTrip)} disabled={busy || !trip.nextToll}>
                  {trip.nextToll ? `Cross next toll → ${trip.nextToll.name}` : "All tolls crossed"}
                </button>
                <button className="btn-ghost" onClick={() => run(api.simulateNear)} disabled={busy}>
                  Simulate near destination
                </button>
                <button className="btn-ghost" onClick={() => run(api.resetTrip)} disabled={busy}>
                  Reset
                </button>
              </div>
              <p className="hint">
                Live me toll events FASTag/toll-gate webhook se aayenge, aur position telematics device
                / driver app se — yahan testing ke liye buttons hain.
              </p>
            </div>

            <div>
              <div className="card">
                <h2>Trip details</h2>
                <div className="row"><span className="k">Truck</span><span className="v">{trip.truckNumber}</span></div>
                <div className="row"><span className="k">Cargo</span><span className="v">{trip.cargo}</span></div>
                <div className="row">
                  <span className="k">Status</span>
                  <span className="v"><span className={"badge " + (trip.status === "In transit" ? "amber" : "green")}>{trip.status}</span></span>
                </div>
                <div className="row"><span className="k">Current position</span><span className="v">{trip.currentPosition.label}</span></div>
                <div className="row"><span className="k">Next toll</span><span className="v">{trip.nextToll ? `${trip.nextToll.name} (₹${trip.nextToll.amount})` : "—"}</span></div>
                <div className="row"><span className="k">Toll paid so far</span><span className="v">₹{trip.totalTollPaid}</span></div>
                <div className="row">
                  <span className="k">Near-destination alert</span>
                  <span className="v">{trip.nearDestNotified ? "Sent ✓" : "Not yet"}</span>
                </div>
                <div className="progress"><span style={{ width: `${trip.progressPct}%` }} /></div>
                <div className="row">
                  <span className="k">Progress</span>
                  <span className="v">{trip.tolls.filter((t) => t.crossed).length}/{trip.tolls.length} tolls · {trip.progressPct}%</span>
                </div>
              </div>

              <div className="card">
                <h2>Who gets notified</h2>
                <div className="row"><span className="k">Vendor (toll alerts)</span><span className="v">{trip.vendor ? `${trip.vendor.name} · ${trip.vendor.phone}` : "—"}</span></div>
                <div className="row"><span className="k">Client (toll + live)</span><span className="v">{trip.client ? `${trip.client.name} · ${trip.client.phone}` : "—"}</span></div>
                <div className="row"><span className="k">Driver (live)</span><span className="v">{trip.driver.name} · {trip.driver.phone}</span></div>
                <div className="btn-row">
                  <button className="btn-ghost" onClick={copyLink}>{copied ? "Copied ✓" : "Copy tracking link"}</button>
                </div>
                <p className="hint">Tracking link client/driver ko SMS/WhatsApp pe jaata hai; kholne par OTP maangta hai.</p>
              </div>
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="card">
              <h2>Alerts triggered just now</h2>
              <ul className="feed">
                {alerts.map((a, i) => (
                  <li key={i}>
                    <span className="feed-event">{EVENT_LABEL[a.event] || a.event}</span>
                    <span className="feed-to">→ {a.recipientName} ({a.recipientRole})</span>
                    <ChannelChip channel={a.channel} status={a.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <h2>Toll plazas</h2>
            <ul className="tolls">
              {trip.tolls.map((t) => (
                <li key={t.id}>
                  <span className={"dot " + (t.crossed ? "done" : "todo")} />
                  <span className="toll-name">{t.name}</span>
                  <span className="toll-amt">₹{t.amount} {t.crossed ? "✓" : ""}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h2>Notification log (in-app feed)</h2>
            {feed.length === 0 ? (
              <p className="sub">Abhi koi notification nahi. Toll cross ya near-destination trigger karein.</p>
            ) : (
              <ul className="feed">
                {feed.map((n) => (
                  <li key={n.id}>
                    <span className="feed-event">{EVENT_LABEL[n.event] || n.event}</span>
                    <span className="feed-to">→ {n.recipientName} ({n.recipientRole})</span>
                    <ChannelChip channel={n.channel} status={n.status} />
                    <span className="feed-time">{new Date(n.createdAt).toLocaleTimeString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
