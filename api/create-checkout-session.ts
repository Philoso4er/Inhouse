import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getStripe } from "../lib/stripe.js";
import { getQuote, legacyVariant } from "../lib/pricing.js";
import { isSupportedCountry } from "../src/providers.js";
import type { FrameFinish } from "../src/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = req.body as {
      imageUrl: string;
      sizeId?: string;
      frame?: FrameFinish;
      country?: string;
      variantId?: number; // legacy clients
      sizeLabel: string;
    };
    const { imageUrl, sizeLabel } = body;
    let { sizeId, frame } = body;
    let country = String(body.country || "").toUpperCase();
    let providerKey: "printifychoice_us" | undefined;

    // Legacy request shape (variantId only): Printify Choice, shipped to the
    // same countries as before.
    if (!sizeId && body.variantId) {
      const legacy = legacyVariant(Number(body.variantId));
      if (legacy) ({ sizeId, frame } = legacy);
      providerKey = "printifychoice_us";
    }

    if (!imageUrl || !sizeId || !frame) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    if (!providerKey && !isSupportedCountry(country)) {
      res.status(400).json({ error: "Missing or unsupported shipping country" });
      return;
    }

    // Never trust a price sent from the browser — recompute it from the
    // real Printify cost + shipping for this country, server-side. The quote
    // also picks the provider and its variant for the order.
    const quote = await getQuote(sizeId, frame, providerKey ? country || "GB" : country, providerKey);
    const { priceCents } = quote;

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // This account has Stripe's newer "Managed Payments" enabled by
      // default, which handles payment methods and shipping collection
      // itself and rejects the classic explicit parameters below. Disabling
      // it per-session keeps the well-documented behavior this code relies
      // on (payment_method_types + shipping_address_collection +
      // shipping_details on the webhook payload).
      managed_payments: { enabled: false },
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: priceCents,
            product_data: {
              name: `Custom print — ${sizeLabel}`,
            },
          },
          quantity: 1,
        },
      ],
      shipping_address_collection: {
        // Lock the address to the country we priced and picked a provider
        // for, so the Printify order always matches the quote.
        allowed_countries: (providerKey
          ? ["US", "GB", "CA", "AU", "IE"]
          : [country]) as any,
      },
      metadata: {
        imageUrl,
        variantId: String(quote.variantId),
        blueprintId: String(quote.blueprintId),
        printProviderId: String(quote.printProviderId),
        provider: quote.provider.name,
        country: quote.country,
        sizeLabel,
      },
      payment_intent_data: {
        metadata: { inhouse_status: "paid" },
      },
      success_url: `${origin}/?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
    });

    res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("create-checkout-session error:", err);
    res.status(500).json({ error: err.message || "Checkout failed" });
  }
}
