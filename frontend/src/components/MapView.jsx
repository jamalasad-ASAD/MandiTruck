import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// Auto-zoom the map to fit the whole route
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points && points.length > 1) {
      map.fitBounds(
        points.map((p) => [p.lat, p.lng]),
        { padding: [45, 45] }
      );
    }
  }, [points, map]);
  return null;
}

const truckIcon = L.divIcon({
  className: "",
  html:
    '<div style="font-size:22px;line-height:30px;text-align:center;width:34px;height:34px;' +
    'background:#2fbf71;border:3px solid #0f1720;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.5)">🚚</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

export default function MapView({ trip }) {
  if (!trip) return <div className="map-wrap" />;

  const routePoints = trip.route.map((p) => [p.lat, p.lng]);

  return (
    <div className="map-wrap">
      <MapContainer center={[19.5, 73.4]} zoom={8} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds points={trip.route} />

        {/* Route line */}
        <Polyline positions={routePoints} pathOptions={{ color: "#2fbf71", weight: 4, opacity: 0.8 }} />

        {/* Origin */}
        <CircleMarker
          center={[trip.origin.lat, trip.origin.lng]}
          radius={8}
          pathOptions={{ color: "#0f1720", fillColor: "#93a4b5", fillOpacity: 1, weight: 2 }}
        >
          <Popup>
            <b>Origin</b>
            <br />
            {trip.origin.name}
          </Popup>
        </CircleMarker>

        {/* Destination */}
        <CircleMarker
          center={[trip.destination.lat, trip.destination.lng]}
          radius={8}
          pathOptions={{ color: "#0f1720", fillColor: "#f0a500", fillOpacity: 1, weight: 2 }}
        >
          <Popup>
            <b>Destination</b>
            <br />
            {trip.destination.name}
          </Popup>
        </CircleMarker>

        {/* Toll plazas — green = crossed, grey = pending */}
        {trip.tolls.map((t) => (
          <CircleMarker
            key={t.id}
            center={[t.lat, t.lng]}
            radius={7}
            pathOptions={{
              color: "#0f1720",
              fillColor: t.crossed ? "#2fbf71" : "#55667a",
              fillOpacity: 1,
              weight: 2
            }}
          >
            <Popup>
              <b>{t.name}</b>
              <br />
              Toll: ₹{t.amount}
              <br />
              Status: {t.crossed ? "Crossed" : "Pending"}
              {t.crossedAt ? (
                <>
                  <br />
                  {new Date(t.crossedAt).toLocaleString("en-IN")}
                </>
              ) : null}
            </Popup>
          </CircleMarker>
        ))}

        {/* Current truck position = last crossed toll (or origin) */}
        <Marker position={[trip.currentPosition.lat, trip.currentPosition.lng]} icon={truckIcon}>
          <Popup>
            <b>{trip.truckNumber}</b>
            <br />
            {trip.currentPosition.label}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
