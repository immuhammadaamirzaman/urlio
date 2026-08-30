import { useEffect, useState } from "react";

/**
 * Trails `value` by `delayMs`, settling only once the input stops changing.
 *
 * Used to keep a search box responsive while the request it drives fires at most once
 * per pause in typing. Feed the raw input state in and the returned value into the
 * fetch dependencies.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
