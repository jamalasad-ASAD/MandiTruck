import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, publicSlipPdfUrl } from "../api.js";
import SlipCard from "../components/SlipCard.jsx";

// PUBLIC page — what the driver sees after scanning the slip QR.
export default function VerifySlip() {
  const { slipNo } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t") || "";

  const [slip, setSlip] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("Verification token missing — QR dobara scan karein.");
      setLoading(false);
      return;
    }
    api
      .getSlip(slipNo, token)
      .then(setSlip)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slipNo, token]);

  if (loading) return <p className="sub">Verifying…</p>;

  return (
    <div>
      <h1>Slip Verification</h1>

      {error ? (
        <>
          <p className="err">{error}</p>
          <p className="sub">Ye slip verify nahi ho payi. Number aur QR check karein.</p>
        </>
      ) : (
        <>
          <p className="badge green" style={{ fontSize: 14, padding: "6px 14px" }}>✓ VALID SLIP</p>
          <p className="sub" style={{ marginTop: 12 }}>
            Ye MandiTruck se issued ek authentic payment slip hai.
          </p>
          <div className="btn-row no-print" style={{ marginTop: 0 }}>
            <a className="btn-link" href={publicSlipPdfUrl(slipNo, token)} target="_blank" rel="noreferrer">
              Download PDF
            </a>
          </div>
          <SlipCard slip={slip} />
        </>
      )}
    </div>
  );
}
