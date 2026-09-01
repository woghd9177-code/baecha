function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);

// Retries a request a few times with backoff on either a transient gateway
// status (502/503/504) or `fetch` itself throwing — public Korean gov/
// quasi-gov APIs (seen with both VWorld and Kakao Mobility) intermittently
// bounce an otherwise-valid request, sometimes as a gateway status and
// sometimes as the connection failing outright (surfaced by Node's fetch as
// a generic "fetch failed" with the real reason nested in `cause`). A short
// retry clears most of either kind without every caller needing its own
// copy of this logic.
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
  baseDelayMs = 300,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, init);
      if (res.ok || attempt >= retries || !TRANSIENT_STATUS_CODES.has(res.status)) return res;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// Node's fetch throws a generic `TypeError: fetch failed` for any
// connection-level problem (DNS, TLS, refused/timed-out connection) and
// buries the actual reason in `err.cause` (often itself an error with a
// `.code` like ENOTFOUND/ECONNREFUSED/ETIMEDOUT). Surfacing that in API
// error responses is what makes "fetch failed" actually diagnosable from
// the browser instead of needing to go dig through platform function logs.
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  if (!cause) return err.message;
  const causeCode = (cause as { code?: string })?.code;
  return `${err.message} (cause: ${causeCode ? `${causeCode} - ` : ""}${String(cause)})`;
}
