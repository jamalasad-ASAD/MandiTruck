// ---------------------------------------------------------------------------
// SAMPLE / MOCK DATA ONLY
// Route, toll plaza names, coordinates and toll amounts are illustrative
// placeholders for local testing. Replace with your real route + FASTag/toll
// data before going live. Phone numbers are placeholders — swap in real ones.
// ---------------------------------------------------------------------------

export const seedTrips = [
  {
    id: "TRK-1024",
    truckNumber: "MH-15-AB-1234",
    driver: { name: "Ramesh Patil", phone: "+919800000021" },
    vendor: { name: "Nashik Mandi Traders", phone: "+919800000101" },
    client: { name: "Vashi APMC Buyer", phone: "+919800000201" },
    cargo: "Tomato (Grade A)",
    cargoWeightKg: 8500,
    departure: "2026-10-12T05:30:00+05:30",
    expectedArrival: "2026-10-12T14:00:00+05:30",
    origin: { name: "Nashik APMC Mandi", lat: 19.9975, lng: 73.7898 },
    destination: { name: "Vashi APMC Mandi, Navi Mumbai", lat: 19.0771, lng: 72.9986 },
    route: [
      { lat: 19.9975, lng: 73.7898 },
      { lat: 19.85, lng: 73.7 },
      { lat: 19.6967, lng: 73.5626 },
      { lat: 19.6333, lng: 73.4833 },
      { lat: 19.45, lng: 73.33 },
      { lat: 19.3, lng: 73.1 },
      { lat: 19.2183, lng: 72.9781 },
      { lat: 19.14, lng: 72.99 },
      { lat: 19.0771, lng: 72.9986 }
    ],
    tolls: [
      { id: "T1", name: "Igatpuri Toll Plaza", lat: 19.6967, lng: 73.5626, amount: 145, crossed: true, crossedAt: "2026-10-12T06:40:00+05:30" },
      { id: "T2", name: "Kasara Toll Plaza", lat: 19.6333, lng: 73.4833, amount: 95, crossed: false, crossedAt: null },
      { id: "T3", name: "Shahapur Toll Plaza", lat: 19.45, lng: 73.33, amount: 110, crossed: false, crossedAt: null }
    ],
    nearDestNotified: false
  },
  {
    id: "TRK-2057",
    truckNumber: "MH-04-CD-7788",
    driver: { name: "Suresh Jadhav", phone: "+919800000022" },
    vendor: { name: "Lasalgaon Onion Growers", phone: "+919800000102" },
    client: { name: "Vashi APMC Buyer", phone: "+919800000202" },
    cargo: "Onion (Grade B)",
    cargoWeightKg: 9200,
    departure: "2026-10-12T04:00:00+05:30",
    expectedArrival: "2026-10-12T12:30:00+05:30",
    origin: { name: "Lasalgaon APMC Mandi", lat: 20.1436, lng: 74.2393 },
    destination: { name: "Vashi APMC Mandi, Navi Mumbai", lat: 19.0771, lng: 72.9986 },
    route: [
      { lat: 20.1436, lng: 74.2393 },
      { lat: 19.9975, lng: 73.7898 },
      { lat: 19.6967, lng: 73.5626 },
      { lat: 19.6333, lng: 73.4833 },
      { lat: 19.45, lng: 73.33 },
      { lat: 19.2183, lng: 72.9781 },
      { lat: 19.0771, lng: 72.9986 }
    ],
    tolls: [
      { id: "T1", name: "Nashik Toll Plaza", lat: 19.9975, lng: 73.7898, amount: 130, crossed: true, crossedAt: "2026-10-12T05:10:00+05:30" },
      { id: "T2", name: "Igatpuri Toll Plaza", lat: 19.6967, lng: 73.5626, amount: 145, crossed: true, crossedAt: "2026-10-12T06:20:00+05:30" },
      { id: "T3", name: "Kasara Toll Plaza", lat: 19.6333, lng: 73.4833, amount: 95, crossed: false, crossedAt: null },
      { id: "T4", name: "Shahapur Toll Plaza", lat: 19.45, lng: 73.33, amount: 110, crossed: false, crossedAt: null }
    ],
    nearDestNotified: false
  }
];
