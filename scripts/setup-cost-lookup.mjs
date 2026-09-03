// Run this ONCE, locally, before pricing will work:
//   node --env-file=.env.local scripts/setup-cost-lookup.mjs
//
// This creates a hidden Printify product (never published, not for sale)
// covering every size/frame variant InHouse sells, purely so the app can
// read Printify's real cost for each variant. Doing this at runtime on every
// price check was too slow and caused Vercel function timeouts — this
// script does the slow part once, and prints the product ID you then save
// as PRINTIFY_COST_LOOKUP_PRODUCT_ID (in .env.local AND in your Vercel
// project's Environment Variables).
//
// NOTE: keep this variant ID list in sync with src/types.ts SIZE_OPTIONS.
// If you add/change sizes or frame colors there, re-run this script.

const BLUEPRINT_ID = 540; // Framed Vertical Poster
const PRINT_PROVIDER_ID = 99; // Printify Choice

const VARIANT_IDS = [
  69663, 69670, 69677, // 11x14: black, walnut, white
  69667, 69674, 69681, // 16x20: black, walnut, white
  69669, 69676, 69683, // 20x30: black, walnut, white
];

const PLACEHOLDER_PIXEL_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function main() {
  const token = process.env.PRINTIFY_API_TOKEN;
  const shopId = process.env.PRINTIFY_SHOP_ID;
  if (!token || !shopId) {
    console.error("Missing PRINTIFY_API_TOKEN or PRINTIFY_SHOP_ID. Run with:");
    console.error("  node --env-file=.env.local scripts/setup-cost-lookup.mjs");
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  console.log("Uploading placeholder image...");
  const uploadRes = await fetch("https://api.printify.com/v1/uploads/images.json", {
    method: "POST",
    headers,
    body: JSON.stringify({ file_name: "cost-lookup-pixel.png", contents: PLACEHOLDER_PIXEL_BASE64 }),
  });
  if (!uploadRes.ok) {
    console.error("Image upload failed:", uploadRes.status, await uploadRes.text());
    process.exit(1);
  }
  const image = await uploadRes.json();
  console.log("Uploaded. Image ID:", image.id);

  console.log("Creating cost-lookup product (this can take up to ~30s)...");
  const productRes = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "InHouse — cost lookup (internal, not for sale)",
      description: "Internal product used only to read live variant cost. Do not publish.",
      blueprint_id: BLUEPRINT_ID,
      print_provider_id: PRINT_PROVIDER_ID,
      variants: VARIANT_IDS.map((id) => ({ id, price: 100, is_enabled: true })),
      print_areas: [
        {
          variant_ids: VARIANT_IDS,
          placeholders: [
            { position: "front", images: [{ id: image.id, x: 0.5, y: 0.5, scale: 1, angle: 0 }] },
          ],
        },
      ],
    }),
  });

  if (!productRes.ok) {
    console.error("Product creation failed:", productRes.status, await productRes.text());
    process.exit(1);
  }

  const product = await productRes.json();
  console.log("\n✅ Done. Add this to .env.local AND to your Vercel project's Environment Variables:\n");
  console.log(`PRINTIFY_COST_LOOKUP_PRODUCT_ID=${product.id}\n`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
