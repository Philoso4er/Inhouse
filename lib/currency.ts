// Display + charge currency per shipping country. Printify bills us in USD,
// so prices are computed in USD and converted once, server-side; the same
// converted amount is shown on the page and charged by Stripe Checkout.
const EURO_COUNTRIES = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];

export function currencyForCountry(country: string): string {
  const c = country.toUpperCase();
  if (["GB", "IM", "JE", "GG"].includes(c)) return "gbp";
  if (EURO_COUNTRIES.includes(c)) return "eur";
  const map: Record<string, string> = { DK: "dkk", SE: "sek", PL: "pln", CA: "cad", AU: "aud", US: "usd" };
  return map[c] || "usd";
}

// Fallback USD -> X rates (approx., Oct 2026) if the live rate lookup fails.
const FALLBACK_RATES: Record<string, number> = {
  usd: 1, gbp: 0.75, eur: 0.86, dkk: 6.42, sek: 9.4, pln: 3.65, cad: 1.38, aud: 1.52,
};
// Small buffer so FX movement between quote and Printify billing doesn't eat margin.
const FX_BUFFER = 1.02;

let cache: { at: number; rates: Record<string, number> } | null = null;

async function usdRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < 6 * 3600_000) return cache.rates;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch("https://api.frankfurter.app/latest?from=USD", { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { rates: Record<string, number> };
    const rates: Record<string, number> = { usd: 1 };
    for (const [k, v] of Object.entries(data.rates)) rates[k.toLowerCase()] = v;
    cache = { at: Date.now(), rates };
    return rates;
  } catch (err: any) {
    console.warn("fx: using fallback rates:", err?.message);
    return FALLBACK_RATES;
  }
}

/** Convert USD cents to minor units of `currency` (all supported currencies use 2 decimals). */
export async function convertFromUsdCents(usdCents: number, currency: string): Promise<number> {
  if (currency === "usd") return usdCents;
  const rates = await usdRates();
  const rate = rates[currency] ?? FALLBACK_RATES[currency];
  if (!rate) throw new Error(`No FX rate for ${currency}`);
  return Math.ceil(usdCents * rate * FX_BUFFER);
}
