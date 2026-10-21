"use client";

import { useCallback, useEffect, useState } from "react";

export type ApiState<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };

/**
 * Fetches JSON from an app API route. Responses with `ok: false` or a non-2xx
 * status surface as `error` (never as data), so pages can show a real error
 * state instead of silently rendering zeros.
 */
export function useApi<T>(url: string | null): ApiState<T> {
  const [nonce, setNonce] = useState(0);
  const key = url ? `${url}#${nonce}` : null;
  // Results are tagged with the request key, so "loading" is derived instead of
  // being set synchronously inside the effect.
  const [result, setResult] = useState<{ key: string | null; data: T | null; error: string | null }>({ key: null, data: null, error: null });

  useEffect(() => {
    if (!url || !key) return;
    let cancelled = false;
    fetch(url, { credentials: "include" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
        if (cancelled) return;
        if (!res.ok || !body || body.ok === false) {
          setResult({ key, data: null, error: body?.error || `Request failed (${res.status}).` });
        } else {
          setResult({ key, data: body, error: null });
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ key, data: null, error: "Could not reach the server. Check your connection." });
      });
    return () => {
      cancelled = true;
    };
  }, [url, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const loading = Boolean(key) && result.key !== key;
  // Keep showing the previous data while a reload is in flight.
  return { data: result.data, error: loading ? null : result.error, loading, reload };
}

export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: (T & { ok?: boolean; error?: string }) | null }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
  return { ok: res.ok && data?.ok !== false, status: res.status, data };
}
