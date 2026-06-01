use tauri::State;
use std::sync::Arc;
use crate::db::DbPool;
use crate::models::{HardwareProfile, ModelOption, BenchmarkResult, AppConfig};
use crate::services::{hardware_scanner, inference_client::InferenceClient, config_service};

#[tauri::command]
pub async fn scan_hardware() -> Result<HardwareProfile, String> {
    hardware_scanner::scan().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_model_recommendations(ram_gb: f64) -> Vec<ModelOption> {
    let models = vec![
        ModelOption {
            id: "qwen2.5:1.5b".into(), display_name: "Quick Assistant".into(),
            category: "Quick".into(), ollama_tag: "qwen2.5:1.5b".into(),
            description: "Fast responses for simple tasks".into(),
            good_at: "Simple lookups, quick answers".into(),
            download_gb: 1.0, memory_gb: 1.0,
            license: "Apache 2.0".into(), recommended: ram_gb < 8.0,
        },
        ModelOption {
            id: "llama3.2:3b".into(), display_name: "Balanced".into(),
            category: "Balanced".into(), ollama_tag: "llama3.2:3b".into(),
            description: "Great for most business tasks".into(),
            good_at: "Most business automation".into(),
            download_gb: 2.1, memory_gb: 2.0,
            license: "Llama License".into(), recommended: ram_gb >= 8.0,
        },
        ModelOption {
            id: "llama3.1:8b".into(), display_name: "Deep Thinker".into(),
            category: "Deep".into(), ollama_tag: "llama3.1:8b".into(),
            description: "Best for complex analysis".into(),
            good_at: "Complex analysis, long documents".into(),
            download_gb: 4.7, memory_gb: 5.0,
            license: "Llama License".into(), recommended: false,
        },
        ModelOption {
            id: "llava:7b".into(), display_name: "Vision-Capable".into(),
            category: "Vision".into(), ollama_tag: "llava:7b".into(),
            description: "Can read images and screenshots".into(),
            good_at: "Reading images and screenshots".into(),
            download_gb: 4.1, memory_gb: 4.0,
            license: "Apache 2.0".into(), recommended: false,
        },
        ModelOption {
            id: "mistral:7b".into(), display_name: "Multilingual".into(),
            category: "Multilingual".into(), ollama_tag: "mistral:7b".into(),
            description: "Works well in non-English languages".into(),
            good_at: "Non-English languages".into(),
            download_gb: 4.1, memory_gb: 4.0,
            license: "Apache 2.0".into(), recommended: false,
        },
    ];
    models
}

#[tauri::command]
pub async fn save_setup_config(
    model: String,
    cpu_cores: u32,
    memory_gb: f64,
    disk_gb: f64,
    electricity_rate: f64,
) -> Result<(), String> {
    let mut config = config_service::load().unwrap_or_default();
    config.model = model;
    config.max_cpu_cores = cpu_cores;
    config.max_memory_gb = memory_gb;
    config.max_disk_gb = disk_gb;
    config.electricity_rate_kwh = electricity_rate;
    config.setup_complete = true;
    config_service::save(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn is_setup_complete() -> bool {
    config_service::load()
        .map(|c| c.setup_complete)
        .unwrap_or(false)
}
