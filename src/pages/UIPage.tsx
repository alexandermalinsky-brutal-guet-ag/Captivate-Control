import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { emitCaptivateButtonTrigger } from "../core/captivateIntegration";
import { sendCaptivateDataPush, startCaptivateBridge } from "../adapters/captivatePluginAdapter";
import { publishCaptivateTableSelects } from "../adapters/captivateDataApiAdapter";
import { GuiSnapshotStore, type GuiSnapshotListItem } from "../adapters/guiSnapshotStore";
import type {
  ElementPosition,
  ElementSize,
  GuiButtonAction,
  GuiButtonTextWeight,
  GuiTableSnapshot,
  GuiButtonTableRow,
  GuiCaptivateButtonBindingRow,
  GuiTextTableRow,
  TextAlignment,
} from "../core/guiTables";
import { useGuiTablePersistence } from "../hooks/useGuiTablePersistence";

type EditTarget =
  | { kind: "button"; id: string }
  | { kind: "text"; id: string }
  | null;

interface TableSelectDropdown {
  buttonId: string;
  label: string;
  inputName: string;
  columns: string[];
  rows: string[][];
  anchor: { x: number; y: number };
}

interface ButtonLayer {
  id: string;
  label: string;
  actionId: GuiButtonAction;
  captivateLayer: string;
  captivateTarget: string;
  sourceTable: string;
  enabled: boolean;
  size: ElementSize;
  textSizePt: number;
  textWeight: GuiButtonTextWeight;
  bgColor: string;
  position: ElementPosition | null;
  isDragging: boolean;
  isResizing: boolean;
  cursor: string;
}

interface TextLayer {
  id: string;
  value: string;
  size: ElementSize;
  fontSizePt: number;
  alignment: TextAlignment;
  position: ElementPosition | null;
  isDragging: boolean;
  isResizing: boolean;
  cursor: string;
}

const GRID_SIZE = 20;
const FUNCTION_PREFIX = /^import\s+captivate\s+control\s+logic\s+/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function createButtonLayer(label: string, actionId: GuiButtonAction): ButtonLayer {
  return {
    id: `button-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    label,
    actionId,
    captivateLayer: "layer-1",
    captivateTarget: "001",
    sourceTable: "button_layers",
    enabled: true,
    size: { width: 120, height: 44 },
    textSizePt: 14,
    textWeight: "regular",
    bgColor: "#2f343a",
    position: null,
    isDragging: false,
    isResizing: false,
    cursor: "default",
  };
}

function createHydratedButtonLayer(row: GuiButtonTableRow): ButtonLayer {
  return {
    ...row,
    textWeight: row.textWeight ?? "regular",
    isDragging: false,
    isResizing: false,
    cursor: "default",
  };
}

function createTextLayer(): TextLayer {
  return {
    id: `text-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    value: "Text",
    size: { width: 180, height: 48 },
    fontSizePt: 26,
    alignment: "left",
    position: null,
    isDragging: false,
    isResizing: false,
    cursor: "default",
  };
}

function createHydratedTextLayer(row: GuiTextTableRow): TextLayer {
  return {
    ...row,
    isDragging: false,
    isResizing: false,
    cursor: "default",
  };
}

function serializeButtonLayer(layer: ButtonLayer): GuiButtonTableRow {
  return {
    id: layer.id,
    label: layer.label,
    actionId: layer.actionId,
    captivateLayer: layer.captivateLayer,
    captivateTarget: layer.captivateTarget,
    sourceTable: layer.sourceTable,
    enabled: layer.enabled,
    size: layer.size,
    textSizePt: layer.textSizePt,
    textWeight: layer.textWeight,
    bgColor: layer.bgColor,
    position: layer.position,
  };
}

function serializeTextLayer(layer: TextLayer): GuiTextTableRow {
  return {
    id: layer.id,
    value: layer.value,
    size: layer.size,
    fontSizePt: layer.fontSizePt,
    alignment: layer.alignment,
    position: layer.position,
  };
}

function serializeCaptivateBinding(layer: ButtonLayer): GuiCaptivateButtonBindingRow {
  return {
    id: layer.id,
    label: layer.label,
    actionId: layer.actionId,
    captivateLayer: layer.captivateLayer,
    captivateTarget: layer.captivateTarget,
    sourceTable: layer.sourceTable,
    enabled: layer.enabled,
  };
}

function parseFunctionCommand(
  functionSource: string
): { actionId: GuiButtonAction; captivateTarget?: string } | null {
  const trimmed = functionSource.trim();
  if (!trimmed || !FUNCTION_PREFIX.test(trimmed)) {
    return null;
  }

  const withoutSemicolon = trimmed.replace(/;\s*$/, "");
  const instruction = withoutSemicolon.replace(FUNCTION_PREFIX, "").trim();
  const commandMatch = instruction.match(/^([a-z][a-z\s/_-]*)(?:\s*\(\s*([^)]+)\s*\))?$/i);

  if (!commandMatch) {
    return null;
  }

  const normalizedCommand = commandMatch[1].toLowerCase().replace(/[^a-z0-9]/g, "");
  const rawTarget = commandMatch[2]?.trim();
  const commandMap: Record<string, GuiButtonAction> = {
    animateinout: "animate-in-out",
    animatein: "animate-in",
    animateout: "animate-out",
    tableselect: "table-select",
    cutin: "cut-in",
    cutout: "cut-out",
    custom: "custom",
  };

  const actionId = commandMap[normalizedCommand];
  if (!actionId) {
    return null;
  }

  return {
    actionId,
    captivateTarget: rawTarget && rawTarget.length > 0 ? rawTarget : undefined,
  };
}

