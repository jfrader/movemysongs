export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: string
  ) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, 300)}`);
    this.name = "HttpError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type FetchJsonOptions = RequestInit & {
  /** Called once on 401 to refresh auth; the request is retried with new headers. */
  onUnauthorized?: () => Promise<Record<string, string> | null>;
  maxAttempts?: number;
};

/**
 * fetch with JSON parsing, exponential backoff on 429/5xx/network errors,
 * Retry-After support, and a single 401 refresh hook.
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const { onUnauthorized, maxAttempts = 4, ...init } = options;
  let refreshed = false;
  let headers = { ...(init.headers as Record<string, string> | undefined) };

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      await sleep(500 * 2 ** attempt);
      continue;
    }

    if (res.ok) {
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    const body = await res.text().catch(() => "");

    if (res.status === 401 && onUnauthorized && !refreshed) {
      refreshed = true;
      const newHeaders = await onUnauthorized();
      if (newHeaders) {
        headers = { ...headers, ...newHeaders };
        continue;
      }
    }

    if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs =
        !Number.isNaN(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 60_000)
          : 500 * 2 ** attempt;
      await sleep(waitMs);
      continue;
    }

    throw new HttpError(res.status, url, body);
  }
}

export function formBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}
