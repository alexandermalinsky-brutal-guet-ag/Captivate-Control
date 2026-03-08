import type { GameState } from "./types";

export const DEFAULT_PERIOD_DURATION_MS = 20 * 60 * 1000;

export function createInitialGameState(): GameState {
  const now = Date.now();

  return {
    schema: "hockey.v1",
    teams: {
      home: {
        name: "Home",
        shortName: "HOME",
      },
      away: {
        name: "Away",
        shortName: "AWAY",
      },
    },
    score: {
      home: 0,
      away: 0,
    },
    shots: {
      home: 0,
      away: 0,
    },
    clock: {
      remainingMs: DEFAULT_PERIOD_DURATION_MS,
      isRunning: false,
    },
    period: 1,
    penalties: {
      home: 0,
      away: 0,
    },
    powerplay: {
      team: null,
      expiresAtMs: null,
    },
    lowerThird: {
      visible: false,
      playerName: "",
      playerNumber: "",
      playerRole: "",
      team: null,
    },
    timestamps: {
      createdAt: now,
      updatedAt: now,
    },
  };
}
