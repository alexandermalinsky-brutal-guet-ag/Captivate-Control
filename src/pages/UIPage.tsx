import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { emitCaptivateButtonTrigger } from "../core/captivateIntegration";
import { getCaptivateLayerNames, requestCaptivateLayerSync, startCaptivateBridge } from "../adapters/captivatePluginAdapter";
import type {
  ElementPosition,
  ElementSize,
  GuiButtonAction,
  GuiButtonTextWeight,
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
    captivateTarget: "captivate.gui.button",
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

export function UIPage() {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addSearchValue, setAddSearchValue] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<GuiButtonAction>("animate-in-out");

  const [buttonLayers, setButtonLayers] = useState<ButtonLayer[]>([]);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [captivateLayerItems, setCaptivateLayerItems] = useState<string[]>([
    "layer-1",
    "layer-2",
    "layer-3",
    "layer-4",
    "layer-5",
    "layer-6",
    "layer-7",
    "layer-8",
  ]);

  const [selectedButtonId, setSelectedButtonId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [objectEditTarget, setObjectEditTarget] = useState<EditTarget>(null);
  const [animateInOutActiveById, setAnimateInOutActiveById] = useState<Record<string, boolean>>({});

  const containerRef = useRef<HTMLElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const textRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    void startCaptivateBridge().catch((error) => {
      console.error("Failed to start Captivate bridge:", error);
    });
  }, []);

  useEffect(() => {
    let disposed = false;

    const refreshLayers = async () => {
      try {
        await requestCaptivateLayerSync();
        const layers = await getCaptivateLayerNames();
        if (!disposed && layers && layers.length > 0) {
          setCaptivateLayerItems(layers);
        }
      } catch (error) {
        console.error("Failed to refresh Captivate layer names:", error);
      }
    };

    void refreshLayers();
    const timerId = window.setInterval(() => {
      void refreshLayers();
    }, 2500);

    return () => {
      disposed = true;
      window.clearInterval(timerId);
    };
  }, []);

  const presetItems: Array<{ id: GuiButtonAction; label: string }> = [
    { id: "animate-in-out", label: "Animate In/Out" },
    { id: "animate-in", label: "Animate In" },
    { id: "animate-out", label: "Animate Out" },
    { id: "cut-in", label: "Cut In" },
    { id: "cut-out", label: "Cut Out" },
    { id: "table-select", label: "Table Select" },
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
    setButtonLayers(snapshot.buttonRows.map(createHydratedButtonLayer));
    setTextLayers(snapshot.textRows.map(createHydratedTextLayer));
  }, []);

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
            layer.actionId === "animate-in-out" && animateInOutActiveById[layer.id] ? "is-live" : "",
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
          onClick={() => {
            if (isEditMode) {
              return;
            }

            const baseBinding = serializeCaptivateBinding(layer);

            if (layer.actionId === "animate-in-out") {
              const isActive = Boolean(animateInOutActiveById[layer.id]);
              const nextAction: GuiButtonAction = isActive ? "animate-out" : "animate-in";
              emitCaptivateButtonTrigger({
                ...baseBinding,
                actionId: nextAction,
              });
              setAnimateInOutActiveById((current) => ({
                ...current,
                [layer.id]: !isActive,
              }));
              return;
            }

            emitCaptivateButtonTrigger(baseBinding);
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
        <button type="button" className="gui-edit-button" onClick={toggleEditMode}>
          Edit
        </button>
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
                    <label className="gui-modal-label" htmlFor="gui-button-layer">
                      Captivate Layer
                    </label>
                    <select
                      id="gui-button-layer"
                      className="gui-object-edit-input gui-binding-select"
                      value={layer.captivateLayer}
                      onChange={(event) =>
                        updateButtonLayer(layer.id, (current) => ({
                          ...current,
                          captivateLayer: event.target.value,
                        }))
                      }
                    >
                      {captivateLayerItems.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <label className="gui-modal-label" htmlFor="gui-button-target">
                      Captivate Target
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
    </main>
  );
}
