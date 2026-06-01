use serde::{Deserialize, Serialize};

// ─── Hardware ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareProfile {
    pub cpu_cores: u32,
    pub cpu_brand: String,
    pub ram_total_gb: f64,
    pub ram_available_gb: f64,
    pub gpu_vendor: String,
    pub gpu_vram_gb: f64,
    pub disk_free_gb: f64,
    pub tier: String, // "Excellent" | "Good" | "Capable" | "Minimal"
    // Plain-language display fields
    pub cpu_label: String,
    pub cpu_tier: String,
    pub ram_label: String,
    pub ram_tier: String,
    pub gpu_label: String,
    pub gpu_tier: String,
    pub disk_label: String,
    pub disk_tier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelOption {
    pub id: String,
    pub display_name: String,
    pub category: String, // "Quick Assistant" | "Balanced" | "Deep Thinker" | "Vision" | "Multilingual"
    pub ollama_tag: String,
    pub description: String,
    pub good_at: String,
    pub download_gb: f64,
    pub memory_gb: f64,
    pub license: String,
    pub recommended: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub model_name: String,
    pub tokens_per_second: f64,
    pub first_token_ms: u64,
    pub memory_used_gb: f64,
    pub cpu_pct: f64,
    pub responses_per_minute: u32,
}

// ─── Inference ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceResponse {
    pub text: String,
    pub tokens_in: u32,
    pub tokens_out: u32,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub size_gb: f64,
    pub modified: String,
}

// ─── Workflows ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub status: String, // "idle" | "running" | "paused" | "error"
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    pub run_count: u32,
    pub success_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowRun {
    pub id: String,
    pub workflow_id: String,
    pub status: String, // "running" | "completed" | "failed" | "paused_awaiting_human"
    pub started_at: String,
    pub completed_at: Option<String>,
    pub trigger_type: String,
    pub retry_count: u32,
    pub failure_step: Option<String>,
    pub failure_reason_ai: Option<String>,
    pub human_action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepEvent {
    pub run_id: String,
    pub step_name: String,
    pub step_index: u32,
    pub total_steps: u32,
    pub status: String,
    pub output: Option<String>,
    pub tokens_used: Option<u32>,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
}

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerState {
    pub workflow_id: String,
    pub state: String, // "CLOSED" | "OPEN" | "HALF_OPEN"
    pub consecutive_failures: u32,
    pub last_failure_at: Option<String>,
    pub next_retry_at: Option<String>,
}

// ─── Vault ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultSummary {
    pub name: String,
    pub object_count: u32,
    pub total_size_bytes: u64,
    pub last_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultObject {
    pub key: String,
    pub size_bytes: u64,
    pub last_modified: String,
    pub content_type: Option<String>,
    pub workflow_name: Option<String>,
}

// ─── Cost Analytics ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostEstimate {
    pub local_cost_usd: f64,
    pub bedrock_equiv_usd: f64,
    pub savings_usd: f64,
    pub savings_pct: f64,
    pub matched_tier: String,
    pub confidence: String,
    pub model_fit: String,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostSummary {
    pub period_days: u32,
    pub total_local_cost: f64,
    pub total_bedrock_equiv: f64,
    pub total_savings: f64,
    pub savings_pct: f64,
    pub matched_tier: String,
    pub daily_breakdown: Vec<DailyCost>,
    pub ai_insight: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyCost {
    pub date: String,
    pub local_cost: f64,
    pub bedrock_equiv: f64,
}

// ─── Agent Metrics ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetrics {
    pub workflow_id: String,
    pub workflow_name: String,
    pub tasks_today: u32,
    pub success_rate: f64,
    pub avg_response_ms: u64,
    pub cpu_avg_pct: f64,
    pub memory_gb: f64,
    pub status: String,
    pub last_run: Option<String>,
}

// ─── Config ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub setup_complete: bool,
    pub model: String,
    pub max_cpu_cores: u32,
    pub max_memory_gb: f64,
    pub max_disk_gb: f64,
    pub electricity_rate_kwh: f64,
    pub desktop_notifications: bool,
    pub theme: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            setup_complete: false,
            model: "llama3.2:3b".to_string(),
            max_cpu_cores: 4,
            max_memory_gb: 8.0,
            max_disk_gb: 20.0,
            electricity_rate_kwh: 0.12,
            desktop_notifications: true,
            theme: "system".to_string(),
        }
    }
}
