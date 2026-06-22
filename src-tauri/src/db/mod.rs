use anyhow::Result;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::path::PathBuf;

pub type DbPool = Pool<SqliteConnectionManager>;

pub mod repositories;
pub mod writer;
pub mod audit_chain;

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

fn get_db_path() -> PathBuf {
    crate::utils::fs::app_dir().join("edgestack.db")
}

const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    definition_yaml TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    circuit_breaker_json TEXT,
    local_model_path TEXT,
    huggingface_repo_id TEXT,
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
    state TEXT NOT NULL DEFAULT 'CLOSED' CHECK(state IN ('CLOSED', 'OPEN', 'HALF-OPEN')),
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

CREATE TABLE IF NOT EXISTS compute_instances (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    state TEXT NOT NULL,
    image TEXT NOT NULL,
    cpu_cores INTEGER NOT NULL,
    memory_gb INTEGER NOT NULL,
    disk_gb INTEGER NOT NULL,
    uptime_seconds INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS compute_containers (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    cpu_pct REAL NOT NULL,
    memory_mb INTEGER NOT NULL,
    network_io TEXT NOT NULL,
    block_io TEXT NOT NULL,
    image TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (instance_id) REFERENCES compute_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS governance_policies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER DEFAULT 1,
    action_type TEXT NOT NULL,  -- 'ask_ai' | 'browse_web' | 'http_request' | 'save_to_vault' | 'write_to_s3' | '*'
    effect TEXT NOT NULL,       -- 'block' | 'warn' | 'audit'
    conditions_json TEXT NOT NULL DEFAULT '{}',
    version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    workflow_id TEXT,
    run_id TEXT,
    step_name TEXT,
    action_type TEXT NOT NULL,
    policy_id TEXT,
    policy_name TEXT,
    decision TEXT NOT NULL,     -- 'allow' | 'block' | 'warn' | 'audit'
    reason TEXT,
    context_url TEXT,
    tokens_requested INTEGER,
    pii_detected_count INTEGER DEFAULT 0,
    execution_blocked INTEGER DEFAULT 0,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE TABLE IF NOT EXISTS tamper_evident_audit_log (
    event_id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    outcome TEXT NOT NULL,
    metadata TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    event_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_trust_registry (
    model_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    publisher TEXT NOT NULL,
    source_url TEXT NOT NULL,
    sha256_hash TEXT NOT NULL,
    license TEXT NOT NULL,
    trust_level TEXT NOT NULL CHECK(trust_level IN ('UNTRUSTED', 'COMMUNITY', 'VERIFIED', 'ENTERPRISE_APPROVED')),
    approved_by TEXT,
    approved_at TEXT,
    last_verified_at TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tamper_evident_audit_log_timestamp ON tamper_evident_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_step_executions_run_id ON step_executions(run_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_captured_at ON telemetry(captured_at);
CREATE INDEX IF NOT EXISTS idx_cost_estimates_period ON cost_estimates(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_compute_containers_instance_id ON compute_containers(instance_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_workflow ON audit_log(workflow_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_decision ON audit_log(decision);
"#;

pub fn run_migrations(pool: &DbPool) -> Result<()> {
    let conn = pool.get()?;
    
    // Add columns dynamically to workflows table if they don't exist
    let _ = conn.execute("ALTER TABLE workflows ADD COLUMN local_model_path TEXT", []);
    let _ = conn.execute("ALTER TABLE workflows ADD COLUMN huggingface_repo_id TEXT", []);

    // Add columns dynamically to audit_log table if they don't exist
    let _ = conn.execute("ALTER TABLE audit_log ADD COLUMN pii_detected_count INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE audit_log ADD COLUMN execution_blocked INTEGER DEFAULT 0", []);

    // Add version column to governance_policies table if it doesn't exist
    let _ = conn.execute("ALTER TABLE governance_policies ADD COLUMN version INTEGER DEFAULT 1", []);

    conn.execute_batch(SCHEMA_SQL)?;
    seed_db(&conn)?;
    Ok(())
}

fn seed_db(conn: &rusqlite::Connection) -> Result<()> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM compute_instances",
        [],
        |row| row.get(0),
    )?;

    if count == 0 {
        conn.execute(
            "INSERT INTO compute_instances (id, name, state, image, cpu_cores, memory_gb, disk_gb, uptime_seconds, created_at) VALUES 
             ('i-local-a3f8c2d1', 'alpine-edge', 'running', 'Alpine Linux', 2, 4, 20, 43200, datetime('now')),
             ('i-local-b5f6d7e8', 'db-primary', 'stopped', 'Debian 12', 4, 8, 40, 0, datetime('now')),
             ('i-local-c9d0e1f2', 'k3s-control-node', 'running', 'Ubuntu 22.04 LTS', 8, 16, 80, 172800, datetime('now')),
             ('i-local-d3e4f5a6', 'ollama-worker-1', 'running', 'Ubuntu 22.04 LTS', 4, 8, 50, 86400, datetime('now'))",
            []
        )?;

        conn.execute(
            "INSERT INTO compute_containers (id, instance_id, name, status, cpu_pct, memory_mb, network_io, block_io, image, created_at) VALUES 
             ('c-nginx-web', 'i-local-c9d0e1f2', 'web-gateway', 'running', 1.2, 45, '1.2 KB/s', '0 B/s', 'nginx:alpine', datetime('now')),
             ('c-postgres-db', 'i-local-c9d0e1f2', 'postgres-primary', 'running', 0.8, 120, '512 B/s', '4.2 KB/s', 'postgres:15-alpine', datetime('now')),
             ('c-redis-cache', 'i-local-d3e4f5a6', 'redis-shared', 'running', 0.2, 15, '2.1 KB/s', '0 B/s', 'redis:alpine', datetime('now')),
             ('c-ollama-service', 'i-local-a3f8c2d1', 'ollama-inference', 'running', 12.5, 4300, '0 B/s', '12.8 KB/s', 'ollama/ollama', datetime('now')),
             ('c-workflow-worker', 'i-local-a3f8c2d1', 'workflow-runner-1', 'running', 0.5, 85, '124 B/s', '0 B/s', 'python:3.11-slim', datetime('now')),
             ('c-telemetry-agent', 'i-local-a3f8c2d1', 'sys-metrics-collector', 'running', 0.4, 32, '340 B/s', '0 B/s', 'gcr.io/cadvisor:latest', datetime('now')),
             ('c-db-sync', 'i-local-b5f6d7e8', 'backup-agent', 'stopped', 0.0, 0, '0 B/s', '0 B/s', 'restic/restic:latest', datetime('now')),
             ('c-cert-manager', 'i-local-c9d0e1f2', 'cert-manager', 'running', 0.1, 28, '45 B/s', '0 B/s', 'cert-manager-controller:v1.12.0', datetime('now')),
             ('c-fluent-bit', 'i-local-c9d0e1f2', 'log-shipper', 'running', 0.6, 18, '4.8 KB/s', '1.2 KB/s', 'fluent/fluent-bit:latest', datetime('now')),
             ('c-node-exporter', 'i-local-c9d0e1f2', 'node-exporter', 'running', 0.3, 12, '180 B/s', '0 B/s', 'prom/node-exporter:latest', datetime('now')),
             ('c-app-proxy', 'i-local-d3e4f5a6', 'envoy-sidecar', 'running', 0.7, 24, '3.2 KB/s', '0 B/s', 'envoyproxy/envoy:v1.26.0', datetime('now')),
             ('c-auth-portal', 'i-local-d3e4f5a6', 'oauth2-proxy', 'running', 0.4, 22, '150 B/s', '0 B/s', 'bitnami/oauth2-proxy:latest', datetime('now'))",
            []
        )?;
    }
    Ok(())
}
