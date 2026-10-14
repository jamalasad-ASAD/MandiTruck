import express from "express";
import { allTrips, findTrip, saveTrip } from "../db.js";
import {
  currentPosition,
  tripStatus,
  tripProgressPct,
  nextToll,
  totalTollPaid,
  advanceTrip
} from "../services/trips.js";
import { onTollCrossed, checkNearDestination } from "../services/events.js";
import { distanceKm } from "../services/geo.js";
import { config } from "../config.js";

const r = express.Router();

const maskPhone = (p = "") => p.replace(/.(?=.{3})/g, "\u2022");

function publicTrip(trip) {
  const pos = currentPosition(trip);
  const nxt = nextToll(trip);
  return {
    id: trip.id,
    truckNumber: trip.truckNumber,
    driver: { name: trip.driver.name, phone: maskPhone(trip.driver.phone) },
    vendor: trip.vendor ? { name: trip.vendor.name, phone: maskPhone(trip.vendor.phone) } : null,
    client: trip.client ? { name: trip.client.name, phone: maskPhone(trip.client.phone) } : null,
    cargo: trip.cargo,
    cargoWeightKg: trip.cargoWeightKg,
    departure: trip.departure,
    expectedArrival: trip.expectedArrival,
    origin: trip.origin,
    destination: trip.destination,
    route: trip.route,
    tolls: trip.tolls,
    status: tripStatus(trip),
    progressPct: tripProgressPct(trip),
    currentPosition: { lat: pos.lat, lng: pos.lng, label: pos.label },
    nextToll: nxt ? { id: nxt.id, name: nxt.name, lat: nxt.lat, lng: nxt.lng, amount: nxt.amount } : null,
    totalTollPaid: totalTollPaid(trip),
    nearDestNotified: !!trip.nearDestNotified
  };
}

const slimNotification = (n) => ({
  event: n.event,
  recipientRole: n.recipientRole,
  recipientName: n.recipientName,
  channel: n.channel,
  message: n.message,
  status: n.status,
  error: n.error || undefined
});

// List all trips (summary)
r.get("/", async (_req, res) => {
  const trips = await allTrips();
  res.json(
    trips.map((t) => ({
      id: t.id,
      truckNumber: t.truckNumber,
      driver: t.driver.name,
      origin: t.origin.name,
      destination: t.destination.name,
      cargo: t.cargo,
      status: tripStatus(t),
      progressPct: tripProgressPct(t),
      tollsCrossed: t.tolls.filter((x) => x.crossed).length,
      tollsTotal: t.tolls.length,
      nearDestNotified: !!t.nearDestNotified
    }))
  );
});

// Full detail for one trip
r.get("/:id", async (req, res) => {
  const trip = await findTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "Trip not found" });
  res.json(publicTrip(trip));
});

// Simulate crossing the next toll plaza.
// Fires the toll-cross alert (client + vendor) and, if the truck is now close
// to the destination, the near-destination alert (client + driver).
r.post("/:id/advance", async (req, res) => {
  const trip = await findTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  const { advanced, toll } = advanceTrip(trip);
  if (!advanced) return res.status(400).json({ error: "Truck has already crossed all toll plazas" });
  await saveTrip(trip);

  const notifications = [];
  notifications.push(...(await onTollCrossed(trip, toll)));
  notifications.push(...(await checkNearDestination(trip)));

  res.json({
    advanced: true,
    crossedToll: toll,
    trip: publicTrip(trip),
    notifications: notifications.map(slimNotification)
  });
});

// Reset a trip to its starting state
r.post("/:id/reset", async (req, res) => {
  const trip = await findTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  trip.tolls.forEach((t) => {
    t.crossed = false;
    t.crossedAt = null;
  });
  trip.nearDestNotified = false;
  trip.livePosition = null;
  await saveTrip(trip);
  res.json({ reset: true, trip: publicTrip(trip) });
});

// Live GPS ping. In production your telematics device / driver app posts here
// (or a FASTag/toll webhook calls advance). This drives the geofence check.
r.post("/:id/position", async (req, res) => {
  const { lat, lng } = req.body || {};
  const trip = await findTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "Trip not found" });
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return res.status(400).json({ error: "lat and lng (numbers) required" });
  }

  trip.livePosition = { lat: Number(lat), lng: Number(lng) };
  await saveTrip(trip);

  const notifications = await checkNearDestination(trip);
  res.json({
    ok: true,
    trip: publicTrip(trip),
    distanceToDestinationKm: Number(distanceKm(trip.livePosition, trip.destination).toFixed(1)),
    notifications: notifications.map(slimNotification)
  });
});

// Demo helper: place the truck just inside the geofence radius.
r.post("/:id/simulate-near", async (req, res) => {
  const trip = await findTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  const dest = trip.destination;
  const from = trip.route[trip.route.length - 2] || trip.origin; // point just before destination
  const segKm = Math.max(0.001, distanceKm(from, dest));
  const targetKm = Math.max(1, config.nearDestKm - 3);
  const frac = Math.min(0.95, targetKm / segKm);
  trip.livePosition = {
    lat: dest.lat + (from.lat - dest.lat) * frac,
    lng: dest.lng + (from.lng - dest.lng) * frac
  };
  await saveTrip(trip);

  const notifications = await checkNearDestination(trip);
  res.json({
    ok: true,
    trip: publicTrip(trip),
    distanceToDestinationKm: Number(distanceKm(trip.livePosition, dest).toFixed(1)),
    notifications: notifications.map(slimNotification)
  });
});

export default r;
