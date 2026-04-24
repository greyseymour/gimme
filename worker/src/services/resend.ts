// Resend — transactional email (free tier: 3k/mo)

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(apiKey: string, opts: SendOptions): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Gimme.domains <rescue@gimme.domains>',
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        reply_to: opts.replyTo ?? 'rescue@gimme.domains',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- Email templates ----

export function alertEmail(domain: string, daysLeft: number, registrar: string | null): string {
  const urgency = daysLeft <= 1 ? '🚨 FINAL WARNING' : daysLeft <= 7 ? '⚠️ Urgent' : '📅 Heads up';
  const registrarNote = registrar ? `<p style="color:#999;font-size:14px">Your domain is registered at <strong>${registrar}</strong>. Log in there to renew.</p>` : '';
  return `
<!DOCTYPE html><html><body style="background:#0a0a0a;color:#eee;font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px">
<div style="border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;background:#0f1015">
  <p style="font-family:monospace;font-size:12px;color:#666;margin-bottom:24px;letter-spacing:0.1em">GIMME.DOMAINS · EXPIRY ALERT</p>
  <h1 style="font-size:24px;font-weight:600;margin:0 0 8px;letter-spacing:-0.02em">${urgency}: <span style="color:#ffbe0b">${domain}</span></h1>
  <p style="font-size:16px;color:#aaa;margin:0 0 24px">expires in <strong style="color:#fff">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong></p>
  ${registrarNote}
  <p style="color:#bbb;font-size:14px;line-height:1.6;margin:0 0 24px">If your domain expires and squatters grab it, getting it back can cost <strong>$500–$5,000+</strong>. Renew now — it takes 2 minutes and costs about $12/year.</p>
  <a href="https://gimme.domains/status.html?domain=${encodeURIComponent(domain)}" style="display:inline-block;background:linear-gradient(135deg,#7928ca,#00d4ff);color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">Check Status &amp; Renew</a>
  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:32px 0"/>
  <p style="font-size:12px;color:#555">You set up this alert at gimme.domains. <a href="https://gimme.domains" style="color:#555">Unsubscribe</a></p>
</div></body></html>`;
}

export function rescueNotificationEmail(domain: string, claimWindowCloses: string, rescueUrl: string): string {
  return `
<!DOCTYPE html><html><body style="background:#0a0a0a;color:#eee;font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px">
<div style="border:1px solid rgba(0,255,136,0.2);border-radius:16px;padding:40px;background:#0f1015">
  <p style="font-family:monospace;font-size:12px;color:#00ff88;margin-bottom:24px;letter-spacing:0.1em">GIMME.DOMAINS · DOMAIN RESCUED</p>
  <h1 style="font-size:24px;font-weight:600;margin:0 0 8px;letter-spacing:-0.02em">We caught <span style="color:#00d4ff">${domain}</span></h1>
  <p style="font-size:15px;color:#aaa;margin:0 0 24px">before anyone else could grab it</p>
  <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 16px">Your domain expired, and we caught it the moment it became available — before domain squatters could grab it and hold it for ransom.</p>
  <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 24px"><strong style="color:#fff">Your data, hosting, and email are completely untouched.</strong> This is only a registration issue. Pay our flat rescue fee and your domain is back in your hands within 24 hours.</p>
  <div style="background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.15);border-radius:12px;padding:20px;margin-bottom:28px">
    <p style="margin:0 0 4px;font-size:13px;color:#666;font-family:monospace;letter-spacing:0.08em">CLAIM WINDOW CLOSES</p>
    <p style="margin:0;font-size:18px;font-weight:700;color:#ffbe0b">${claimWindowCloses}</p>
  </div>
  <a href="${rescueUrl}" style="display:inline-block;background:linear-gradient(135deg,#7928ca,#00d4ff);color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">Reclaim My Domain — $299</a>
  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:32px 0"/>
  <p style="font-size:12px;color:#555">Gimme.domains — we're on your side. Questions? Reply to this email.</p>
</div></body></html>`;
}

export function claimConfirmationEmail(domain: string, plan: string, claimId: string): string {
  return `
<!DOCTYPE html><html><body style="background:#0a0a0a;color:#eee;font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px">
<div style="border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;background:#0f1015">
  <p style="font-family:monospace;font-size:12px;color:#00ff88;margin-bottom:24px;letter-spacing:0.1em">GIMME.DOMAINS · CLAIM CONFIRMED</p>
  <h1 style="font-size:24px;font-weight:600;margin:0 0 8px;letter-spacing:-0.02em">Payment received — transfer starting now</h1>
  <p style="color:#aaa;margin:0 0 24px;font-size:15px"><strong style="color:#00d4ff">${domain}</strong> is on its way back to you.</p>
  <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 24px">We've initiated the domain transfer (${plan === 'concierge' ? 'Concierge Rescue \u2014 we\u2019ll handle the DNS and email too' : 'Self-Serve Rescue'}). You'll receive the auth/transfer code within a few hours.</p>
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:16px;margin-bottom:28px;font-family:monospace;font-size:13px;color:#666">
    <span>Claim ID: </span><span style="color:#aaa">${claimId}</span>
  </div>
  <p style="font-size:14px;color:#bbb">Questions? Reply to this email and a human will respond — typically within 2 hours.</p>
</div></body></html>`;
}
