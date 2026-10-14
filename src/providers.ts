import type { FrameFinish } from "./types.js";

// Printify providers per region. All IDs verified against Printify's catalog
// API (/v1/catalog/blueprints/{id}/print_providers.json and .../variants.json)
// on 2026-10-14.
export type Region = "UK" | "EU" | "US" | "ROW";
export type ProviderKey = "printclever_uk" | "printpigeons_eu" | "printifychoice_us";

export interface PrintArea {
  widthIn: number;
  heightIn: number;
  widthPx: number;
  heightPx: number;
}

export interface ProviderVariant {
  variantId: number;
  printArea: PrintArea;
  // Fallbacks (US cents) used only if the live Printify lookup fails.
  // Captured from Printify on 2026-10-14.
  fallbackCostCents: number;
  fallbackShippingHomeCents: number; // to the provider's home region
  fallbackShippingOtherCents: number; // REST_OF_THE_WORLD rate
}

export interface ProviderConfig {
  key: ProviderKey;
  name: string;
  location: string; // ISO country the provider prints in
  region: Exclude<Region, "ROW">;
  blueprintId: number;
  printProviderId: number;
  costLookupProductEnv: string;
  defaultCostLookupProductId?: string; // not secret: a hidden, unpublished product in the shop
  variants: Record<string, Partial<Record<FrameFinish, ProviderVariant>>>;
}

const pa = (w: number, h: number, wp: number, hp: number): PrintArea => ({ widthIn: w, heightIn: h, widthPx: wp, heightPx: hp });
const v = (variantId: number, printArea: PrintArea, cost: number, home: number, other: number): ProviderVariant => ({
  variantId,
  printArea,
  fallbackCostCents: cost,
  fallbackShippingHomeCents: home,
  fallbackShippingOtherCents: other,
});

export const PROVIDERS: Record<ProviderKey, ProviderConfig> = {
  // Blueprint 764 "Framed Posters" by Print Clever — prints in the UK.
  // Only one frame (black wood), so walnut/white are hidden for UK customers.
  printclever_uk: {
    key: "printclever_uk",
    name: "Print Clever",
    location: "GB",
    region: "UK",
    blueprintId: 764,
    printProviderId: 72,
    costLookupProductEnv: "PRINTIFY_COST_LOOKUP_PRODUCT_ID_UK",
    defaultCostLookupProductId: "6acef4ae357b3775a4018a2a",
    variants: {
      "11x14": { black: v(98931, pa(11, 14, 3295, 4205), 3312, 1649, 5329) },
      "16x20": { black: v(75331, pa(16, 20, 4795, 6000), 5478, 1649, 6689) },
      "20x30": { black: v(98937, pa(20, 30, 6000, 9000), 7493, 1649, 8739) },
    },
  },
  // Blueprint 492 "Vertical Framed Poster" by Print Pigeons — prints in Latvia (EU).
  // Black and white frames only; walnut is hidden for EU customers.
  printpigeons_eu: {
    key: "printpigeons_eu",
    name: "Print Pigeons",
    location: "LV",
    region: "EU",
    blueprintId: 492,
    printProviderId: 36,
    costLookupProductEnv: "PRINTIFY_COST_LOOKUP_PRODUCT_ID_EU",
    defaultCostLookupProductId: "6acef4b203967ac067076b0d",
    variants: {
      "11x14": {
        black: v(65400, pa(11, 14, 3300, 4200), 3501, 2639, 5549),
        white: v(65401, pa(11, 14, 3300, 4200), 3501, 2639, 5549),
      },
      "16x20": {
        black: v(66226, pa(16, 20, 4800, 6000), 4943, 2639, 6099),
        white: v(66228, pa(16, 20, 4800, 6000), 4943, 2639, 6099),
      },
      "20x30": {
        black: v(66227, pa(20, 30, 6000, 9000), 6951, 2899, 7299),
        white: v(66229, pa(20, 30, 6000, 9000), 6951, 2899, 7299),
      },
    },
  },
  // Blueprint 540 "Framed Vertical Poster" via Printify Choice — prints in the US.
  printifychoice_us: {
    key: "printifychoice_us",
    name: "Printify Choice",
    location: "US",
    region: "US",
    blueprintId: 540,
    printProviderId: 99,
    costLookupProductEnv: "PRINTIFY_COST_LOOKUP_PRODUCT_ID",
    variants: {
      "11x14": {
        black: v(69663, pa(11, 14, 3300, 4200), 3589, 1249, 5719),
        walnut: v(69670, pa(11, 14, 3300, 4200), 3589, 1249, 5719),
        white: v(69677, pa(11, 14, 3300, 4200), 3589, 1249, 5719),
      },
      "16x20": {
        black: v(69667, pa(16, 20, 4800, 6000), 4776, 1729, 7509),
        walnut: v(69674, pa(16, 20, 4800, 6000), 4776, 1729, 7509),
        white: v(69681, pa(16, 20, 4800, 6000), 4776, 1729, 7509),
      },
      "20x30": {
        black: v(69669, pa(20, 30, 6000, 9000), 7103, 2189, 21839),
        walnut: v(69676, pa(20, 30, 6000, 9000), 7103, 2189, 21839),
        white: v(69683, pa(20, 30, 6000, 9000), 7103, 2189, 21839),
      },
    },
  },
};

export const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];
const UK_COUNTRIES = ["GB", "IM", "JE", "GG"];

export function regionForCountry(country: string): Region {
  const c = country.toUpperCase();
  if (UK_COUNTRIES.includes(c)) return "UK";
  if (EU_COUNTRIES.includes(c)) return "EU";
  if (c === "US") return "US";
  return "ROW";
}

/** Providers that may serve a country: the regional one, or all of them for ROW (cheapest wins at pricing time). */
export function candidateProviders(country: string): ProviderConfig[] {
  const region = regionForCountry(country);
  const all = Object.values(PROVIDERS);
  if (region === "ROW") return all;
  return all.filter((p) => p.region === region);
}

/** Countries offered in the country selector (and allowed at checkout). */
export const SHIPPING_COUNTRIES: { code: string; name: string }[] = [
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "AT", name: "Austria" },
  { code: "DK", name: "Denmark" },
  { code: "SE", name: "Sweden" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
];

export function isSupportedCountry(code: string) {
  return SHIPPING_COUNTRIES.some((c) => c.code === code.toUpperCase());
}

/** Frames/sizes available for a country (union over candidate providers). */
export function availability(country: string): Record<string, FrameFinish[]> {
  const out: Record<string, FrameFinish[]> = {};
  for (const p of candidateProviders(country)) {
    for (const [sizeId, frames] of Object.entries(p.variants)) {
      out[sizeId] = Array.from(new Set([...(out[sizeId] || []), ...(Object.keys(frames) as FrameFinish[])]));
    }
  }
  return out;
}
