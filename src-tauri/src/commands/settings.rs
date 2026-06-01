use crate::services::config_service;
use crate::models::AppConfig;

#[tauri::command]
pub async fn get_config() -> Result<AppConfig, String> {
    config_service::load().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_config(key: String, value: String) -> Result<(), String> {
    let mut config = config_service::load().unwrap_or_default();
    match key.as_str() {
        "model" => config.model = value,
        "theme" => config.theme = value,
        "electricity_rate" => config.electricity_rate_kwh = value.parse().unwrap_or(0.12),
        "desktop_notifications" => config.desktop_notifications = value == "true",
        _ => {}
    }
    config_service::save(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn store_secret(name: String, value: String) -> Result<(), String> {
    keyring::Entry::new("edgestack", &name)
        .and_then(|e| e.set_password(&value))
        .map_err(|e| format!("Could not save: {}", e))
}

#[tauri::command]
pub async fn get_secret_names() -> Vec<String> {
    // In production: query secret_names table; stub returns empty for now
    vec![]
}

#[tauri::command]
pub async fn delete_secret(name: String) -> Result<(), String> {
    keyring::Entry::new("edgestack", &name)
        .and_then(|e| e.delete_password())
        .map_err(|e| format!("Could not delete: {}", e))
}

