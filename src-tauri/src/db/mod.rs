use anyhow::Result;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::path::PathBuf;

pub type DbPool = Pool<SqliteConnectionManager>;

pub mod repositories;

pub fn init_pool() -> Result<DbPool> {
    let db_path = get_db_path();
    let manager = SqliteConnectionManager::file(&db_path);
    let pool = Pool::builder().max_size(5).build(manager)?;

    // Configure SQLite for performance
    let conn = pool.get()?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA cache_size = -32000;
         PRAGMA temp_store = MEMORY;",
    )?;

    Ok(pool)
}

pub fn run_migrations(pool: &DbPool) -> Result<()> {
    let conn = pool.get()?;
    conn.execute_batch(SCHEMA_SQL)?;
    Ok(())
}

fn get_db_path() -> PathBuf {
    let home = dirs_next::home_dir().unwrap_or_default();
    home.join(".edgestack").join("edgestack.db")
}

const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS hardware_profile (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS benchmarks (
    id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    model_size_gb REAL,
    tokens_per_second REAL,
    first_token_ms INTEGER,
    memory_used_gb REAL,
    cpu_pct REAL,
    gpu_pct REAL,
    run_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    definition_yaml TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    circuit_breaker_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    trigger_type TEXT,
    retry_count INTEGER DEFAULT 0,
    failure_step TEXT,
    failure_reason_ai TEXT,
    failure_raw_log TEXT,
    human_action TEXT,
    human_action_at TEXT,
    approved_retry_delay INTEGER,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE TABLE IF NOT EXISTS step_executions (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    step_name TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    input_data TEXT,
    output_data TEXT,
    error_message TEXT,
    tokens_input INTEGER,
    tokens_output INTEGER,
    inference_ms INTEGER,
    FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
);

CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    workflow_id TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'CLOSED',
    consecutive_failures INTEGER DEFAULT 0,
    last_failure_at TEXT,
    next_retry_at TEXT,
    opened_at TEXT,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE TABLE IF NOT EXISTS telemetry (
    id TEXT PRIMARY KEY,
    captured_at TEXT NOT NULL,
    workflow_id TEXT,
    agent_id TEXT,
    cpu_pct REAL,
    memory_gb REAL,
    gpu_pct REAL,
    vram_gb REAL,
    tokens_input INTEGER,
    tokens_output INTEGER,
    inference_ms INTEGER
);

CREATE TABLE IF NOT EXISTS cost_estimates (
    id TEXT PRIMARY KEY,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    local_cost_usd REAL NOT NULL,
    bedrock_equiv_usd REAL NOT NULL,
    savings_usd REAL NOT NULL,
    savings_pct REAL NOT NULL,
    matched_tier TEXT NOT NULL,
    confidence TEXT NOT NULL,
    model_fit TEXT NOT NULL,
    model_used TEXT NOT NULL,
    generated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    workflow_id TEXT,
    run_id TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    read_at TEXT,
    action_taken TEXT
);

CREATE TABLE IF NOT EXISTS vault_objects (
    id TEXT PRIMARY KEY,
    vault_name TEXT NOT NULL,
    object_key TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    content_type TEXT,
    created_at TEXT NOT NULL,
    last_modified TEXT NOT NULL,
    workflow_id TEXT,
    UNIQUE(vault_name, object_key)
);

CREATE TABLE IF NOT EXISTS secret_names (
    name TEXT PRIMARY KEY,
    added_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_step_executions_run_id ON step_executions(run_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_captured_at ON telemetry(captured_at);
CREATE INDEX IF NOT EXISTS idx_cost_estimates_period ON cost_estimates(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(read_at) WHERE read_at IS NULL;
"#;
