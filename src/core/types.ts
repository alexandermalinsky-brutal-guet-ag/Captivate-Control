export type SchemaVersion = "hockey.v1";
export type TeamSide = "home" | "away";

export interface TeamInfo {
  name: string;
  shortName: string;
}

export interface NumericByTeam {
  home: number;
  away: number;
}

export interface GameClock {
  remainingMs: number;
  isRunning: boolean;
}

export interface PowerplayState {
  team: TeamSide | null;
  expiresAtMs: number | null;
}

export interface LowerThirdState {
  visible: boolean;
  playerName: string;
  playerNumber: string;
  playerRole: string;
  team: TeamSide | null;
}

export interface GameTimestamps {
  createdAt: number;
  updatedAt: number;
}

export interface GameState {
  schema: SchemaVersion;
  teams: {
    home: TeamInfo;
    away: TeamInfo;
  };
  score: NumericByTeam;
  shots: NumericByTeam;
  clock: GameClock;
  period: number;
  penalties: NumericByTeam;
  powerplay: PowerplayState;
  lowerThird: LowerThirdState;
  timestamps: GameTimestamps;
}
