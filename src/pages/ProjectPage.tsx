import { LargeButton } from "../components/LargeButton";

export function ProjectPage() {
  return (
    <main className="workspace-layout data-page-blank">
      <header className="data-page-header">
        <h1>Project</h1>
        <div className="data-page-separator" aria-hidden="true" />
      </header>

      <section className="page-panel">
        <div className="page-panel-header">
          <strong>Project Profiles</strong>
        </div>
        <div className="page-panel-body">
          <div className="placeholder-grid">
            <div className="placeholder-card">
              <h3>Swiss League</h3>
              <p>Template set, fonts, and sponsor layout mapping</p>
              <LargeButton>Activate</LargeButton>
            </div>
            <div className="placeholder-card">
              <h3>International Feed</h3>
              <p>Neutral package with multilingual lower-third support</p>
              <LargeButton>Activate</LargeButton>
            </div>
            <div className="placeholder-card">
              <h3>Practice Session</h3>
              <p>Safe local-output profile for rehearsals and QA</p>
              <LargeButton>Activate</LargeButton>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
