import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JsonTableStore } from "../adapters/jsonTableStore";
import type { GuiButtonTableRow, GuiCaptivateButtonBindingRow, GuiTableSnapshot, GuiTextTableRow } from "../core/guiTables";

interface UseGuiTablePersistenceArgs {
  buttonRows: GuiButtonTableRow[];
  bindingRows: GuiCaptivateButtonBindingRow[];
  textRows: GuiTextTableRow[];
  onLoaded: (snapshot: GuiTableSnapshot) => void;
}

interface GuiTablePersistenceStatus {
  ready: boolean;
  error: string | null;
  lastSavedAt: number | null;
}

interface PersistedGuiLayoutSnapshot extends GuiTableSnapshot {
  schema: "gui-layout.v1";
  savedAt: number;
}

function isPersistedGuiLayoutSnapshot(value: unknown): value is PersistedGuiLayoutSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<PersistedGuiLayoutSnapshot>;
  return (
    snapshot.schema === "gui-layout.v1" &&
    Array.isArray(snapshot.buttonRows) &&
    Array.isArray(snapshot.textRows) &&
    typeof snapshot.savedAt === "number"
  );
}

export function useGuiTablePersistence({
  buttonRows,
  bindingRows,
  textRows,
  onLoaded,
}: UseGuiTablePersistenceArgs): GuiTablePersistenceStatus {
  const store = useMemo(() => new JsonTableStore(), []);
  const hasLoadedRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const latestRowsRef = useRef({
    buttonRows,
    bindingRows,
    textRows,
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  latestRowsRef.current = {
    buttonRows,
    bindingRows,
    textRows,
  };

  const saveSnapshot = useCallback(async (): Promise<void> => {
    const snapshot = latestRowsRef.current;
    const savedAt = Date.now();
    const layoutSnapshot: PersistedGuiLayoutSnapshot = {
      schema: "gui-layout.v1",
      buttonRows: snapshot.buttonRows,
      textRows: snapshot.textRows,
      savedAt,
    };

    await Promise.all([
      store.saveRecord("gui_layout_snapshot", layoutSnapshot),
      store.saveTable("button_layers", snapshot.buttonRows),
      store.saveTable("captivate_button_bindings", snapshot.bindingRows),
      store.saveTable("text_layers", snapshot.textRows),
    ]);

    setLastSavedAt(savedAt);
    setReady(true);
    setError(null);
  }, [store]);

  useEffect(() => {
    let isDisposed = false;

    void (async () => {
      try {
        await store.connect();
        const [savedLayoutSnapshot, loadedButtons, loadedTexts] = await Promise.all([
          store.loadRecord<PersistedGuiLayoutSnapshot>("gui_layout_snapshot"),
          store.loadTable<GuiButtonTableRow>("button_layers"),
          store.loadTable<GuiTextTableRow>("text_layers"),
        ]);
        const initialSnapshot = isPersistedGuiLayoutSnapshot(savedLayoutSnapshot)
          ? {
              buttonRows: savedLayoutSnapshot.buttonRows,
              textRows: savedLayoutSnapshot.textRows,
            }
          : {
              buttonRows: loadedButtons,
              textRows: loadedTexts,
            };

        if (!isDisposed) {
          onLoaded(initialSnapshot);
          hasLoadedRef.current = true;
          setReady(true);
          setError(null);
          if (isPersistedGuiLayoutSnapshot(savedLayoutSnapshot)) {
            setLastSavedAt(savedLayoutSnapshot.savedAt);
          }

          if (pendingSaveRef.current) {
            pendingSaveRef.current = false;
            await saveSnapshot();
          }
        }
      } catch (loadError) {
        if (!isDisposed) {
          setReady(false);
          setError(String(loadError));
        }
      }
    })();

    return () => {
      isDisposed = true;
      void store.disconnect();
    };
  }, [onLoaded, saveSnapshot, store]);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    let isCanceled = false;

    void (async () => {
      try {
        await saveSnapshot();
      } catch (saveError) {
        if (!isCanceled) {
          setError(String(saveError));
        }
      }
    })();

    return () => {
      isCanceled = true;
    };
  }, [bindingRows, buttonRows, saveSnapshot, textRows]);

  useEffect(() => {
    const flushOnBackground = () => {
      if (!hasLoadedRef.current) {
        return;
      }
      void saveSnapshot().catch((saveError) => {
        setError(String(saveError));
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushOnBackground();
      }
    };

    window.addEventListener("pagehide", flushOnBackground);
    window.addEventListener("beforeunload", flushOnBackground);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushOnBackground);
      window.removeEventListener("beforeunload", flushOnBackground);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [saveSnapshot]);

  return {
    ready,
    error,
    lastSavedAt,
  };
}
