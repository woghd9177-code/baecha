"use client";

let counter = 0;

// VWorld's REST APIs are reachable via JSONP (a `callback=` query param
// wraps the JSON body in a function call), which is why this exists:
// calling them as a normal server-side fetch from Vercel gets the
// connection reset outright — VWorld's firewall blocks IDC/cloud-hosting
// IP ranges, including AWS (what Vercel runs on) regardless of region.
// Loading this as a <script> from the *browser* instead sends the request
// from the user's own residential/business ISP address, which isn't
// blocked, and sidesteps CORS entirely (VWorld's JSON endpoints don't send
// Access-Control-Allow-Origin, so a plain client-side fetch() would be
// blocked by the browser anyway).
export function fetchJsonp<T>(url: string, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const callbackName = `__vworldJsonp${Date.now()}_${counter++}`;
    const script = document.createElement("script");
    let settled = false;

    function cleanup() {
      delete (window as unknown as Record<string, unknown>)[callbackName];
      script.remove();
      clearTimeout(timer);
    }

    (window as unknown as Record<string, unknown>)[callbackName] = (data: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("VWorld 요청이 시간 초과됐습니다"));
    }, timeoutMs);

    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("VWorld 요청을 불러오지 못했습니다"));
    };

    const finalUrl = new URL(url);
    finalUrl.searchParams.set("callback", callbackName);
    script.src = finalUrl.toString();
    document.head.appendChild(script);
  });
}
