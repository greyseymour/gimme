import { Hono } from 'hono';
import { lookupDomain } from '../services/rdap';
import type { Bindings } from '../index';

const domain = new Hono<{ Bindings: Bindings }>();

domain.get('/status', async (c) => {
  const raw = c.req.query('domain')?.trim().toLowerCase() ?? '';
  const name = raw
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];

  if (!name || !name.includes('.')) {
    return c.json({ error: 'Invalid domain' }, 400);
  }

  // Check our DB first — do we hold this domain?
  const caught = await c.env.DB
    .prepare('SELECT * FROM caught_domains WHERE domain = ? AND status = ?')
    .bind(name, 'holding')
    .first<{
      domain: string; caught_at: string; claim_window_closes: string;
      rescue_price_usd: number; concierge_price_usd: number;
    }>();

  if (caught) {
    return c.json({
      domain: name,
      status: 'caught',
      caught_date: caught.caught_at,
      claim_window_closes: caught.claim_window_closes,
      rescue_price_usd: caught.rescue_price_usd,
      concierge_price_usd: caught.concierge_price_usd,
      gimme_holds: true,
    });
  }

  // Try KV cache
  const cacheKey = `rdap:${name}`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) {
    return c.json(JSON.parse(cached));
  }

  // Try our monitoring DB — if we have data < 2 hours old, use it
  const monitored = await c.env.DB
    .prepare(`SELECT * FROM domains WHERE domain = ? AND updated_at > datetime('now', '-2 hours')`)
    .bind(name)
    .first<{ domain: string; status: string; expiry_date: string | null; registrar: string | null }>();

  if (monitored) {
    const days = monitored.expiry_date
      ? Math.floor((new Date(monitored.expiry_date).getTime() - Date.now()) / 86_400_000)
      : null;
    return c.json({
      domain: name,
      status: monitored.status,
      expiry_date: monitored.expiry_date,
      days_until_expiry: days,
      registrar: monitored.registrar,
      gimme_holds: false,
    });
  }

  // Live RDAP lookup
  const result = await lookupDomain(name);
  const response = {
    domain: name,
    status: result.status,
    expiry_date: result.expiry_date,
    days_until_expiry: result.days_until_expiry,
    registrar: result.registrar,
    gimme_holds: false,
  };

  // Cache for 1 hour (unless expiring soon — then shorter)
  const ttl = result.days_until_expiry !== null && result.days_until_expiry <= 7
    ? 1800
    : 3600;
  await c.env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: ttl });

  // Upsert into domains table for monitoring
  await c.env.DB
    .prepare(`
      INSERT INTO domains (domain, status, expiry_date, registrar, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(domain) DO UPDATE SET
        status = excluded.status,
        expiry_date = excluded.expiry_date,
        registrar = excluded.registrar,
        updated_at = datetime('now')
    `)
    .bind(name, result.status, result.expiry_date, result.registrar)
    .run();

  return c.json(response);
});

export default domain;
