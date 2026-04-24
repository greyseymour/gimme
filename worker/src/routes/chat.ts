import { Hono } from 'hono';
import type { Bindings } from '../index';

const chat = new Hono<{ Bindings: Bindings }>();

const SYSTEM_PROMPT = `You are a calm, warm support agent for Gimme.domains — a service that catches expired domains before squatters can grab them and returns them to their original owners.

Your job is to reassure panicked domain owners and answer their questions simply. The person you're talking to is probably stressed and not very technical.

Key facts to communicate when relevant:
- Their files, email, and data are completely safe. A domain expiring doesn't touch any of that.
- Their domain didn't get "hacked" — the registration simply lapsed, and we caught it first.
- Gimme.domains holds the domain and will return it to them. We're on their side.
- One flat fee: $299. That covers the full rescue — domain transferred back, DNS and email brought back online, and lifetime monitoring so it never lapses again. No upsells, no tiers.
- Transfers typically complete within 24 hours after payment.
- They can email rescue@gimme.domains to talk to a real human.

Rules:
- Keep responses to 2–3 short sentences max.
- No jargon (avoid: DNS, ICANN, registrar, TLD, RDAP, EPP unless they ask).
- Never minimize their stress — acknowledge it briefly, then reassure.
- If they're asking something you genuinely don't know, tell them to email rescue@gimme.domains.
- Never make up domain status, transfer timelines, or pricing beyond what's listed above.
- Stay warm but professional. No exclamation points unless they're genuinely excited.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  domain?: string;
  message: string;
  history?: ChatMessage[];
}

chat.post('/', async (c) => {
  let body: ChatRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const message = (body.message ?? '').trim();
  if (!message) return c.json({ error: 'message required' }, 400);

  if (!c.env.ANTHROPIC_API_KEY) {
    return c.json({
      reply: "I'm having trouble connecting right now. Please email rescue@gimme.domains and a real human will help you right away.",
    });
  }

  const domain = (body.domain ?? '').trim().toLowerCase();
  const history: ChatMessage[] = Array.isArray(body.history) ? body.history.slice(-8) : [];

  const systemPrompt = domain
    ? `${SYSTEM_PROMPT}\n\nThe domain in question is: ${domain}`
    : SYSTEM_PROMPT;

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message },
  ];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': c.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: systemPrompt,
        messages,
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status}`);
    }

    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    const reply = data.content.find((b) => b.type === 'text')?.text ?? '';

    return c.json({ reply });
  } catch {
    return c.json({
      reply: "Something went wrong on my end. Please email rescue@gimme.domains and we'll sort it out quickly.",
    });
  }
});

export default chat;
