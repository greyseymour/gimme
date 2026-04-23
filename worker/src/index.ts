import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import domainRoutes from './routes/domain';
import alertRoutes from './routes/alerts';
import rescueRoutes from './routes/rescue';
import { lookupDomain } from './services/rdap';
import { sendEmail, alertEmail, rescueNotificationEmail } from './services/resend';
import { placeBackorder } from './services/dynadot';

export type Bindings = {
  // D1 database
  DB: D1Database;
  // KV cache
  CACHE: KVNamespace;
  // Secrets (set via wrangler secret put)
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY: string;
  DYNADOT_API_KEY: string;
  // Vars (set in wrangler.toml)
  FRONTEND_URL: string;
  CLAIM_WINDOW_DAYS: string;
  DEFAULT_RESCUE_PRICE_USD: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ---------- MIDDLEWARE ----------
app.use('*', logger());
app.use('/v1/*', cors({
  origin: (origin) => {
    const allowed = ['https://gimme.domains', 'http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1'];
    return allowed.some(o => origin?.startsWith(o)) ? origin : 'https://gimme.domains';
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600,
}));

// ---------- ROUTES ----------
app.route('/v1/domain', domainRoutes);
app.route('/v1/alerts', alertRoutes);
app.route('/v1/rescue', rescueRoutes);

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'gimme-worker' }));
app.get('/v1/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }));

// ---------- CRON: MONITORING SWEEP ----------
async function runMonitoringSweep(env: Bindings): Promise<void> {
  // Fetch all active alert subscriptions
  const { results: subscriptions } = await env.DB
    .prepare(`
      SELECT DISTINCT domain FROM alert_subscriptions WHERE active = 1
    `)
    .all<{ domain: string }>();

  if (!subscriptions.length) return;

  for (const { domain } of subscriptions) {
    try {
      const result = await lookupDomain(domain);

      // Update domains table
      await env.DB
        .prepare(`
          INSERT INTO domains (domain, status, expiry_date, registrar, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(domain) DO UPDATE SET
            status = excluded.status,
            expiry_date = excluded.expiry_date,
            registrar = excluded.registrar,
            updated_at = datetime('now')
        `)
        .bind(domain, result.status, result.expiry_date, result.registrar)
        .run();

      // Invalidate cache
      await env.CACHE.delete(`rdap:${domain}`);

      // Fire expiry alert emails if thresholds crossed
      if (result.days_until_expiry !== null && result.days_until_expiry >= 0) {
        const days = result.days_until_expiry;
        const thresholds = [30, 14, 7, 1];
        const triggered = thresholds.find(t => days <= t && days > t - 1);

        if (triggered) {
          const { results: subs } = await env.DB
            .prepare(`SELECT email, intervals FROM alert_subscriptions WHERE domain = ? AND active = 1`)
            .bind(domain)
            .all<{ email: string; intervals: string }>();

          for (const sub of subs) {
            const intervals: number[] = JSON.parse(sub.intervals ?? '[30,14,7,1]');
            if (intervals.includes(triggered) && env.RESEND_API_KEY) {
              await sendEmail(env.RESEND_API_KEY, {
                to: sub.email,
                subject: `${domain} expires in ${days} day${days !== 1 ? 's' : ''} — Gimme.domains`,
                html: alertEmail(domain, days, result.registrar),
              });
            }
          }
        }
      }

      // If domain has dropped (RDAP returns 404/unknown and it was previously active)
      // queue a backorder attempt
      if (result.status === 'unknown' && env.DYNADOT_API_KEY) {
        const existing = await env.DB
          .prepare('SELECT id FROM caught_domains WHERE domain = ?')
          .bind(domain)
          .first();

        if (!existing) {
          // Queue backorder — fire and forget, don't block cron
          placeBackorder(env.DYNADOT_API_KEY, domain).then(async (res) => {
            if (res.success) {
              await markAsCaught(env, domain);
            }
          }).catch(() => {/* non-fatal */});
        }
      }
    } catch {
      // Non-fatal per-domain error — continue loop
    }
  }
}

async function markAsCaught(env: Bindings, domain: string): Promise<void> {
  const claimWindowDays = parseInt(env.CLAIM_WINDOW_DAYS ?? '30', 10);
  const rescuePrice = parseFloat(env.DEFAULT_RESCUE_PRICE_USD ?? '249');
  const claimWindowCloses = new Date(Date.now() + claimWindowDays * 86_400_000).toISOString();

  await env.DB
    .prepare(`
      INSERT OR IGNORE INTO caught_domains
        (domain, caught_at, catch_registrar, cost_usd, claim_window_closes, rescue_price_usd, concierge_price_usd, status)
      VALUES (?, datetime('now'), 'dynadot', 10, ?, ?, 499, 'holding')
    `)
    .bind(domain, claimWindowCloses, rescuePrice)
    .run();

  // Send outreach email to all alert subscribers for this domain
  const { results: subs } = await env.DB
    .prepare('SELECT email FROM alert_subscriptions WHERE domain = ? AND active = 1')
    .bind(domain)
    .all<{ email: string }>();

  const rescueUrl = `${env.FRONTEND_URL}/rescued.html?domain=${encodeURIComponent(domain)}`;
  const claimWindowStr = new Date(claimWindowCloses).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  for (const sub of subs) {
    if (env.RESEND_API_KEY) {
      await sendEmail(env.RESEND_API_KEY, {
        to: sub.email,
        subject: `We caught ${domain} before the squatters did — Gimme.domains`,
        html: rescueNotificationEmail(domain, claimWindowStr, rescueUrl),
      });

      await env.DB
        .prepare(`UPDATE caught_domains SET outreach_sent = 1, outreach_email = ? WHERE domain = ?`)
        .bind(sub.email, domain)
        .run();
    }
  }
}

// ---------- EXPORT ----------
export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runMonitoringSweep(env));
  },
};
