import { ControlSection } from "../components/ControlSection";
import { LargeButton } from "../components/LargeButton";

export function ProjectPage() {
  return (
    <main className="workspace-layout">
      <header className="panel-header">
        <h1>Project</h1>
        <p>Project-level configuration, profiles, and deployment targets</p>
      </header>

      <ControlSection title="Project Profiles">
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
      </ControlSection>
    </main>
  );
}
