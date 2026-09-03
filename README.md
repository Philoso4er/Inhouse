# InHouse

Upload art → pick size & frame → pay → order auto-submitted to Printify for printing and shipping.

## How pricing works (dynamic)

Prices are **not hardcoded**. When someone selects a size/frame:

1. The frontend calls `/api/get-price?variantId=...`
2. That endpoint reads Printify's real production cost for that exact variant (via a hidden "cost lookup" product created once in your shop — never published, never sold, just used to read cost)
3. It adds an estimated shipping cost for that variant
4. It applies your margin (`PRICE_MARGIN_MULTIPLIER`, default 1.8x, with a `PRICE_MIN_MARGIN_CENTS` floor of $8 so cheap variants still profit)
5. That computed price is shown to the customer, **and independently recomputed server-side again at checkout** — the app never trusts a price sent from the browser, since that could be tampered with before a real charge happens.

**First-time setup is required before pricing works at all** — run this once, locally, before your first price check:
```
node --env-file=.env.local scripts/setup-cost-lookup.mjs
```
This creates the hidden cost-lookup product in Printify. It's a deliberate one-time step: creating a product (image upload + registering 9 variants) is slow, and doing it automatically on every price request caused Vercel function timeouts (`FUNCTION_INVOCATION_FAILED`) in an earlier version of this app. The script prints a product ID — copy it into `PRINTIFY_COST_LOOKUP_PRODUCT_ID`, in **both** `.env.local` and your Vercel project's Environment Variables (Settings → Environment Variables), then redeploy. If you later change sizes/frames in `src/types.ts`, re-run the script and update the ID.

**Known limitation:** shipping cost is estimated from Printify's general shipping data, not calculated precisely for the customer's actual address (that would require knowing their address before checkout, which Stripe Checkout doesn't give you). It's a reasonable approximation, not an exact figure — pad your margin multiplier accordingly if you want a safety buffer.

**Tune your margin** by setting `PRICE_MARGIN_MULTIPLIER` (e.g. `2.0` for 100% markup) and `PRICE_MIN_MARGIN_CENTS` in your env vars.

## What's actually done vs. what's placeholder

**Done and working:**
- Full upload → configure → preview → checkout UI
- Live camera placement preview (drag/resize/rotate)
- **Live dynamic pricing** pulled from real Printify cost + shipping + your margin
- Stripe Checkout session creation, with shipping address collection
- Stripe webhook that listens for successful payment
- Printify image upload + order creation calls, wired to fire automatically after payment
- Real blueprint (540, Framed Vertical Poster), print provider (99, Printify Choice), and variant IDs for 3 sizes × 3 frame colors

**You must still do before this takes real orders:**
1. Add a payment method to your Printify account (Billing/Wallet) — without this, orders will fail even after a customer pays.
2. Switch Stripe from test keys to live keys when ready to charge real money.
3. Verify the order-creation call shape in `lib/printify.ts` against a real test order — I built this from documented behavior, not a live test.
4. Decide on your margin multiplier and test that the live-priced checkout actually reflects it correctly.


## Local development

```bash
npm install
cp .env.example .env.local   # fill in your real keys
npm run dev
```

The Vite dev server proxies `/api/*` to `localhost:3000`, so for full local testing of the API routes you'll want `vercel dev` instead (it runs both together):

```bash
npm install -g vercel
vercel dev
```

## Deploying

1. Push this repo to GitHub.
2. Import it into Vercel.
3. Add the four environment variables from `.env.example` in the Vercel project settings.
4. Deploy.
5. In Stripe, add a webhook endpoint pointing to `https://<your-domain>/api/webhook`, subscribed to `checkout.session.completed`, and copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## Known gaps worth knowing about before you rely on this for income

- **No order-failure alerting.** If the Printify call fails after a successful payment, it's currently just a `console.error` — you won't be notified. Worth adding an email/Slack alert on that catch block before real volume.
- **No inventory/proofing step.** Low-resolution uploads will print blurry; there's no resolution check or warning to the customer yet.
- **No order history or customer-facing status page.** Customers get a Stripe receipt and (once shipped) a Printify shipping notification — nothing in between.
- **Tax and international shipping** aren't configured — Stripe Checkout is set up for card payments with shipping to US/GB/CA/AU/IE only; adjust `allowed_countries` in `api/create-checkout-session.ts` as needed.
