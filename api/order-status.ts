import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { getStripe } from "../lib/stripe.js";

// GET /api/order-status?session_id=cs_... — customer-facing status, polled by the success page.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    res.status(400).json({ error: "session_id required" });
    return;
  }
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
    const pi = session.payment_intent as Stripe.PaymentIntent | null;
    const m = pi?.metadata || {};
    const status = m.inhouse_status || (session.payment_status === "paid" ? "paid" : "pending");
    const messages: Record<string, string> = {
      pending: "Waiting for payment confirmation…",
      paid: "Payment received — sending to the printer…",
      submitted: "Received by our print partner — awaiting approval.",
      in_production: "Approved — in production.",
      shipped: "Shipped! Check your email for tracking.",
      cancelled: `Cancelled: ${m.inhouse_reason || "the order couldn't be made"}`,
    };
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      status,
      message: messages[status] || status,
      refunded: status === "cancelled",
      reason: m.inhouse_reason || null,
    });
  } catch {
    res.status(404).json({ error: "Order not found" });
  }
}
