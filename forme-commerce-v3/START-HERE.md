# FORME — two websites, one store

An original editorial fashion storefront with a separate management portal. The customer site has departments, search, filters, saved items, product galleries, size/color selection, a persistent bag, customer accounts, and hosted checkout. Administrators manage products, uploaded images, option stock, orders, and branding. Clothing, physical goods, digital listings, and course listings use the same catalog.

**New in v3:** Read `ACCOUNT-AND-TRACKING.md` before launch for Google authentication, account alerts, languages, admin content, shipping milestones, and upgrade steps.

## What is already connected

The private preview provided in ChatGPT uses a persistent Cloudflare D1 database and R2 image storage. Its management entry is `/manage`, protected by the owner's ChatGPT identity. Test checkout is available only to the owner in sample mode. It records a clearly marked demo order and deducts its reserved stock; cancel the demo in management to restore it. No payment credentials are installed in that preview.

This portable package connects both separately deployed websites to **your own Supabase project**. Its admin login uses a username/email and password; customer signups never receive admin access. Supabase row-level security and transactional RPCs enforce access and stock changes. Server-only Netlify functions create payment sessions and verify callbacks. This separate setup needs your hosting, database, and merchant account settings before accepting payments.

| Folder | Purpose |
| --- | --- |
| `customer-site/` | Deploy this project to Netlify. Includes prebuilt `web/`, checkout functions, and hosting configuration. |
| `management-site/` | Deploy this as a second Netlify project. Includes the prebuilt admin portal and hosting configuration. |
| `database/schema.sql` | Complete setup for a **fresh** Supabase project. |
| `database/commerce.sql` | Migration for the original v1 FORME database; then run `upgrade-v3.sql`. Do not run this after the fresh schema.
| `database/upgrade-v3.sql` | One-time upgrade for an existing v2 store. |
| `database/create-admin.sql` | Grant management access to an Auth user you create. |
| `database/sample-data.sql` | Optional illustrative catalog with variant stock. |
| `source/` | Editable React/TypeScript source, functions, and local database/payment tests. |
| `ASSETS.md` | Sample photo sources. Replace samples with accurate product photography. |

## 1. Create the database and admin

