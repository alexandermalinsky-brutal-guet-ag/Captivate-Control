import { useEffect, useMemo, useState } from "react";
import { startCaptivateBridge } from "./adapters/captivatePluginAdapter";
import { BroadcastControlPage } from "./pages/BroadcastControlPage";
import { PlaylistPage } from "./pages/PlaylistPage";
import { ProjectPage } from "./pages/ProjectPage";
import { UIPage } from "./pages/UIPage";

export function App() {
  const [activePage, setActivePage] = useState<"playlist" | "data" | "ui" | "project">("data");

  useEffect(() => {
    void startCaptivateBridge().catch((error) => {
      console.error("Failed to start Captivate bridge on app startup:", error);
    });
  }, []);

  const pageContent = useMemo(() => {
    switch (activePage) {
      case "playlist":
        return <PlaylistPage />;
      case "ui":
        return <UIPage />;
      case "project":
        return <ProjectPage />;
      case "data":
      default:
        return <BroadcastControlPage />;
    }
  }, [activePage]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>Captivate-Control</h1>
          <p>Broadcast Ops</p>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          <button
            className={activePage === "playlist" ? "sidebar-link is-active" : "sidebar-link"}
            onClick={() => setActivePage("playlist")}
            type="button"
          >
            Playlist
          </button>
          <button
            className={activePage === "data" ? "sidebar-link is-active" : "sidebar-link"}
            onClick={() => setActivePage("data")}
            type="button"
          >
            Data
          </button>
          <button
            className={activePage === "ui" ? "sidebar-link is-active" : "sidebar-link"}
            onClick={() => setActivePage("ui")}
            type="button"
          >
            GUI
          </button>
          <button
            className={activePage === "project" ? "sidebar-link is-active" : "sidebar-link"}
            onClick={() => setActivePage("project")}
            type="button"
          >
            Project
          </button>
        </nav>
      </aside>

      <section className="workspace">{pageContent}</section>
    </div>
  );
}
