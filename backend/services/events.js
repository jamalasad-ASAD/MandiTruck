import { config } from "../config.js";
import { saveTrip } from "../db.js";
import { distanceKm } from "./geo.js";
import { notifyRecipients } from "./notify.js";
import { nextToll, currentPosition, totalTollPaid, fmtTime } from "./trips.js";

// Fired when the truck crosses a toll plaza -> client + vendor get SMS/WhatsApp/in-app.
export async function onTollCrossed(trip, toll) {
  const nxt = nextToll(trip);
  const recipients = [
    { role: "client", ...trip.client },
    { role: "vendor", ...trip.vendor }
  ];
  return notifyRecipients({
    trip,
    event: "toll_crossed",
    recipients,
    channels: ["sms", "whatsapp", "inapp"],
    buildMessage: () =>
      `MandiTruck: ${trip.truckNumber} ne ${toll.name} cross kiya (${fmtTime(toll.crossedAt)}). ` +
      `Next: ${nxt ? nxt.name : trip.destination.name}. Ab tak toll: Rs ${totalTollPaid(trip)}. ` +
      `Cargo: ${trip.cargo}.`
  });
}

// Fired once when the truck comes within NEAR_DEST_KM of the destination ->
// client + driver get a live-location link (OTP protected).
export async function checkNearDestination(trip) {
  const pos = currentPosition(trip);
  const d = distanceKm({ lat: pos.lat, lng: pos.lng }, trip.destination);
  if (d > config.nearDestKm || trip.nearDestNotified) return [];

  trip.nearDestNotified = true;
  await saveTrip(trip);

  const link = `${config.publicBaseUrl}/track/${trip.id}`;
  const recipients = [
    { role: "client", ...trip.client },
    { role: "driver", ...trip.driver }
  ];
  return notifyRecipients({
    trip,
    event: "near_destination",
    recipients,
    channels: ["sms", "whatsapp", "inapp"],
    buildMessage: () =>
      `MandiTruck: ${trip.truckNumber} destination ke paas hai (~${d.toFixed(1)} km from ${trip.destination.name}). ` +
      `Live location dekhne ke liye is link par jaayein (OTP lagega): ${link}`
  });
}
