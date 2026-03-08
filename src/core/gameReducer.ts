import type { GameAction } from "./gameActions";
import type { GameState, TeamSide } from "./types";

const MIN_PERIOD = 1;
const MAX_PERIOD = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function adjustTeamValue(
  current: { home: number; away: number },
  side: TeamSide,
  delta: number
): { home: number; away: number } {
  return {
    ...current,
    [side]: Math.max(0, current[side] + delta),
  };
}

function withTimestamp(state: GameState): GameState {
  return {
    ...state,
    timestamps: {
      ...state.timestamps,
      updatedAt: Date.now(),
    },
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "score/adjust":
      return withTimestamp({
        ...state,
        score: adjustTeamValue(state.score, action.side, action.delta),
      });

    case "shots/adjust":
      return withTimestamp({
        ...state,
        shots: adjustTeamValue(state.shots, action.side, action.delta),
      });

    case "clock/toggle": {
      if (state.clock.remainingMs <= 0) {
        return state;
      }

      return withTimestamp({
        ...state,
        clock: {
          ...state.clock,
          isRunning: !state.clock.isRunning,
        },
      });
    }

    case "clock/tick": {
      if (!state.clock.isRunning) {
        return state;
      }

      const nextRemaining = Math.max(0, state.clock.remainingMs - action.deltaMs);

      return withTimestamp({
        ...state,
        clock: {
          remainingMs: nextRemaining,
          isRunning: nextRemaining > 0,
        },
      });
    }

    case "clock/set":
      return withTimestamp({
        ...state,
        clock: {
          remainingMs: Math.max(0, action.remainingMs),
          isRunning: false,
        },
      });

    case "period/adjust":
      return withTimestamp({
        ...state,
        period: clamp(state.period + action.delta, MIN_PERIOD, MAX_PERIOD),
      });

    case "penalties/adjust":
      return withTimestamp({
        ...state,
        penalties: adjustTeamValue(state.penalties, action.side, action.delta),
      });

    case "powerplay/set":
      return withTimestamp({
        ...state,
        powerplay: {
          team: action.team,
          expiresAtMs: null,
        },
      });

    case "lowerThird/update":
      return withTimestamp({
        ...state,
        lowerThird: {
          ...state.lowerThird,
          playerName: action.playerName,
          playerNumber: action.playerNumber,
          playerRole: action.playerRole,
          team: action.team,
        },
      });

    case "lowerThird/toggle":
      return withTimestamp({
        ...state,
        lowerThird: {
          ...state.lowerThird,
          visible: !state.lowerThird.visible,
        },
      });

    default:
      return state;
  }
}
