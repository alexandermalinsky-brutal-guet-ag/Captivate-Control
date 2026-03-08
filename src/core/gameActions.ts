import type { TeamSide } from "./types";

export type GameAction =
  | { type: "score/adjust"; side: TeamSide; delta: number }
  | { type: "shots/adjust"; side: TeamSide; delta: number }
  | { type: "clock/toggle" }
  | { type: "clock/tick"; deltaMs: number }
  | { type: "clock/set"; remainingMs: number }
  | { type: "period/adjust"; delta: number }
  | { type: "penalties/adjust"; side: TeamSide; delta: number }
  | { type: "powerplay/set"; team: TeamSide | null }
  | {
      type: "lowerThird/update";
      playerName: string;
      playerNumber: string;
      playerRole: string;
      team: TeamSide | null;
    }
  | { type: "lowerThird/toggle" };
