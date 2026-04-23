// RDAP (IANA standard, free) — replaces paid WhoisXML

export interface RdapResult {
  domain: string;
  status: 'caught' | 'expiring' | 'safe' | 'unknown';
  expiry_date: string | null;
  days_until_expiry: number | null;
  registrar: string | null;
  raw_status: string[];
}

// IANA bootstrap — maps TLDs to RDAP server URLs
const RDAP_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';
let bootstrapCache: Record<string, string> | null = null;

async function getRdapServer(tld: string): Promise<string | null> {
  if (!bootstrapCache) {
    try {
      const res = await fetch(RDAP_BOOTSTRAP, { cf: { cacheTtl: 86400 } } as RequestInit);
      const data = await res.json() as { services: [string[][], string[]][] };
      bootstrapCache = {};
      for (const [tlds, urls] of data.services) {
        for (const t of tlds.flat()) {
          bootstrapCache[t.toLowerCase()] = urls[0];
        }
      }
    } catch {
      return null;
    }
  }
  return bootstrapCache[tld.toLowerCase()] ?? null;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function parseExpiryDate(events: Array<{ eventAction: string; eventDate: string }> | undefined): string | null {
  if (!events) return null;
  const exp = events.find(e =>
    e.eventAction === 'expiration' || e.eventAction === 'registration expiration'
  );
  return exp?.eventDate ?? null;
}

function parseRegistrar(entities: Array<{ roles: string[]; vcardArray?: unknown[] }> | undefined): string | null {
  if (!entities) return null;
  const reg = entities.find(e => e.roles?.includes('registrar'));
  if (!reg?.vcardArray) return null;
  try {
    const props = (reg.vcardArray as [string, unknown[]])[1] as Array<[string, unknown, string, string]>;
    const fn = props.find(p => p[0] === 'fn');
    return fn?.[3] ?? null;
  } catch {
    return null;
  }
}

export async function lookupDomain(domain: string): Promise<RdapResult> {
  const base: RdapResult = {
    domain,
    status: 'unknown',
    expiry_date: null,
    days_until_expiry: null,
    registrar: null,
    raw_status: [],
  };

  const parts = domain.toLowerCase().split('.');
  if (parts.length < 2) return base;
  const tld = parts[parts.length - 1];

  const server = await getRdapServer(tld);
  if (!server) return base;

  try {
    const url = `${server.replace(/\/$/, '')}/domain/${encodeURIComponent(domain)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/rdap+json' },
      cf: { cacheTtl: 3600 },
    } as RequestInit);

    if (res.status === 404) {
      // Domain doesn't exist in registry — likely dropped or never registered
      return { ...base, status: 'unknown' };
    }
    if (!res.ok) return base;

    const data = await res.json() as {
      events?: Array<{ eventAction: string; eventDate: string }>;
      entities?: Array<{ roles: string[]; vcardArray?: unknown[] }>;
      status?: string[];
    };

    const expiryRaw = parseExpiryDate(data.events);
    const registrar = parseRegistrar(data.entities);
    const rawStatus = data.status ?? [];

    let daysUntil: number | null = null;
    if (expiryRaw) {
      daysUntil = daysBetween(new Date(), new Date(expiryRaw));
    }

    let status: RdapResult['status'] = 'safe';
    if (daysUntil !== null && daysUntil <= 0) {
      status = 'unknown'; // expired — may be in drop pipeline
    } else if (daysUntil !== null && daysUntil <= 30) {
      status = 'expiring';
    } else {
      status = 'safe';
    }

    return {
      domain,
      status,
      expiry_date: expiryRaw,
      days_until_expiry: daysUntil,
      registrar,
      raw_status: rawStatus,
    };
  } catch {
    return base;
  }
}
