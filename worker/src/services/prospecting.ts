// Proactive domain prospecting — the core of the catch business.
//
// Pipeline:
//   fetchCandidates() → scoreDomain() → filter(score >= THRESHOLD) → placeBackorder()
//
// Data source: plug in via fetchCandidates(). Two options below:
//   A) CZDS zone file diffs (free, ~1 week ICANN approval)
//   B) Bulk WHOIS service like WHOXY ($20/mo)
//   C) Manual batch via POST /v1/admin/prospect
//
// We target: established local-business .com domains with low squatter competition.
// We avoid: premium keywords, short domains, generics — those go to auction markets.

export interface ProspectResult {
  domain: string;
  score: number;
  reason: string;
  estibot_value?: number | null;
  contested?: boolean;
  rdap_expiry?: string | null;
  days_until_drop?: number | null;
}

// ---- Estibot appraisal ----
// Adds a market-value signal: if Estibot thinks a domain is worth $300+,
// DropCatch and friends are probably already watching it. We penalise those.
// Requires ESTIBOT_API_KEY env var. Falls back gracefully if not set.
export async function enrichWithEstibot(
  results: ProspectResult[],
  apiKey: string
): Promise<ProspectResult[]> {
  const enriched = await Promise.all(
    results.map(async (r) => {
      try {
        const res = await fetch(
          `https://api.estibot.com/appraise?key=${encodeURIComponent(apiKey)}&domain=${encodeURIComponent(r.domain)}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (!res.ok) return r;
        const data = await res.json() as { appraisal?: number };
        const value = data?.appraisal ?? null;

        if (value === null) return { ...r, estibot_value: null };

        // DropCatch territory: likely contested, lower our score
        if (value >= 500) {
          return {
            ...r,
            estibot_value: value,
            contested: true,
            score: Math.max(0, r.score - 35),
            reason: `${r.reason} · Estibot $${value} — likely contested, deprioritised`,
          };
        }
        // Moderate value: slight caution
        if (value >= 200) {
          return {
            ...r,
            estibot_value: value,
            contested: false,
            score: Math.max(0, r.score - 10),
            reason: `${r.reason} · Estibot $${value} — some competition possible`,
          };
        }
        // Low value: we're almost certainly alone here, small bonus
        return {
          ...r,
          estibot_value: value,
          contested: false,
          score: Math.min(100, r.score + 8),
          reason: `${r.reason} · Estibot $${value} — uncontested territory`,
        };
      } catch {
        return r; // non-fatal — score stands without Estibot
      }
    })
  );
  return enriched.sort((a, b) => b.score - a.score);
}

// ---- Scoring heuristics ----

const SERVICE_WORDS = [
  'dental','dentist','dent','orthodont','ortho','dds','dmd','endodont','periodont',
  'law','legal','attorney','lawyer','llc','esq','counsel',
  'plumb','electric','electrician','hvac','heat','cool','roofing','roof',
  'landscap','lawn','mow','tree','pest','exterminator',
  'clean','maid','janitor','housekeep',
  'medical','clinic','health','doctor','physician','chiro','chiropract','optom','optician','vision','eyecare','eye care',
  'realty','realtor','realestate','homes','property','mortgage',
  'repair','service','solutions','associates','partners','group',
  'salon','spa','barber','hair','nail','beauty','esthetician',
  'restaurant','cafe','bakery','pizza','diner',
  'auto','automotive','mechanic','garage','tire','body shop',
  'accounting','cpa','tax','bookkeep','financial','advisor',
  'insurance','agency',
  'vet','veterinarian','animal','pet','grooming',
  'construction','build','contractor','remodel','renovat',
  'flooring','cabinet','kitchen','bath',
  'moving','storage','logistics',
  'pediatr','geriatric','cardiol','oncol','dermatol','urology','gastro','neurol',
  'physical','therapy','rehab','massage','acupunct','wellness',
  'funeral','mortuary',
  'church','chapel','ministry',
  'daycare','preschool','childcare','tutoring',
  'photography','photo','studio',
];

const GENERIC_KEYWORDS = new Set([
  'buy','sell','shop','store','online','web','digital','tech',
  'crypto','nft','ai','app','software','cloud','data','api',
  'free','cheap','best','top','pro','plus','max','ultra','prime',
  'news','blog','info','hub','zone','world','global',
  'deals','savings','discount','coupon','promo','offer',
  'money','cash','earn','income','profit','invest',
  'dating','adult','sex','casino','poker','slots',
]);

const CONTESTED_SHORT_MAX = 5; // <= 5 chars = premium territory, skip

export function scoreDomain(domain: string): { score: number; reason: string } {
  const name = domain.replace(/\.com$/i, '').toLowerCase();

  if (name.length <= CONTESTED_SHORT_MAX) {
    return { score: 0, reason: 'too short — premium/contested' };
  }
  if (name.length > 35) {
    return { score: 5, reason: 'too long — likely spam or typo domain' };
  }

  // Heavy numbers = not a business brand
  const digits = (name.match(/\d/g) || []).length;
  if (digits > 3) return { score: 10, reason: 'too numeric' };

  // More than one hyphen = awkward brand
  const hyphens = (name.match(/-/g) || []).length;
  if (hyphens > 2) return { score: 10, reason: 'too many hyphens' };

  // Blacklist pure generic keywords or SEO-bait patterns
  const isGeneric = [...GENERIC_KEYWORDS].some(kw =>
    name === kw || name.startsWith(kw + '-') || name.endsWith('-' + kw)
  );
  // Penalise domains that start with aggregator/SEO prefixes even if they contain a service word
  const hasSEOPrefix = /^(best|top|cheap|online|find|get|my|your|the|all|pro|ez|e-|seo|free)/.test(name);
  const hasPoisonWord = /casino|bonus|nft|crypto|poker|slot|adult|xxx|porn|dating|forex|loan/.test(name);
  const hasServiceWord = SERVICE_WORDS.some(sw => name.includes(sw));

  if (isGeneric && !hasServiceWord) {
    return { score: 15, reason: 'generic keyword — squatter bait, skip' };
  }
  if (hasSEOPrefix && hasServiceWord) {
    return { score: 25, reason: 'SEO-bait pattern — not a real business brand' };
  }
  if (hasPoisonWord) {
    return { score: 10, reason: 'poison word — not our market' };
  }

  // Score it
  let score = 35; // baseline — it's at least a real-looking domain

  if (hasServiceWord) score += 40; // strong signal: local business
  if (hyphens === 0) score += 8;   // cleaner brand
  if (digits === 0) score += 7;    // pure alpha = nicer brand
  if (name.length >= 8 && name.length <= 22) score += 8; // sweet spot length
  if (name.match(/^[a-z]/) && !name.match(/[^a-z0-9-]/)) score += 2; // clean chars

  const reason = hasServiceWord
    ? `local business pattern (service word match)`
    : 'business-name structure';

  return { score: Math.min(score, 100), reason };
}

export const BACKORDER_THRESHOLD = 75; // score >= this → we place a backorder

// ---- Candidate fetching ----
// Plug in your data source here. Returns domains expiring within `withinDays`.

export interface CandidateSource {
  // Returns a list of domain names (e.g. ["schwartzdent.com", "millerplumbing.com"])
  fetchExpiring(withinDays: number): Promise<string[]>;
}

// Stub: replace with CZDS or WHOXY integration.
// To use CZDS: apply at czds.icann.org (free, ~1 week approval).
//   Once approved: download the .com zone file daily, diff it against previous,
//   find domains with registrationExpiryDate within withinDays, return them here.
//
// To use WHOXY Bulk WHOIS (~$20/mo):
//   POST to https://api.whoxy.com/?key={key}&history=1&status=expiring&days=30
//   Parse response and return domain list.
export class StubCandidateSource implements CandidateSource {
  async fetchExpiring(_withinDays: number): Promise<string[]> {
    // Replace this with real data source integration.
    // For now returns empty — manual batch via POST /v1/admin/prospect is the
    // way to feed candidates until CZDS or WHOXY is wired up.
    return [];
  }
}

// Manually submitted batch (from admin endpoint or any external source)
export async function scoreBatch(domains: string[]): Promise<ProspectResult[]> {
  return domains
    .map(domain => {
      const { score, reason } = scoreDomain(domain.trim().toLowerCase());
      return { domain: domain.trim().toLowerCase(), score, reason };
    })
    .sort((a, b) => b.score - a.score);
}
