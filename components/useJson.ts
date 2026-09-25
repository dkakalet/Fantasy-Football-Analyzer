"use client";

import { useEffect, useState } from "react";

interface State<T> {
  url: string | null;
  data: T | null;
  error: string | null;
}

/**
 * GET a JSON endpoint whenever `url` changes (null = don't fetch). While a new
 * URL loads, the previous data stays available so the UI doesn't flash empty.
 */
export function useJson<T>(url: string | null) {
  const [state, setState] = useState<State<T>>({ url: null, data: null, error: null });

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        return body as T;
      })
      .then(
        (data) => setState({ url, data, error: null }),
        (e: unknown) => {
          if (!ctrl.signal.aborted) setState((s) => ({ url, data: s.data, error: e instanceof Error ? e.message : String(e) }));
        },
      );
    return () => ctrl.abort();
  }, [url]);

  return {
    data: state.data,
    loading: url !== null && state.url !== url,
    error: state.url === url ? state.error : null,
  };
}
