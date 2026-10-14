import express from "express";
import { notificationsByTrip } from "../db.js";

const r = express.Router();

// In-app notification feed for a trip (polled by the dashboard)
r.get("/:tripId", async (req, res) => {
  res.json(await notificationsByTrip(req.params.tripId));
});

export default r;
