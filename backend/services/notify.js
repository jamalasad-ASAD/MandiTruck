import { config, twilioConfigured } from "../config.js";
import { addNotification } from "../db.js";

if (!twilioConfigured()) {
  console.warn("[notify] Twilio not configured — SMS/WhatsApp will be recorded as 'skipped'");
}

// Load the Twilio SDK lazily, only when creds exist and a message is actually
// being sent. Keeps startup fast and avoids pulling the SDK in local dev.
let clientPromise = null;
async function getClient() {
  if (!twilioConfigured()) return null;
  if (!clientPromise) {
    clientPromise = import("twilio").then((m) =>
      m.default(config.twilio.accountSid, config.twilio.authToken)
    );
  }
  return clientPromise;
}

// --- channels ---------------------------------------------------------------
async function sendSms(to, body) {
  const client = await getClient();
  if (!client) return { status: "skipped", error: "Twilio not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing)" };
  if (!config.twilio.smsFrom) return { status: "skipped", error: "TWILIO_SMS_FROM missing" };
  try {
    const m = await client.messages.create({ from: config.twilio.smsFrom, to, body });
    return { status: "sent", providerId: m.sid };
  } catch (e) {
    return { status: "failed", error: e.message };
  }
}

async function sendWhatsapp(to, body, mediaUrl) {
  const client = await getClient();
  if (!client) return { status: "skipped", error: "Twilio not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing)" };
  if (!config.twilio.whatsappFrom) return { status: "skipped", error: "TWILIO_WHATSAPP_FROM missing" };
  try {
    const params = {
      from: `whatsapp:${config.twilio.whatsappFrom}`,
      to: `whatsapp:${to}`,
      body
    };
    // Attach the slip PDF as a WhatsApp document when we have a public URL.
    if (mediaUrl) params.mediaUrl = [mediaUrl];
    const m = await client.messages.create(params);
    return { status: "sent", providerId: m.sid };
  } catch (e) {
    // NOTE: business-initiated WhatsApp messages outside the 24h window need an
    // approved template. During Twilio sandbox testing, join the sandbox first.
    return { status: "failed", error: e.message };
  }
}

// In-app: nothing to send — the record itself is the notification; the
// dashboard polls /api/notifications/:tripId to display it.
async function sendInApp() {
  return { status: "sent", providerId: "" };
}

const CHANNELS = { sms: sendSms, whatsapp: sendWhatsapp, inapp: sendInApp };

export async function send({ channel, to, body, mediaUrl }) {
  const fn = CHANNELS[channel];
  if (!fn) return { status: "failed", error: `unknown channel: ${channel}` };
  // Only WhatsApp supports media attachments here.
  return channel === "whatsapp" ? fn(to, body, mediaUrl) : fn(to, body);
}

// --- fan-out ----------------------------------------------------------------
/**
 * Sends one message per (recipient x channel) and records every attempt.
 * @param {object}   args
 * @param {object}   args.trip
 * @param {string}   args.event      'toll_crossed' | 'near_destination'
 * @param {Array}    args.recipients [{role, name, phone}]
 * @param {string[]} args.channels   ['sms','whatsapp','inapp']
 * @param {Function} args.buildMessage (recipient, trip) => string
 */
export async function notifyRecipients({ trip, event, recipients, channels, buildMessage }) {
  const results = [];
  for (const r of recipients) {
    if (!r || !r.phone) continue;
    const message = buildMessage(r, trip);
    for (const channel of channels) {
      const res = await send({ channel, to: r.phone, body: message });
      if (res.status !== "sent" && channel !== "inapp") {
        console.log(`[notify] ${event} -> ${channel} to ${r.phone}: ${res.status} (${res.error || ""})`);
      }
      results.push(
        await addNotification({
          tripId: trip.id,
          event,
          recipientRole: r.role,
          recipientName: r.name,
          phone: r.phone,
          channel,
          message,
          status: res.status,
          providerId: res.providerId || "",
          error: res.error || ""
        })
      );
    }
  }
  return results;
}
