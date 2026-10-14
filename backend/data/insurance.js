// ---------------------------------------------------------------------------
// Static (rule-based) insurance quote engine for goods/mandi trucks.
// Rates are illustrative sample values for local testing, NOT real market
// rates. Swap in your actual underwriting rules / insurer tariff before live.
// ---------------------------------------------------------------------------

export const insuranceMeta = {
  vehicleTypes: [
    { id: "lcv",     label: "LCV / Small Truck",     tp: 8000,  baseOdRate: 0.035 },
    { id: "truck2",  label: "Truck (2-axle)",        tp: 12000, baseOdRate: 0.033 },
    { id: "truck3",  label: "Truck (3-axle)",        tp: 16000, baseOdRate: 0.031 },
    { id: "trailer", label: "Trailer / Multi-axle",  tp: 18000, baseOdRate: 0.029 }
  ],
  cargoTypes: [
    { id: "perishable", label: "Perishable (fruits / vegetables)", cargoRate: 0.006 },
    { id: "durable",    label: "Durable goods",                    cargoRate: 0.004 },
    { id: "hazardous",  label: "Hazardous / fragile",              cargoRate: 0.009 }
  ],
  // rate = fraction of the Own-Damage premium; flat = fixed rupees
  addOns: [
    { id: "zeroDep", label: "Zero Depreciation",      rate: 0.15, flat: 0 },
    { id: "engine",  label: "Engine Protection",      rate: 0.08, flat: 0 },
    { id: "rsa",     label: "Roadside Assistance",    rate: 0,    flat: 1500 },
    { id: "cargo",   label: "Cargo Insurance",        rate: 0,    flat: 0 } // priced separately
  ],
  ncbOptions: [0, 20, 25, 35, 45, 50], // No-Claim Bonus % options
  gstRate: 0.18
};

function ageFactor(years) {
  const y = Number(years) || 0;
  if (y <= 1) return 1.0;
  if (y <= 3) return 0.88;
  if (y <= 5) return 0.78;
  if (y <= 8) return 0.68;
  return 0.6;
}

/**
 * @param {object} input
 * @param {string} input.vehicleType   id from insuranceMeta.vehicleTypes
 * @param {number} input.vehicleAgeYears
 * @param {number} input.idv            Insured Declared Value of the vehicle (Rs)
 * @param {string} input.cargoType     id from insuranceMeta.cargoTypes
 * @param {number} input.cargoValue    Value of goods being carried (Rs)
 * @param {number} input.ncbPercent    No-Claim Bonus %
 * @param {string[]} input.addOns      ids from insuranceMeta.addOns
 * @param {boolean} input.comprehensive true = own damage + third party
 */
export function calculateQuote(input = {}) {
  const vType = insuranceMeta.vehicleTypes.find((v) => v.id === input.vehicleType) || insuranceMeta.vehicleTypes[0];
  const cType = insuranceMeta.cargoTypes.find((c) => c.id === input.cargoType) || insuranceMeta.cargoTypes[0];
  const idv = Math.max(0, Number(input.idv) || 0);
  const cargoValue = Math.max(0, Number(input.cargoValue) || 0);
  const ncb = Math.min(50, Math.max(0, Number(input.ncbPercent) || 0));
  const addOns = Array.isArray(input.addOns) ? input.addOns : [];
  const comprehensive = input.comprehensive !== false; // default true

  const breakdown = [];

  // --- Own Damage premium (only for comprehensive cover) ---
  let odPremium = 0;
  if (comprehensive) {
    odPremium = idv * vType.baseOdRate * ageFactor(input.vehicleAgeYears);
    breakdown.push({ label: `Own Damage premium (${(vType.baseOdRate * 100).toFixed(1)}% of IDV, age-adjusted)`, amount: odPremium });
    if (ncb > 0) {
      const discount = odPremium * (ncb / 100);
      odPremium -= discount;
      breakdown.push({ label: `No-Claim Bonus discount (${ncb}%)`, amount: -discount });
    }
  } else {
    breakdown.push({ label: "Own Damage cover not included (Third-Party only)", amount: 0 });
  }

  // --- Third Party premium (fixed by vehicle class) ---
  breakdown.push({ label: "Third-Party liability premium", amount: vType.tp });

  // --- Add-ons ---
  let addOnTotal = 0;
  for (const id of addOns) {
    const a = insuranceMeta.addOns.find((x) => x.id === id);
    if (!a || a.id === "cargo") continue; // cargo handled separately
    const amt = a.rate ? odPremium * a.rate : a.flat;
    addOnTotal += amt;
    breakdown.push({ label: `Add-on: ${a.label}`, amount: amt });
  }

  // --- Cargo insurance (optional, priced on goods value) ---
  let cargoPremium = 0;
  if (addOns.includes("cargo") && cargoValue > 0) {
    cargoPremium = cargoValue * cType.cargoRate;
    breakdown.push({ label: `Cargo cover — ${cType.label} (${(cType.cargoRate * 100).toFixed(1)}% of goods value)`, amount: cargoPremium });
  }

  const netPremium = (comprehensive ? odPremium : 0) + vType.tp + addOnTotal + cargoPremium;
  const gst = netPremium * insuranceMeta.gstRate;
  const total = netPremium + gst;

  breakdown.push({ label: `GST @ ${(insuranceMeta.gstRate * 100).toFixed(0)}%`, amount: gst });

  return {
    input: { ...input, vehicleTypeLabel: vType.label, cargoTypeLabel: cType.label },
    breakdown,
    netPremium: round2(netPremium),
    gst: round2(gst),
    totalPremium: round2(total),
    totalPremiumRounded: Math.round(total)
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
