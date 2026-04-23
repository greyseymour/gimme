// Stripe — checkout session creation + webhook verification

export interface CheckoutSession {
  url: string;
  session_id: string;
}

export async function createCheckoutSession(
  secretKey: string,
  opts: {
    domain: string;
    email: string;
    claimId: string;
    plan: 'self' | 'concierge';
    frontendUrl: string;
  }
): Promise<CheckoutSession> {
  const price = opts.plan === 'concierge' ? 49900 : 24900; // cents
  const planLabel = opts.plan === 'concierge' ? 'Concierge Rescue' : 'Self-Serve Rescue';

  const params = new URLSearchParams({
    'payment_method_types[]': 'card',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': `Domain Rescue — ${opts.domain}`,
    'line_items[0][price_data][product_data][description]': planLabel,
    'line_items[0][price_data][unit_amount]': String(price),
    'line_items[0][quantity]': '1',
    mode: 'payment',
    customer_email: opts.email,
    'metadata[claim_id]': opts.claimId,
    'metadata[domain]': opts.domain,
    'metadata[plan]': opts.plan,
    success_url: `${opts.frontendUrl}/rescued.html?domain=${encodeURIComponent(opts.domain)}&claim_id=${opts.claimId}&payment=success`,
    cancel_url: `${opts.frontendUrl}/rescued.html?domain=${encodeURIComponent(opts.domain)}&payment=cancelled`,
  });

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } };
    throw new Error(err.error?.message ?? 'Stripe error');
  }

  const session = await res.json() as { url: string; id: string };
  return { url: session.url, session_id: session.id };
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
      const [k, v] = part.split('=');
      acc[k] = v;
      return acc;
    }, {});

    const timestamp = parts['t'];
    const sigHash = parts['v1'];
    if (!timestamp || !sigHash) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
    const expected = Array.from(new Uint8Array(mac))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return expected === sigHash;
  } catch {
    return false;
  }
}
