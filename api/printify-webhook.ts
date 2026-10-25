import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPrintifyOrder } from "../lib/printify.js";
import { findPaymentIntentForPrintifyOrder, refundOrder, setOrderMeta } from "../lib/orders.js";

// Raw body needed for the HMAC signature check.
export const config = { api: { bodyParser: false } };

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Authenticity: Printify lets you set a `secret` when registering a webhook
 * and then signs each delivery with `X-Pfy-Signature: sha256=<hmac hex of body>`.
 * We accept that signature, or a `?token=` in the URL equal to the same secret
 * (belt and braces, in case the header isn't sent).
 */
function isAuthentic(req: VercelRequest, raw: Buffer, secret: string) {
  const sigHeader = String(req.headers["x-pfy-signature"] || "");
  if (sigHeader) {
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
    if (safeEqual(sigHeader, expected)) return true;
  }
  const token = typeof req.query.token === "string" ? req.query.token : "";
  return !!token && safeEqual(token, secret);
}

const CANCELLED = new Set(["canceled", "cancelled", "rejected", "has-issues"]);
const PRODUCTION = new Set(["in-production", "sending-to-production"]);

function reasonFrom(order: any, data: any): string {
  const raw =
    data?.reason || data?.cancel_reason || order?.cancel_reason || order?.reason ||
    order?.line_items?.find((l: any) => l?.status === "canceled")?.reason;
  const base = raw ? String(raw) : "Our print partner declined this design (usually a copyright, trademark or logo issue).";
  return `${base} You've been refunded in full.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const secret = process.env.PRINTIFY_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).send("PRINTIFY_WEBHOOK_SECRET not set");
    return;
  }
  const raw = await readRawBody(req);
  if (!isAuthentic(req, raw, secret)) {
    res.status(401).send("Invalid signature");
    return;
  }

  let event: any;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).send("Bad JSON");
    return;
  }

  const type: string = event?.type || "";
  const orderId: string = String(event?.resource?.id || "");
  if (!type.startsWith("order:") || !orderId) {
    res.status(200).json({ ignored: true });
    return;
  }

  try {
    // Re-fetch the order from Printify rather than trusting the payload's status.
    const order = await getPrintifyOrder(orderId);
    const status: string = String(order?.status || event?.resource?.data?.status || "").toLowerCase();
    const piId = await findPaymentIntentForPrintifyOrder(order, orderId);
    if (!piId) {
      console.warn("Printify webhook: no Stripe payment found for order", orderId);
      res.status(200).json({ ignored: true });
      return;
    }

    const hasIssues = status === "on-hold" && (event?.resource?.data?.issues?.length || order?.issues?.length);
    if (type === "order:canceled" || CANCELLED.has(status) || hasIssues) {
      const result = await refundOrder(piId, reasonFrom(order, event?.resource?.data));
      res.status(200).json({ refund: result });
      return;
    }

    let next: string | null = null;
    if (type === "order:shipment:created" || type === "order:shipment:delivered" || status === "fulfilled") next = "shipped";
    else if (type === "order:sent-to-production" || PRODUCTION.has(status)) next = "in_production";
    if (next) await setOrderMeta(piId, { inhouse_status: next, printify_order_id: orderId });
    res.status(200).json({ ok: true, status: next });
  } catch (err: any) {
    console.error("Printify webhook error:", err.message);
    res.status(500).json({ error: "processing failed" }); // Printify retries
  }
}
