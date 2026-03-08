import { useEffect, useMemo, useReducer } from "react";
import { gameReducer } from "../core/gameReducer";
import { createInitialGameState } from "../core/gameState";
import type { TeamSide } from "../core/types";

const CLOCK_TICK_INTERVAL_MS = 100;

export function useGameEngine() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialGameState);

  useEffect(() => {
    if (!state.clock.isRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      dispatch({ type: "clock/tick", deltaMs: CLOCK_TICK_INTERVAL_MS });
    }, CLOCK_TICK_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [state.clock.isRunning]);

  const actions = useMemo(
    () => ({
      adjustScore(side: TeamSide, delta: number) {
        dispatch({ type: "score/adjust", side, delta });
      },
      adjustShots(side: TeamSide, delta: number) {
        dispatch({ type: "shots/adjust", side, delta });
      },
      toggleClock() {
        dispatch({ type: "clock/toggle" });
      },
      setClock(remainingMs: number) {
        dispatch({ type: "clock/set", remainingMs });
      },
      adjustPeriod(delta: number) {
        dispatch({ type: "period/adjust", delta });
      },
      adjustPenalties(side: TeamSide, delta: number) {
        dispatch({ type: "penalties/adjust", side, delta });
      },
      setPowerplay(team: TeamSide | null) {
        dispatch({ type: "powerplay/set", team });
      },
      toggleLowerThird() {
        dispatch({ type: "lowerThird/toggle" });
      },
      updateLowerThird(payload: {
        playerName: string;
        playerNumber: string;
        playerRole: string;
        team: TeamSide | null;
      }) {
        dispatch({ type: "lowerThird/update", ...payload });
      },
    }),
    []
  );

  return {
    state,
    actions,
  };
}
