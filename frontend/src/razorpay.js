// Razorpay Checkout loader + opener.

export function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Razorpay checkout script load nahi hua"));
    document.body.appendChild(s);
  });
}

/**
 * Opens Razorpay Checkout for an already-created order.
 * @param {object} o
 * @param {string} o.keyId        Razorpay key id (from the backend)
 * @param {string} o.orderId      order id created server-side
 * @param {number} o.amountPaise
 * @param {string} o.currency
 * @param {object} o.prefill      { name, contact, email }
 * @param {Function} o.onSuccess  (response) => void  — response carries the signature
 * @param {Function} o.onDismiss  (reason?) => void
 */
export async function openCheckout({ keyId, orderId, amountPaise, currency, prefill, onSuccess, onDismiss }) {
  await loadRazorpay();
  const rzp = new window.Razorpay({
    key: keyId,
    order_id: orderId,
    amount: amountPaise,
    currency,
    name: "MandiTruck",
    description: "Insurance premium",
    prefill: prefill || {},
    theme: { color: "#2fbf71" },
    handler: (response) => onSuccess(response),
    modal: { ondismiss: () => onDismiss && onDismiss() }
  });
  rzp.on("payment.failed", (r) => onDismiss && onDismiss(r?.error?.description || "Payment failed"));
  rzp.open();
}