1. Create a [Supabase](https://supabase.com) project. In the SQL Editor run `database/schema.sql`. For an existing v2 project, back it up and run **only** `database/upgrade-v3.sql`. For legacy v1, run `commerce.sql` and then `upgrade-v3.sql`. Historical request orders remain in `orders` while new paid checkouts use `commerce_orders`.
2. Optionally run `database/sample-data.sql`. Repeating it preserves existing products, option quantities, and settings. All sample descriptions and photos are illustrative.
3. In Authentication → Users, create a confirmed admin user with your chosen email and a strong password. Edit and run `database/create-admin.sql` to use that exact email. Verify it returns an admin row. No default password is included.
4. Sign in with the full email. For short username login, use an email such as `owner@your-domain.com` and set `adminEmailDomain: "your-domain.com"` in the management config; the username is `owner`. The SQL role row is what grants access.
5. Enable email/password customer signups if you want customer accounts. In Auth URL settings set Site URL to the customer HTTPS origin. Email confirmation remains supported: after confirming the email, customers sign in with their password. Configure your SMTP provider for production confirmation messages and delivery limits.
6. Copy the project URL and **publishable key** (or legacy anon key) into `web/config.js` in **both** deploy folders. These are public. Never place a service-role/secret key, merchant secret, or password there.

## 2. Deploy two Netlify projects

[Netlify](https://www.netlify.com) and [Supabase](https://supabase.com) have plan limits that may change. Check their current pricing and quotas before launch. Domains, email delivery, and payment processing may incur separate costs.

1. Put `customer-site/` in a Git repository, then import it into Netlify. Use that folder as the project root. Its `netlify.toml` sets the publish directory to `web` and functions directory to `functions`. No frontend rebuild is needed; the supplied build command verifies the prebuilt entry/config files, and Netlify bundles the functions.
2. Deploy `management-site/` as a second project the same way. It publishes its own `web` folder and has no payment secrets.
3. Update both `web/config.js` files with the actual customer and management HTTPS origins. In management, `apiBase` must be the full customer origin plus `/.netlify/functions`. In the shop it remains `/.netlify/functions`. Redeploy after these public configuration edits.
4. In the **customer project's server environment**, configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORE_ORIGIN`, and `MANAGEMENT_ORIGIN`. Origins must match the two websites exactly, with no trailing slash. Restrict secrets to Functions when your host supports scopes. Redeploy functions after environment changes.
5. Make the customer deployment publicly reachable when ready so payment providers can call it. New Netlify projects may start private. The admin site's page can be publicly reachable because all management data and writes require an admin Supabase account; optionally add hosting-level restrictions.

**Do not use a static drag-and-drop deploy for the customer project when you need payments.** Uploading only `web/` does not deploy its server functions. Use Git deployment or Netlify CLI from the entire customer project:

```bash
npx netlify-cli login
npx netlify-cli deploy --prod --dir=web --functions=functions
```

The CLI prompts you to select/create the appropriate project. Configure its environment variables in Netlify before a payment test. The management `web/` folder is static and may also be deployed on another static host, while keeping its `apiBase` pointed to the Netlify customer backend.

## 3. Enable one payment provider

Open Management → Store settings. Choose the store currency, provider, shipping fee, and free-shipping threshold. Monetary values entered by admins are in normal currency units; internally prices use hundredths for all supported currencies. JPY/KRW prices and shipping must use whole currency units. Shipping is a flat fee with an optional free threshold; carrier quotations and automatic tax calculations are not included.

### Stripe card checkout

Use an eligible merchant account in your business's country; see [Stripe availability](https://stripe.com/global). In the customer Netlify environment set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.

In Stripe register the public webhook endpoint:

```text
https://YOUR-SHOP.netlify.app/.netlify/functions/stripe-webhook
```

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, and `charge.refunded`. Start with test keys and the matching test endpoint secret. Turn on live mode only after a complete merchant test. In Management turn off Sample store mode before accepting real charges.

The browser never supplies the charged price. Stock and a catalog snapshot are reserved atomically; Stripe receives that snapshot. Only a correctly signed event with matching amount, currency, order/session, and test/live mode marks the order paid. Returning to a success URL does not confirm payment. Duplicate requests use a stable Stripe idempotency key. Expired sessions restore stock once. A fully refunded Stripe charge marks the order refunded without automatically restocking physical returns; partial refunds and disputes require merchant reconciliation.

### QPay for MNT

Obtain QPay merchant credentials. Set `QPAY_BASE_URL` (sandbox: `https://merchant-sandbox.qpay.mn`; production: `https://merchant.qpay.mn`), `QPAY_CLIENT_ID`, `QPAY_CLIENT_SECRET`, `QPAY_INVOICE_CODE`, and a long random `QPAY_CALLBACK_SECRET`. Select QPay and MNT in management. The callback URL is generated per invoice; its base is:

```text
https://YOUR-SHOP.netlify.app/.netlify/functions/qpay-callback
```

The customer sees the invoice QR and bank app links. An authenticated callback causes the server to check QPay's recorded payment amount/currency before updating the order. The browser polls only the store's database; it does not repeatedly call QPay's payment API. Invoice creation is claimed once because QPay forbids repeating a sender invoice number. QPay cancellations call the merchant API before restoring stock. QPay refunds require merchant reconciliation; no automated refund integration is included.

## Operations and recovery

- Checkout deducts available option stock immediately. Paid orders retain that deduction; cancel/Stripe expiry restores it once. Fulfillment does not deduct stock again. Archived products and inactive variants cannot be ordered. Historical snapshots remain readable.
- Inventory saves require the product revision opened by the editor. If a reservation changed stock while an admin edited, the save is rejected. Refresh and re-enter the desired available quantity.
- Customer accounts see only their own orders. Guest receipts require a random 256-bit capability token, kept in the URL fragment. Treat the full receipt link as private. The public receipt response omits contact details and internal hashes.
- Checkout and receipt functions include Netlify IP rate limits; the database also limits checkouts per email. Review Netlify deployment logs to confirm rate-limit rules were applied.
- A timeout after invoice/session creation can leave an unknown provider result with reserved stock. Do not blindly release or retry a QPay invoice. Look up the order reference in the merchant dashboard, confirm/cancel the provider session, and reconcile the stored record with a database administrator. Monitor `awaiting_payment` and `payment_review` orders. Callbacks depend on public reachability and correct merchant configuration; there is no periodic provider reconciliation job.
- Full refunds do not return physical stock automatically. Inspect returns, then adjust option stock. Partial refunds, chargebacks, QPay refunds, and failed callback recovery need merchant reconciliation. Do not fulfill refunded or review orders.
- The dashboard reads the latest 500 orders; its overview is operational, not a complete accounting report. Test orders are excluded from live revenue totals. Use database exports/accounting tools for full history.
- Download catalog creates a catalog/settings snapshot. It is not a full database backup or import tool. Back up orders, roles, and Storage separately. Removing product images from a listing does not delete their stored objects.
- This version stores course metadata and sells listings. Course access control, lesson hosting, automatic digital delivery, transactional email, shipping labels, tax automation, subscriptions, and a full returns portal require additional integrations.

## Edit and rebuild

Use Node 22.13 or newer. In `source/`:

```bash
npm install
npm run dev
npm run build
npm run test:database
npm run test:payments
```

`npm run dev` edits the customer site; `npm run dev:management` edits management. The build generates `build/customer/` and `build/management/`; copy each build's contents into the corresponding deploy project's `web/`. Keep each deployed config.js configured correctly. Copy edited `source/portable/functions/` into `customer-site/functions/` after backend changes. Never commit `.env` secrets.

Database tests run the actual SQL in an isolated PostgreSQL engine. Payment tests use mocked provider responses and real HMAC verification; they do not certify live merchant callbacks. Type checks and production builds were completed. Browser interaction and responsive visual QA were unavailable in the build environment, so perform a desktop/mobile review and a provider sandbox purchase before launch.

## Technical references

- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Netlify Functions](https://docs.netlify.com/build/functions/overview/)
- [Netlify rate limits](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/)
- [Stripe Checkout](https://docs.stripe.com/checkout/quickstart)
- [Stripe webhooks](https://docs.stripe.com/webhooks)
- [QPay Merchant V2](https://developer.qpay.mn/mn/docs/merchant?version=2.0.0)
