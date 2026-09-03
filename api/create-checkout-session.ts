import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getStripe } from "../lib/stripe.js";
import { getLivePriceCents } from "../lib/pricing.js";
import { BLUEPRINT_ID, PRINT_PROVIDER_ID } from "../src/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { imageUrl, variantId, sizeLabel } = req.body as {
      imageUrl: string;
      variantId: number;
      sizeLabel: string;
    };

    if (!imageUrl || !variantId) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Never trust a price sent from the browser — recompute it from the
    // real Printify cost right here, server-side.
    const { priceCents } = await getLivePriceCents(variantId);

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
        allowed_countries: ["US", "GB", "CA", "AU", "IE"],
      },
      metadata: {
        imageUrl,
        variantId: String(variantId),
        blueprintId: String(BLUEPRINT_ID),
        printProviderId: String(PRINT_PROVIDER_ID),
        sizeLabel,
      },
      success_url: `${origin}/?success=true`,
      cancel_url: `${origin}/`,
    });

    res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("create-checkout-session error:", err);
    res.status(500).json({ error: err.message || "Checkout failed" });
  }
}
