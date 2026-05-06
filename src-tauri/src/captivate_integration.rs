use serde::Serialize;
use tauri::{AppHandle, Manager};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::data_api::{PublishedTable, TableSelectInstance};

#[cfg(target_os = "windows")]
use std::env;

#[cfg(not(target_os = "windows"))]
use std::env;

const CONTROLLER_FOLDER_NAME: &str = "Captivate Control";
const PLUGIN_FILE_NAME: &str = "captivate-control-bridge.plugin.js";

const CONTROLLER_XML_TEMPLATE: &str = include_str!("../../tools/captivate-data-controller/Captivate Control/captivate-control-data.xml");
const CONTROLLER_HTML: &str =
    include_str!("../../tools/captivate-data-controller/Captivate Control/controller/controller.html");
const CONTROLLER_CSS: &str =
    include_str!("../../tools/captivate-data-controller/Captivate Control/controller/css/style.css");
const CONTROLLER_JS: &str =
    include_str!("../../tools/captivate-data-controller/Captivate Control/controller/js/app.js");
const CONTROLLER_QWEBCHANNEL_JS: &str =
    include_str!("../../tools/captivate-data-controller/Captivate Control/common/js/qwebchannel.js");
const CONTROLLER_SERVICEHANDLER_JS: &str =
    include_str!("../../tools/captivate-data-controller/Captivate Control/common/js/servicehandler.js");
