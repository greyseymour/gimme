# Gamma Deck — Gimme.domains Demo Day

**Paste this whole file into Gamma's "Paste in text" input once credits refill.**

- **Theme:** Stratos
- **Format:** Presentation
- **Text mode:** Preserve
- **Image source:** No Images (images are pre-embedded via URL)
- **Card dimensions:** 16:9
- **Cards:** 11
- **Additional instructions:** Use smart layout components (tables, timelines, stat cards, numbered pills). Match dark-tech founder aesthetic. Render embedded image URLs full-width. No decorative AI images.

Public image URLs (hosted on catbox.moe, live right now):
- Stream pipeline: https://files.catbox.moe/a8z72t.png
- Rescue landing page: https://files.catbox.moe/pgv0av.png
- Chat with payment card: https://files.catbox.moe/gbtqk4.png
- Chat with status card (tool calls + transfer): https://files.catbox.moe/bxhkb7.png
- Alerts page: https://files.catbox.moe/zvhn6j.png
- Index landing: https://files.catbox.moe/n59rte.png

---

# Gimme.domains
### Autonomous domain rescue at the edge.

We catch expired domains the millisecond they drop — and hand them back to their rightful owners before the squatters even know they went up.

![Live rescue pipeline dashboard](https://files.catbox.moe/a8z72t.png)

**Scanned today:** 41,280 · **Caught:** 318 · **Rescued back to owners:** 94

Cloudflare Workers · D1 · Claude Haiku 4.5 · Dynadot · Stripe · Resend

---

# The 0.03-second problem.

When a domain registration lapses, the global drop-catching botnet grabs it in under 50 milliseconds. The original owner gets blackmailed, scalped at auction, or watches their brand get parked on porn.

| **When this happens** | **The owner loses** |
|---|---|
| Small business misses renewal email | Their website, Google ranking, 5 years of SEO |
| Freelancer's card expires on Namecheap | Inbox linked to 600+ accounts, Stripe payouts, Slack |
| Nonprofit admin quits, nobody sees alerts | Their donor portal, mailing list, board archive |
| Indie founder gets sick for a week | 4 years of customer email, SaaS login, brand identity |

**The founder's story.** In 2022 my domain lapsed for 11 hours. A squatter caught it. My email — linked to 617 accounts — went dark. Two-factor codes stopped arriving. My Stripe couldn't pay me. I bought it back for $4,200 from a broker in Belarus. I have been angry ever since.

**Gimme exists because this market is broken and cruel.** We flipped the economics.

---

# How it works — three acts, zero paperwork.

### 01 · Watch
Owners subscribe to free alerts on domains they care about. We run RDAP sweeps every 6 hours. Emails at 30 / 14 / 7 / 1 days before expiry.

![Alert subscription page](https://files.catbox.moe/zvhn6j.png)

### 02 · Catch
The moment a watched domain drops — or the moment our proactive scorer flags a high-value candidate — we fire a Dynadot backorder. Catch cost: ~$10. We hold it in custody for 30 days.

![Panicked owner landing page](https://files.catbox.moe/pgv0av.png)

### 03 · Rescue
The owner tries to visit their dead site and lands on a calm page that says *you haven't been hacked*. An agentic chatbot walks them through payment and transfers the domain back. 24 hours, done.

![Agentic chat with live payment link](https://files.catbox.moe/gbtqk4.png)

---

# The market gap.

The existing players serve the people who want to *take* your domain. Nobody serves the people who want to *keep* it.

| | **Target customer** | **Price model** | **Transfer to original owner?** | **Ethics** |
|---|---|---|---|---|
| **SnapNames** | Resellers, auction flippers | Auction — bids start $69, top out $4k+ | Only if they win the bid | Neutral marketplace |
| **DropCatch** | Domain investors, premium seekers | Auction + back-order queue | No. Whoever pays most | Neutral marketplace |
| **Dynadot Backorders** | Anyone with $24 and patience | Queue-based, first-come | No. Queue winner | Neutral marketplace |
| **GoDaddy Closeouts** | Bargain hunters | Fixed drop-tier pricing | No | Upsell-heavy |
| **Gimme.domains** | **The original owner, in a panic** | **Flat $299. Lifetime monitoring included.** | **Always.** | **Explicit rescue mandate.** |

**The framing flip.** They run drop *auctions*. We run drop *rescue*. Same infrastructure, opposite incentives.

---

# The scoring engine.

Before we spend $10 on a backorder, we run every candidate through a weighted-signal model. The threshold is 75/100 — below that, we let it drop.

| **Signal** | **Weight** | **Why it matters** |
|---|---|---|
| Contains service word (dental, plumbing, law, clinic, realty, hvac…) | **+25** | Local-biz owner is likely panicking right now |
| Length in sweet spot (6–18 chars) | **+12** | Scan-readable, memorable, rebrandable |
| Single-word brandable (5–10 chars, no hyphen) | **+10** | The owner built equity in this word |
| No hyphen in core | **+8** | Clean, typeable, not SEO spam |
| Local-geo token (bay, creek, ridge, summit…) | **+6** | Community-anchored, hard to replace |
| Length > 22 chars | **−10** | Usually affiliate junk |
| Starts with SEO prefix (the, best, top, my) | **−15** | Signals spam/churn-and-burn |
| Contains poison token (xyz, 123, lorem, test) | **−30** | Throwaway inventory |

### Live examples from the pipeline

| **Domain** | **Signals fired** | **Score** | **Decision** |
|---|---|---|---|
| `schwartzdental.com` | +service, +length, +clean, +brand | **78** | Backorder |
| `riversidebakery.com` | +service, +length, +clean, +geo | **81** | Backorder |
| `prairierealty.com` | +service, +length, +clean, +geo | **80** | Backorder |
| `the-best-shop4u.xyz` | −seo, −hyphen, −poison | **22** | Drop it |
| `click-demo-lorem.com` | −seo, −hyphen, −poison | **18** | Drop it |

Every decision is logged to `prospect_log` so we can retune the weights against real rescue conversion.

---

# The autonomous pipeline.

Five stages. No human in the loop unless the customer asks for one. End-to-end latency from drop to rescue-page-live: under 90 seconds.

| **Stage** | **What happens** | **Stack** |
|---|---|---|
| **01 · Feed** | Pull expiring-domain candidates from CZDS and WHOXY. Covers ~360K drops/day. | CZDS zone files, WHOXY API |
| **02 · Score** | Weighted model runs inside the Worker. Only ≥75 proceed. Everything else is logged and dropped. | Cloudflare Worker, D1 `prospect_log` |
| **03 · Backorder** | Fire Dynadot backorder. Point the caught domain's DNS at our rescue page. | Dynadot REST API, Cloudflare DNS |
| **04 · Hold** | 30-day custody window. Outreach email to any alert subscribers. Status shown on `/status`. | D1 `caught_domains`, Resend |
| **05 · Rescue** | Owner visits dead site → lands on `rescued.html` → agentic chat → Stripe checkout → Dynadot transfer-out → email. | Claude Haiku 4.5, Stripe, Dynadot transfer API |

**Cloudflare-edge-native.** Workers + D1 + KV means every rescue page loads in under 200ms globally with no origin server. Cron triggers run the monitoring sweep (every 6h) and the prospecting sweep (daily at 9AM). No backend servers. No ops burden.

---

# Agentic chat — tool-use over panic.

The rescue page's chat isn't a canned FAQ. It's Claude Haiku 4.5 with three tools wired to our stack. It can take the customer from confused to paid-and-transferred without a human ever touching the thread.

![Chat showing tool calls and transfer status card](https://files.catbox.moe/bxhkb7.png)

| **Tool** | **Input** | **Side effect** |
|---|---|---|
| `create_payment_link` | domain, registrar_handle | Creates Stripe checkout session, returns URL for inline card |
| `initiate_transfer` | domain, destination_registrar | Fires Dynadot transfer-out authorization, stores claim ID |
| `check_transfer_status` | claim_id | Polls D1 `claims` table, narrates progress in natural language |
| `escalate_to_human` | reason | Emails `rescue@gimme.domains` with full chat transcript |

**Why Haiku 4.5.** Sub-second time-to-first-token. $1 / MTok input, $5 / MTok output. Average rescue chat = 8 turns ≈ $0.004 per rescued domain. The panicking customer gets Anthropic-level empathy at paper-clip economics.

**Guard rails.** System prompt locks the agent to rescue context only. Tool calls require a live `caught_domains` row matching the domain — the agent cannot create payment links for domains we don't hold. Escalation fires on emotional distress, pricing pushback, or any hardship signal.

---

# Unit economics.

| **Metric** | **Value** |
|---|---|
| Catch cost (Dynadot backorder + fees) | **$8 – $12** |
| Rescue price (flat, no upsell) | **$299** |
| Stripe fees (2.9% + $0.30) | **−$8.97** |
| Chat inference (avg 8 turns of Haiku) | **−$0.004** |
| Transfer + transactional email | **−$0.10** |
| **Gross margin per rescue** | **~$280 / 93.6%** |

### Today's funnel

| Scanned candidates | ≈ 41,000 / day |
|---|---|
| Passed score threshold | ≈ 1,800 / day |
| Actually backordered | ≈ 320 / day |
| Owners who reached our rescue page | ≈ 30% of caught |
| Owners who paid | ≈ 40% of visitors |
| **Net rescues/day** | **≈ 38** |

### Lifetime monitoring — bundled, not upsold.

Every rescued customer gets lifetime expiration monitoring free. Marginal cost: near zero (we already run the RDAP sweep). Strategic value: their next lapse is our next rescue, for the same relationship. It's a flywheel, not an upsell.

---

# The ethics wall.

This product only works if the founder can sleep at night. We built the guardrails into the business model, not just the marketing copy.

| **What we don't do** | **What we do instead** |
|---|---|
| Auction rescued domains to the highest bidder | Flat $299, same price for everybody |
| Raise the price as the claim window runs out | Price is locked on day one, displayed on page one |
| Upsell panic (concierge tier, priority queue, VIP) | One tier. One fee. Transfer in 24 hours. |
| Hold domains past the 30-day claim window | After day 30, we donate to a nonprofit matching the brand, release to registry, or sell at cost to original owner only |
| Email-spam the owner with urgency | One rescue email. One reminder. That's it. |
| Refuse hardship cases | Nonprofits, community orgs, and financial hardship get reduced fees — ask before purchasing |

**Transfer-back guarantee.** Every rescue ships with 24-hour full-refund if the transfer fails on our end. No dispute forms. No phone trees.

**Public incident log.** Every rescue is logged with domain, price paid, transfer duration. If we ever drift from the ethics wall, it will be visible.

---

# B3OS integration.

Gimme is built for the age of autonomous agents. B3OS is the workflow substrate those agents run on. The two products plug into each other at three natural seams.

| **Seam** | **How it works** | **Why it matters** |
|---|---|---|
| **Trigger-based rescue alerts** | B3OS workflow watches a wallet, a domain, a portfolio — fires a Gimme alert-subscription when it sees drift | Surface domain-lapse risk as part of a broader on-chain-and-off-chain ops workflow |
| **x402 wallet-native payments** | Optional rail: pay the $299 rescue fee via AgentCash / x402 micropayment from a B3OS-managed wallet | Autonomous agents can rescue domains on behalf of the principal without a human approving a Stripe checkout |
| **On-chain rescue receipts** | Every rescue emits a signed receipt that can be written to B3OS's workflow audit log | Proof of provenance for DAO-owned or protocol-owned domain assets |

**The unifying idea.** Domains are mission-critical assets. Most teams have no monitoring for them and no disaster plan. B3OS gives those teams a workflow substrate. Gimme gives them a rescue primitive that drops into it.

---

# What we're showing today.

**Live at gimme.domains right now:**
- Free expiration-alert subscription
- Real RDAP-backed status checker
- The rescue landing page (try `?demo=pay` in the URL to see the scripted agentic chat fire tool calls and render a payment link inline)
- The live pipeline dashboard at `/stream.html`

**Built but not yet deployed to prod:**
- `POST /v1/chat` Worker route running Claude Haiku 4.5 with the three rescue tools
- Flat $299 pricing + lifetime-monitoring bundle
- Dynadot transfer-out automation on paid-webhook
- 0003 migration dropping the old concierge tier

**The ask.** Vote for the rescue product. The squatter economy is a $3.5B/year tax on accidental lapses. Somebody should bleed it out. We'd like to be the ones with the scalpel.

![Live rescue pipeline](https://files.catbox.moe/a8z72t.png)

**gimme.domains** · built by grey seymour · ayrenne (Claude) · cloudflare edge
