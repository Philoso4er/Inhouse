// Thin wrapper around the Printify API.
// Docs: https://developers.printify.com/
// Verify exact field names against current docs before going live —
// Printify's API has changed shape before and this hasn't been tested
// against a live account.

const PRINTIFY_BASE = "https://api.printify.com/v1";

function authHeaders() {
  const token = process.env.PRINTIFY_API_TOKEN;
  if (!token) throw new Error("PRINTIFY_API_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function uploadImageToPrintify(fileName: string, base64Contents: string) {
  const res = await fetch(`${PRINTIFY_BASE}/uploads/images.json`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ file_name: fileName, contents: base64Contents }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Printify image upload failed: ${res.status} ${body}`);
  }
  // preview_url is the hosted URL Printify assigns the upload — this is what
  // order line items need for print_areas (the internal `id` only works when
  // building a saved product, a different endpoint than order creation).
  return res.json() as Promise<{ id: string; file_name: string; preview_url: string }>;
}

export async function getProduct(productId: string) {
  const shopId = process.env.PRINTIFY_SHOP_ID;
  if (!shopId) throw new Error("PRINTIFY_SHOP_ID is not set");
  const res = await fetch(`${PRINTIFY_BASE}/shops/${shopId}/products/${productId}.json`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Printify get product failed: ${res.status}`);
  return res.json();
}

// A 1x1 transparent PNG, used only so Printify will let us create a "cost
// lookup" product — this product is never published or sold, it exists
// purely so we can read Printify's real cost for each variant.
const PLACEHOLDER_PIXEL_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/**
 * Reads the cost-lookup product. Requires PRINTIFY_COST_LOOKUP_PRODUCT_ID to
 * already exist — created once via `npm run setup:pricing`, not on every
 * request. Creating a product (image upload + variant registration) is slow
 * enough that doing it on every price check risked hitting Vercel's function
 * timeout, which is what caused the FUNCTION_INVOCATION_FAILED errors.
 */
export async function getCostLookupProduct() {
  const productId = process.env.PRINTIFY_COST_LOOKUP_PRODUCT_ID;
  if (!productId) {
    throw new Error(
      "PRINTIFY_COST_LOOKUP_PRODUCT_ID is not set. Run `npm run setup:pricing` once locally, " +
        "then add the printed product ID as an env var (locally and in Vercel) before pricing will work."
    );
  }
  return getProduct(productId);
}

/**
 * Rough shipping cost estimate for a variant, in cents. Printify's shipping
 * cost varies by destination country; this takes the first available rate
 * as an approximation. For precise per-order shipping, Printify's
 * order-level shipping calculation would need to run after the address is
 * known — a further improvement, not done here.
 */
export async function estimateShippingCents(
  blueprintId: number,
  printProviderId: number,
  variantId: number
): Promise<number> {
  const res = await fetch(
    `${PRINTIFY_BASE}/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/shipping.json`,
    { headers: authHeaders() }
  );
  if (!res.ok) return 0; // fail open — better to under-estimate than block pricing entirely
  const data = await res.json();
  try {
    const profiles = data.profiles || [];
    for (const profile of profiles) {
      if (profile.variant_ids?.includes(variantId)) {
        const firstCost = profile.first_item?.cost;
        if (typeof firstCost === "number") return firstCost;
      }
    }
  } catch {
    // fall through to 0
  }
  return 0;
}

export interface PrintifyOrderInput {
  externalId: string;
  imageUrl: string;
  blueprintId: number;
  printProviderId: number;
  variantId: number;
  quantity: number;
  shippingAddress: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    country: string;
    region?: string;
    address1: string;
    address2?: string;
    city: string;
    zip: string;
  };
}

export async function createPrintifyOrder(input: PrintifyOrderInput) {
  const shopId = process.env.PRINTIFY_SHOP_ID;
  if (!shopId) throw new Error("PRINTIFY_SHOP_ID is not set");

  const body = {
    external_id: input.externalId,
    label: input.externalId,
    line_items: [
      {
        print_provider_id: input.printProviderId,
        blueprint_id: input.blueprintId,
        variant_id: input.variantId,
        quantity: input.quantity,
        print_areas: {
          front: input.imageUrl,
        },
      },
    ],
    shipping_method: 1,
    send_shipping_notification: true,
    address_to: input.shippingAddress,
  };

  const res = await fetch(`${PRINTIFY_BASE}/shops/${shopId}/orders.json`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = await res.text();
    // Include what we actually sent — this is the fastest way to tell
    // whether a field came through empty/undefined vs. Printify rejecting
    // a value we genuinely sent.
    throw new Error(
      `Printify order creation failed: ${res.status} ${responseBody} | sent: ${JSON.stringify(body)}`
    );
  }
  return res.json();
}
