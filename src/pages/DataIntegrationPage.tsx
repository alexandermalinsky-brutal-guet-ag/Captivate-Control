import { useEffect, useMemo, useState } from "react";
import {
  getCaptivateIntegrationAdminCommand,
  getCaptivateIntegrationStatus,
  installCaptivateIntegration,
  restartCaptivateIntegrationHost,
  type CaptivateIntegrationAdminCommand,
  type CaptivateIntegrationStatus,
} from "../adapters/captivateIntegrationAdapter";
import { getCaptivateDataApiStatus, type CaptivateDataApiStatus } from "../adapters/captivateDataApiAdapter";
import { useTables } from "../hooks/useTables";

const STATUS_POLL_INTERVAL_MS = 2000;
const DEFAULT_BIND_ADDR = "127.0.0.1:45455";

function formatTimestamp(value: number | null): string {
  if (!value) {
    return "Not published yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatTerminalTime(value: number): string {
  const date = new Date(value);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function statusKind(status: number): "success" | "error" | "info" {
  if (status >= 500) return "error";
  if (status >= 400) return "error";
  if (status >= 300) return "info";
  return "success";
}

export function DataIntegrationPage() {
  const { tables } = useTables();
  const [status, setStatus] = useState<CaptivateDataApiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<CaptivateIntegrationStatus | null>(null);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [integrationMessage, setIntegrationMessage] = useState<string | null>(null);
  const [adminCommand, setAdminCommand] = useState<CaptivateIntegrationAdminCommand | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isRestartingCaptivate, setIsRestartingCaptivate] = useState(false);

  useEffect(() => {
    let isDisposed = false;

    const loadStatus = async () => {
      try {
        const [nextStatus, nextIntegrationStatus] = await Promise.all([
          getCaptivateDataApiStatus(),
          getCaptivateIntegrationStatus(),
        ]);
        if (!isDisposed) {
          setStatus(nextStatus);
          setIntegrationStatus(nextIntegrationStatus);
          setError(null);
          setIntegrationError(null);
        }
      } catch (nextError) {
        if (!isDisposed) {
          const message = nextError instanceof Error ? nextError.message : "Failed to load integration status.";
          setError(message);
          setIntegrationError(message);
        }
      }
    };

    void loadStatus();
    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const bindAddr = status?.bindAddr ?? DEFAULT_BIND_ADDR;
  const exposedTables = useMemo(
    () => tables.filter((table) => table.destination === "captivate" || table.destination === "both"),
    [tables]
  );

  const reloadIntegrationStatus = async () => {
    try {
      const nextStatus = await getCaptivateIntegrationStatus();
      setIntegrationStatus(nextStatus);
      setIntegrationError(null);
    } catch (nextError) {
      setIntegrationError(nextError instanceof Error ? nextError.message : "Failed to load Captivate install status.");
    }
  };

  const loadAdminCommand = async () => {
    try {
      const nextCommand = await getCaptivateIntegrationAdminCommand();
      setAdminCommand(nextCommand);
    } catch (_error) {
      setAdminCommand(null);
    }
  };

  const handleInstallIntegration = async () => {
    setIsInstalling(true);
    setIntegrationMessage(null);
    setIntegrationError(null);

    try {
      const result = await installCaptivateIntegration();
      setIntegrationMessage(result?.statusMessage ?? "Installed Captivate integration assets.");
      if (result?.pluginError || result?.controllerError) {
        setIntegrationError(
          [result.controllerError, result.pluginError].filter(Boolean).join(" ")
        );
        if (result?.pluginError) {
          await loadAdminCommand();
        }
      }
      await reloadIntegrationStatus();
    } catch (nextError) {
      setIntegrationError(nextError instanceof Error ? nextError.message : "Failed to install Captivate integration.");
    } finally {
      setIsInstalling(false);
    }
  };

  const handleRestartCaptivate = async () => {
    setIsRestartingCaptivate(true);
    setIntegrationMessage(null);
    setIntegrationError(null);

    try {
      await restartCaptivateIntegrationHost();
      setIntegrationMessage("Restarted Captivate.");
      await reloadIntegrationStatus();
    } catch (nextError) {
      setIntegrationError(nextError instanceof Error ? nextError.message : "Failed to restart Captivate.");
    } finally {
      setIsRestartingCaptivate(false);
    }
  };

  const recentRequests = useMemo(() => {
    if (!status?.recentRequests?.length) {
      return [];
    }
    return status.recentRequests.slice().reverse();
  }, [status?.recentRequests]);

  const handleCopyAdminCommand = async () => {
    if (!adminCommand?.command) {
      return;
    }

    try {
      await navigator.clipboard.writeText(adminCommand.command);
      setIntegrationMessage("Copied admin install command.");
      setIntegrationError(null);
    } catch (nextError) {
      setIntegrationError(nextError instanceof Error ? nextError.message : "Failed to copy admin install command.");
    }
  };

  return (
    <main className="workspace-layout data-page-blank">
      <header className="data-page-header">
        <h1>Integration</h1>
        <div className="data-page-separator" aria-hidden="true" />
      </header>

      <section className="page-panel">
        <div className="page-panel-header">
          <strong>Captivate Install</strong>
        </div>
        <div className="page-panel-body">
          <div className="integration-stat-grid">
            <div className="integration-stat">
              <span className="integration-stat-label">Captivate App</span>
              <span className="integration-stat-value">
                {integrationStatus?.captivateAppPath ? "Detected" : "Not detected"}
              </span>
            </div>
            <div className="integration-stat">
              <span className="integration-stat-label">HTML Controller</span>
              <span className="integration-stat-value">
                {integrationStatus?.controllerInstalled ? "Installed" : "Not installed"}
              </span>
            </div>
            <div className="integration-stat">
              <span className="integration-stat-label">Bridge Plugin</span>
              <span className="integration-stat-value">
                {integrationStatus?.pluginInstalled ? "Installed" : "Not installed"}
              </span>
            </div>
            <div className="integration-stat">
              <span className="integration-stat-label">Packaging</span>
              <span className="integration-stat-value">
                {integrationStatus?.packagedAssetsEmbedded ? "Embedded in app" : "External files"}
              </span>
            </div>
          </div>

          <div className="integration-install-actions">
            <button
              type="button"
              className="gui-edit-button"
              onClick={() => void handleInstallIntegration()}
              disabled={isInstalling || !integrationStatus?.canInstall}
            >
              {isInstalling ? "Installing..." : "Install / Reinstall Captivate Integration"}
            </button>
            <button
              type="button"
              className="gui-edit-button"
              onClick={() => void handleRestartCaptivate()}
              disabled={isRestartingCaptivate || !integrationStatus?.restartSupported}
            >
              {isRestartingCaptivate ? "Restarting..." : "Restart Captivate"}
            </button>
          </div>

          <p className="integration-note">
            Column names from exposed tables are baked into the installed controller XML as Captivate input variables. After adding
            or renaming columns, reinstall and restart Captivate to refresh the binding dropdown.
          </p>

          <div className="integration-path-list">
            <div className="integration-path">
              <span className="integration-stat-label">Captivate App Path</span>
              <code className="integration-endpoint">
                {integrationStatus?.captivateAppPath ?? "Not found in the default location"}
              </code>
            </div>
            <div className="integration-path">
              <span className="integration-stat-label">Controller Install Path</span>
              <code className="integration-endpoint">
                {integrationStatus?.controllerInstallPath ?? "Unsupported on this platform"}
              </code>
            </div>
            <div className="integration-path">
              <span className="integration-stat-label">Plugin Install Path</span>
              <code className="integration-endpoint">
                {integrationStatus?.pluginInstallPath ?? "Unsupported on this platform"}
              </code>
            </div>
          </div>

          {integrationStatus?.statusMessage ? (
            <p className="integration-note">{integrationStatus.statusMessage}</p>
          ) : null}
          {integrationStatus?.platform === "macos" && !integrationStatus?.pluginInstalled ? (
            <p className="integration-note">
              The HTML controller installs in a user-writable folder, but the bridge plugin lives under
              <code className="integration-inline-code"> /Library/Application Support/.../NodeRuntime/plugins </code>
              and usually requires administrator privileges on macOS.
            </p>
          ) : null}
          {adminCommand ? (
            <div className="integration-admin-box">
              <p className="integration-note">{adminCommand.statusMessage}</p>
              <div className="integration-install-actions">
                <button type="button" className="gui-edit-button" onClick={() => void handleCopyAdminCommand()}>
                  Copy Admin Install Command
                </button>
              </div>
              <div className="integration-path-list">
                <div className="integration-path">
                  <span className="integration-stat-label">Staged Plugin Path</span>
                  <code className="integration-endpoint">{adminCommand.stagedPluginPath}</code>
                </div>
                <div className="integration-path">
                  <span className="integration-stat-label">Target Plugin Path</span>
                  <code className="integration-endpoint">{adminCommand.targetPluginPath}</code>
                </div>
              </div>
              <div className="integration-command-block">
                <code className="integration-command-code">{adminCommand.command}</code>
              </div>
            </div>
          ) : null}
          {integrationMessage ? <p className="integration-success">{integrationMessage}</p> : null}
          {integrationError ? <p className="integration-error">{integrationError}</p> : null}
        </div>
      </section>

      <section className="page-panel">
        <div className="page-panel-header">
          <strong>API Status</strong>
        </div>
        <div className="page-panel-body">
          <div className="integration-stat-grid">
            <div className="integration-stat">
              <span className="integration-stat-label">Service</span>
              <span className="integration-stat-value">
                {status?.running ? "Running" : "Starting / unavailable"}
              </span>
            </div>
            <div className="integration-stat">
              <span className="integration-stat-label">Bind Address</span>
              <span className="integration-stat-value">{bindAddr}</span>
            </div>
            <div className="integration-stat">
              <span className="integration-stat-label">Published</span>
              <span className="integration-stat-value">{formatTimestamp(status?.publishedAt ?? null)}</span>
            </div>
            <div className="integration-stat">
              <span className="integration-stat-label">Exposed Tables</span>
              <span className="integration-stat-value">{status?.tableCount ?? exposedTables.length}</span>
            </div>
          </div>
          {error ? <p className="integration-error">{error}</p> : null}
        </div>
      </section>

      <section className="page-panel">
        <div className="page-panel-header">
          <strong>Exposed Tables</strong>
        </div>
        <div className="page-panel-body">
          {exposedTables.length > 0 ? (
            <div className="integration-table-list">
              {exposedTables.map((table) => (
                <article key={table.id} className="integration-table-row">
                  <div className="integration-table-row-main">
                    <strong>{table.name}</strong>
                    <small>
                      {table.columns.length} columns · {table.rows.length} rows
                    </small>
                  </div>
                  <code className="integration-endpoint">{`http://${bindAddr}/tables/${table.id}`}</code>
                </article>
              ))}
            </div>
          ) : (
            <p className="integration-note">No tables are currently exposed to Captivate.</p>
          )}
        </div>
      </section>

      <section className="page-panel page-panel--terminal">
        <div className="integration-terminal-bar">
          <span className="integration-terminal-title">Recent Requests</span>
        </div>
        <div className="integration-terminal-body" role="log">
          {recentRequests.length > 0 ? (
            recentRequests.map((entry) => {
              const kind = statusKind(entry.status);
              return (
                <div
                  key={`${entry.ts}-${entry.method}-${entry.path}`}
                  className="integration-terminal-line"
                >
                  <span className="integration-terminal-prompt" aria-hidden="true">
                    $
                  </span>
                  <span className="integration-terminal-time">{formatTerminalTime(entry.ts)}</span>
                  <span className="integration-terminal-method">{entry.method}</span>
                  <span className="integration-terminal-path">{entry.path}</span>
                  <span className="integration-terminal-status" data-kind={kind}>
                    {entry.status}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="integration-terminal-line integration-terminal-line--empty">
              <span className="integration-terminal-prompt" aria-hidden="true">
                $
              </span>
              <span className="integration-terminal-empty">waiting for requests…</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
