import { useEffect, useMemo, useState } from "react";
import type { DataTable } from "../core/dataTables";
import { useTables } from "../hooks/useTables";

export function BroadcastControlPage() {
  const { tables, setTables } = useTables();
  const [activeTableId, setActiveTableId] = useState<string>("players");
  const [tableZoom, setTableZoom] = useState<number>(1);
  const [selectedColumnIndex, setSelectedColumnIndex] = useState<number | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [tableSettingsTableId, setTableSettingsTableId] = useState<string | null>(null);
  const [tableSettingsName, setTableSettingsName] = useState("");
  const [tableSettingsDestination, setTableSettingsDestination] = useState<DataTable["destination"]>("captivate");

  const activeTable = useMemo(
    () => tables.find((table) => table.id === activeTableId) ?? tables[0] ?? null,
    [tables, activeTableId]
  );

  useEffect(() => {
    setSelectedColumnIndex(null);
    setSelectedRowIndex(null);
  }, [activeTableId]);

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    if (!activeTable) {
      return;
    }

    setTables((current) =>
      current.map((table) => {
        if (table.id !== activeTable.id) {
          return table;
        }

        const nextRows = table.rows.map((row) => [...row]);
        if (!nextRows[rowIndex]) {
          return table;
        }

        nextRows[rowIndex][columnIndex] = value;
        return { ...table, rows: nextRows };
      })
    );
  };

  const addRow = () => {
    if (!activeTable) {
      return;
    }

    setTables((current) =>
      current.map((table) => {
        if (table.id !== activeTable.id) {
          return table;
        }

        return {
          ...table,
          rows: [...table.rows, Array.from({ length: table.columns.length }, () => "")],
        };
      })
    );
  };

  const deleteSelectedRow = () => {
    if (!activeTable || selectedRowIndex === null) {
      return;
    }

    setTables((current) =>
      current.map((table) => {
        if (table.id !== activeTable.id) {
          return table;
        }

        if (table.rows.length <= 1) {
          return table;
        }

        return {
          ...table,
          rows: table.rows.filter((_, index) => index !== selectedRowIndex),
        };
      })
    );
    setSelectedRowIndex(null);
  };

  const addTable = () => {
    const newId = `table-${Date.now()}`;
    const newTable: DataTable = {
      id: newId,
      name: `Table ${tables.length + 1}`,
      destination: "captivate",
      columns: ["Column 1", "Column 2", "Column 3"],
      rows: [["", "", ""]],
    };

    setTables((current) => [...current, newTable]);
    setActiveTableId(newId);
  };

  const deleteActiveTable = () => {
    if (!activeTable || tables.length <= 1) {
      return;
    }

    setTables((current) => {
      const nextTables = current.filter((table) => table.id !== activeTable.id);
      if (nextTables.length > 0) {
        setActiveTableId(nextTables[0].id);
      }
      return nextTables;
    });
  };

  const addColumn = () => {
    if (!activeTable) {
      return;
    }

    const defaultName = `Column ${activeTable.columns.length + 1}`;
    const columnName = window.prompt("New column title", defaultName)?.trim();
    if (!columnName) {
      return;
    }

    setTables((current) =>
      current.map((table) => {
        if (table.id !== activeTable.id) {
          return table;
        }

        return {
          ...table,
          columns: [...table.columns, columnName],
          rows: table.rows.map((row) => [...row, ""]),
        };
      })
    );
  };

  const deleteSelectedColumn = () => {
    if (!activeTable || selectedColumnIndex === null) {
      return;
    }

    setTables((current) =>
      current.map((table) => {
        if (table.id !== activeTable.id) {
          return table;
        }

        if (table.columns.length <= 1) {
          return table;
        }

        return {
          ...table,
          columns: table.columns.filter((_, index) => index !== selectedColumnIndex),
          rows: table.rows.map((row) => row.filter((_, index) => index !== selectedColumnIndex)),
        };
      })
    );
    setSelectedColumnIndex(null);
  };

  const editSelectedColumnTitle = () => {
    if (!activeTable || selectedColumnIndex === null) {
      return;
    }

    const currentTitle = activeTable.columns[selectedColumnIndex] ?? "";
    const nextTitle = window.prompt("Edit column title", currentTitle)?.trim();
    if (!nextTitle) {
      return;
    }

    setTables((current) =>
      current.map((table) => {
        if (table.id !== activeTable.id) {
          return table;
        }

        const nextColumns = [...table.columns];
        nextColumns[selectedColumnIndex] = nextTitle;
        return { ...table, columns: nextColumns };
      })
    );
  };

  const openTableSettings = (tableId: string) => {
    const table = tables.find((item) => item.id === tableId);
    if (!table) {
      return;
    }

    setTableSettingsTableId(table.id);
    setTableSettingsName(table.name);
    setTableSettingsDestination(table.destination);
  };

  const submitTableSettings = () => {
    if (!tableSettingsTableId) {
      return;
    }

    const nextName = tableSettingsName.trim();
    if (!nextName) {
      return;
    }

    setTables((current) =>
      current.map((table) => {
        if (table.id !== tableSettingsTableId) {
          return table;
        }

        return {
          ...table,
          name: nextName,
          destination: tableSettingsDestination,
        };
      })
    );
    setTableSettingsTableId(null);
  };

  return (
    <main className="workspace-layout data-page-blank">
      <header className="data-page-header">
        <h1>Data</h1>
        <div className="data-page-separator" aria-hidden="true" />
      </header>

      <section className="data-workspace">
        <aside className="data-table-menu">
          <div className="data-table-menu-header">
            <strong>Tables</strong>
            <button type="button" className="gui-edit-button" onClick={addTable}>
              Add Table
            </button>
          </div>
          <div className="data-table-list" role="tablist" aria-label="Table list">
            {tables.map((table) => (
              <div
                key={table.id}
                className={activeTable?.id === table.id ? "data-table-list-row is-active" : "data-table-list-row"}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTable?.id === table.id}
                  className={activeTable?.id === table.id ? "data-table-list-item is-active" : "data-table-list-item"}
                  onClick={() => setActiveTableId(table.id)}
                >
                  <span>{table.name}</span>
                  <small className="data-table-destination">{table.destination}</small>
                </button>
                <button
                  type="button"
                  className="data-table-settings-button"
                  onClick={() => openTableSettings(table.id)}
                  aria-label={`Edit settings for ${table.name}`}
                  title={`Edit settings for ${table.name}`}
                >
                  ⚙
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="data-table-panel" aria-live="polite">
          {activeTable ? (
            <>
              <div className="data-table-panel-header">
                <h2>{activeTable.name}</h2>
                <div className="data-table-panel-actions">
                  <button type="button" className="gui-edit-button gui-delete-button" onClick={deleteActiveTable} disabled={tables.length <= 1}>
                    Delete Table
                  </button>
                  <button
                    type="button"
                    className="gui-edit-button"
                    onClick={editSelectedColumnTitle}
                    disabled={selectedColumnIndex === null}
                  >
                    Edit Column Title
                  </button>
                  <button type="button" className="gui-edit-button" onClick={addColumn}>
                    Add Column
                  </button>
                  <button
                    type="button"
                    className="gui-edit-button gui-delete-button"
                    onClick={deleteSelectedColumn}
                    disabled={selectedColumnIndex === null || activeTable.columns.length <= 1}
                  >
                    Delete Column
                  </button>
                  <button type="button" className="gui-edit-button" onClick={addRow}>
                    Add Row
                  </button>
                  <button
                    type="button"
                    className="gui-edit-button gui-delete-button"
                    onClick={deleteSelectedRow}
                    disabled={selectedRowIndex === null || activeTable.rows.length <= 1}
                  >
                    Delete Row
                  </button>
                </div>
              </div>
              <div className="data-table-scroll">
                <div
                  className="data-table-zoom-layer"
                  style={{ transform: `scale(${tableZoom})`, width: `${100 / tableZoom}%` }}
                >
                  <table className="data-table-grid">
                    <thead>
                      <tr>
                        <th className="data-row-index-header">#</th>
                        {activeTable.columns.map((column, columnIndex) => (
                          <th
                            key={`${column}-${columnIndex}`}
                            className={selectedColumnIndex === columnIndex ? "data-column-header is-selected" : "data-column-header"}
                            onClick={() => setSelectedColumnIndex(columnIndex)}
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeTable.rows.map((row, rowIndex) => (
                        <tr
                          key={`${activeTable.id}-row-${rowIndex}`}
                          className={selectedRowIndex === rowIndex ? "data-row is-selected" : "data-row"}
                        >
                          <td className="data-row-index-cell">
                            <button
                              type="button"
                              className={selectedRowIndex === rowIndex ? "data-row-index-button is-selected" : "data-row-index-button"}
                              onClick={() => setSelectedRowIndex(rowIndex)}
                            >
                              {rowIndex + 1}
                            </button>
                          </td>
                          {activeTable.columns.map((column, columnIndex) => (
                            <td key={`${column}-${rowIndex}-${columnIndex}`}>
                              <input
                                type="text"
                                className="data-cell-input"
                                value={row[columnIndex] ?? ""}
                                onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="data-table-footer">
                <button
                  type="button"
                  className="data-zoom-button"
                  onClick={() => setTableZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(2))))}
                >
                  Zoom -
                </button>
                <span className="data-zoom-value">{Math.round(tableZoom * 100)}%</span>
                <button
                  type="button"
                  className="data-zoom-button"
                  onClick={() => setTableZoom((current) => Math.min(1.5, Number((current + 0.1).toFixed(2))))}
                >
                  Zoom +
                </button>
              </div>
            </>
          ) : (
            <p className="gui-modal-label">No table selected.</p>
          )}
        </section>
      </section>

      {tableSettingsTableId ? (
        <div className="gui-modal-overlay" role="presentation">
          <div className="gui-modal-window" role="dialog" aria-modal="true" aria-label="Table settings">
            <div className="gui-modal-header">
              <strong>Table Settings</strong>
              <button type="button" className="gui-edit-button" onClick={() => setTableSettingsTableId(null)}>
                Close
              </button>
            </div>
            <label className="gui-modal-label" htmlFor="data-table-settings-name">
              Name
            </label>
            <input
              id="data-table-settings-name"
              className="gui-object-edit-input"
              type="text"
              value={tableSettingsName}
              onChange={(event) => setTableSettingsName(event.target.value)}
            />
            <label className="gui-modal-label" htmlFor="data-table-settings-destination">
              Destination
            </label>
            <select
              id="data-table-settings-destination"
              className="gui-object-edit-input gui-binding-select"
              value={tableSettingsDestination}
              onChange={(event) => setTableSettingsDestination(event.target.value as DataTable["destination"])}
            >
              <option value="captivate">Captivate</option>
              <option value="local-file">Local File</option>
              <option value="both">Captivate + Local File</option>
            </select>
            <button type="button" className="gui-edit-button" onClick={submitTableSettings} disabled={!tableSettingsName.trim()}>
              Save Settings
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
