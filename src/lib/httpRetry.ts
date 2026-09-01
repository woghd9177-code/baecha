function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);

// Retries a request a few times with backoff when the response is a
// transient gateway failure (502/503/504) — public Korean gov/quasi-gov
// APIs (seen with both VWorld and Kakao Mobility) intermittently bounce an
// otherwise-valid request at the gateway layer. A short retry clears most
// of these without every caller needing its own copy of this logic.
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
  baseDelayMs = 300,
): Promise<Response> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1));
    res = await fetch(url, init);
    if (res.ok || attempt >= retries || !TRANSIENT_STATUS_CODES.has(res.status)) return res;
  }
}
