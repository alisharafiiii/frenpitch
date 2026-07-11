"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/** stale-while-revalidate for GETs: tab switches render the cached data
 *  INSTANTLY, then refresh quietly in the background. cache lives for
 *  the whole mini-app session. */
const cache = new Map<string, unknown>();

export function useApi<T>(
  path: string,
  opts: { intervalMs?: number } = {}
): { data: T | undefined; refresh: () => void } {
  const [data, setData] = useState<T | undefined>(() => cache.get(path) as T | undefined);

  const refresh = useCallback(() => {
    api<T>(path)
      .then((d) => {
        cache.set(path, d);
        setData(d);
      })
      .catch(() => {
        /* keep last known data */
      });
  }, [path]);

  useEffect(() => {
    refresh();
    if (opts.intervalMs) {
      const t = setInterval(refresh, opts.intervalMs);
      return () => clearInterval(t);
    }
  }, [refresh, opts.intervalMs]);

  return { data, refresh };
}

/** warm caches for the other tabs right after first paint */
export function prefetch(paths: string[]): void {
  setTimeout(() => {
    paths.forEach((p) =>
      api(p)
        .then((d) => cache.set(p, d))
        .catch(() => {})
    );
  }, 800);
}
