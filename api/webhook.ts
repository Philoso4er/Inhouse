import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getStripe } from "../lib/stripe.js";
import { createPrintifyOrder } from "../lib/printify.js";
import { refundOrder, setOrderMeta } from "../lib/orders.js";

// Stripe requires the raw, unparsed request body to verify the webhook
// signature, so body parsing is disabled for this route.
export const config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];

  if (!webhookSecret || !signature) {
    res.status(400).send("Missing webhook secret or signature");
    return;
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const meta = session.metadata || {};
    const shipping = session.shipping_details || session.customer_details;

    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

    // Stripe retries webhooks; don't submit a second Printify order.
    if (paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.metadata?.printify_order_id || pi.metadata?.inhouse_status === "cancelled") {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
    }

    try {
      const order: any = await createPrintifyOrder({
        externalId: session.id,
        imageUrl: meta.imageUrl,
        blueprintId: Number(meta.blueprintId),
        printProviderId: Number(meta.printProviderId),
        variantId: Number(meta.variantId),
        quantity: 1,
        shippingAddress: {
          first_name: shipping?.name?.split(" ")?.[0] || "Customer",
          last_name: shipping?.name?.split(" ")?.slice(1).join(" ") || "",
          email: session.customer_details?.email || "",
          country: shipping?.address?.country || "",
          region: shipping?.address?.state || "",
          address1: shipping?.address?.line1 || "",
          address2: shipping?.address?.line2 || "",
          city: shipping?.address?.city || "",
          zip: shipping?.address?.postal_code || "",
        },
      });
      if (paymentIntentId) {
        await setOrderMeta(paymentIntentId, {
          printify_order_id: String(order?.id || ""),
          checkout_session_id: session.id,
          inhouse_status: "submitted",
        });
      }
    } catch (err: any) {
      // Customer paid but no print order was placed: refund in full right away.
      console.error("Failed to create Printify order after payment:", err.message);
      if (paymentIntentId) {
        try {
          await refundOrder(
            paymentIntentId,
            "We couldn't submit your order to our print partner, so it was not made."
          );
        } catch (refundErr: any) {
          console.error("Auto-refund after Printify failure also failed:", refundErr.message);
          res.status(500).json({ error: "refund failed" }); // let Stripe retry
          return;
        }
      }
    }
  }

  res.status(200).json({ received: true });
}
