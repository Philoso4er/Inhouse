import { convertFromUsdCents, currencyForCountry } from "./currency.js";
import { getShippingProfiles, getVariantCosts, shippingCostFromProfiles } from "./printify.js";
import {
  PROVIDERS,
  candidateProviders,
  regionForCountry,
  type PrintArea,
  type ProviderConfig,
  type ProviderKey,
} from "../src/providers.js";
import type { FrameFinish } from "../src/types.js";

// ---- Pricing model -------------------------------------------------------
// price = (Printify production cost + Printify shipping to the customer's
//          country + VAT charged by Printify + Stripe fixed fee)
//         / (1 - Stripe % fee - GROSS_MARGIN)
// rounded UP to the next .99. Cost and shipping are fetched live from
// Printify per provider and country (cached ~1h, see lib/printify.ts), with
// the values in src/providers.ts as a fallback if Printify is unreachable.
//
// Single knob: the gross margin kept after all costs and Stripe fees.
export const GROSS_MARGIN = 0.3;
// Stripe UK standard card pricing: 1.5% + 20p (https://stripe.com/gb/pricing).
export const STRIPE_PERCENT_FEE = 0.015;
// Checkout is charged in USD (Printify bills in USD), so the 20p fixed fee is
// expressed in US cents. 20p ≈ $0.27 at ~1.34 USD/GBP.
export const STRIPE_FIXED_FEE_CENTS = 27;
// Printify charged 20% VAT on cost + shipping on real test orders for this
// (UK-based) shop. Applied to every region to avoid under-pricing.
const VAT_RATE = Number(process.env.PRICE_VAT_RATE || "0.2");

/** Round up to the next whole-unit-minus-one price, e.g. 19140 -> 19199. */
export function roundToNinetyNine(cents: number): number {
  return Math.ceil((cents + 1) / 100) * 100 - 1;
}

export function computePriceCents(costCents: number, shippingCents: number) {
  const vatCents = Math.round((costCents + shippingCents) * VAT_RATE);
  const totalCostCents = costCents + shippingCents + vatCents + STRIPE_FIXED_FEE_CENTS;
  const raw = totalCostCents / (1 - STRIPE_PERCENT_FEE - GROSS_MARGIN);
  const priceCents = roundToNinetyNine(Math.ceil(raw));
  const stripeFeeCents = Math.round(priceCents * STRIPE_PERCENT_FEE) + STRIPE_FIXED_FEE_CENTS;
  return { priceCents, vatCents, stripeFeeCents };
}

export interface Quote {
  /** Price in minor units of `currency` — what is displayed and charged. */
  priceCents: number;
  currency: string;
  /** Same price in US cents (Printify's billing currency), for comparison. */
  priceUsdCents: number;
  costCents: number;
  shippingCents: number;
  vatCents: number;
  stripeFeeCents: number;
  country: string;
  region: string;
  provider: { key: ProviderKey; name: string; location: string };
  blueprintId: number;
  printProviderId: number;
  variantId: number;
  printArea: PrintArea;
  live: boolean; // false if any fallback value was used
}

async function quoteProvider(
  provider: ProviderConfig,
  sizeId: string,
  frame: FrameFinish,
  country: string
): Promise<Quote | null> {
  const variant = provider.variants[sizeId]?.[frame];
  if (!variant) return null;
  let live = true;

  let costCents = variant.fallbackCostCents;
  try {
    const productId = process.env[provider.costLookupProductEnv] || provider.defaultCostLookupProductId;
    if (!productId) throw new Error(`${provider.costLookupProductEnv} not set`);
    const cost = (await getVariantCosts(productId)).get(variant.variantId);
    if (typeof cost !== "number") throw new Error(`no cost for ${variant.variantId}`);
    costCents = cost;
  } catch (err: any) {
    live = false;
    console.warn(`pricing: cost fallback for ${provider.key}/${variant.variantId}:`, err.message);
  }

  const home = regionForCountry(country) === provider.region;
  let shippingCents = home ? variant.fallbackShippingHomeCents : variant.fallbackShippingOtherCents;
  try {
    const profiles = await getShippingProfiles(provider.blueprintId, provider.printProviderId);
    const ship = shippingCostFromProfiles(profiles, variant.variantId, country);
    if (ship === null) throw new Error(`no shipping profile for ${variant.variantId} -> ${country}`);
    shippingCents = ship;
  } catch (err: any) {
    live = false;
    console.warn(`pricing: shipping fallback for ${provider.key}/${variant.variantId}:`, err.message);
  }

  const { priceCents: priceUsdCents, vatCents, stripeFeeCents } = computePriceCents(costCents, shippingCents);
  const currency = currencyForCountry(country);
  const priceCents =
    currency === "usd" ? priceUsdCents : roundToNinetyNine(await convertFromUsdCents(priceUsdCents, currency));
  return {
    priceCents,
    currency,
    priceUsdCents,
    costCents,
    shippingCents,
    vatCents,
    stripeFeeCents,
    country,
    region: regionForCountry(country),
    provider: { key: provider.key, name: provider.name, location: provider.location },
    blueprintId: provider.blueprintId,
    printProviderId: provider.printProviderId,
    variantId: variant.variantId,
    printArea: variant.printArea,
    live,
  };
}

/**
 * Price a size + frame for a shipping country. UK/EU/US use their regional
 * provider; anywhere else gets whichever provider is cheapest delivered.
 * Pass providerKey to force a specific provider.
 */
export async function getQuote(
  sizeId: string,
  frame: FrameFinish,
  country: string,
  providerKey?: ProviderKey
): Promise<Quote> {
  const c = country.toUpperCase();
  const providers = providerKey ? [PROVIDERS[providerKey]] : candidateProviders(c);
  const quotes = (await Promise.all(providers.map((p) => quoteProvider(p, sizeId, frame, c)))).filter(
    (q): q is Quote => q !== null
  );
  if (!quotes.length) throw new Error(`${sizeId} / ${frame} is not available for ${c}`);
  return quotes.sort((a, b) => a.priceUsdCents - b.priceUsdCents)[0];
}

/** Map a legacy Printify Choice (blueprint 540) variantId to size + frame. */
export function legacyVariant(variantId: number): { sizeId: string; frame: FrameFinish } | null {
  for (const [sizeId, frames] of Object.entries(PROVIDERS.printifychoice_us.variants)) {
    for (const [frame, v] of Object.entries(frames)) {
      if (v?.variantId === variantId) return { sizeId, frame: frame as FrameFinish };
    }
  }
  return null;
}
