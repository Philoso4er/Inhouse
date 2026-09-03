import { estimateShippingCents, getCostLookupProduct } from "./printify.js";
import { BLUEPRINT_ID, PRINT_PROVIDER_ID } from "../src/types.js";

// Retail = actual production cost + estimated shipping + a small flat
// margin. No multiplier — the price should track Printify's real cost per
// size/frame directly, with just a modest fee on top for running the app.
const FLAT_MARGIN_CENTS = Number(process.env.PRICE_FLAT_MARGIN_CENTS || "690"); // $6.90

export async function getLivePriceCents(variantId: number): Promise<{
  priceCents: number;
  costCents: number;
  shippingCents: number;
}> {
  const product = await getCostLookupProduct();

  const variant = (product.variants || []).find((v: any) => v.id === variantId);
  if (!variant || typeof variant.cost !== "number") {
    throw new Error(`Could not find live cost for variant ${variantId}`);
  }

  const costCents = variant.cost;
  const shippingCents = await estimateShippingCents(BLUEPRINT_ID, PRINT_PROVIDER_ID, variantId);
  const priceCents = costCents + shippingCents + FLAT_MARGIN_CENTS;

  return { priceCents, costCents, shippingCents };
}
