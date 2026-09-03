import { estimateShippingCents, getCostLookupProduct } from "./printify.js";
import { BLUEPRINT_ID, PRINT_PROVIDER_ID } from "../src/types.js";

// Retail = production cost + shipping + estimated VAT + a small flat margin.
//
// IMPORTANT CONTEXT: a real fulfilled order showed Production $47.76 +
// Shipping $75.09 + VAT $24.56 = $147.41 total. Two things were previously
// missing from this calculation entirely:
//   1. VAT was never accounted for at all.
//   2. The live shipping lookup (estimateShippingCents) likely returns 0 for
//      the "Printify Choice" auto-routing provider, which doesn't appear to
//      expose a static shipping table the way a named provider does — the
//      same limitation we hit with cost, which needed a workaround.
// Pricing without these two produces a price far below Printify's real
// charge — a genuine risk of selling below cost, not just a thin margin.
//
// Until shipping is verified working for all three sizes, this uses a
// fallback: if the live shipping lookup returns 0, estimate shipping as a
// multiple of production cost, calibrated from the one real data point
// above (75.09 / 47.76 ≈ 1.57). VERIFY THIS AGAINST REAL TEST ORDERS FOR
// MEDIUM AND LARGE TOO before trusting it fully — shipping likely scales
// somewhat with size/weight, so a flat ratio from one Medium-size data
// point may not hold precisely for Small or Large.
const SHIPPING_FALLBACK_MULTIPLIER = Number(process.env.PRICE_SHIPPING_FALLBACK_MULTIPLIER || "1.6");
const VAT_RATE = Number(process.env.PRICE_VAT_RATE || "0.2"); // 20% — UK standard rate
const FLAT_MARGIN_CENTS = Number(process.env.PRICE_FLAT_MARGIN_CENTS || "690"); // $6.90

export async function getLivePriceCents(variantId: number): Promise<{
  priceCents: number;
  costCents: number;
  shippingCents: number;
  vatCents: number;
}> {
  const product = await getCostLookupProduct();

  const variant = (product.variants || []).find((v: any) => v.id === variantId);
  if (!variant || typeof variant.cost !== "number") {
    throw new Error(`Could not find live cost for variant ${variantId}`);
  }

  const costCents = variant.cost;

  let shippingCents = await estimateShippingCents(BLUEPRINT_ID, PRINT_PROVIDER_ID, variantId);
  if (shippingCents <= 0) {
    // Live lookup failed or returned nothing usable — fall back to the
    // calibrated estimate rather than pricing as if shipping were free.
    shippingCents = Math.round(costCents * SHIPPING_FALLBACK_MULTIPLIER);
  }

  const vatCents = Math.round((costCents + shippingCents) * VAT_RATE);
  const priceCents = costCents + shippingCents + vatCents + FLAT_MARGIN_CENTS;

  return { priceCents, costCents, shippingCents, vatCents };
}
