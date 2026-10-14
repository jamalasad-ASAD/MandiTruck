import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadFile } from "../api.js";
import { openCheckout } from "../razorpay.js";
import SlipCard from "../components/SlipCard.jsx";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function Insurance() {
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState({
    vehicleType: "truck2",
    vehicleAgeYears: 2,
    idv: 1200000,
    comprehensive: true,
    cargoType: "perishable",
    cargoValue: 300000,
    ncbPercent: 0,
    addOns: ["rsa"]
  });
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // payment
  const [trips, setTrips] = useState([]);
  const [payerRole, setPayerRole] = useState("vendor");
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [tripId, setTripId] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [slip, setSlip] = useState(null);

  useEffect(() => {
    api.insuranceMeta().then(setMeta).catch((e) => setError(e.message + " — backend chal raha hai?"));
    api.listTrips().then(setTrips).catch(() => {});
  }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function toggleAddOn(id) {
    setForm((f) => ({
      ...f,
      addOns: f.addOns.includes(id) ? f.addOns.filter((x) => x !== id) : [...f.addOns, id]
    }));
  }

  async function getQuote(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSlip(null);
    try {
      const q = await api.quote({
        ...form,
        vehicleAgeYears: Number(form.vehicleAgeYears),
        idv: Number(form.idv),
        cargoValue: Number(form.cargoValue),
        ncbPercent: Number(form.ncbPercent)
      });
      setQuote(q);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function payNow(e) {
    e.preventDefault();
    if (!quote) return;
    if (!payerName.trim() || !payerPhone.trim()) {
      setPayError("Payer ka naam aur phone bharein.");
      return;
    }
    setPaying(true);
    setPayError("");
    setSlip(null);

    try {
      const r = await api.createOrder({
        quoteInput: form,
        payerRole,
        payerName: payerName.trim(),
        payerPhone: payerPhone.trim(),
        tripId: tripId || null
      });

      if (r.simulated) {
        // Dev: no Razorpay keys — complete locally so you can test the slip.
        const s = await api.simulatePayment(r.paymentDbId);
        setSlip(s.slip);
        setPaying(false);
        return;
      }

      await openCheckout({
        keyId: r.keyId,
        orderId: r.orderId,
        amountPaise: r.amount,
        currency: r.currency,
        prefill: { name: payerName.trim(), contact: payerPhone.trim() },
        onSuccess: async (resp) => {
          try {
            const v = await api.verifyPayment({ paymentDbId: r.paymentDbId, ...resp });
            setSlip(v.slip);
          } catch (err) {
            setPayError(err.message);
          } finally {
            setPaying(false);
          }
        },
        onDismiss: (reason) => {
          if (reason) setPayError(reason);
          setPaying(false);
        }
      });
    } catch (err) {
      setPayError(err.message);
      setPaying(false);
    }
  }

  if (!meta) return <p className="sub">Loading…</p>;

  return (
    <div>
      <h1>Insurance Quote & Payment</h1>
      <p className="sub">Quote nikalo, premium pay karo, aur driver ke liye payment slip generate karo.</p>

      {error && <p className="err">{error}</p>}

      <div className="grid two">
        <form className="card" onSubmit={getQuote}>
          <h2>Vehicle & cover details</h2>

          <div className="form-grid">
            <div className="field">
              <label>Vehicle type</label>
              <select value={form.vehicleType} onChange={(e) => set("vehicleType", e.target.value)}>
                {meta.vehicleTypes.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Vehicle age (years)</label>
              <input type="number" min="0" max="30" value={form.vehicleAgeYears} onChange={(e) => set("vehicleAgeYears", e.target.value)} />
            </div>
            <div className="field">
              <label>Vehicle value / IDV (₹)</label>
              <input type="number" min="0" step="10000" value={form.idv} onChange={(e) => set("idv", e.target.value)} />
            </div>
            <div className="field">
              <label>No-Claim Bonus</label>
              <select value={form.ncbPercent} onChange={(e) => set("ncbPercent", e.target.value)}>
                {meta.ncbOptions.map((n) => <option key={n} value={n}>{n}%{n === 0 ? " (none)" : ""}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Cargo type</label>
              <select value={form.cargoType} onChange={(e) => set("cargoType", e.target.value)}>
                {meta.cargoTypes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Cargo / goods value (₹)</label>
              <input type="number" min="0" step="10000" value={form.cargoValue} onChange={(e) => set("cargoValue", e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Cover type</label>
            <div className="check">
              <input type="checkbox" id="comp" checked={form.comprehensive} onChange={(e) => set("comprehensive", e.target.checked)} />
              <label htmlFor="comp" style={{ margin: 0, color: "var(--text)" }}>
                Comprehensive (Own Damage + Third Party). Uncheck for Third-Party only.
              </label>
            </div>
          </div>

          <div className="field">
            <label>Add-ons</label>
            {meta.addOns.map((a) => (
              <div className="check" key={a.id}>
                <input type="checkbox" id={"ao-" + a.id} checked={form.addOns.includes(a.id)} onChange={() => toggleAddOn(a.id)} />
                <label htmlFor={"ao-" + a.id} style={{ margin: 0, color: "var(--text)" }}>{a.label}</label>
              </div>
            ))}
          </div>

          <div className="btn-row">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Calculating…" : "Get quote"}</button>
          </div>
        </form>

        <div>
          <div className="card">
            <h2>Estimated premium</h2>
            {!quote ? (
              <p className="sub">Details bharein aur "Get quote" dabayein.</p>
            ) : (
              <>
                <div className="premium-total">{inr(quote.totalPremiumRounded)}</div>
                <p className="sub" style={{ margin: 0 }}>{quote.input.vehicleTypeLabel} · {quote.input.cargoTypeLabel}</p>
                <div className="breakdown">
                  {quote.breakdown.map((b, i) => (
                    <div className="row" key={i}>
                      <span className="k">{b.label}</span>
                      <span className={"v" + (b.amount < 0 ? " neg" : "")}>{inr(b.amount)}</span>
                    </div>
                  ))}
                  <div className="row">
                    <span className="k"><b>Total (incl. GST)</b></span>
                    <span className="v"><b>{inr(quote.totalPremiumRounded)}</b></span>
                  </div>
                </div>
                <p className="hint">Indicative estimate (sample rates).</p>
              </>
            )}
          </div>

          {quote && !slip && (
            <form className="card" onSubmit={payNow}>
              <h2>Pay premium</h2>
              <div className="form-grid">
                <div className="field">
                  <label>Kaun pay kar raha hai?</label>
                  <select value={payerRole} onChange={(e) => setPayerRole(e.target.value)}>
                    <option value="vendor">Vendor (mandi) — slip dispatch ke time driver ko</option>
                    <option value="client">Client (buyer)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Trip (optional — slip pe truck dikhega)</label>
                  <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
                    <option value="">— koi nahi —</option>
                    {trips.map((t) => <option key={t.id} value={t.id}>{t.truckNumber} ({t.id})</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Payer name</label>
                  <input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Nashik Mandi Traders" />
                </div>
                <div className="field">
                  <label>Payer phone</label>
                  <input value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} placeholder="+9198xxxxxxxx" />
                </div>
              </div>

              {payError && <p className="err">{payError}</p>}

              <div className="btn-row">
                <button className="btn-primary" type="submit" disabled={paying}>
                  {paying ? "Processing…" : `Pay ${inr(quote.totalPremiumRounded)}`}
                </button>
              </div>
              <p className="hint">Razorpay checkout khulega. Payment confirm hone par slip generate hogi.</p>
            </form>
          )}

          {slip && (
            <div className="card">
              <h2>Payment successful ✓</h2>
              <p className="sub">Slip generate ho gayi. Driver ko dena hai.</p>
              <div className="btn-row no-print" style={{ marginTop: 0, marginBottom: 14 }}>
                <Link className="btn-link" to={`/slip/${slip.paymentId}`}>Open printable slip →</Link>
                <button
                  className="btn-ghost"
                  onClick={() => downloadFile(`/api/payments/${slip.paymentId}/slip/pdf`, `${slip.slipNo}.pdf`)}
                >
                  Download PDF
                </button>
                <button className="btn-ghost" onClick={() => window.print()}>Print</button>
              </div>
              <SlipCard slip={slip} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
