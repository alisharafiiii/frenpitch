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

/** tg start param (tournament invite code) if the app was opened via
 *  t.me/frenpitch_bot?startapp=CODE */
export function startParam(): string | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } };
  };
  return w.Telegram?.WebApp?.initDataUnsafe?.start_param ?? null;
}
