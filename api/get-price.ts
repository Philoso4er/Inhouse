import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getLivePriceCents } from "../lib/pricing.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const variantId = Number(req.query.variantId);
    if (!variantId) {
      res.status(400).json({ error: "Missing variantId" });
      return;
    }

    const result = await getLivePriceCents(variantId);
    res.status(200).json(result);
  } catch (err: any) {
    console.error("get-price error:", err);
    res.status(500).json({ error: err.message || "Could not get live price" });
  }
}
