// Trip helpers — position/status are derived from which toll plazas were crossed.

export function currentPosition(trip) {
  // A live GPS ping (if present) wins over the toll-derived position.
  if (trip.livePosition && Number.isFinite(trip.livePosition.lat)) {
    return { lat: trip.livePosition.lat, lng: trip.livePosition.lng, label: "Live GPS position", lastToll: null };
  }
  const crossed = trip.tolls.filter((t) => t.crossed);
  if (crossed.length === 0) {
    return { lat: trip.origin.lat, lng: trip.origin.lng, label: `At origin: ${trip.origin.name}`, lastToll: null };
  }
  const last = crossed[crossed.length - 1];
  return { lat: last.lat, lng: last.lng, label: `Last crossed: ${last.name}`, lastToll: last };
}

export function tripStatus(trip) {
  const c = trip.tolls.filter((t) => t.crossed).length;
  if (c === 0) return "At origin";
  if (c === trip.tolls.length) return "Reached destination";
  return "In transit";
}

export function tripProgressPct(trip) {
  const c = trip.tolls.filter((t) => t.crossed).length;
  return Math.round((c / trip.tolls.length) * 100);
}

export function nextToll(trip) {
  return trip.tolls.find((t) => !t.crossed) || null;
}

export function totalTollPaid(trip) {
  return trip.tolls.filter((t) => t.crossed).reduce((s, t) => s + t.amount, 0);
}

// Simulate crossing the next toll plaza. In production this is driven by a
// FASTag / toll-gate webhook calling into the same pipeline.
export function advanceTrip(trip) {
  const next = nextToll(trip);
  if (!next) return { advanced: false, toll: null };
  next.crossed = true;
  next.crossedAt = new Date().toISOString();
  trip.livePosition = null; // fall back to the toll-derived position
  return { advanced: true, toll: next };
}

export function fmtTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
  } catch (_) {
    return iso;
  }
}
