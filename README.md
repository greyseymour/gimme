# Gimme.domains

Domain rescue. Not domain squatting.

---

## Architecture

```
gimme/
├── frontend/          # Static site → Cloudflare Pages
│   ├── index.html     # Marketing homepage
│   ├── status.html    # Domain status lookup
│   ├── rescued.html   # Rescue landing (served on caught domains)
│   ├── alerts.html    # Free expiry alert signup
│   ├── style.css      # Full design system (Liquid Prism × Cyber Vault)
│   ├── app.js         # Shared JS utilities
│   ├── favicon.svg
│   ├── _headers       # Cloudflare Pages security headers
│   └── _redirects
└── worker/            # Cloudflare Worker → REST API
    ├── src/
    │   ├── index.ts           # Hono app + cron scheduler
    │   ├── routes/
    │   │   ├── domain.ts      # GET /v1/domain/status
    │   │   ├── alerts.ts      # POST /v1/alerts
    │   │   └── rescue.ts      # POST /v1/rescue/claim, GET /rescue/verify, POST /rescue/webhook
    │   ├── services/
    │   │   ├── rdap.ts        # Free IANA RDAP lookups (no paid WHOIS needed)
    │   │   ├── resend.ts      # Transactional email (Resend, free tier)
    │   │   ├── stripe.ts      # Checkout + webhook verification
    │   │   └── dynadot.ts     # Domain backorder + transfer-out
    │   └── db/
    │       └── migrations/0001_init.sql
    └── wrangler.toml
```

---

## Setup — Step by Step

### 1. Accounts you need (all have free tiers)

| Service | Purpose | Link |
|---------|---------|------|
| Cloudflare | Hosting (Pages + Workers + D1 + KV) | [cloudflare.com](https://cloudflare.com) |
| Stripe | Payments | [stripe.com](https://stripe.com) |
| Resend | Email | [resend.com](https://resend.com) |
| Dynadot | Domain backorder + transfer | [dynadot.com](https://www.dynadot.com) |

### 2. Install Wrangler

```bash
cd worker
npm install
```

### 3. Cloudflare setup

```bash
# Login
npx wrangler login

# Create D1 database
npx wrangler d1 create gimme-db
# → Copy the database_id into wrangler.toml

# Create KV namespace
npx wrangler kv:namespace create CACHE
# → Copy the id into wrangler.toml

# Run migrations
npm run db:migrate:local   # local dev
npm run db:migrate         # production
```

### 4. Set secrets

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put DYNADOT_API_KEY
```

### 5. Local dev

```bash
cd worker
npm run dev        # API on http://localhost:8787

# Serve frontend separately (any static server)
cd ../frontend
npx serve .        # or: python3 -m http.server 3000
```

The API auto-detects localhost — `app.js` points to `http://localhost:8787/v1` when running locally.

### 6. Deploy

**Frontend → Cloudflare Pages:**
1. Go to [Cloudflare Dashboard → Pages](https://dash.cloudflare.com)
2. Connect GitHub → select `greyseymour/gimme`
3. Build settings: **no build command**, output directory: `frontend`
4. Add custom domain: `gimme.domains`

**Worker → Cloudflare Workers:**
```bash
cd worker
npm run deploy
```
Add custom domain `api.gimme.domains` in the Worker's settings → Triggers → Custom Domains.

### 7. Stripe webhook

After deploying the Worker, add a webhook endpoint in Stripe Dashboard:
- URL: `https://api.gimme.domains/v1/rescue/webhook`
- Events: `checkout.session.completed`
- Copy the signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET`

### 8. Resend domain

In Resend, add and verify `gimme.domains` as a sending domain, then set up `rescue@gimme.domains`.

---

## Pricing

| Plan | Price |
|------|-------|
| Expiry Alerts | Free |
| Self-Serve Rescue | $249 |
| Concierge Rescue | $499 |

Nonprofit/hardship: email rescue@gimme.domains.

---

## How the catch pipeline works

1. Alert subscribers' domains are checked every 6 hours via RDAP (free, no API key needed).
2. When expiry is within 30/14/7/1 days → alert email sent via Resend.
3. If a domain goes RDAP-unknown (dropped from registry) → Dynadot backorder placed automatically.
4. On successful catch → `caught_domains` record created, outreach email sent to alert subscribers.
5. Owner visits rescued.html, pays via Stripe, transfer initiated via Dynadot auth code.

**Target domains:** Long-tail business domains (.com) with real businesses behind them — medical practices, law firms, local businesses. Not competing with DropCatch on premium keyword domains.

---

## Environment variables

| Name | Where | Description |
|------|-------|-------------|
| `STRIPE_SECRET_KEY` | Secret | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Secret | Stripe webhook signing secret |
| `RESEND_API_KEY` | Secret | Resend API key |
| `DYNADOT_API_KEY` | Secret | Dynadot API key |
| `FRONTEND_URL` | wrangler.toml | `https://gimme.domains` |
| `CLAIM_WINDOW_DAYS` | wrangler.toml | `30` |
| `DEFAULT_RESCUE_PRICE_USD` | wrangler.toml | `249` |
