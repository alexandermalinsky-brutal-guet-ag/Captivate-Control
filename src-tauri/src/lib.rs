use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::net::TcpStream;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DEFAULT_CAPTIVATE_BRIDGE_PORT: u16 = 45454;

#[derive(Default)]
struct AppState {
    bridge: Mutex<CaptivateBridgeRuntime>,
}

#[derive(Default)]
struct CaptivateBridgeRuntime {
    bind_addr: Option<String>,
    clients: Arc<Mutex<Vec<TcpStream>>>,
    layer_names: Arc<Mutex<Vec<String>>>,
    listener_thread: Option<JoinHandle<()>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptivateBridgeStatus {
    running: bool,
    bind_addr: Option<String>,
    connected_clients: usize,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CaptivateTriggerPayload {
    id: String,
    label: String,
    action_id: String,
    captivate_layer: String,
    captivate_target: String,
    source_table: String,
    enabled: bool,
    triggered_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptivatePluginMessage {
    schema: &'static str,
    message_type: &'static str,
    sent_at: u64,
    payload: CaptivateTriggerPayload,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptivateBridgeRequestMessage {
    schema: &'static str,
    message_type: &'static str,
    sent_at: u64,
    payload: serde_json::Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptivateInboundMessage {
    schema: Option<String>,
    message_type: Option<String>,
    payload: Option<serde_json::Value>,
}

fn now_ms() -> u64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    now.as_millis() as u64
}

fn read_inbound_messages(stream: TcpStream, layer_names: Arc<Mutex<Vec<String>>>) {
    let mut reader = BufReader::new(stream);

    loop {
        let mut line = String::new();
        let read_result = reader.read_line(&mut line);

        match read_result {
            Ok(0) => break,
            Ok(_) => {
                let frame = line.trim();
                if frame.is_empty() {
                    continue;
                }

                let parsed = serde_json::from_str::<CaptivateInboundMessage>(frame);
                let Ok(message) = parsed else {
                    continue;
                };

                if message.schema.as_deref() != Some("captivate.bridge.v1") {
                    continue;
                }

                if message.message_type.as_deref() != Some("layerList") {
                    continue;
                }

                let Some(payload) = message.payload else {
                    continue;
                };

                let Some(items) = payload.get("layers").and_then(|v| v.as_array()) else {
                    continue;
                };

                let mut next_layers = Vec::new();
                for item in items {
                    if let Some(name) = item.as_str() {
                        let trimmed = name.trim();
                        if !trimmed.is_empty() && !next_layers.iter().any(|existing: &String| existing == trimmed) {
                            next_layers.push(trimmed.to_string());
                        }
                    }
                }

                if let Ok(mut current) = layer_names.lock() {
                    *current = next_layers;
                }
            }
            Err(_) => break,
        }
    }
}

fn start_bridge_server(runtime: &mut CaptivateBridgeRuntime, port: u16) -> Result<String, String> {
    if runtime.listener_thread.is_some() {
        return Ok(runtime
            .bind_addr
            .clone()
            .unwrap_or_else(|| format!("127.0.0.1:{port}")));
    }

    let bind_addr = format!("127.0.0.1:{port}");
    let listener = TcpListener::bind(&bind_addr).map_err(|error| {
        format!(
            "Unable to bind Captivate bridge on {bind_addr}: {error}. Is another process using this port?"
        )
    })?;

    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Failed to set non-blocking listener mode: {error}"))?;

    let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();
    let clients = Arc::clone(&runtime.clients);
    let layer_names = Arc::clone(&runtime.layer_names);

    let listener_thread = thread::Builder::new()
        .name("captivate-bridge-listener".into())
        .spawn(move || loop {
            if shutdown_rx.try_recv().is_ok() {
                break;
            }

            match listener.accept() {
                Ok((stream, _address)) => {
                    if stream.set_nodelay(true).is_err() {
                        continue;
                    }

                    if let Ok(writer_stream) = stream.try_clone() {
                        if let Ok(mut guard) = clients.lock() {
                            guard.push(writer_stream);
                        }
                    }

                    let layer_names = Arc::clone(&layer_names);
                    let _ = thread::Builder::new()
                        .name("captivate-bridge-client-reader".into())
                        .spawn(move || {
                            read_inbound_messages(stream, layer_names);
                        });
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(70));
                }
                Err(_error) => {
                    thread::sleep(Duration::from_millis(120));
                }
            }
        })
        .map_err(|error| format!("Failed to spawn Captivate bridge listener thread: {error}"))?;

    runtime.bind_addr = Some(bind_addr.clone());
    runtime.shutdown_tx = Some(shutdown_tx);
    runtime.listener_thread = Some(listener_thread);

    Ok(bind_addr)
}

fn broadcast_to_clients(runtime: &CaptivateBridgeRuntime, message: &str) -> Result<(), String> {
    let mut clients = runtime
        .clients
        .lock()
        .map_err(|_| "Captivate bridge client lock poisoned".to_string())?;

    clients.retain_mut(|stream| {
        let write_result = stream.write_all(message.as_bytes());
        let flush_result = stream.flush();
        write_result.is_ok() && flush_result.is_ok()
    });

    Ok(())
}

fn send_bridge_request(
    runtime: &CaptivateBridgeRuntime,
    message_type: &'static str,
    payload: serde_json::Value,
) -> Result<(), String> {
    let message = CaptivateBridgeRequestMessage {
        schema: "captivate.bridge.v1",
        message_type,
        sent_at: now_ms(),
        payload,
    };

    let json = serde_json::to_string(&message)
        .map_err(|error| format!("Failed to serialize Captivate bridge request: {error}"))?;
    let framed = format!("{json}\n");
    broadcast_to_clients(runtime, &framed)
}

fn stop_bridge_server(runtime: &mut CaptivateBridgeRuntime) {
    if let Some(shutdown_tx) = runtime.shutdown_tx.take() {
        let _ = shutdown_tx.send(());
    }

    if let Some(listener_thread) = runtime.listener_thread.take() {
        let _ = listener_thread.join();
    }

    if let Ok(mut clients) = runtime.clients.lock() {
        clients.clear();
    }

    runtime.bind_addr = None;
}

#[tauri::command]
fn captivate_get_layer_names(state: tauri::State<AppState>) -> Result<Vec<String>, String> {
    let runtime = state
        .bridge
        .lock()
        .map_err(|_| "Captivate bridge runtime lock poisoned".to_string())?;

    let layers = runtime
        .layer_names
        .lock()
        .map_err(|_| "Captivate layer cache lock poisoned".to_string())?;

    Ok(layers.clone())
}

#[tauri::command]
fn captivate_request_layer_sync(state: tauri::State<AppState>) -> Result<(), String> {
    let runtime = state
        .bridge
        .lock()
        .map_err(|_| "Captivate bridge runtime lock poisoned".to_string())?;

    if runtime.listener_thread.is_none() {
        return Err("Captivate bridge is not running".to_string());
    }

    send_bridge_request(&runtime, "requestLayerList", json!({}))
}

#[tauri::command]
fn captivate_send_data_push(state: tauri::State<AppState>, payload: serde_json::Value) -> Result<(), String> {
    let runtime = state
        .bridge
        .lock()
        .map_err(|_| "Captivate bridge runtime lock poisoned".to_string())?;

    if runtime.listener_thread.is_none() {
        return Err("Captivate bridge is not running".to_string());
    }

    send_bridge_request(&runtime, "dataPush", payload)
}

#[tauri::command]
fn captivate_send_command(
    state: tauri::State<AppState>,
    command: String,
    parameters: Option<serde_json::Value>,
    variables: Option<serde_json::Value>,
) -> Result<(), String> {
    let runtime = state
        .bridge
        .lock()
        .map_err(|_| "Captivate bridge runtime lock poisoned".to_string())?;

    if runtime.listener_thread.is_none() {
        return Err("Captivate bridge is not running".to_string());
    }

    send_bridge_request(
        &runtime,
        "command",
        json!({
            "command": command,
            "parameters": parameters.unwrap_or_else(|| json!({})),
            "variables": variables.unwrap_or_else(|| json!({}))
        }),
    )
}

#[tauri::command]
fn captivate_start_bridge(
    state: tauri::State<AppState>,
    port: Option<u16>,
) -> Result<CaptivateBridgeStatus, String> {
    let mut runtime = state
        .bridge
        .lock()
        .map_err(|_| "Captivate bridge runtime lock poisoned".to_string())?;

    let selected_port = port.unwrap_or(DEFAULT_CAPTIVATE_BRIDGE_PORT);
    let bind_addr = start_bridge_server(&mut runtime, selected_port)?;
    let connected_clients = runtime
        .clients
        .lock()
        .map(|clients| clients.len())
        .unwrap_or_default();

    Ok(CaptivateBridgeStatus {
        running: true,
        bind_addr: Some(bind_addr),
        connected_clients,
    })
}

#[tauri::command]
fn captivate_stop_bridge(state: tauri::State<AppState>) -> Result<(), String> {
    let mut runtime = state
        .bridge
        .lock()
        .map_err(|_| "Captivate bridge runtime lock poisoned".to_string())?;
    stop_bridge_server(&mut runtime);
    Ok(())
}

#[tauri::command]
fn captivate_bridge_status(state: tauri::State<AppState>) -> Result<CaptivateBridgeStatus, String> {
    let runtime = state
        .bridge
        .lock()
        .map_err(|_| "Captivate bridge runtime lock poisoned".to_string())?;

    let connected_clients = runtime
        .clients
        .lock()
        .map(|clients| clients.len())
        .unwrap_or_default();

    Ok(CaptivateBridgeStatus {
        running: runtime.listener_thread.is_some(),
        bind_addr: runtime.bind_addr.clone(),
        connected_clients,
    })
}

#[tauri::command]
fn captivate_send_button_trigger(
    state: tauri::State<AppState>,
    trigger: CaptivateTriggerPayload,
) -> Result<(), String> {
    let runtime = state
        .bridge
        .lock()
        .map_err(|_| "Captivate bridge runtime lock poisoned".to_string())?;

    if runtime.listener_thread.is_none() {
        return Err(
            "Captivate bridge is not running. Start the bridge before sending trigger messages."
                .to_string(),
        );
    }

    let message = CaptivatePluginMessage {
        schema: "captivate.bridge.v1",
        message_type: "buttonTrigger",
        sent_at: now_ms(),
        payload: trigger,
    };

    let json = serde_json::to_string(&message)
        .map_err(|error| format!("Failed to serialize Captivate trigger message: {error}"))?;
    let framed = format!("{json}\n");
    broadcast_to_clients(&runtime, &framed)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            captivate_start_bridge,
            captivate_stop_bridge,
            captivate_bridge_status,
            captivate_send_button_trigger,
            captivate_get_layer_names,
            captivate_request_layer_sync,
            captivate_send_data_push,
            captivate_send_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
