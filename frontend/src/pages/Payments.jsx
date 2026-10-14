import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function Payments() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listPayments()
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="sub">Loading…</p>;

  return (
    <div>
      <h1>Payments</h1>
      <p className="sub">Insurance premium payments aur unke slips.</p>

      {error && <p className="err">{error}</p>}

      <div className="card">
        {rows.length === 0 ? (
          <p className="sub">Abhi koi payment nahi. Insurance tab se premium pay karein.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Payer</th><th>Trip</th><th>Amount</th><th>Status</th><th>Slip</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>{p.payerName} <span className="toll-amt">({p.payerRole})</span></td>
                  <td>{p.tripId || "—"}</td>
                  <td>{inr(p.amount)}</td>
                  <td>
                    <span className={"badge " + (p.status === "paid" ? "green" : p.status === "failed" ? "grey" : "amber")}>
                      {p.status}{p.simulated ? " (sim)" : ""}
                    </span>
                  </td>
                  <td>
                    {p.status === "paid" ? <Link to={`/slip/${p.id}`}>View slip →</Link> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
