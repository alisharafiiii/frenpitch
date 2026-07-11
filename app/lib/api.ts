"use client";

/** client api helper — attaches telegram initData so the server can
 *  verify who's calling. outside telegram you become the shared demo fren. */

function initData(): string {
  if (typeof window === "undefined") return "";
  const w = window as unknown as { Telegram?: { WebApp?: { initData?: string } } };
  return w.Telegram?.WebApp?.initData ?? "";
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "x-init-data": initData(),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

/** tg start param (invite code) — checks every place telegram may put it:
 *  initDataUnsafe.start_param, the url hash (tgWebAppStartParam), and
 *  plain query params (browser testing). */
export function startParam(): string | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } };
  };
  const fromBridge = w.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (fromBridge) return fromBridge;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const fromHash = hash.get("tgWebAppStartParam");
  if (fromHash) return fromHash;
  const qs = new URLSearchParams(window.location.search);
  return qs.get("tgWebAppStartParam") ?? qs.get("startapp") ?? null;
}

/** the bridge can inject slightly after first render — poll briefly
 *  so an invite code is never missed (minted mind pattern). */
export function waitForStartParam(cb: (code: string) => void, tries = 10): void {
  let attempt = 0;
  const tick = () => {
    const code = startParam();
    if (code) {
      cb(code);
      return;
    }
    attempt++;
    if (attempt < tries) setTimeout(tick, 400);
  };
  tick();
}
