import { Hono } from 'hono';
import { sendEmail, alertEmail } from '../services/resend';
import type { Bindings } from '../index';

const alerts = new Hono<{ Bindings: Bindings }>();

alerts.post('/', async (c) => {
  let body: { domain?: string; email?: string; intervals?: number[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const domain = (body.domain ?? '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const email = (body.email ?? '').trim().toLowerCase();
  const intervals = Array.isArray(body.intervals) && body.intervals.length
    ? body.intervals.filter(n => typeof n === 'number' && n > 0)
    : [30, 14, 7, 1];

  if (!domain || !domain.includes('.')) {
    return c.json({ error: 'Invalid domain' }, 400);
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Invalid email address' }, 400);
  }

  const alertId = `alrt_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const nextCheck = new Date(Date.now() + 6 * 3600 * 1000).toISOString();

  // Upsert subscription (idempotent — same domain+email updates intervals)
  await c.env.DB
    .prepare(`
      INSERT INTO alert_subscriptions (domain, email, intervals, last_checked_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(domain, email) DO UPDATE SET
        intervals = excluded.intervals,
        active = 1,
        last_checked_at = datetime('now')
    `)
    .bind(domain, email, JSON.stringify(intervals))
    .run();

  // Send confirmation email (non-blocking — fire and forget)
  if (c.env.RESEND_API_KEY) {
    c.executionCtx.waitUntil(
      sendEmail(c.env.RESEND_API_KEY, {
        to: email,
        subject: `Alert set for ${domain} — Gimme.domains`,
        html: confirmationEmail(domain, intervals, nextCheck),
      })
    );
  }

  return c.json({ success: true, alert_id: alertId, domain, next_check: nextCheck });
});

function confirmationEmail(domain: string, intervals: number[], nextCheck: string): string {
  const dayList = intervals.sort((a, b) => b - a).map(d => `${d} day${d !== 1 ? 's' : ''}`).join(', ');
  return `
<!DOCTYPE html><html><body style="background:#0a0a0a;color:#eee;font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px">
<div style="border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;background:#0f1015">
  <p style="font-family:monospace;font-size:12px;color:#00d4ff;margin-bottom:24px;letter-spacing:0.1em">GIMME.DOMAINS · ALERT CONFIRMED</p>
  <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;letter-spacing:-0.02em">We're watching <span style="color:#00d4ff">${domain}</span></h1>
  <p style="color:#aaa;font-size:14px;margin:0 0 24px">You'll get alerts at: <strong style="color:#fff">${dayList}</strong> before it expires.</p>
  <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 24px">If the domain expires despite our warnings, we'll attempt to catch it before squatters can — and give you first right to reclaim it.</p>
  <a href="https://gimme.domains/status.html?domain=${encodeURIComponent(domain)}" style="display:inline-block;background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.25);color:#00d4ff;padding:12px 24px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:500">Check domain status</a>
  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:28px 0"/>
  <p style="font-size:12px;color:#555">Gimme.domains — not affiliated with any squatting service.</p>
</div></body></html>`;
}

export default alerts;
