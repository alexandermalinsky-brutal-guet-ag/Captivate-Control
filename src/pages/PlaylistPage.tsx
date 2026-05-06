import { LargeButton } from "../components/LargeButton";

export function PlaylistPage() {
  return (
    <main className="workspace-layout data-page-blank">
      <header className="data-page-header">
        <h1>Playlist</h1>
        <div className="data-page-separator" aria-hidden="true" />
      </header>

      <section className="page-panel">
        <div className="page-panel-header">
          <strong>Playlist Queue</strong>
        </div>
        <div className="page-panel-body">
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
        </div>
      </section>
    </main>
  );
}
