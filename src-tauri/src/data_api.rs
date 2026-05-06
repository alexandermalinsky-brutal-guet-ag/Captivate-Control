use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::VecDeque;
use std::io::Cursor;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tiny_http::{Header, Method, Response, Server};

pub const DEFAULT_DATA_API_PORT: u16 = 45455;
const REQUEST_LOG_CAPACITY: usize = 50;

#[derive(Default)]
pub struct DataApiRuntime {
    bind_addr: Option<String>,
    published_at: Arc<Mutex<Option<u64>>>,
    tables: Arc<Mutex<Vec<PublishedTable>>>,
    table_selects: Arc<Mutex<Vec<TableSelectInstance>>>,
    request_log: Arc<Mutex<VecDeque<ReqLogEntry>>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
    listener_thread: Option<JoinHandle<()>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedTable {
    pub id: String,
    pub name: String,
    pub destination: String,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSelectInstance {
    pub id: String,
    pub label: String,
    pub source_table_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReqLogEntry {
    pub ts: u64,
    pub method: String,
    pub path: String,
    pub status: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataApiStatus {
    pub running: bool,
    pub bind_addr: Option<String>,
    pub table_count: usize,
    pub published_at: Option<u64>,
    pub recent_requests: Vec<ReqLogEntry>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

fn is_exposed(destination: &str) -> bool {
    destination == "captivate" || destination == "both"
}

fn json_response(status: u16, body: serde_json::Value) -> Response<Cursor<Vec<u8>>> {
    let bytes = body.to_string().into_bytes();
    let length = bytes.len();
    let cursor = Cursor::new(bytes);
    let mut response = Response::new(
        tiny_http::StatusCode(status),
        vec![
            Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap(),
            Header::from_bytes(&b"Cache-Control"[..], &b"no-store"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, OPTIONS"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..]).unwrap(),
        ],
        cursor,
        Some(length),
        None,
    );
    response = response.with_status_code(status);
    response
}

fn record_log(log: &Arc<Mutex<VecDeque<ReqLogEntry>>>, entry: ReqLogEntry) {
    if let Ok(mut guard) = log.lock() {
        guard.push_back(entry);
        while guard.len() > REQUEST_LOG_CAPACITY {
            guard.pop_front();
        }
    }
}

fn handle_status(
    bind_addr: &str,
    tables: &Arc<Mutex<Vec<PublishedTable>>>,
    published_at: &Arc<Mutex<Option<u64>>>,
) -> (u16, serde_json::Value) {
    let exposed = tables
        .lock()
        .map(|rows| rows.iter().filter(|t| is_exposed(&t.destination)).count())
        .unwrap_or(0);
    let stamp = published_at.lock().ok().and_then(|guard| *guard);
    (
        200,
        json!({
            "running": true,
            "bindAddr": bind_addr,
            "tableCount": exposed,
            "publishedAt": stamp,
        }),
    )
}

fn handle_tables_list(tables: &Arc<Mutex<Vec<PublishedTable>>>) -> (u16, serde_json::Value) {
    let Ok(rows) = tables.lock() else {
        return (500, json!({ "error": "tables lock poisoned" }));
    };
    let summaries: Vec<serde_json::Value> = rows
        .iter()
        .filter(|t| is_exposed(&t.destination))
        .map(|t| {
            json!({
                "id": t.id,
                "name": t.name,
                "columns": t.columns,
                "rowCount": t.rows.len(),
                "destination": t.destination,
            })
        })
        .collect();
    (200, serde_json::Value::Array(summaries))
}

fn handle_table_detail(
    id: &str,
    tables: &Arc<Mutex<Vec<PublishedTable>>>,
) -> (u16, serde_json::Value) {
    let Ok(rows) = tables.lock() else {
        return (500, json!({ "error": "tables lock poisoned" }));
    };
    match rows
        .iter()
        .find(|t| t.id == id && is_exposed(&t.destination))
    {
        Some(table) => (
            200,
            json!({
                "id": table.id,
                "name": table.name,
                "columns": table.columns,
                "rows": table.rows,
            }),
        ),
        None => (404, json!({ "error": "table not found" })),
    }
}

fn handle_table_select_detail(
    instance_id: &str,
    tables: &Arc<Mutex<Vec<PublishedTable>>>,
    table_selects: &Arc<Mutex<Vec<TableSelectInstance>>>,
) -> (u16, serde_json::Value) {
    let Ok(instances) = table_selects.lock() else {
        return (500, json!({ "error": "table_selects lock poisoned" }));
    };
    let Some(instance) = instances.iter().find(|i| i.id == instance_id).cloned() else {
        return (404, json!({ "error": "table select instance not found" }));
    };
    drop(instances);

    let Ok(rows) = tables.lock() else {
        return (500, json!({ "error": "tables lock poisoned" }));
    };
    let Some(table) = rows
        .iter()
        .find(|t| t.id == instance.source_table_id && is_exposed(&t.destination))
    else {
        return (
            200,
            json!({
                "id": instance.id,
                "label": instance.label,
                "sourceTableId": instance.source_table_id,
                "inputName": format!("Captivate Control: {}", instance.label),
                "columns": [],
                "rows": [],
            }),
        );
    };

    (
        200,
        json!({
            "id": instance.id,
            "label": instance.label,
            "sourceTableId": instance.source_table_id,
            "sourceTableName": table.name,
            "inputName": format!("Captivate Control: {}", instance.label),
            "columns": table.columns,
            "rows": table.rows,
        }),
    )
}

fn handle_table_selects_list(
    table_selects: &Arc<Mutex<Vec<TableSelectInstance>>>,
) -> (u16, serde_json::Value) {
    let Ok(instances) = table_selects.lock() else {
        return (500, json!({ "error": "table_selects lock poisoned" }));
    };
    let summaries: Vec<serde_json::Value> = instances
        .iter()
        .map(|i| {
            json!({
                "id": i.id,
                "label": i.label,
                "sourceTableId": i.source_table_id,
                "inputName": format!("Captivate Control: {}", i.label),
            })
        })
        .collect();
    (200, serde_json::Value::Array(summaries))
}

fn handle(
    request: tiny_http::Request,
    bind_addr: String,
    tables: Arc<Mutex<Vec<PublishedTable>>>,
    table_selects: Arc<Mutex<Vec<TableSelectInstance>>>,
    published_at: Arc<Mutex<Option<u64>>>,
    log: Arc<Mutex<VecDeque<ReqLogEntry>>>,
) {
    let method = format!("{}", request.method());
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or(&url).to_string();

    if request.method() == &Method::Options {
        record_log(
            &log,
            ReqLogEntry {
                ts: now_ms(),
                method,
                path,
                status: 204,
            },
        );
        let _ = request.respond(json_response(204, json!({})));
        return;
    }

    let (status, body) = match (request.method(), path.as_str()) {
        (Method::Get, "/status") => handle_status(&bind_addr, &tables, &published_at),
        (Method::Get, "/tables") => handle_tables_list(&tables),
        (Method::Get, p) if p.starts_with("/tables/") => {
            let id = &p["/tables/".len()..];
            if id.is_empty() || id.contains('/') {
                (404, json!({ "error": "not found" }))
            } else {
                handle_table_detail(id, &tables)
            }
        }
        (Method::Get, "/table-selects") => handle_table_selects_list(&table_selects),
        (Method::Get, p) if p.starts_with("/table-selects/") => {
            let id = &p["/table-selects/".len()..];
            if id.is_empty() || id.contains('/') {
                (404, json!({ "error": "not found" }))
            } else {
                handle_table_select_detail(id, &tables, &table_selects)
            }
        }
        _ => (404, json!({ "error": "not found" })),
    };

    record_log(
        &log,
        ReqLogEntry {
            ts: now_ms(),
            method,
            path,
            status,
        },
    );

    let _ = request.respond(json_response(status, body));
}

pub fn start(runtime: &mut DataApiRuntime, port: u16) -> Result<String, String> {
    if runtime.listener_thread.is_some() {
        return Ok(runtime
            .bind_addr
            .clone()
            .unwrap_or_else(|| format!("127.0.0.1:{port}")));
    }

    let bind_addr = format!("127.0.0.1:{port}");
    let server = Server::http(&bind_addr).map_err(|error| {
        format!("Unable to bind data API on {bind_addr}: {error}. Is another process using this port?")
    })?;

    let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();
    let tables = Arc::clone(&runtime.tables);
    let table_selects = Arc::clone(&runtime.table_selects);
    let published_at = Arc::clone(&runtime.published_at);
    let log = Arc::clone(&runtime.request_log);
    let bind_for_thread = bind_addr.clone();

    let listener_thread = thread::Builder::new()
        .name("captivate-data-api".into())
        .spawn(move || loop {
            if shutdown_rx.try_recv().is_ok() {
                break;
            }
            match server.recv_timeout(Duration::from_millis(200)) {
                Ok(Some(req)) => {
                    let tables = Arc::clone(&tables);
                    let table_selects = Arc::clone(&table_selects);
                    let published_at = Arc::clone(&published_at);
                    let log = Arc::clone(&log);
                    let bind = bind_for_thread.clone();
                    let _ = thread::Builder::new()
                        .name("captivate-data-api-request".into())
                        .spawn(move || handle(req, bind, tables, table_selects, published_at, log));
                }
                Ok(None) => continue,
                Err(_) => break,
            }
        })
        .map_err(|error| format!("Failed to spawn data API thread: {error}"))?;

    runtime.bind_addr = Some(bind_addr.clone());
    runtime.shutdown_tx = Some(shutdown_tx);
    runtime.listener_thread = Some(listener_thread);
    Ok(bind_addr)
}

pub fn stop(runtime: &mut DataApiRuntime) {
    if let Some(shutdown_tx) = runtime.shutdown_tx.take() {
        let _ = shutdown_tx.send(());
    }
    if let Some(thread) = runtime.listener_thread.take() {
        let _ = thread.join();
    }
    runtime.bind_addr = None;
}

pub fn publish_tables(runtime: &DataApiRuntime, tables: Vec<PublishedTable>) -> Result<(), String> {
    let mut guard = runtime
        .tables
        .lock()
        .map_err(|_| "data API tables lock poisoned".to_string())?;
    *guard = tables;
    drop(guard);
    if let Ok(mut stamp) = runtime.published_at.lock() {
        *stamp = Some(now_ms());
    }
    Ok(())
}

pub fn snapshot_tables(runtime: &DataApiRuntime) -> Vec<PublishedTable> {
    runtime
        .tables
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_default()
}

pub fn publish_table_selects(
    runtime: &DataApiRuntime,
    instances: Vec<TableSelectInstance>,
) -> Result<(), String> {
    let mut guard = runtime
        .table_selects
        .lock()
        .map_err(|_| "data API table_selects lock poisoned".to_string())?;
    *guard = instances;
    Ok(())
}

pub fn snapshot_table_selects(runtime: &DataApiRuntime) -> Vec<TableSelectInstance> {
    runtime
        .table_selects
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_default()
}

pub fn status(runtime: &DataApiRuntime) -> DataApiStatus {
    let table_count = runtime
        .tables
        .lock()
        .map(|rows| rows.iter().filter(|t| is_exposed(&t.destination)).count())
        .unwrap_or(0);
    let published_at = runtime.published_at.lock().ok().and_then(|guard| *guard);
    let recent_requests = runtime
        .request_log
        .lock()
        .map(|log| log.iter().cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    DataApiStatus {
        running: runtime.listener_thread.is_some(),
        bind_addr: runtime.bind_addr.clone(),
        table_count,
        published_at,
        recent_requests,
    }
}
