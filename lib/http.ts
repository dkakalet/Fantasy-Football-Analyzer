// Server-side fetch helpers. Responses bypass Next's data cache (`no-store`);
// caching is handled explicitly by lib/cache.ts so TTLs are visible in one place.

const DEFAULT_TIMEOUT_MS = 20_000;
const USER_AGENT = "trade-analyzer/0.1 (personal, non-commercial)";

export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
  ) {
    super(`HTTP ${status} from ${url}`);
  }
}

async function request(url: string, timeoutMs: number): Promise<Response> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new HttpError(url, res.status);
  return res;
}

export async function fetchJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  return (await request(url, timeoutMs)).json() as Promise<T>;
}

export async function fetchText(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  return (await request(url, timeoutMs)).text();
}
