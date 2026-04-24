import { Hono } from 'hono';
import { createCheckoutSession, verifyWebhookSignature } from '../services/stripe';
import { sendEmail, claimConfirmationEmail } from '../services/resend';
import { initiateTransferOut } from '../services/dynadot';
import type { Bindings } from '../index';

const rescue = new Hono<{ Bindings: Bindings }>();

// POST /rescue/claim — start Stripe checkout
rescue.post('/claim', async (c) => {
  let body: { domain?: string; email?: string; registrar_handle?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const domain = (body.domain ?? '').trim().toLowerCase();
  const email = (body.email ?? '').trim().toLowerCase();

  if (!domain || !domain.includes('.')) return c.json({ error: 'Invalid domain' }, 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Invalid email' }, 400);
  }

  // Verify we actually hold this domain
  const caught = await c.env.DB
    .prepare('SELECT * FROM caught_domains WHERE domain = ? AND status = ?')
    .bind(domain, 'holding')
    .first<{ rescue_price_usd: number; claim_window_closes: string }>();

  if (!caught) {
    return c.json({ error: 'Domain not found in our custody — please email rescue@gimme.domains' }, 404);
  }

  const amountUsd = caught.rescue_price_usd;
  const claimId = `clm_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;

  // Create DB record before Stripe (idempotency)
  await c.env.DB
    .prepare(`
      INSERT INTO claims (id, domain, email, registrar_handle, plan, amount_usd, payment_status, transfer_status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', 'pending')
    `)
    .bind(claimId, domain, email, body.registrar_handle ?? null, 'self', amountUsd)
    .run();

  if (!c.env.STRIPE_SECRET_KEY) {
    // Dev mode — skip Stripe, return mock success
    return c.json({
      success: true,
      claim_id: claimId,
      payment_url: null,
      rescue_price_usd: amountUsd,
      transfer_eta_hours: 24,
      dev_mode: true,
    });
  }

  try {
    const session = await createCheckoutSession(c.env.STRIPE_SECRET_KEY, {
      domain,
      email,
      claimId,
      plan: 'self',
      frontendUrl: c.env.FRONTEND_URL,
    });

    return c.json({
      success: true,
      claim_id: claimId,
      payment_url: session.url,
      rescue_price_usd: amountUsd,
      transfer_eta_hours: 24,
    });
  } catch (err) {
    return c.json({ error: 'Payment setup failed — please email rescue@gimme.domains' }, 500);
  }
});

// GET /rescue/verify?claim_id=clm_xxx — poll transfer status
rescue.get('/verify', async (c) => {
  const claimId = c.req.query('claim_id')?.trim();
  if (!claimId) return c.json({ error: 'Missing claim_id' }, 400);

  const claim = await c.env.DB
    .prepare('SELECT * FROM claims WHERE id = ?')
    .bind(claimId)
    .first<{
      id: string; domain: string; transfer_status: string;
      payment_status: string; completed_at: string | null;
    }>();

  if (!claim) return c.json({ error: 'Claim not found' }, 404);

  const messages: Record<string, string> = {
    pending: 'Payment received — preparing transfer.',
    initiated: 'Transfer in progress. ETA 12–24 hours.',
    complete: 'Transfer complete. Check your registrar inbox.',
    failed: 'Issue encountered — our team will contact you shortly.',
  };

  return c.json({
    claim_id: claim.id,
    domain: claim.domain,
    transfer_status: claim.transfer_status,
    message: messages[claim.transfer_status] ?? 'Processing.',
    completed_at: claim.completed_at,
  });
});

// POST /rescue/webhook — Stripe webhook handler
rescue.post('/webhook', async (c) => {
  const payload = await c.req.text();
  const signature = c.req.header('stripe-signature') ?? '';

  if (!c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json({ error: 'Webhook not configured' }, 500);
  }

  const valid = await verifyWebhookSignature(payload, signature, c.env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return c.json({ error: 'Invalid signature' }, 400);

  const event = JSON.parse(payload) as {
    type: string;
    data: { object: { metadata?: { claim_id?: string; domain?: string; plan?: string }; customer_email?: string } };
  };

  if (event.type === 'checkout.session.completed') {
    const meta = event.data.object.metadata ?? {};
    const claimId = meta.claim_id;
    const domain = meta.domain;
    const email = event.data.object.customer_email ?? '';

    if (claimId && domain) {
      // Mark payment as paid
      await c.env.DB
        .prepare(`UPDATE claims SET payment_status = 'paid', transfer_status = 'initiated' WHERE id = ?`)
        .bind(claimId)
        .run();

      // Mark caught domain as claimed
      await c.env.DB
        .prepare(`UPDATE caught_domains SET status = 'claimed' WHERE domain = ?`)
        .bind(domain)
        .run();

      // Kick off transfer + email (non-blocking)
      c.executionCtx.waitUntil(
        handlePostPayment(c.env, domain, email, claimId)
      );
    }
  }

  return c.json({ received: true });
});

async function handlePostPayment(
  env: Bindings,
  domain: string,
  email: string,
  claimId: string,
): Promise<void> {
  if (env.DYNADOT_API_KEY) {
    const transfer = await initiateTransferOut(env.DYNADOT_API_KEY, domain, email);
    if (transfer.success) {
      await env.DB
        .prepare(`UPDATE claims SET transfer_status = 'initiated' WHERE id = ?`)
        .bind(claimId)
        .run();
    }
  }

  if (env.RESEND_API_KEY && email) {
    await sendEmail(env.RESEND_API_KEY, {
      to: email,
      subject: `${domain} — transfer started! Gimme.domains`,
      html: claimConfirmationEmail(domain, 'self', claimId),
    });
  }
}

export default rescue;
