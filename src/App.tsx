import { useEffect, useMemo, useState } from "react";
import { publishCaptivateDataTables, startCaptivateDataApi } from "./adapters/captivateDataApiAdapter";
import { startCaptivateBridge } from "./adapters/captivatePluginAdapter";
import { TablesProvider, useTables } from "./hooks/useTables";
import { BroadcastControlPage } from "./pages/BroadcastControlPage";
import { DataIntegrationPage } from "./pages/DataIntegrationPage";
import { PlaylistPage } from "./pages/PlaylistPage";
import { ProjectPage } from "./pages/ProjectPage";
import { UIPage } from "./pages/UIPage";

type ActivePage = "playlist" | "data" | "integration" | "ui" | "project";

function AppShell() {
  const { tables } = useTables();
  const [activePage, setActivePage] = useState<ActivePage>("data");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    void startCaptivateBridge().catch((error) => {
      console.error("Failed to start Captivate bridge on app startup:", error);
    });
    void startCaptivateDataApi().catch((error) => {
      console.error("Failed to start data API on app startup:", error);
    });
  }, []);

  useEffect(() => {
    void publishCaptivateDataTables(tables).catch((error) => {
      console.error("Failed to publish data tables to Captivate data API:", error);
    });
  }, [tables]);

  const pageContent = useMemo(() => {
    switch (activePage) {
      case "playlist":
        return <PlaylistPage />;
      case "integration":
        return <DataIntegrationPage />;
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
    <div className={isSidebarOpen ? "app-shell" : "app-shell is-sidebar-collapsed"}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>Captivate-Control</h1>
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
            className={activePage === "integration" ? "sidebar-link is-active" : "sidebar-link"}
            onClick={() => setActivePage("integration")}
            type="button"
          >
            Integration
          </button>
          <button
            className={activePage === "ui" ? "sidebar-link is-active" : "sidebar-link"}
            onClick={() => setActivePage("ui")}
            type="button"
          >
            Playout UI
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

      <button
        type="button"
        className="sidebar-toggle"
        onClick={() => setIsSidebarOpen((value) => !value)}
        aria-label={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
        aria-expanded={isSidebarOpen}
      >
        {isSidebarOpen ? "‹" : "›"}
      </button>
    </div>
  );
}

export function App() {
  return (
    <TablesProvider>
      <AppShell />
    </TablesProvider>
  );
}
