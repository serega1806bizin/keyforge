import { useCallback, useRef, useState } from "react";

export interface AsyncAction<Args extends unknown[]> {
  busy: boolean;
  run: (...args: Args) => Promise<void>;
}

export function useAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<void>,
): AsyncAction<Args> {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(
    async (...args: Args) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      try {
        await action(...args);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [action],
  );

  return { busy, run };
}
