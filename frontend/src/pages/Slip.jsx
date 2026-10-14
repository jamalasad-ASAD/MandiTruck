import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, downloadFile } from "../api.js";
import SlipCard from "../components/SlipCard.jsx";

export default function Slip() {
  const { paymentId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.getPayment(paymentId).then(setData).catch((e) => setError(e.message));
  }, [paymentId]);

  if (error) return <p className="err">{error}</p>;
  if (!data) return <p className="sub">Loading…</p>;

  const { payment, slip } = data;

  async function downloadPdf() {
    setBusy("pdf");
    setMsg("");
    try {
      await downloadFile(`/api/payments/${paymentId}/slip/pdf`, `${slip.slipNo}.pdf`);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy("");
    }
  }

  async function sendOnWhatsapp() {
    setBusy("send");
    setMsg("");
    try {
      const r = await api.sendSlip(paymentId, ["payer", "driver"]);
      const sent = r.sent.filter((s) => s.status === "sent").length;
      const skipped = r.sent.filter((s) => s.status !== "sent").length;
      if (sent) {
        setMsg(`${sent} message bheja gaya${r.mediaAttached ? " (PDF attach)" : " (PDF ke bina — API_PUBLIC_URL set nahi)"}.${skipped ? ` ${skipped} skipped.` : ""}`);
      } else {
        setMsg(`Koi message nahi gaya — Twilio configured hai? (${r.sent[0]?.error || "unknown"})`);
      }
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <h1>Payment Slip</h1>
      <p className="sub">
        {payment.status === "paid"
          ? "Driver ko dispatch ke time ye slip dein."
          : "Payment abhi complete nahi hua."}
      </p>

      <div className="btn-row no-print" style={{ marginTop: 0 }}>
        {slip && (
          <>
            <button className="btn-primary" onClick={() => window.print()}>Print</button>
            <button className="btn-ghost" onClick={downloadPdf} disabled={busy === "pdf"}>
              {busy === "pdf" ? "Preparing…" : "Download PDF"}
            </button>
            <button className="btn-ghost" onClick={sendOnWhatsapp} disabled={busy === "send"}>
              {busy === "send" ? "Sending…" : "Send on WhatsApp"}
            </button>
          </>
        )}
        <Link className="btn-link" to="/payments">← All payments</Link>
      </div>

      {msg && <p className="hint no-print">{msg}</p>}

      {slip ? <SlipCard slip={slip} /> : <p className="sub">Is payment ke liye slip nahi mili.</p>}
    </div>
  );
}
