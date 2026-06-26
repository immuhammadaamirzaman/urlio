import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "../lib/errors";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Run an async fetcher on mount and whenever a dependency in `deps` changes.
 * Returns loading/error state plus a `reload` and a `setData` for optimistic updates.
 */
export function useAsyncData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    fetcher(controller.signal)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active && err?.name !== "AbortError") setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload, setData };
}
