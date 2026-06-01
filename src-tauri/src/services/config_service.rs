use crate::models::{AppConfig};
use anyhow::Result;
use crate::utils::fs::app_dir;

pub fn load() -> Result<AppConfig> {
    let config_path = app_dir().join("config.toml");
    if !config_path.exists() {
        return Ok(AppConfig::default());
    }
    let content = std::fs::read_to_string(config_path)?;
    // Simple TOML-to-struct parsing via toml crate
    let raw: toml::Value = toml::from_str(&content)?;
    let mut config = AppConfig::default();
    if let Some(general) = raw.get("general") {
        if let Some(v) = general.get("setup_complete").and_then(|v| v.as_bool()) {
            config.setup_complete = v;
        }
        if let Some(v) = general.get("theme").and_then(|v| v.as_str()) {
            config.theme = v.to_string();
        }
    }
    if let Some(inf) = raw.get("inference") {
        if let Some(v) = inf.get("model").and_then(|v| v.as_str()) {
            config.model = v.to_string();
        }
    }
    if let Some(res) = raw.get("resources") {
        if let Some(v) = res.get("max_cpu_cores").and_then(|v| v.as_integer()) {
            config.max_cpu_cores = v as u32;
        }
        if let Some(v) = res.get("max_memory_gb").and_then(|v| v.as_float()) {
            config.max_memory_gb = v;
        }
        if let Some(v) = res.get("max_disk_gb").and_then(|v| v.as_float()) {
            config.max_disk_gb = v;
        }
    }
    if let Some(costs) = raw.get("costs") {
        if let Some(v) = costs.get("electricity_rate_kwh").and_then(|v| v.as_float()) {
            config.electricity_rate_kwh = v;
        }
    }
    Ok(config)
}

pub fn save(config: &AppConfig) -> Result<()> {
    let content = format!(
        "[general]\nsetup_complete = {}\ntheme = \"{}\"\n\n\
         [inference]\nmodel = \"{}\"\nollama_port = 11434\n\n\
         [resources]\nmax_cpu_cores = {}\nmax_memory_gb = {:.1}\nmax_disk_gb = {:.1}\n\n\
         [costs]\nelectricity_rate_kwh = {:.3}\n\n\
         [notifications]\ndesktop = {}\n",
        config.setup_complete, config.theme,
        config.model,
        config.max_cpu_cores, config.max_memory_gb, config.max_disk_gb,
        config.electricity_rate_kwh,
        config.desktop_notifications
    );
    let config_path = app_dir().join("config.toml");
    std::fs::write(config_path, content)?;
    Ok(())
}
