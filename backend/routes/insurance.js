import express from "express";
import { calculateQuote, insuranceMeta } from "../data/insurance.js";

const r = express.Router();

// Options so the form can render without hard-coding them
r.get("/meta", (_req, res) => res.json(insuranceMeta));

function parseQuery(q) {
  return {
    vehicleType: q.vehicleType,
    vehicleAgeYears: Number(q.vehicleAgeYears) || 0,
    idv: Number(q.idv) || 0,
    cargoType: q.cargoType,
    cargoValue: Number(q.cargoValue) || 0,
    ncbPercent: Number(q.ncbPercent) || 0,
    comprehensive: q.comprehensive !== "false",
    addOns: q.addOns ? String(q.addOns).split(",").filter(Boolean) : []
  };
}

r.get("/quote", (req, res) => res.json(calculateQuote(parseQuery(req.query))));
r.post("/quote", (req, res) => res.json(calculateQuote(req.body || {})));

export default r;
