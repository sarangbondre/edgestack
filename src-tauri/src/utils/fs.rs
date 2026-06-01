use anyhow::Result;
use std::fs;
use std::path::PathBuf;

pub fn app_dir() -> PathBuf {
    dirs_next::home_dir().unwrap_or_default().join("edgestack")
}

pub fn ensure_app_dirs() -> Result<()> {
    let base = app_dir();
    for subdir in &["vault", "floci", "workflows/definitions", "workflows/runs", "logs", "bin"] {
        fs::create_dir_all(base.join(subdir))?;
    }
    Ok(())
}

pub fn copy_default_assets() -> Result<()> {
    let pricing_path = app_dir().join("bedrock_pricing.json");
    if !pricing_path.exists() {
        fs::write(&pricing_path, DEFAULT_PRICING)?;
    }
    let config_path = app_dir().join("config.toml");
    if !config_path.exists() {
        fs::write(&config_path, DEFAULT_CONFIG)?;
    }
    Ok(())
}

const DEFAULT_PRICING: &str = r#"{
  "tiers": [
    {"name":"Nova Micro","model_size":"1.5B","input_per_1m":0.035,"output_per_1m":0.14},
    {"name":"Nova Lite","model_size":"3B","input_per_1m":0.06,"output_per_1m":0.24},
    {"name":"Llama 3.3 70B","model_size":"8B","input_per_1m":0.72,"output_per_1m":0.72},
    {"name":"Nova Pro","model_size":"7B","input_per_1m":0.80,"output_per_1m":3.20},
    {"name":"Claude Haiku","model_size":"13B","input_per_1m":1.00,"output_per_1m":5.00}
  ]
}"#;

const DEFAULT_CONFIG: &str = r#"[general]
setup_complete = false
theme = "system"

[inference]
model = "llama3.2:3b"
ollama_port = 11434

[resources]
max_cpu_cores = 4
max_memory_gb = 8.0
max_disk_gb = 20.0

[costs]
electricity_rate_kwh = 0.12

[notifications]
desktop = true
"#;
