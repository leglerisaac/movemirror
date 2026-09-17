# MoveMirror launch checklist

MoveMirror is prepared for `https://chess.leglord.com`. Complete these owner-controlled steps in order. Use Stripe test mode until the entire flow works.

## 1. Confirm the app locally

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm test:smoke
pnpm build
```

## 2. Create the Cloudflare Worker and D1 database

Authenticate Wrangler with the Cloudflare account that owns `leglord.com`:

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create movemirror
```

Copy the returned `database_id` into the commented `d1_databases` block in `wrangler.jsonc`, uncomment the block, and apply the schema:

```bash
pnpm exec wrangler d1 migrations apply movemirror --remote --config wrangler.jsonc
```

## 3. Create Stripe products in test mode

Create these three prices in the Stripe Dashboard:

| Product | Type | Price |
|---|---|---:|
| MoveMirror Deep Report | One time | $7.00 USD |
| MoveMirror Player Plus | Monthly recurring | $5.99 USD |
| MoveMirror Coach | Monthly recurring | $19.00 USD |

Activate Stripe's hosted Customer Portal with cancellation and payment-method management enabled. Then add the test secret key and all three `price_...` IDs to Cloudflare:

```bash
pnpm exec wrangler secret put STRIPE_SECRET_KEY
pnpm exec wrangler secret put STRIPE_DEEP_PRICE_ID
pnpm exec wrangler secret put STRIPE_PLUS_PRICE_ID
pnpm exec wrangler secret put STRIPE_COACH_PRICE_ID
```

The tip checkout does not need a separate product or price; the Worker creates a safe $3, $5 or $10 one-time line item.

## 4. Configure weekly email

Create a Resend account, verify `chess.leglord.com` (or `leglord.com`), and add:

```bash
pnpm exec wrangler secret put RESEND_API_KEY
pnpm exec wrangler secret put REPORT_FROM_EMAIL
```

Use a value such as `MoveMirror <reports@chess.leglord.com>` for `REPORT_FROM_EMAIL`. Also create or forward `support@leglord.com`, because the Privacy Policy, Terms and checkout support point there.

The included Cron Trigger runs Mondays at `16:00 UTC`. Change `triggers.crons` in `wrangler.jsonc` if another delivery time is preferable.

## 5. Deploy and attach the domain

```bash
pnpm build
pnpm exec wrangler deploy --config wrangler.jsonc
```

In Cloudflare, open **Workers & Pages → movemirror → Settings → Domains & Routes → Add → Custom Domain** and enter:

```text
chess.leglord.com
```

Cloudflare will create the proxied DNS record and certificate. Do not create a second Tunnel route for this hostname; this app is served directly by Workers.

Verify these response headers at the custom domain before testing Stockfish:

```bash
curl -I https://chess.leglord.com
```

The response must include `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.

## 6. Test the complete purchase flow

In Stripe test mode:

1. Run a free 30-game report.
2. Purchase a $7 Deep Report with Stripe's `4242 4242 4242 4242` test card.
3. Confirm the return URL automatically reruns the purchased account with 150 games.
4. Run the Stockfish evidence review and print the report to PDF.
5. Purchase Player Plus and enable weekly email.
6. Confirm a report saves locally and in D1.
7. Open the Stripe billing portal and cancel the test subscription.
8. Use the email unsubscribe link and confirm the monitored account is removed.

Inspect D1 without exposing report contents:

```bash
pnpm exec wrangler d1 execute movemirror --remote --command "SELECT event, COUNT(*) AS total FROM analytics_events GROUP BY event"
```

## 7. Enable automatic GitHub deployments

Create a scoped Cloudflare API token that can edit Workers scripts and D1 for this account. In the GitHub repository add:

- Actions secret `CLOUDFLARE_API_TOKEN`
- Actions secret `CLOUDFLARE_ACCOUNT_ID`
- Actions variable `CLOUDFLARE_DEPLOY_ENABLED` set to `true`

The Cloudflare workflow validates, migrates D1 and deploys on pushes to `main`. Until the variable is enabled, pushes do not attempt a deployment.

## 8. Production readiness

- Ask Chess.com at `legal@chess.com` to confirm that selling independently generated reports based on PubAPI games is acceptable. Include the live URL and explain that no Chess.com branding or analysis is resold.
- Review the Privacy Policy, Terms and seven-day failed-delivery refund language with the business owner. This repository does not provide legal advice.
- Switch the Stripe secret and price IDs from test mode to live mode only after the test checklist passes.
- Make a real low-value purchase, confirm the bank statement descriptor, refund it, and verify the customer email.
- Keep the current GitHub Pages deployment only as a temporary free beta; disable Pages after `chess.leglord.com` is healthy.

## What is intentionally not hidden

MoveMirror is not pretending to have an account system. Purchase recognition uses the Stripe Checkout session stored in that browser. Plus and Coach cloud reports are available from the purchasing browser; cross-device magic-link login is a later feature. Stripe still provides secure billing management through its hosted portal.
