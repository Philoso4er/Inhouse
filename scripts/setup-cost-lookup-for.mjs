// Create a hidden cost-lookup product for ONE blueprint + print provider, so
// lib/pricing.ts can read Printify's live production cost for its variants.
// Usage:
//   node --env-file=.env.local scripts/setup-cost-lookup-for.mjs <blueprintId> <printProviderId> <variantId> [...]
// Prints the product id: put it in src/providers.ts (defaultCostLookupProductId).
const [bp, pp, ...vids] = process.argv.slice(2).map(Number);
if (!bp || !pp || !vids.length) {
  console.error("usage: setup-cost-lookup-for.mjs <blueprintId> <printProviderId> <variantId> [...]");
  process.exit(1);
}
const token = process.env.PRINTIFY_API_TOKEN;
const shopId = process.env.PRINTIFY_SHOP_ID;
if (!token || !shopId) {
  console.error("Missing PRINTIFY_API_TOKEN or PRINTIFY_SHOP_ID");
  process.exit(1);
}
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const up = await fetch("https://api.printify.com/v1/uploads/images.json", {
  method: "POST",
  headers,
  body: JSON.stringify({ file_name: "cost-lookup-pixel.png", contents: PIXEL }),
});
if (!up.ok) throw new Error(`upload ${up.status}: ${await up.text()}`);
const image = await up.json();
const res = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    title: `InHouse — cost lookup ${bp}/${pp} (internal, not for sale)`,
    description: "Internal product used only to read live variant cost. Do not publish.",
    blueprint_id: bp,
    print_provider_id: pp,
    variants: vids.map((id) => ({ id, price: 100, is_enabled: true })),
    print_areas: [
      { variant_ids: vids, placeholders: [{ position: "front", images: [{ id: image.id, x: 0.5, y: 0.5, scale: 1, angle: 0 }] }] },
    ],
  }),
});
if (!res.ok) throw new Error(`product ${res.status}: ${await res.text()}`);
const product = await res.json();
const costs = Object.fromEntries((product.variants || []).filter((v) => vids.includes(v.id)).map((v) => [v.id, v.cost]));
console.log(JSON.stringify({ productId: product.id, blueprint: bp, provider: pp, costs }));
