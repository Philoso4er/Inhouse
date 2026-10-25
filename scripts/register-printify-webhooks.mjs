// One-time: register Printify order webhooks for this shop.
// Usage: node --env-file=.env.local scripts/register-printify-webhooks.mjs https://your-domain.vercel.app
// Needs PRINTIFY_API_TOKEN, PRINTIFY_SHOP_ID, PRINTIFY_WEBHOOK_SECRET. Never prints the secret.
const base = process.argv[2];
const { PRINTIFY_API_TOKEN: token, PRINTIFY_SHOP_ID: shop, PRINTIFY_WEBHOOK_SECRET: secret } = process.env;
if (!base || !token || !shop || !secret) {
  console.error("Usage: node --env-file=.env.local scripts/register-printify-webhooks.mjs https://<domain>  (and set PRINTIFY_API_TOKEN, PRINTIFY_SHOP_ID, PRINTIFY_WEBHOOK_SECRET)");
  process.exit(1);
}
const api = `https://api.printify.com/v1/shops/${shop}/webhooks.json`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const url = `${base.replace(/\/$/, "")}/api/printify-webhook?token=${encodeURIComponent(secret)}`;
const topics = ["order:updated", "order:sent-to-production", "order:shipment:created"];

const existing = await (await fetch(api, { headers })).json();
for (const topic of topics) {
  const dup = (Array.isArray(existing) ? existing : []).find((w) => w.topic === topic && String(w.url).startsWith(`${base.replace(/\/$/, "")}/api/printify-webhook`));
  if (dup) { console.log(`${topic}: already registered (${dup.id})`); continue; }
  const r = await fetch(api, { method: "POST", headers, body: JSON.stringify({ topic, url, secret }) });
  const body = await r.json().catch(() => ({}));
  console.log(`${topic}: ${r.ok ? "registered " + body.id : "FAILED " + r.status + " " + JSON.stringify(body)}`);
}
