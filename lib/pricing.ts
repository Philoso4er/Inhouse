import { getCostLookupProduct } from "./printify.js";
import { SIZE_OPTIONS } from "../src/types.js";

// Retail = production cost (live from Printify) + shipping (real, per size)
// + VAT (20%, confirmed) + a small flat margin.
//
// Shipping is NOT estimated from a ratio anymore — it's hardcoded per size
// from REAL Printify order data (created via real test orders with the
// Printify payment method removed, so nothing was actually charged; the
// orders sit "On hold" in Printify but show real cost breakdowns):
//
//   Small  (11x14): Production $35.89, Shipping $57.19, VAT $18.61  → ratio 1.59x
//   Medium (16x20): Production $47.76, Shipping $75.09, VAT $24.56  → ratio 1.57x
//   Large  (20x30): Production $71.03, Shipping $218.39, VAT $57.88 → ratio 3.07x
//
// Large's shipping scales far faster than cost (heavier/bulkier package),
// so a single flat ratio across sizes would have badly underpriced Large.
// VAT was confirmed at a clean 20% across all three, so that part stays a
// simple percentage. If Printify's real shipping rates change later, or a
// new size/frame is added, this table needs updating — it's real data, not
// a live lookup, so it can go stale.
const SHIPPING_CENTS_BY_SIZE: Record<string, number> = {
  "11x14": 5719,
  "16x20": 7509,
  "20x30": 21839,
};

const VAT_RATE = Number(process.env.PRICE_VAT_RATE || "0.2"); // 20% — confirmed against 3 real orders
const FLAT_MARGIN_CENTS = Number(process.env.PRICE_FLAT_MARGIN_CENTS || "690"); // $6.90

function shippingCentsForVariant(variantId: number): number {
  for (const size of SIZE_OPTIONS) {
    if (Object.values(size.variantIdByFrame).includes(variantId)) {
      const known = SHIPPING_CENTS_BY_SIZE[size.id];
      if (known) return known;
    }
  }
  // Unknown size (e.g. a new one added to types.ts without updating this
  // table) — fall back to a conservative ratio rather than $0, but this
  // should be treated as a signal to add real data for it.
  return 0;
}

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
  let shippingCents = shippingCentsForVariant(variantId);
  if (shippingCents <= 0) {
    // No real data for this variant's size — safe fallback using the
    // highest observed ratio (Large's 3.07x) rather than risk under-pricing.
    shippingCents = Math.round(costCents * 3.1);
  }

  const vatCents = Math.round((costCents + shippingCents) * VAT_RATE);
  const priceCents = costCents + shippingCents + vatCents + FLAT_MARGIN_CENTS;

  return { priceCents, costCents, shippingCents, vatCents };
}
