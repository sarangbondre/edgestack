use crate::models::{InferenceResponse, ModelInfo, BenchmarkResult};
use crate::services::{inference_client::InferenceClient, config_service};
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn check_ollama() -> bool {
    let _ = crate::services::ollama_manager::start_ollama().await;
    let model = get_current_model();
    let client = InferenceClient::new(&model);
    client.is_running().await
}

#[tauri::command]
pub async fn pull_model(app: AppHandle, model_name: String) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600))
        .build()
        .map_err(|e| e.to_string())?;

    let body = serde_json::json!({"model": model_name, "stream": true});
    let mut resp = client
        .post("http://127.0.0.1:11434/api/pull")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Cannot reach AI engine: {}", e))?;

    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        if let Ok(text) = std::str::from_utf8(&chunk) {
            for line in text.lines() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                    let completed = v["completed"].as_u64().unwrap_or(0);
                    let total = v["total"].as_u64().unwrap_or(1);
                    let pct = if total > 0 { (completed as f64 / total as f64 * 100.0) as u32 } else { 0 };
                    let status = v["status"].as_str().unwrap_or("downloading").to_string();
                    let _ = app.emit("model_download_progress", serde_json::json!({
                        "pct": pct,
                        "status": status,
                        "completed": completed,
                        "total": total
                    }));
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn list_models() -> Result<Vec<ModelInfo>, String> {
    let model = get_current_model();
    let client = InferenceClient::new(&model);
    client.list_models().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate(prompt: String) -> Result<InferenceResponse, String> {
    let model = get_current_model();
    let client = InferenceClient::new(&model);
    client.generate(&prompt).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_benchmark(app: AppHandle, model_name: String) -> Result<BenchmarkResult, String> {
    let client = InferenceClient::new(&model_name);

    const PROMPTS: [&str; 5] = [
        "Reply with only the number: 2+2",
        "List exactly 3 common small business tasks. One per line.",
        "In 2 sentences, explain what lean startup means for non-technical founders.",
        "Write a 3-sentence email politely declining a meeting request.",
        "Name 3 pros and 3 cons of remote work for small teams. Keep it brief.",
    ];

    let mut total_tokens_out = 0u32;
    let mut total_time_ms = 0u64;
    let mut first_token_ms = 0u64;

    for (i, prompt) in PROMPTS.iter().enumerate() {
        let _ = app.emit("benchmark_progress", serde_json::json!({
            "step": i + 1,
            "total": 5,
            "label": format!("Running speed test ({}/5)...", i + 1)
        }));

        let start = std::time::Instant::now();
        let resp = client.generate(prompt).await.map_err(|e| e.to_string())?;
        let elapsed = start.elapsed().as_millis() as u64;

        if i == 0 { first_token_ms = elapsed; }
        total_tokens_out += resp.tokens_out;
        total_time_ms += elapsed;
    }

    let _ = app.emit("benchmark_progress", serde_json::json!({
        "step": 5, "total": 5, "label": "Complete!"
    }));

    let total_secs = total_time_ms as f64 / 1000.0;
    let tokens_per_second = if total_secs > 0.0 { total_tokens_out as f64 / total_secs } else { 10.0 };
    let responses_per_minute = (60.0 / (total_time_ms as f64 / 1000.0 / 5.0)) as u32;

    Ok(BenchmarkResult {
        model_name: model_name.clone(),
        tokens_per_second,
        first_token_ms,
        memory_used_gb: 2.0,
        cpu_pct: 70.0,
        responses_per_minute: responses_per_minute.min(200),
    })
}

fn get_current_model() -> String {
    config_service::load()
        .map(|c| c.model)
        .unwrap_or_else(|_| "llama3.2:3b".to_string())
}
