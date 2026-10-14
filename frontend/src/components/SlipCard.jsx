const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch (_) {
    return iso || "";
  }
};

export default function SlipCard({ slip }) {
  if (!slip) return null;

  return (
    <div className="slip" id="slip-print">
      <div className="slip-head">
        <div>
          <div className="slip-brand">🚚 MandiTruck</div>
          <div className="slip-sub">Insurance Premium — Payment Slip</div>
        </div>
        <div className="slip-no">
          <div className="slip-no-label">Slip No.</div>
          <div className="slip-no-val">{slip.slipNo}</div>
        </div>
      </div>

      {slip.simulated && <div className="slip-warn">SIMULATED / TEST PAYMENT — real gateway se nahi hua</div>}

      <div className="slip-body">
        <div className="slip-fields">
          <div className="row"><span className="k">Paid by</span><span className="v">{slip.payerName} ({slip.payerRole})</span></div>
          <div className="row"><span className="k">Phone</span><span className="v">{slip.payerPhone}</span></div>
          <div className="row"><span className="k">Truck</span><span className="v">{slip.truckNumber || "—"}</span></div>
          <div className="row"><span className="k">Route</span><span className="v">{slip.route || "—"}</span></div>
          <div className="row"><span className="k">Cover</span><span className="v">{slip.quoteSummary?.vehicleTypeLabel || "—"}</span></div>
          <div className="row"><span className="k">Cargo</span><span className="v">{slip.quoteSummary?.cargoTypeLabel || "—"}</span></div>
          <div className="row"><span className="k">Issued</span><span className="v">{fmtDate(slip.issuedAt)}</span></div>
          <div className="row"><span className="k">Payment ID</span><span className="v slip-mono">{slip.razorpayPaymentId || "—"}</span></div>
        </div>

        <div className="slip-qr">
          {slip.qrDataUrl ? <img src={slip.qrDataUrl} alt="Verify QR" width="150" height="150" /> : null}
          <div className="slip-qr-label">Scan to verify</div>
        </div>
      </div>

      <div className="slip-total">
        <span>Amount Paid</span>
        <span className="slip-amount">{inr(slip.amount)}</span>
      </div>

      <p className="slip-foot">
        Ye slip dispatch ke time driver ko di jaaye. QR scan karne par verification page khulta hai.
      </p>
    </div>
  );
}
