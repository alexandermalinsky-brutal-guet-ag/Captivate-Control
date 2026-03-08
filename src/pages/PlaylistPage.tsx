import { ControlSection } from "../components/ControlSection";
import { LargeButton } from "../components/LargeButton";

export function PlaylistPage() {
  return (
    <main className="workspace-layout">
      <header className="panel-header">
        <h1>Playlist</h1>
        <p>Cue management for game moments and segment timing</p>
      </header>

      <ControlSection title="Playlist Queue">
        <div className="placeholder-grid">
          <div className="placeholder-card">
            <h3>Warmup Sequence</h3>
            <p>Pregame lower-thirds and intro stingers</p>
            <LargeButton>Load</LargeButton>
          </div>
          <div className="placeholder-card">
            <h3>In-Game Package</h3>
            <p>Goal, penalty, review, and timeout graphics blocks</p>
            <LargeButton>Load</LargeButton>
          </div>
          <div className="placeholder-card">
            <h3>Postgame Rollout</h3>
            <p>Final score board and star-of-game templates</p>
            <LargeButton>Load</LargeButton>
          </div>
        </div>
      </ControlSection>
    </main>
  );
}
