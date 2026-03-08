import { useState } from "react";

export function BroadcastControlPage() {
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);

  return (
    <main className="workspace-layout data-page-blank">
      <header className="data-page-header">
        <h1>Data</h1>
        <div className="data-page-separator" aria-hidden="true" />
        <div className="data-page-actions">
          <button type="button" className="gui-edit-button" onClick={() => setIsAddSourceOpen(true)}>
            Add Source
          </button>
        </div>
      </header>

      {isAddSourceOpen ? (
        <div className="gui-modal-overlay" role="presentation">
          <div className="gui-modal-window" role="dialog" aria-modal="true" aria-label="Add source">
            <div className="gui-modal-header">
              <strong>Add Source</strong>
              <button type="button" className="gui-edit-button" onClick={() => setIsAddSourceOpen(false)}>
                Close
              </button>
            </div>

            <p className="gui-modal-label">Source creation panel placeholder.</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
