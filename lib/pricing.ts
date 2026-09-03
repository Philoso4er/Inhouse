import { getCostLookupProduct } from "./printify.js";

// Retail = production cost + shipping (estimated) + VAT (estimated) + a
// small flat margin.
//
// IMPORTANT: the live Printify shipping.json lookup for this blueprint/
// provider ("Printify Choice", auto-routing) has now been shown TWICE to
// return inaccurate numbers rather than failing loudly — a real order was
// charged $75.09 shipping, but the live API call returned $17.29 for the
// same size. Because "Printify Choice" doesn't commit to one real fulfiller
// until order time, its published shipping table doesn't reflect what
// actually gets charged. Trusting it silently under-prices every order.
//
// So shipping is NOT pulled live at all here — it's always estimated as a
// multiple of production cost, calibrated from one real fulfilled order
// (Production $47.76, Shipping $75.09 → ratio ≈ 1.57, rounded up to 1.6 for
// a small safety buffer). VAT rate (20%) was also confirmed against that
// same real order (VAT $24.56 on a $122.85 cost+shipping base ≈ 20.0%).
//
// This is still an estimate, calibrated from ONE real Medium-size order.
// Verify against a real Small and a real Large order (with the Printify
// card removed first, so nothing actually gets charged if something's
// still off — you'll see the failure at the fulfillment step instead) if
// you want this properly confirmed across your whole size range.
const SHIPPING_MULTIPLIER = Number(process.env.PRICE_SHIPPING_MULTIPLIER || "1.6");
const VAT_RATE = Number(process.env.PRICE_VAT_RATE || "0.2"); // 20% — confirmed against a real order
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
  const shippingCents = Math.round(costCents * SHIPPING_MULTIPLIER);
  const vatCents = Math.round((costCents + shippingCents) * VAT_RATE);
  const priceCents = costCents + shippingCents + vatCents + FLAT_MARGIN_CENTS;

  return { priceCents, costCents, shippingCents, vatCents };
}