function escapeHtml(source: string): string {
  return source.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderFunctionHighlightedHtml(source: string): string {
  const escaped = escapeHtml(source);
  const withActionHighlight = escaped.replace(
    /(animateinout|animatein|animateout|tableselect|cutin|cutout|custom|animate\s+in\/out|animate\s+in|animate\s+out|table\s+select|cut\s+in|cut\s+out)(?=\s*\(|\b)/gi,
    '<span class="gui-function-token-action">$1</span>'
  );

  return withActionHighlight.replace(/\b(import)\b/gi, '<span class="gui-function-token-import">$1</span>');
}

export function UIPage() {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addSearchValue, setAddSearchValue] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<GuiButtonAction>("custom");

  const [buttonLayers, setButtonLayers] = useState<ButtonLayer[]>([]);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [selectedButtonId, setSelectedButtonId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [objectEditTarget, setObjectEditTarget] = useState<EditTarget>(null);
  const [animateInOutActiveById, setAnimateInOutActiveById] = useState<Record<string, boolean>>({});
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [snapshotItems, setSnapshotItems] = useState<GuiSnapshotListItem[]>([]);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [tableSelectDropdown, setTableSelectDropdown] = useState<TableSelectDropdown | null>(null);

  const containerRef = useRef<HTMLElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const textRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const functionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const functionHighlightRef = useRef<HTMLPreElement | null>(null);
  const functionGutterRef = useRef<HTMLDivElement | null>(null);
  const snapshotStore = useMemo(() => new GuiSnapshotStore(), []);

  useEffect(() => {
    void startCaptivateBridge().catch((error) => {
      console.error("Failed to start Captivate bridge:", error);
    });
  }, []);

  useEffect(() => {
    void snapshotStore.connect().catch((error) => {
      console.error("Failed to connect Playout UI snapshot store:", error);
    });

    return () => {
      void snapshotStore.disconnect();
    };
  }, [snapshotStore]);

  const presetItems: Array<{ id: GuiButtonAction; label: string }> = [
    { id: "animate-in-out", label: "Animate In/Out" },
    { id: "animate-in", label: "Animate In" },
    { id: "animate-out", label: "Animate Out" },
    { id: "table-select", label: "Table Select" },
    { id: "custom", label: "Custom Button" },
  ];
  const filteredPresetItems = useMemo(() => {
    const query = addSearchValue.trim().toLowerCase();
    if (!query) {
      return presetItems;
    }
    return presetItems.filter((item) => item.label.toLowerCase().includes(query));
  }, [addSearchValue]);

  const updateButtonLayer = (id: string, updater: (layer: ButtonLayer) => ButtonLayer) => {
    setButtonLayers((current) => current.map((layer) => (layer.id === id ? updater(layer) : layer)));
  };

  const updateTextLayer = (id: string, updater: (layer: TextLayer) => TextLayer) => {
    setTextLayers((current) => current.map((layer) => (layer.id === id ? updater(layer) : layer)));
  };

  const loadLayoutSnapshot = useCallback((snapshot: GuiTableSnapshot) => {
    setButtonLayers(snapshot.buttonRows.map(createHydratedButtonLayer));
    setTextLayers(snapshot.textRows.map(createHydratedTextLayer));
    setSelectedButtonId(null);
    setSelectedTextId(null);
    setObjectEditTarget(null);
    setAnimateInOutActiveById({});
  }, []);

  const resolveRuntimeBinding = (layer: ButtonLayer): GuiCaptivateButtonBindingRow => {
    const parsed = parseFunctionCommand(layer.captivateTarget);
    const base = serializeCaptivateBinding(layer);

    if (!parsed) {
      return base;
    }

    return {
      ...base,
      actionId: parsed.actionId,
      captivateTarget: parsed.captivateTarget ?? base.captivateTarget,
    };
  };

  useEffect(() => {
    const instances = buttonLayers
      .filter((layer) => layer.actionId === "table-select")
      .map((layer) => ({
        id: layer.id,
        label: layer.label,
        sourceTableId: layer.sourceTable,
      }));

    void publishCaptivateTableSelects(instances).catch((error) => {
      console.error("Failed to publish Captivate table-select instances:", error);
    });
  }, [buttonLayers]);

  useEffect(() => {
    if (!tableSelectDropdown) {
      return;
    }
    const stillExists = buttonLayers.some(
      (layer) => layer.id === tableSelectDropdown.buttonId && layer.actionId === "table-select"
    );
    if (!stillExists) {
      setTableSelectDropdown(null);
    }
  }, [buttonLayers, tableSelectDropdown]);

  const openTableSelectDropdown = useCallback(
    async (layer: ButtonLayer, event: MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      try {
        const response = await fetch(
          `http://127.0.0.1:45455/table-selects/${encodeURIComponent(layer.id)}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const detail = (await response.json()) as {
          label: string;
          inputName: string;
          columns: string[];
          rows: string[][];
        };
        setTableSelectDropdown({
          buttonId: layer.id,
          label: detail.label,
          inputName: detail.inputName,
          columns: detail.columns,
          rows: detail.rows,
          anchor: { x: rect.left, y: rect.bottom + 4 },
        });
      } catch (error) {
        console.error("Failed to load table-select rows:", error);
      }
    },
    []
  );

  const handleTableSelectRowPick = useCallback(
    async (row: string[]) => {
      if (!tableSelectDropdown) {
        return;
      }
      const variables: Record<string, string> = {};
      tableSelectDropdown.columns.forEach((name, index) => {
        variables[name] = row[index] ?? "";
      });
      try {
        await sendCaptivateDataPush({
          mode: "input",
          target: tableSelectDropdown.inputName,
          action: "update",
          variables,
        });
      } catch (error) {
        console.error("Failed to push table-select variables:", error);
      }
      setTableSelectDropdown(null);
    },
    [tableSelectDropdown]
  );

  useEffect(() => {
    const validIds = new Set(buttonLayers.map((layer) => layer.id));
    setAnimateInOutActiveById((current) => {
      let hasChange = false;
      const next: Record<string, boolean> = {};

      Object.entries(current).forEach(([id, value]) => {
        if (validIds.has(id)) {
          next[id] = value;
        } else {
          hasChange = true;
        }
      });

      return hasChange ? next : current;
    });
  }, [buttonLayers]);

  const startDragging = (
    event: MouseEvent,
    elementRef: HTMLElement,
    onDragStart: () => void,
    onDragEnd: () => void,
    setPosition: (position: ElementPosition) => void
  ) => {
    const container = containerRef.current;

    if (!isEditMode || !container) {
      return;
    }

    event.preventDefault();
    onDragStart();

    const containerRect = container.getBoundingClientRect();
    const elementRect = elementRef.getBoundingClientRect();

    const offsetX = event.clientX - elementRect.left;
    const offsetY = event.clientY - elementRect.top;

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const maxX = containerRect.width - elementRect.width;
      const maxY = containerRect.height - elementRect.height;

      const nextX = clamp(snapToGrid(moveEvent.clientX - containerRect.left - offsetX), 0, maxX);
      const nextY = clamp(snapToGrid(moveEvent.clientY - containerRect.top - offsetY), 0, maxY);

      setPosition({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      onDragEnd();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const startResizing = (
    event: MouseEvent,
    axis: "x" | "y" | "both",
    currentSize: ElementSize,
    onResizeStart: () => void,
    onResizeEnd: () => void,
    setSize: (size: ElementSize) => void
  ) => {
    if (!isEditMode) {
      return;
    }

    event.preventDefault();
    onResizeStart();

    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = currentSize.width;
    const startHeight = currentSize.height;

    const minWidth = 80;
    const minHeight = 32;
    const maxWidth = 620;
    const maxHeight = 320;

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const nextWidth =
        axis === "x" || axis === "both" ? clamp(startWidth + deltaX, minWidth, maxWidth) : startWidth;
      const nextHeight =
        axis === "y" || axis === "both" ? clamp(startHeight + deltaY, minHeight, maxHeight) : startHeight;

      setSize({ width: nextWidth, height: nextHeight });
    };

    const handleMouseUp = () => {
      onResizeEnd();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const detectEdgeResizeAxis = (event: MouseEvent<HTMLElement>, elementRef: HTMLElement): "x" | "y" | "both" | null => {
    const edgeThreshold = 10;
    const rect = elementRef.getBoundingClientRect();
    const nearRight = rect.right - event.clientX <= edgeThreshold;
    const nearBottom = rect.bottom - event.clientY <= edgeThreshold;

    if (nearRight && nearBottom) {
      return "both";
    }
    if (nearRight) {
      return "x";
    }
    if (nearBottom) {
      return "y";
    }
    return null;
  };

  const computeCenterPosition = useCallback((size: ElementSize): ElementPosition | null => {
    const container = containerRef.current;
    if (!container) {
      return null;
    }

    const rect = container.getBoundingClientRect();
    const maxX = Math.max(0, rect.width - size.width);
    const maxY = Math.max(0, rect.height - size.height);
    const x = clamp(snapToGrid((rect.width - size.width) / 2), 0, maxX);
    const y = clamp(snapToGrid((rect.height - size.height) / 2), 0, maxY);
    return { x, y };
  }, []);

  const toggleEditMode = () => {
    setIsEditMode((current) => {
      const next = !current;
      if (!next) {
        setIsAddModalOpen(false);
        setSelectedButtonId(null);
        setSelectedTextId(null);
        setObjectEditTarget(null);
        setButtonLayers((layers) => layers.map((layer) => ({ ...layer, isDragging: false, isResizing: false })));
        setTextLayers((layers) => layers.map((layer) => ({ ...layer, isDragging: false, isResizing: false })));
      }
      return next;
    });
  };

  const openObjectEditPopup = (target: EditTarget, event: MouseEvent<HTMLElement>) => {
    if (!isEditMode) {
      return;
    }

    event.preventDefault();
    setObjectEditTarget(target);
    setIsAddModalOpen(false);

    if (target?.kind === "button") {
      setSelectedButtonId(target.id);
      setSelectedTextId(null);
    } else if (target?.kind === "text") {
      setSelectedTextId(target.id);
      setSelectedButtonId(null);
    }
  };

  const selectedPresetLabel = presetItems.find((item) => item.id === selectedPreset)?.label ?? "Default";

  const buttonRows = useMemo(() => buttonLayers.map(serializeButtonLayer), [buttonLayers]);
  const bindingRows = useMemo(() => buttonLayers.map(serializeCaptivateBinding), [buttonLayers]);
  const textRows = useMemo(() => textLayers.map(serializeTextLayer), [textLayers]);

  const handleLoadedTables = useCallback((snapshot: { buttonRows: GuiButtonTableRow[]; textRows: GuiTextTableRow[] }) => {
    loadLayoutSnapshot(snapshot);
  }, [loadLayoutSnapshot]);

  const refreshSnapshotItems = useCallback(async () => {
    try {
      const items = await snapshotStore.listSnapshots();
      setSnapshotItems(items);
      setSnapshotError(null);
    } catch (error) {
      console.error("Playout UI snapshot operation failed:", error);
      setSnapshotError(String(error));
    }
  }, [snapshotStore]);

  const handleSaveSnapshot = useCallback(async () => {
    try {
      await snapshotStore.saveSnapshot({
        buttonRows,
        textRows,
      });
      await refreshSnapshotItems();
      setSnapshotError(null);
    } catch (error) {
      console.error("Playout UI snapshot operation failed:", error);
      setSnapshotError(String(error));
    }
  }, [buttonRows, refreshSnapshotItems, snapshotStore, textRows]);

  const openImportSnapshotModal = useCallback(() => {
    setIsSnapshotModalOpen(true);
    void refreshSnapshotItems();
  }, [refreshSnapshotItems]);

  const importSnapshot = useCallback(async (fileName: string) => {
    try {
      const snapshot = await snapshotStore.loadSnapshot(fileName);
      if (!snapshot) {
        setSnapshotError("Snapshot could not be loaded.");
        return;
      }

      loadLayoutSnapshot(snapshot);
      setIsSnapshotModalOpen(false);
      setSnapshotError(null);
    } catch (error) {
      console.error("Playout UI snapshot operation failed:", error);
      setSnapshotError(String(error));
    }
  }, [loadLayoutSnapshot, snapshotStore]);

  const handleExportSnapshot = useCallback(async () => {
    try {
      const targetPath = await saveDialog({
        title: "Export Playout UI Snapshot",
        defaultPath: snapshotStore.buildDefaultExportFileName(),
        filters: [{ name: "Captivate Control Playout UI Snapshot", extensions: ["ccgui"] }],
      });

      if (!targetPath) {
        return;
      }

      await snapshotStore.exportSnapshotToPath(targetPath, {
        buttonRows,
        textRows,
      });
      setSnapshotError(null);
    } catch (error) {
      console.error("Playout UI snapshot operation failed:", error);
      setSnapshotError(String(error));
    }
  }, [buttonRows, snapshotStore, textRows]);

  const handleOpenSnapshotFromDisk = useCallback(async () => {
    try {
      const selection = await openDialog({
        title: "Open Playout UI Snapshot",
        multiple: false,
        filters: [{ name: "Captivate Control Playout UI Snapshot", extensions: ["ccgui"] }],
      });

      const sourcePath = typeof selection === "string" ? selection : null;
      if (!sourcePath) {
        return;
      }

      const snapshot = await snapshotStore.importSnapshotFromPath(sourcePath);
      if (!snapshot) {
        setSnapshotError("Selected file is not a valid .ccgui snapshot.");
        return;
      }

      loadLayoutSnapshot(snapshot);
      setSnapshotError(null);
    } catch (error) {
      console.error("Playout UI snapshot operation failed:", error);
      setSnapshotError(String(error));
    }
  }, [loadLayoutSnapshot, snapshotStore]);

  useGuiTablePersistence({
    buttonRows,
    bindingRows,
    textRows,
    onLoaded: handleLoadedTables,
  });

  return (
    <main ref={containerRef} className="workspace-layout gui-empty-page">
      {isEditMode ? <div className="gui-grid-overlay" aria-hidden="true" /> : null}

      {buttonLayers.map((layer) => (
        <button
          key={layer.id}
          ref={(node) => {
            buttonRefs.current[layer.id] = node;
          }}
          type="button"
          className={[
            "gui-floating-button",
            isEditMode ? "is-editable" : "",
            layer.isDragging ? "is-dragging" : "",
            layer.isResizing ? "is-resizing" : "",
            selectedButtonId === layer.id ? "is-selected" : "",
            resolveRuntimeBinding(layer).actionId === "animate-in-out" && animateInOutActiveById[layer.id] ? "is-live" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            layer.position
              ? {
                  left: `${layer.position.x}px`,
                  top: `${layer.position.y}px`,
                  right: "auto",
                  bottom: "auto",
                  width: `${layer.size.width}px`,
                  height: `${layer.size.height}px`,
                  cursor: isEditMode ? layer.cursor : "default",
                  fontSize: `${layer.textSizePt}pt`,
                  fontWeight: layer.textWeight === "bold" ? 700 : 400,
                  background: layer.bgColor,
                }
              : {
                  width: `${layer.size.width}px`,
                  height: `${layer.size.height}px`,
                  cursor: isEditMode ? layer.cursor : "default",
                  fontSize: `${layer.textSizePt}pt`,
                  fontWeight: layer.textWeight === "bold" ? 700 : 400,
                  background: layer.bgColor,
                }
          }
          onMouseDown={(event) => {
            if (!isEditMode) {
              return;
            }

            if (event.button !== 0) {
              return;
            }

            const ref = buttonRefs.current[layer.id];
            if (!ref) {
              return;
            }

            setSelectedButtonId(layer.id);
            setSelectedTextId(null);
            const resizeAxis = detectEdgeResizeAxis(event, ref);

            if (resizeAxis) {
              startResizing(
                event,
                resizeAxis,
                layer.size,
                () => updateButtonLayer(layer.id, (current) => ({ ...current, isResizing: true })),
                () => updateButtonLayer(layer.id, (current) => ({ ...current, isResizing: false })),
                (size) => updateButtonLayer(layer.id, (current) => ({ ...current, size }))
              );
            } else {
              startDragging(
                event,
                ref,
                () => updateButtonLayer(layer.id, (current) => ({ ...current, isDragging: true })),
                () => updateButtonLayer(layer.id, (current) => ({ ...current, isDragging: false })),
                (position) => updateButtonLayer(layer.id, (current) => ({ ...current, position }))
              );
            }
          }}
          onMouseMove={(event) => {
            if (!isEditMode) {
              return;
            }

            const ref = buttonRefs.current[layer.id];
            if (!ref || layer.isDragging || layer.isResizing) {
              return;
            }

            const resizeAxis = detectEdgeResizeAxis(event, ref);
            const cursor =
              resizeAxis === "both"
                ? "nwse-resize"
                : resizeAxis === "x"
                  ? "col-resize"
                  : resizeAxis === "y"
                    ? "row-resize"
                    : "grab";

            updateButtonLayer(layer.id, (current) => ({ ...current, cursor }));
          }}
          onContextMenu={(event) => openObjectEditPopup({ kind: "button", id: layer.id }, event)}
          onClick={(event) => {
            if (isEditMode) {
              return;
            }

            const runtimeBinding = resolveRuntimeBinding(layer);

            if (runtimeBinding.actionId === "table-select") {
              void openTableSelectDropdown(layer, event);
              return;
            }

            if (runtimeBinding.actionId === "animate-in-out") {
              const isActive = Boolean(animateInOutActiveById[layer.id]);
              const nextAction: GuiButtonAction = isActive ? "animate-out" : "animate-in";
              emitCaptivateButtonTrigger({
                ...runtimeBinding,
                actionId: nextAction,
              });
              setAnimateInOutActiveById((current) => ({
                ...current,
                [layer.id]: !isActive,
              }));
              return;
            }

            emitCaptivateButtonTrigger(runtimeBinding);
          }}
        >
          {layer.label}
        </button>
      ))}

      {textLayers.map((layer) => (
        <div
          key={layer.id}
          ref={(node) => {
            textRefs.current[layer.id] = node;
          }}
          role="button"
          tabIndex={0}
          className={[
            "gui-floating-text",
            isEditMode ? "is-editable" : "",
            layer.isDragging ? "is-dragging" : "",
            layer.isResizing ? "is-resizing" : "",
            selectedTextId === layer.id ? "is-selected" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            layer.position
              ? {
                  left: `${layer.position.x}px`,
                  top: `${layer.position.y}px`,
                  right: "auto",
                  bottom: "auto",
                  width: `${layer.size.width}px`,
                  height: `${layer.size.height}px`,
                  cursor: isEditMode ? layer.cursor : "default",
                  fontSize: `${layer.fontSizePt}pt`,
                  textAlign: layer.alignment,
                  justifyContent:
                    layer.alignment === "left" ? "flex-start" : layer.alignment === "center" ? "center" : "flex-end",
                }
              : {
                  width: `${layer.size.width}px`,
                  height: `${layer.size.height}px`,
                  cursor: isEditMode ? layer.cursor : "default",
                  fontSize: `${layer.fontSizePt}pt`,
                  textAlign: layer.alignment,
                  justifyContent:
                    layer.alignment === "left" ? "flex-start" : layer.alignment === "center" ? "center" : "flex-end",
                }
          }
          onMouseDown={(event) => {
            if (!isEditMode) {
              return;
            }

            if (event.button !== 0) {
              return;
            }

            const ref = textRefs.current[layer.id];
            if (!ref) {
              return;
            }

            setSelectedTextId(layer.id);
            setSelectedButtonId(null);
            const resizeAxis = detectEdgeResizeAxis(event, ref);

            if (resizeAxis) {
              startResizing(
                event,
                resizeAxis,
                layer.size,
                () => updateTextLayer(layer.id, (current) => ({ ...current, isResizing: true })),
                () => updateTextLayer(layer.id, (current) => ({ ...current, isResizing: false })),
                (size) => updateTextLayer(layer.id, (current) => ({ ...current, size }))
              );
            } else {
              startDragging(
                event,
                ref,
                () => updateTextLayer(layer.id, (current) => ({ ...current, isDragging: true })),
                () => updateTextLayer(layer.id, (current) => ({ ...current, isDragging: false })),
                (position) => updateTextLayer(layer.id, (current) => ({ ...current, position }))
              );
            }
          }}
          onMouseMove={(event) => {
            if (!isEditMode) {
              return;
            }

            const ref = textRefs.current[layer.id];
            if (!ref || layer.isDragging || layer.isResizing) {
              return;
            }

            const resizeAxis = detectEdgeResizeAxis(event, ref);
            const cursor =
              resizeAxis === "both"
                ? "nwse-resize"
                : resizeAxis === "x"
                  ? "col-resize"
                  : resizeAxis === "y"
                    ? "row-resize"
                    : "grab";

            updateTextLayer(layer.id, (current) => ({ ...current, cursor }));
          }}
          onClick={() => {
            if (isEditMode) {
              setSelectedTextId(layer.id);
              setSelectedButtonId(null);
            }
          }}
          onKeyDown={() => {
            if (isEditMode) {
              setSelectedTextId(layer.id);
              setSelectedButtonId(null);
            }
          }}
          onContextMenu={(event) => openObjectEditPopup({ kind: "text", id: layer.id }, event)}
        >
          {layer.value}
        </div>
      ))}

      {isEditMode ? (
        <div className="gui-add-panel">
          <button type="button" className="gui-edit-button" onClick={() => setIsAddModalOpen(true)}>
            Add Button
          </button>
          <button
            type="button"
            className="gui-edit-button"
            onClick={() => {
              const newLayer = createTextLayer();
              newLayer.position = computeCenterPosition(newLayer.size);
              setTextLayers((current) => [...current, newLayer]);
              setSelectedTextId(newLayer.id);
              setSelectedButtonId(null);
            }}
          >
            Add Text
          </button>
        </div>
      ) : null}

      <div className="gui-edit-panel">
        {isEditMode ? (
          <>
            <button type="button" className="gui-edit-button" onClick={() => void handleSaveSnapshot()}>
              Save Snapshot
            </button>
            <button type="button" className="gui-edit-button" onClick={openImportSnapshotModal}>
              Import Snapshot
            </button>
            <button type="button" className="gui-edit-button" onClick={() => void handleExportSnapshot()}>
              Export Snapshot…
            </button>
            <button type="button" className="gui-edit-button" onClick={() => void handleOpenSnapshotFromDisk()}>
              Open Snapshot…
            </button>
          </>
        ) : null}
        <button type="button" className="gui-edit-button" onClick={toggleEditMode}>
          Edit
        </button>
        {isEditMode && snapshotError && !isSnapshotModalOpen ? (
          <span className="gui-snapshot-error" role="alert">{snapshotError}</span>
        ) : null}
      </div>

      {isAddModalOpen ? (
        <div className="gui-modal-overlay" role="presentation">
          <div className="gui-modal-window" role="dialog" aria-modal="true" aria-label="Add button">
            <div className="gui-modal-header">
              <strong>Add Button</strong>
              <button type="button" className="gui-edit-button" onClick={() => setIsAddModalOpen(false)}>
                Close
              </button>
            </div>

            <label className="gui-modal-label" htmlFor="gui-button-search">
              Search
            </label>
            <input
              id="gui-button-search"
              className="gui-modal-search"
              type="text"
              placeholder="Search button type..."
              value={addSearchValue}
              onChange={(event) => setAddSearchValue(event.target.value)}
            />

            <div id="gui-button-preset" className="gui-modal-list" role="listbox" aria-label="Preset list">
              {filteredPresetItems.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={selectedPreset === preset.id ? "gui-modal-list-item is-active" : "gui-modal-list-item"}
                  onClick={() => setSelectedPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
              {filteredPresetItems.length === 0 ? <p className="gui-modal-empty">No matching items.</p> : null}
            </div>

            <button
              type="button"
              className="gui-edit-button"
              onClick={() => {
                const newLayer = createButtonLayer(selectedPresetLabel, selectedPreset);
                newLayer.position = computeCenterPosition(newLayer.size);
                setButtonLayers((current) => [...current, newLayer]);
                setSelectedButtonId(newLayer.id);
                setSelectedTextId(null);
              }}
            >
              Add Selected Button
            </button>
          </div>
        </div>
      ) : null}

      {objectEditTarget ? (
        <div className="gui-modal-overlay" role="presentation">
          <div className="gui-modal-window" role="dialog" aria-modal="true" aria-label="Edit element">
            <div className="gui-modal-header">
              <strong>{objectEditTarget.kind === "button" ? "Edit Button" : "Edit Text"}</strong>
              <button type="button" className="gui-edit-button" onClick={() => setObjectEditTarget(null)}>
                Close
              </button>
            </div>

            {objectEditTarget.kind === "button" ? (
              (() => {
                const layer = buttonLayers.find((item) => item.id === objectEditTarget.id);

                if (!layer) {
                  return <p className="gui-modal-label">Button no longer exists.</p>;
                }

                const functionValue = layer.captivateTarget;
                const functionLineCount = Math.max(1, functionValue.split("\n").length);
                const functionHighlightedHtml = renderFunctionHighlightedHtml(functionValue);

                return (
                  <>
                    <label className="gui-modal-label" htmlFor="gui-button-label">
                      Label
                    </label>
                    <input
                      id="gui-button-label"
                      className="gui-object-edit-input"
                      type="text"
                      value={layer.label}
                      onChange={(event) => updateButtonLayer(layer.id, (current) => ({ ...current, label: event.target.value }))}
                    />
                    <label className="gui-modal-label" htmlFor="gui-button-text-size">
                      Text Size (pt)
                    </label>
                    <input
                      id="gui-button-text-size"
                      className="gui-object-edit-input"
                      type="number"
                      min={6}
                      max={180}
                      value={layer.textSizePt}
                      onChange={(event) =>
                        updateButtonLayer(layer.id, (current) => ({
                          ...current,
                          textSizePt: clamp(Number(event.target.value) || 6, 6, 180),
                        }))
                      }
                    />
                    <label className="gui-modal-label" htmlFor="gui-button-text-weight">
                      Text Weight
                    </label>
                    <select
                      id="gui-button-text-weight"
                      className="gui-object-edit-input gui-binding-select"
                      value={layer.textWeight}
                      onChange={(event) =>
                        updateButtonLayer(layer.id, (current) => ({
                          ...current,
                          textWeight: event.target.value as GuiButtonTextWeight,
                        }))
                      }
                    >
                      <option value="regular">Regular</option>
                      <option value="bold">Bold</option>
                    </select>
                    <label className="gui-modal-label" htmlFor="gui-button-action">
                      Button Preset
                    </label>
                    <select
                      id="gui-button-action"
                      className="gui-object-edit-input gui-binding-select"
                      value={layer.actionId}
                      onChange={(event) =>
                        updateButtonLayer(layer.id, (current) => ({
                          ...current,
                          actionId: event.target.value as GuiButtonAction,
                        }))
                      }
                    >
                      {presetItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    {layer.actionId === "custom" ? (
                      <>
                        <label className="gui-modal-label" htmlFor="gui-button-target">
                          Function
                        </label>
                        <div className="gui-function-editor">
                          <div ref={functionGutterRef} className="gui-function-gutter" aria-hidden="true">
                            {Array.from({ length: functionLineCount }, (_, index) => (
                              <span key={`${layer.id}-line-${index + 1}`} className="gui-function-line-number">
                                {index + 1}
                              </span>
                            ))}
                          </div>
                          <div className="gui-function-code-area">
                            {functionValue.length === 0 ? (
                              <div className="gui-function-placeholder">Import Captivate Control Logic AnimateIn(001);</div>
                            ) : null}
                            <pre
                              ref={functionHighlightRef}
                              className="gui-function-highlight"
                              aria-hidden="true"
                              dangerouslySetInnerHTML={{ __html: functionHighlightedHtml + "\n" }}
                            />
                            <textarea
                              id="gui-button-target"
                              ref={functionInputRef}
                              className="gui-object-edit-input gui-object-edit-textarea"
                              value={functionValue}
                              spellCheck={false}
                              onScroll={(event) => {
                                const scrollTop = event.currentTarget.scrollTop;
                                if (functionHighlightRef.current) {
                                  functionHighlightRef.current.scrollTop = scrollTop;
                                }
                                if (functionGutterRef.current) {
                                  functionGutterRef.current.scrollTop = scrollTop;
                                }
                              }}
                              onChange={(event) =>
                                updateButtonLayer(layer.id, (current) => ({
                                  ...current,
                                  captivateTarget: event.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="gui-modal-label" htmlFor="gui-button-target">
                          Layername
                        </label>
                        <input
                          id="gui-button-target"
                          className="gui-object-edit-input"
                          type="text"
                          value={layer.captivateTarget}
                          onChange={(event) =>
                            updateButtonLayer(layer.id, (current) => ({
                              ...current,
                              captivateTarget: event.target.value,
                            }))
                          }
                        />
                      </>
                    )}
                    <label className="gui-modal-label" htmlFor="gui-button-enabled">
                      Enable Button
                    </label>
                    <select
                      id="gui-button-enabled"
                      className="gui-object-edit-input gui-binding-select"
                      value={layer.enabled ? "on" : "off"}
                      onChange={(event) =>
                        updateButtonLayer(layer.id, (current) => ({
                          ...current,
                          enabled: event.target.value === "on",
                        }))
                      }
                    >
                      <option value="on">On</option>
                      <option value="off">Off</option>
                    </select>
                    <label className="gui-modal-label" htmlFor="gui-button-color">
                      Background Color
                    </label>
                    <input
                      id="gui-button-color"
                      className="gui-color-input"
                      type="color"
                      value={layer.bgColor}
                      onChange={(event) => updateButtonLayer(layer.id, (current) => ({ ...current, bgColor: event.target.value }))}
                    />
                    <p className="gui-modal-label">Resize by dragging the right or bottom edge of the button.</p>
                    <button
                      type="button"
                      className="gui-edit-button gui-delete-button"
                      onClick={() => {
                        setButtonLayers((current) => current.filter((item) => item.id !== layer.id));
                        setAnimateInOutActiveById((current) => {
                          const next = { ...current };
                          delete next[layer.id];
                          return next;
                        });
                        if (selectedButtonId === layer.id) {
                          setSelectedButtonId(null);
                        }
                        setObjectEditTarget(null);
                      }}
                    >
                      Delete Button
                    </button>
                  </>
                );
              })()
            ) : (
              (() => {
                const layer = textLayers.find((item) => item.id === objectEditTarget.id);

                if (!layer) {
                  return <p className="gui-modal-label">Text layer no longer exists.</p>;
                }

                return (
                  <>
                    <label className="gui-modal-label" htmlFor="gui-text-value">
                      Text
                    </label>
                    <input
                      id="gui-text-value"
                      className="gui-object-edit-input"
                      type="text"
                      value={layer.value}
                      onChange={(event) => updateTextLayer(layer.id, (current) => ({ ...current, value: event.target.value }))}
                    />
                    <label className="gui-modal-label" htmlFor="gui-text-size">
                      Size (pt)
                    </label>
                    <input
                      id="gui-text-size"
                      className="gui-object-edit-input"
                      type="number"
                      min={6}
                      max={180}
                      value={layer.fontSizePt}
                      onChange={(event) =>
                        updateTextLayer(layer.id, (current) => ({
                          ...current,
                          fontSizePt: clamp(Number(event.target.value) || 6, 6, 180),
                        }))
                      }
                    />
                    <p className="gui-modal-label">Alignment</p>
                    <div className="gui-align-row">
                      <button
                        type="button"
                        className={layer.alignment === "left" ? "gui-align-button is-active" : "gui-align-button"}
                        onClick={() => updateTextLayer(layer.id, (current) => ({ ...current, alignment: "left" }))}
                      >
                        Left
                      </button>
                      <button
                        type="button"
                        className={layer.alignment === "center" ? "gui-align-button is-active" : "gui-align-button"}
                        onClick={() => updateTextLayer(layer.id, (current) => ({ ...current, alignment: "center" }))}
                      >
                        Center
                      </button>
                      <button
                        type="button"
                        className={layer.alignment === "right" ? "gui-align-button is-active" : "gui-align-button"}
                        onClick={() => updateTextLayer(layer.id, (current) => ({ ...current, alignment: "right" }))}
                      >
                        Right
                      </button>
                    </div>
                    <p className="gui-modal-label">Resize by dragging the right or bottom edge of the text box.</p>
                    <button
                      type="button"
                      className="gui-edit-button gui-delete-button"
                      onClick={() => {
                        setTextLayers((current) => current.filter((item) => item.id !== layer.id));
                        if (selectedTextId === layer.id) {
                          setSelectedTextId(null);
                        }
                        setObjectEditTarget(null);
                      }}
                    >
                      Delete Text
                    </button>
                  </>
                );
              })()
            )}
          </div>
        </div>
      ) : null}

      {isSnapshotModalOpen ? (
        <div className="gui-modal-overlay" role="presentation">
          <div className="gui-modal-window" role="dialog" aria-modal="true" aria-label="Import snapshot">
            <div className="gui-modal-header">
              <strong>Import Snapshot</strong>
              <button type="button" className="gui-edit-button" onClick={() => setIsSnapshotModalOpen(false)}>
                Close
              </button>
            </div>
            <div className="gui-modal-list" role="listbox" aria-label="Snapshot list">
              {snapshotItems.map((item) => (
                <button
                  key={item.fileName}
                  type="button"
                  className="gui-modal-list-item"
                  onClick={() => void importSnapshot(item.fileName)}
                >
                  {item.name}
                </button>
              ))}
              {snapshotItems.length === 0 ? <p className="gui-modal-empty">No saved snapshots.</p> : null}
            </div>
            {snapshotError ? <p className="gui-modal-label">{snapshotError}</p> : null}
          </div>
        </div>
      ) : null}

      {tableSelectDropdown ? (
        <>
          <div
            className="gui-table-select-backdrop"
            onClick={() => setTableSelectDropdown(null)}
          />
          <div
            className="gui-table-select-dropdown"
            style={{ left: `${tableSelectDropdown.anchor.x}px`, top: `${tableSelectDropdown.anchor.y}px` }}
          >
            <div className="gui-table-select-header">{tableSelectDropdown.label}</div>
            {tableSelectDropdown.rows.length === 0 ? (
              <div className="gui-table-select-empty">No rows available.</div>
            ) : (
              tableSelectDropdown.rows.map((row, rowIndex) => (
                <button
                  key={rowIndex}
                  type="button"
                  className="gui-table-select-item"
                  onClick={() => void handleTableSelectRowPick(row)}
                >
                  {row[0] || `Row ${rowIndex + 1}`}
                </button>
              ))
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}
