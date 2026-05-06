(function () {
  "use strict";

  var DEFAULT_API_BASE_URL = "http://127.0.0.1:45455";
  var STORAGE_KEY = "captivate-control-data-api-url";

  function readInstanceIdFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      var value = params.get("instance");
      return value ? value.trim() : "";
    } catch (_error) {
      return "";
    }
  }

  var instanceId = readInstanceIdFromUrl();

  var state = {
    apiBaseUrl: loadStoredApiBaseUrl(),
    inputName: "Captivate Control: Data API Browser",
    tables: [],
    selectedTableId: "",
    tableDetail: null,
    selectedRowIndex: null,
    assignmentsByTable: {},
    instanceId: instanceId,
    instanceMode: Boolean(instanceId),
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function normalizeBaseUrl(value) {
    var nextValue = (value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
    nextValue = nextValue.replace(/\/tables(?:\/[^/?#]+)?$/i, "");
    return nextValue || DEFAULT_API_BASE_URL;
  }

  function loadStoredApiBaseUrl() {
    try {
      return normalizeBaseUrl(window.localStorage.getItem(STORAGE_KEY) || DEFAULT_API_BASE_URL);
    } catch (_error) {
      return DEFAULT_API_BASE_URL;
    }
  }

  function saveStoredApiBaseUrl(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (_error) {
      // Ignore localStorage failures in embedded browsers.
    }
  }

  function setStatus(message, isError) {
    var statusNode = byId("statusMessage");
    statusNode.textContent = message;
    statusNode.style.color = isError ? "#ffb8c2" : "#bdd0e2";
  }

  function setRowInfo(message) {
    byId("rowInfo").textContent = message;
  }

  function renderVariablePreview(variables) {
    byId("variablePreview").textContent = JSON.stringify(variables || {}, null, 2);
  }

  function loadStoredAssignments() {
    if (typeof ServiceHandler === "undefined" || !ServiceHandler.scheduler) {
      return;
    }

    ServiceHandler.scheduler.loadSettings(state.inputName, function (payload) {
      if (!payload) {
        return;
      }

      try {
        var parsed = JSON.parse(payload);
        if (parsed && parsed.assignmentsByTable && typeof parsed.assignmentsByTable === "object") {
          state.assignmentsByTable = parsed.assignmentsByTable;
          renderVariableAssignments();
        }
      } catch (_error) {
        // Ignore malformed saved settings.
      }
    });
  }

  function saveStoredAssignments() {
    if (typeof ServiceHandler === "undefined" || !ServiceHandler.scheduler) {
      return;
    }

    ServiceHandler.scheduler.saveSettings(
      state.inputName,
      JSON.stringify({ assignmentsByTable: state.assignmentsByTable })
    );
  }

  function assignmentsForSelectedTable() {
    if (!state.selectedTableId) {
      return {};
    }

    if (!state.assignmentsByTable[state.selectedTableId]) {
      state.assignmentsByTable[state.selectedTableId] = {};
    }

    return state.assignmentsByTable[state.selectedTableId];
  }

  function getSelectedVariables() {
    if (!state.tableDetail || state.selectedRowIndex === null) {
      return {};
    }

    var row = state.tableDetail.rows[state.selectedRowIndex];
    if (!row) {
      return {};
    }

    var variables = {};
    for (var index = 0; index < state.tableDetail.columns.length; index += 1) {
      variables[state.tableDetail.columns[index]] = row[index] || "";
    }
    return variables;
  }

  function buildVariableDefinition(columns) {
    var variables = {};
    for (var index = 0; index < columns.length; index += 1) {
      variables[columns[index]] = { type: "text" };
    }
    return {
      method: "reset",
      variables: variables,
    };
  }

  function updateInputDefinition(_table) {
    return Promise.resolve();
  }

  function pushCurrentRowToCaptivate() {
    if (typeof ServiceHandler === "undefined" || !ServiceHandler.scheduler || state.selectedRowIndex === null) {
      return Promise.resolve();
    }

    return ServiceHandler.scheduler.scheduleVariables(
      state.inputName,
      "update",
      state.inputName,
      getSelectedVariables()
    );
  }

  function renderTableList() {
    var selectNode = byId("tableSelect");
    selectNode.innerHTML = "";

    if (!state.tables.length) {
      var emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "No Captivate tables exposed";
      selectNode.appendChild(emptyOption);
      return;
    }

    for (var index = 0; index < state.tables.length; index += 1) {
      var table = state.tables[index];
      var option = document.createElement("option");
      option.value = table.id;
      option.textContent = table.name;
      if (table.id === state.selectedTableId) {
        option.selected = true;
      }
      selectNode.appendChild(option);
    }
  }

  function openVariableAssignment(variableName) {
    if (typeof ServiceHandler === "undefined" || !ServiceHandler.scheduler) {
      setStatus("ServiceHandler is not available in this browser context.", true);
      return;
    }

    ServiceHandler.scheduler.scheduleCommand(
      "popupAssignVariable",
      {
        input: state.inputName,
        variable: variableName,
        varType: "text",
      },
      {}
    );
  }

  function renderVariableAssignments() {
    var bodyNode = byId("variableAssignmentBody");
    bodyNode.innerHTML = "";

    if (!state.tableDetail) {
      var emptyRow = document.createElement("tr");
      var emptyCell = document.createElement("td");
      emptyCell.colSpan = 3;
      emptyCell.textContent = "Select a table to populate linkable variables.";
      emptyRow.appendChild(emptyCell);
      bodyNode.appendChild(emptyRow);
      renderVariablePreview({});
      return;
    }

    var variables = getSelectedVariables();
    var assignments = assignmentsForSelectedTable();

    for (var index = 0; index < state.tableDetail.columns.length; index += 1) {
      var variableName = state.tableDetail.columns[index];
      var rowNode = document.createElement("tr");

      var nameCell = document.createElement("td");
      nameCell.className = "variable-assignment-name";
      nameCell.textContent = variableName;
      rowNode.appendChild(nameCell);

      var assignCell = document.createElement("td");
      var assignButton = document.createElement("button");
      assignButton.type = "button";
      assignButton.className = assignments[variableName]
        ? "ctrl-button assign-button is-linked"
        : "ctrl-button assign-button";
      assignButton.textContent = assignments[variableName] || "Assign";
      (function (capturedVariableName) {
        assignButton.onclick = function () {
          openVariableAssignment(capturedVariableName);
        };
      })(variableName);
      assignCell.appendChild(assignButton);
      rowNode.appendChild(assignCell);

      var valueCell = document.createElement("td");
      valueCell.className = "variable-assignment-value";
      valueCell.textContent = variables[variableName] || "";
      rowNode.appendChild(valueCell);

      bodyNode.appendChild(rowNode);
    }

    renderVariablePreview(variables);
  }

  function renderTableDetail() {
    var container = byId("tableContainer");
    container.innerHTML = "";

    if (!state.tableDetail) {
      setRowInfo("No table selected.");
      renderVariableAssignments();
      return;
    }

    setRowInfo(
      state.tableDetail.rows.length +
        " rows available. Click one row to target it for Play or Update."
    );

    var table = document.createElement("table");
    var thead = document.createElement("thead");
    var headerRow = document.createElement("tr");

    for (var columnIndex = 0; columnIndex < state.tableDetail.columns.length; columnIndex += 1) {
      var th = document.createElement("th");
      th.textContent = state.tableDetail.columns[columnIndex];
      headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    for (var rowIndex = 0; rowIndex < state.tableDetail.rows.length; rowIndex += 1) {
      var rowNode = document.createElement("tr");
      if (rowIndex === state.selectedRowIndex) {
        rowNode.className = "is-selected";
      }

      (function (capturedRowIndex) {
        rowNode.onclick = function () {
          state.selectedRowIndex = capturedRowIndex;
          renderTableDetail();
          renderVariableAssignments();
          void pushCurrentRowToCaptivate().catch(function (error) {
            setStatus("Failed to push selected row: " + error, true);
          });
        };
      })(rowIndex);

      var row = state.tableDetail.rows[rowIndex];
      for (columnIndex = 0; columnIndex < state.tableDetail.columns.length; columnIndex += 1) {
        var td = document.createElement("td");
        td.textContent = row[columnIndex] || "";
        rowNode.appendChild(td);
      }

      tbody.appendChild(rowNode);
    }

    table.appendChild(tbody);
    container.appendChild(table);
    renderVariableAssignments();
  }

  function fetchJson(path) {
    return fetch(state.apiBaseUrl + path, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("API request failed: " + response.status + " " + response.statusText);
      }
      return response.json();
    });
  }

  function loadSelectedTable() {
    if (!state.selectedTableId) {
      state.tableDetail = null;
      state.selectedRowIndex = null;
      renderTableDetail();
      return Promise.resolve();
    }

    setStatus("Loading table rows...", false);
    return fetchJson("/tables/" + encodeURIComponent(state.selectedTableId))
      .then(function (detail) {
        state.tableDetail = detail;
        state.selectedRowIndex = detail.rows.length ? 0 : null;
        return updateInputDefinition(detail)
          .then(function () {
            renderTableDetail();
            return pushCurrentRowToCaptivate();
          })
          .then(function () {
            setStatus("Loaded table: " + detail.name, false);
          });
      })
      .catch(function (error) {
        state.tableDetail = null;
        state.selectedRowIndex = null;
        renderTableDetail();
        setStatus(error.message, true);
      });
  }

  function refreshTables() {
    state.apiBaseUrl = normalizeBaseUrl(byId("apiBaseUrl").value);
    byId("apiBaseUrl").value = state.apiBaseUrl;
    saveStoredApiBaseUrl(state.apiBaseUrl);

    setStatus("Refreshing table list...", false);
    return fetchJson("/tables")
      .then(function (tables) {
        state.tables = tables || [];
        if (!state.tables.length) {
          state.selectedTableId = "";
        } else if (!state.selectedTableId || !state.tables.some(function (table) { return table.id === state.selectedTableId; })) {
          state.selectedTableId = state.tables[0].id;
        }

        renderTableList();
        byId("tableSelect").value = state.selectedTableId;
        return loadSelectedTable();
      })
      .catch(function (error) {
        state.tables = [];
        state.selectedTableId = "";
        state.tableDetail = null;
        state.selectedRowIndex = null;
        renderTableList();
        renderTableDetail();
        setStatus(error.message, true);
      });
  }

  function sendAction(action) {
    if (typeof ServiceHandler === "undefined" || !ServiceHandler.scheduler) {
      setStatus("ServiceHandler is not available in this browser context.", true);
      return;
    }

    if (action !== "animateOut" && state.selectedRowIndex === null) {
      setStatus("Select a row before sending data to Captivate.", true);
      return;
    }

    var scheduler = ServiceHandler.scheduler;

    if (action === "animateOut") {
      renderVariablePreview({});
      scheduler
        .scheduleAction("animateOut", state.inputName, "", {})
        .then(function () {
          setStatus("Sent Play Out to Captivate.", false);
        })
        .catch(function (error) {
          setStatus("Captivate action failed: " + error, true);
        });
      return;
    }

    var variables = getSelectedVariables();
    renderVariablePreview(variables);

    var queuingMode = action === "automatic" ? "auto" : "update";
    scheduler
      .scheduleVariables(state.inputName, queuingMode, state.inputName, variables)
      .then(function () {
        setStatus("Sent " + action + " with row " + (state.selectedRowIndex + 1) + ".", false);
      })
      .catch(function (error) {
        setStatus("Captivate action failed: " + error, true);
      });
  }

  function bindEvents() {
    byId("refreshTablesButton").onclick = function () {
      void refreshTables();
    };

    byId("tableSelect").onchange = function (event) {
      state.selectedTableId = event.target.value;
      void loadSelectedTable();
    };

    byId("playButton").onclick = function () {
      sendAction("automatic");
    };

    byId("updateButton").onclick = function () {
      sendAction("update");
    };

    byId("playOutButton").onclick = function () {
      sendAction("animateOut");
    };
  }

  function initServiceHandler() {
    if (typeof ServiceHandler === "undefined") {
      setStatus("ServiceHandler was not found. Open this page inside Captivate.", true);
      return;
    }

    ServiceHandler.init();
    ServiceHandler.onclose = function () {
      setStatus("ServiceHandler disconnected.", true);
    };

    ServiceHandler.onerror = function (error) {
      setStatus("ServiceHandler error: " + error, true);
    };

    ServiceHandler.onready = function () {
      state.inputName = ServiceHandler.inputName || state.inputName;
      ServiceHandler.scheduler.onNotify.connect(function (payload) {
        try {
          var jsonReply = JSON.parse(payload);
          if (
            jsonReply &&
            jsonReply.input === state.inputName &&
            jsonReply.command === "variable_linked" &&
            jsonReply.inputVar
          ) {
            assignmentsForSelectedTable()[jsonReply.inputVar] = jsonReply.titleVar || "Assign";
            saveStoredAssignments();
            renderVariableAssignments();
          }
        } catch (_error) {
          // Ignore unrelated notifications.
        }
      });
      loadStoredAssignments();
      setStatus("Captivate connected. Ready to fetch tables.", false);
      void refreshTables();
    };
  }

  window.onload = function () {
    byId("apiBaseUrl").value = state.apiBaseUrl;
    bindEvents();
    renderTableList();
    renderTableDetail();
    initServiceHandler();
    setStatus("Fetching tables from " + state.apiBaseUrl + "...", false);
    void refreshTables();
  };

  window.onbeforeunload = function () {
    if (typeof ServiceHandler !== "undefined" && ServiceHandler && ServiceHandler.scheduler) {
      ServiceHandler.scheduler.pageClosed(state.inputName);
    }
  };
})();
