import { useEffect, useState } from "react";
import type { OutputAdapter } from "../adapters/outputAdapter";
import type { GameState } from "../core/types";

interface OutputStatus {
  connected: boolean;
  lastPushAt: number | null;
  error: string | null;
}

export function useOutputAdapter(adapter: OutputAdapter, state: GameState): OutputStatus {
  const [connected, setConnected] = useState(false);
  const [lastPushAt, setLastPushAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isDisposed = false;

    void (async () => {
      try {
        await adapter.connect();
        if (!isDisposed) {
          setConnected(true);
          setError(null);
        }
      } catch (connectError) {
        if (!isDisposed) {
          setConnected(false);
          setError(String(connectError));
        }
      }
    })();

    return () => {
      isDisposed = true;
      void adapter.disconnect();
      setConnected(false);
    };
  }, [adapter]);

  useEffect(() => {
    if (!connected) {
      return;
    }

    let isCanceled = false;

    void (async () => {
      try {
        await adapter.pushState(state);
        if (!isCanceled) {
          setLastPushAt(Date.now());
          setError(null);
        }
      } catch (pushError) {
        if (!isCanceled) {
          setError(String(pushError));
        }
      }
    })();

    return () => {
      isCanceled = true;
    };
  }, [adapter, connected, state]);

  return {
    connected,
    lastPushAt,
    error,
  };
}
