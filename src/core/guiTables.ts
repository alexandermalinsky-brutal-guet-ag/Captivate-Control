export type TextAlignment = "left" | "center" | "right";
export type GuiButtonTextWeight = "regular" | "bold";
export type GuiButtonAction =
  | "animate-in-out"
  | "animate-in"
  | "animate-out"
  | "cut-in"
  | "cut-out"
  | "table-select";

export interface ElementSize {
  width: number;
  height: number;
}

export interface ElementPosition {
  x: number;
  y: number;
}

export interface GuiButtonTableRow {
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
}

export interface GuiTextTableRow {
  id: string;
  value: string;
  size: ElementSize;
  fontSizePt: number;
  alignment: TextAlignment;
  position: ElementPosition | null;
}

export interface GuiTableSnapshot {
  buttonRows: GuiButtonTableRow[];
  textRows: GuiTextTableRow[];
}

export interface GuiCaptivateButtonBindingRow {
  id: string;
  label: string;
  actionId: GuiButtonAction;
  captivateLayer: string;
  captivateTarget: string;
  sourceTable: string;
  enabled: boolean;
}
