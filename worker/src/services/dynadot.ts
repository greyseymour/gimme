// Dynadot API — domain backorder + transfer-out
// Docs: https://www.dynadot.com/domain/api2.html
// Auth: API key in query param

const DYNADOT_BASE = 'https://api.dynadot.com/api3.json';

async function dynadotRequest(apiKey: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(DYNADOT_BASE);
  url.searchParams.set('key', apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Dynadot API ${res.status}`);
  return res.json();
}

export async function placeBackorder(apiKey: string, domain: string): Promise<{ success: boolean; orderId?: string }> {
  try {
    const data = await dynadotRequest(apiKey, {
      command: 'backorder',
      domain,
    }) as { BackorderResponse?: { ResponseCode?: string; BackorderId?: string } };

    const resp = data?.BackorderResponse;
    if (resp?.ResponseCode === '0') {
      return { success: true, orderId: resp?.BackorderId };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

export async function registerDomain(apiKey: string, domain: string): Promise<{ success: boolean }> {
  try {
    const data = await dynadotRequest(apiKey, {
      command: 'register',
      domain,
      duration: '1',
    }) as { RegisterResponse?: { ResponseCode?: string } };

    return { success: data?.RegisterResponse?.ResponseCode === '0' };
  } catch {
    return { success: false };
  }
}

export async function initiateTransferOut(
  apiKey: string,
  domain: string,
  toEmail: string
): Promise<{ success: boolean; authCode?: string }> {
  try {
    // Unlock domain first
    await dynadotRequest(apiKey, { command: 'set_lock', domain, lock: 'unlocked' });

    // Get auth code
    const data = await dynadotRequest(apiKey, {
      command: 'get_auth_code',
      domain,
    }) as { AuthCodeResponse?: { ResponseCode?: string; AuthCode?: string } };

    const authCode = data?.AuthCodeResponse?.AuthCode;
    if (authCode) {
      return { success: true, authCode };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

export async function checkDomainAvailability(apiKey: string, domain: string): Promise<boolean> {
  try {
    const data = await dynadotRequest(apiKey, {
      command: 'search',
      domain0: domain,
    }) as { SearchResponse?: { SearchResults?: [{ Available?: string }] } };
    return data?.SearchResponse?.SearchResults?.[0]?.Available === 'yes';
  } catch {
    return false;
  }
}