const BRIDGE_PLUGIN_JS: &str = include_str!("../../tools/captivate-plugin/captivate-control-bridge.plugin.js");

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptivateIntegrationStatus {
    pub platform: String,
    pub captivate_app_path: Option<String>,
    pub controller_install_path: Option<String>,
    pub plugin_install_path: Option<String>,
    pub controller_installed: bool,
    pub plugin_installed: bool,
    pub can_install: bool,
    pub restart_supported: bool,
    pub packaged_assets_embedded: bool,
    pub status_message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptivateIntegrationInstallResult {
    pub controller_install_path: Option<String>,
    pub plugin_install_path: Option<String>,
    pub controller_backup_path: Option<String>,
    pub plugin_backup_path: Option<String>,
    pub controller_install_succeeded: bool,
    pub plugin_install_succeeded: bool,
    pub controller_error: Option<String>,
    pub plugin_error: Option<String>,
    pub status_message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptivateIntegrationAdminCommand {
    pub command: String,
    pub staged_plugin_path: String,
    pub target_plugin_path: String,
    pub status_message: String,
}

struct InstallPaths {
    platform: String,
    captivate_app_path: Option<PathBuf>,
    controller_install_path: Option<PathBuf>,
    plugin_install_path: Option<PathBuf>,
}

fn is_exposed_destination(destination: &str) -> bool {
    destination == "captivate" || destination == "both"
}

fn escape_xml_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn render_controller_xml(tables: &[PublishedTable]) -> String {
    let mut seen: Vec<String> = Vec::new();
    for table in tables.iter().filter(|t| is_exposed_destination(&t.destination)) {
        for column in &table.columns {
            let trimmed = column.trim();
            if trimmed.is_empty() {
                continue;
            }
            if !seen.iter().any(|existing| existing == trimmed) {
                seen.push(trimmed.to_string());
            }
        }
    }

    if seen.is_empty() {
        seen.push("Status".to_string());
    }

    let variables = seen
        .iter()
        .map(|name| {
            format!(
                "  <variable name=\"{}\" category=\"optional\" />",
                escape_xml_attr(name)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    CONTROLLER_XML_TEMPLATE.replace("{{variables}}", &variables)
}

fn render_table_select_xml(instance: &TableSelectInstance, tables: &[PublishedTable]) -> String {
    let columns: Vec<String> = tables
        .iter()
        .find(|t| t.id == instance.source_table_id && is_exposed_destination(&t.destination))
        .map(|t| {
            t.columns
                .iter()
                .map(|c| c.trim().to_string())
                .filter(|c| !c.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let mut variable_names = columns;
    if variable_names.is_empty() {
        variable_names.push("Status".to_string());
    }

    let variables = variable_names
        .iter()
        .map(|name| {
            format!(
                "  <variable name=\"{}\" category=\"optional\" />",
                escape_xml_attr(name)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\" ?>\n<inputBehavior\n  name=\"Captivate Control: {label}\"\n  defaultQueuingMode=\"auto\"\n  url=\"controller/controller.html?instance={instance_id}\"\n  hidden=\"false\"\n  UIGroups=\"General\">\n{variables}\n</inputBehavior>\n",
        label = escape_xml_attr(&instance.label),
        instance_id = escape_xml_attr(&instance.id),
        variables = variables,
    )
}

fn sanitize_filename(value: &str) -> String {
    value
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => c,
            _ => '_',
        })
        .collect()
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn path_to_string(path: Option<&Path>) -> Option<String> {
    path.map(|value| value.to_string_lossy().into_owned())
}

fn install_paths() -> InstallPaths {
    #[cfg(target_os = "macos")]
    {
        return InstallPaths {
            platform: "macos".to_string(),
            captivate_app_path: Some(PathBuf::from("/Applications/NewBlue Captivate.app")),
            controller_install_path: Some(PathBuf::from(format!(
                "/Users/Shared/NewBlue/LiveEngine/DataControllers/{CONTROLLER_FOLDER_NAME}"
            ))),
            plugin_install_path: Some(PathBuf::from(format!(
                "/Library/Application Support/NewBlue/Titler Content/Resources/Service Handlers/NodeRuntime/plugins/{PLUGIN_FILE_NAME}"
            ))),
        };
    }

    #[cfg(target_os = "windows")]
    {
        let program_data = env::var("ProgramData").ok();
        let program_files = env::var("ProgramFiles").ok();
        let program_files_x86 = env::var("ProgramFiles(x86)").ok();
        let captivate_root = program_files
            .clone()
            .or(program_files_x86.clone())
            .map(PathBuf::from);

        return InstallPaths {
            platform: "windows".to_string(),
            captivate_app_path: captivate_root
                .as_ref()
                .map(|root| root.join("NewBlueFX").join("NewBlue Captivate").join("NewBlue Captivate.exe")),
            controller_install_path: program_data.as_ref().map(|root| {
                PathBuf::from(root)
                    .join("NewBlue")
                    .join("LiveEngine")
                    .join("DataControllers")
                    .join(CONTROLLER_FOLDER_NAME)
            }),
            plugin_install_path: captivate_root.as_ref().map(|root| {
                root.join("NewBlueFX")
                    .join("Titler Content")
                    .join("Resources")
                    .join("Service Handlers")
                    .join("NodeRuntime")
                    .join("plugins")
                    .join(PLUGIN_FILE_NAME)
            }),
        };
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        InstallPaths {
            platform: env::consts::OS.to_string(),
            captivate_app_path: None,
            controller_install_path: None,
            plugin_install_path: None,
        }
    }
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn backup_root() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = env::var("LocalAppData") {
            return PathBuf::from(local_app_data)
                .join("Captivate Control")
                .join("integration-backups");
        }
    }

    if let Ok(home) = env::var("HOME") {
        return PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("Captivate Control")
            .join("integration-backups");
    }

    env::temp_dir().join("captivate-control-integration-backups")
}

fn backup_path(path: &Path) -> PathBuf {
    let timestamp = now_unix_ms().to_string();
    let backup_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("backup");

    backup_root().join(timestamp).join(backup_name)
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Err(format!("Path has no parent directory: {}", path.to_string_lossy()));
    };

    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to create parent directory {}: {error}",
            parent.to_string_lossy()
        )
    })
}

fn move_existing_to_backup(path: &Path) -> Result<Option<PathBuf>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let backup = backup_path(path);
    ensure_parent_dir(&backup)?;
    fs::rename(path, &backup).map_err(|error| {
        format!(
            "Failed to back up {} to {}: {error}",
            path.to_string_lossy(),
            backup.to_string_lossy()
        )
    })?;

    Ok(Some(backup))
}

fn write_text_file(path: &Path, contents: &str) -> Result<(), String> {
    ensure_parent_dir(path)?;
    fs::write(path, contents)
        .map_err(|error| format!("Failed to write {}: {error}", path.to_string_lossy()))
}

fn install_controller(
    controller_install_path: &Path,
    tables: &[PublishedTable],
    table_selects: &[TableSelectInstance],
) -> Result<Option<PathBuf>, String> {
    let backup = move_existing_to_backup(controller_install_path)?;
    fs::create_dir_all(controller_install_path).map_err(|error| {
        format!(
            "Failed to create controller directory {}: {error}",
            controller_install_path.to_string_lossy()
        )
    })?;

    write_text_file(
        &controller_install_path.join("captivate-control-data.xml"),
        &render_controller_xml(tables),
    )?;

    for instance in table_selects {
        let file_name = format!("table-select-{}.xml", sanitize_filename(&instance.id));
        write_text_file(
            &controller_install_path.join(file_name),
            &render_table_select_xml(instance, tables),
        )?;
    }
    write_text_file(
        &controller_install_path.join("controller").join("controller.html"),
        CONTROLLER_HTML,
    )?;
    write_text_file(
        &controller_install_path
            .join("controller")
            .join("css")
            .join("style.css"),
        CONTROLLER_CSS,
    )?;
    write_text_file(
        &controller_install_path
            .join("controller")
            .join("js")
            .join("app.js"),
        CONTROLLER_JS,
    )?;
    write_text_file(
        &controller_install_path
            .join("common")
            .join("js")
            .join("qwebchannel.js"),
        CONTROLLER_QWEBCHANNEL_JS,
    )?;
    write_text_file(
        &controller_install_path
            .join("common")
            .join("js")
            .join("servicehandler.js"),
        CONTROLLER_SERVICEHANDLER_JS,
    )?;

    Ok(backup)
}

fn install_plugin(plugin_install_path: &Path) -> Result<Option<PathBuf>, String> {
    let backup = move_existing_to_backup(plugin_install_path)?;
    write_text_file(plugin_install_path, BRIDGE_PLUGIN_JS)?;
    Ok(backup)
}

#[cfg(target_os = "macos")]
fn install_plugin_elevated(
    plugin_install_path: &Path,
    staged_plugin_path: &Path,
) -> Result<(), String> {
    write_text_file(staged_plugin_path, BRIDGE_PLUGIN_JS)?;

    let target_dir = plugin_install_path.parent().ok_or_else(|| {
        format!(
            "Plugin install path has no parent: {}",
            plugin_install_path.to_string_lossy()
        )
    })?;

    let src = staged_plugin_path.to_string_lossy().replace('"', "\\\"");
    let dst = plugin_install_path.to_string_lossy().replace('"', "\\\"");
    let dir = target_dir.to_string_lossy().replace('"', "\\\"");

    let shell = format!(
        "mkdir -p \"{dir}\" && cp \"{src}\" \"{dst}\" && chmod 0644 \"{dst}\""
    );

    let script = format!(
        "do shell script \"{}\" with administrator privileges with prompt \"Captivate Control needs permission to install the bridge plugin into Captivate.\"",
        shell.replace('\\', "\\\\").replace('"', "\\\"")
    );

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|error| format!("Failed to launch osascript: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.contains("User canceled") || stderr.contains("(-128)") {
            return Err("Administrator authorization was cancelled.".to_string());
        }
        return Err(if stderr.is_empty() {
            "Elevated plugin install failed.".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

pub fn admin_install_command(app: &AppHandle) -> Result<CaptivateIntegrationAdminCommand, String> {
    let paths = install_paths();
    let plugin_install_path = paths
        .plugin_install_path
        .ok_or_else(|| "Plugin install path is not available on this platform.".to_string())?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let staged_plugin_path = app_data_dir
        .join("integration-installer")
        .join(PLUGIN_FILE_NAME);

    write_text_file(&staged_plugin_path, BRIDGE_PLUGIN_JS)?;

    #[cfg(target_os = "macos")]
    let command = format!(
        "sudo install -m 0644 {} {}",
        shell_quote(&staged_plugin_path.to_string_lossy()),
        shell_quote(&plugin_install_path.to_string_lossy())
    );

    #[cfg(target_os = "windows")]
    let command = format!(
        "powershell -Command \"Copy-Item -Force {} {}\"",
        shell_quote(&staged_plugin_path.to_string_lossy()),
        shell_quote(&plugin_install_path.to_string_lossy())
    );

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let command = format!(
        "cp {} {}",
        shell_quote(&staged_plugin_path.to_string_lossy()),
        shell_quote(&plugin_install_path.to_string_lossy())
    );

    Ok(CaptivateIntegrationAdminCommand {
        command,
        staged_plugin_path: staged_plugin_path.to_string_lossy().into_owned(),
        target_plugin_path: plugin_install_path.to_string_lossy().into_owned(),
        status_message: "Copy the command below into Terminal with administrator privileges, then restart Captivate."
            .to_string(),
    })
}

pub fn status() -> CaptivateIntegrationStatus {
    let paths = install_paths();
    let controller_installed = paths
        .controller_install_path
        .as_ref()
        .map(|path| path.join("captivate-control-data.xml").exists())
        .unwrap_or(false);
    let plugin_installed = paths
        .plugin_install_path
        .as_ref()
        .map(|path| path.exists())
        .unwrap_or(false);
    let captivate_found = paths
        .captivate_app_path
        .as_ref()
        .map(|path| path.exists())
        .unwrap_or(false);

    CaptivateIntegrationStatus {
        platform: paths.platform,
        captivate_app_path: path_to_string(paths.captivate_app_path.as_deref()),
        controller_install_path: path_to_string(paths.controller_install_path.as_deref()),
        plugin_install_path: path_to_string(paths.plugin_install_path.as_deref()),
        controller_installed,
        plugin_installed,
        can_install: paths.controller_install_path.is_some() && paths.plugin_install_path.is_some(),
        restart_supported: captivate_found,
        packaged_assets_embedded: true,
        status_message: if !captivate_found {
            Some("Captivate app not found in the default install location.".to_string())
        } else if controller_installed && plugin_installed {
            Some("Controller and bridge plugin are installed.".to_string())
        } else {
            Some("Install the Captivate controller and bridge plugin into Captivate.".to_string())
        },
    }
}

pub fn install(
    tables: Vec<PublishedTable>,
    table_selects: Vec<TableSelectInstance>,
) -> Result<CaptivateIntegrationInstallResult, String> {
    let paths = install_paths();
    let controller_install_path = paths
        .controller_install_path
        .ok_or_else(|| "Controller install path is not available on this platform.".to_string())?;
    let plugin_install_path = paths
        .plugin_install_path
        .ok_or_else(|| "Plugin install path is not available on this platform.".to_string())?;

    let controller_result = install_controller(&controller_install_path, &tables, &table_selects);
    let mut plugin_result = install_plugin(&plugin_install_path);

    #[cfg(target_os = "macos")]
    if plugin_result.is_err() {
        let staged = env::temp_dir()
            .join("captivate-control-installer")
            .join(PLUGIN_FILE_NAME);
        match install_plugin_elevated(&plugin_install_path, &staged) {
            Ok(()) => plugin_result = Ok(None),
            Err(elevated_err) => {
                if let Err(original) = plugin_result.as_mut() {
                    *original = format!("{original}\nElevated install also failed: {elevated_err}");
                }
            }
        }
    }

    let controller_backup = controller_result.as_ref().ok().cloned().flatten();
    let plugin_backup = plugin_result.as_ref().ok().cloned().flatten();
    let controller_install_succeeded = controller_result.is_ok();
    let plugin_install_succeeded = plugin_result.is_ok();
    let controller_error = controller_result.err();
    let plugin_error = plugin_result.err();

    let status_message = if controller_install_succeeded && plugin_install_succeeded {
        "Installed Captivate controller and bridge plugin. Restart Captivate to reload both."
            .to_string()
    } else if controller_install_succeeded && !plugin_install_succeeded {
        #[cfg(target_os = "macos")]
        {
            "Installed the HTML controller, but the bridge plugin could not be written to Captivate's protected plugin folder. Install the plugin with administrator privileges, then restart Captivate.".to_string()
        }
        #[cfg(not(target_os = "macos"))]
        {
            "Installed the HTML controller, but the bridge plugin failed to install. Check the plugin error details and install location permissions.".to_string()
        }
    } else if !controller_install_succeeded && plugin_install_succeeded {
        "Installed the bridge plugin, but the HTML controller failed to install. Check the controller error details."
            .to_string()
    } else {
        return Err(
            "Failed to install the Captivate controller and bridge plugin. Check folder permissions and Captivate install paths."
                .to_string(),
        );
    };

    Ok(CaptivateIntegrationInstallResult {
        controller_install_path: Some(controller_install_path.to_string_lossy().into_owned()),
        plugin_install_path: Some(plugin_install_path.to_string_lossy().into_owned()),
        controller_backup_path: path_to_string(controller_backup.as_deref()),
        plugin_backup_path: path_to_string(plugin_backup.as_deref()),
        controller_install_succeeded,
        plugin_install_succeeded,
        controller_error,
        plugin_error,
        status_message,
    })
}

pub fn restart_captivate() -> Result<(), String> {
    let paths = install_paths();
    let app_path = paths
        .captivate_app_path
        .ok_or_else(|| "Captivate restart is not supported on this platform.".to_string())?;

    if !app_path.exists() {
        return Err(format!(
            "Captivate app not found at {}",
            app_path.to_string_lossy()
        ));
    }

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("pkill")
            .args(["-f", "NewBlue Captivate"])
            .status();

        Command::new("open")
            .arg("-a")
            .arg(&app_path)
            .spawn()
            .map_err(|error| format!("Failed to relaunch Captivate: {error}"))?;

        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/IM", "NewBlue Captivate.exe", "/F"])
            .status();

        Command::new(&app_path)
            .spawn()
            .map_err(|error| format!("Failed to relaunch Captivate: {error}"))?;

        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("Captivate restart is not supported on this platform.".to_string())
    }
}
