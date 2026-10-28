import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { errorMessage, isAbortError } from "../lib/errors";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: Dispatch<SetStateAction<T | null>>;
}

/**
 * Run an async fetcher on mount and whenever a value in `deps` changes.
 * Returns loading/error state plus a `reload` and a `setData` for optimistic updates.
 *
 * `deps` must hold JSON-serializable values (the primitives every call site passes:
 * ids, search terms, offsets, filter flags). They are compared by serialized value
 * rather than spread into the effect's dependency array, so the array stays a fixed
 * size even if a caller varies the number of dependencies between renders.
 */
export function useAsyncData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // The fetcher is a fresh closure on every render, so it is deliberately not a
  // dependency below — `depsKey` decides when to refetch. Kept in a ref (updated
  // by the effect above the fetch, which React runs first) so a refetch always
  // calls the latest closure rather than the one captured on mount.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: unknown) => {
        if (active && !isAbortError(err)) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [depsKey, nonce]);

  return { data, loading, error, reload, setData };
}
