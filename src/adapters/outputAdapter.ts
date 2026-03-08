import type { GameState } from "../core/types";

export interface OutputAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  pushState(state: GameState): Promise<void>;
}
