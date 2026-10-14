import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getQuote, legacyVariant } from "../lib/pricing.js";
import { availability, isSupportedCountry, regionForCountry } from "../src/providers.js";
import type { FrameFinish } from "../src/types.js";

// GET /api/get-price?sizeId=16x20&frame=black&country=GB
//   country defaults to the visitor's geolocation (x-vercel-ip-country).
// Legacy: GET /api/get-price?variantId=69667 (Printify Choice variant).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const geo = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
    const requested = String(req.query.country || "").toUpperCase();
    const country = requested || (isSupportedCountry(geo) ? geo : "GB");
    if (!isSupportedCountry(country)) {
      res.status(400).json({ error: `We don't ship to ${country} yet` });
      return;
    }

    let sizeId = String(req.query.sizeId || "");
    let frame = String(req.query.frame || "") as FrameFinish;
    let providerKey: "printifychoice_us" | undefined;
    if (!sizeId && req.query.variantId) {
      const legacy = legacyVariant(Number(req.query.variantId));
      if (!legacy) {
        res.status(400).json({ error: "Unknown variantId" });
        return;
      }
      ({ sizeId, frame } = legacy);
      providerKey = "printifychoice_us";
    }

    const avail = availability(country);
    if (!sizeId || !frame) {
      res.status(200).json({ country, geoCountry: geo || null, region: regionForCountry(country), availability: avail });
      return;
    }

    const quote = await getQuote(sizeId, frame, country, providerKey);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.status(200).json({ ...quote, geoCountry: geo || null, availability: avail });
  } catch (err: any) {
    console.error("get-price error:", err);
    res.status(500).json({ error: err.message || "Could not get live price" });
  }
}
