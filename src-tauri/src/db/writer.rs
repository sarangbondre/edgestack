use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use serde::{Deserialize, Serialize};
use rusqlite::types::Value as SqlValue;
use crate::db::DbPool;
use crate::utils::fs::app_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteEvent {
    pub event_id: String,
    pub table: String,
    pub operation: String, // INSERT | UPDATE | DELETE
    pub sql: String,
    pub params: Vec<serde_json::Value>,
    pub priority: String, // HIGH | NORMAL | LOW
    pub timestamp: i64,
}

pub struct DbWriter {
    tx: mpsc::Sender<WriteEvent>,
}

impl DbWriter {
    pub fn new(pool: Arc<DbPool>) -> Self {
        let (tx, mut rx) = mpsc::channel::<WriteEvent>(500);
        let pool_clone = pool.clone();

        // Spawn a single dedicated thread for SQLite writes
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            
            rt.block_on(async {
                // Replay dead letter writes on startup
                let _ = replay_dead_letter_log(&pool_clone).await;

                let mut batch = Vec::new();
                let mut last_batch_time = Instant::now();

                loop {
                    tokio::select! {
                        // Retrieve events with bounded backpressure check
                        maybe_event = rx.recv() => {
                            if let Some(event) = maybe_event {
                                batch.push(event);
                                // If batch limit met or priority is HIGH, flush immediately
                                if batch.len() >= 25 || batch.iter().any(|e| e.priority == "HIGH") {
                                    flush_batch(&pool_clone, &mut batch).await;
                                    last_batch_time = Instant::now();
                                }
                            } else {
                                break;
                            }
                        }
                        // Timeout tick to ensure writes aren't starved
                        _ = tokio::time::sleep(Duration::from_millis(50)) => {
                            if !batch.is_empty() && last_batch_time.elapsed() >= Duration::from_millis(50) {
                                flush_batch(&pool_clone, &mut batch).await;
                                last_batch_time = Instant::now();
                            }
                        }
                    }
                }
            });
        });

        Self { tx }
    }

    pub async fn write(&self, event: WriteEvent) -> Result<(), String> {
        self.tx.send(event).await.map_err(|e| e.to_string())
    }
}

async fn flush_batch(pool: &Arc<DbPool>, batch: &mut Vec<WriteEvent>) {
    if batch.is_empty() { return; }
    
    let mut retries = 3;
    let mut delay = Duration::from_millis(50);

    while retries > 0 {
        match execute_transaction(pool, batch).await {
            Ok(_) => {
                batch.clear();
                return;
            }
            Err(e) => {
                retries -= 1;
                println!("[DbWriter] Transaction failed ({} retries left): {}. Retrying in {:?}", retries, e, delay);
                tokio::time::sleep(delay).await;
                delay *= 2; // Exponential backoff
            }
        }
    }

    // Write persistently failed events to dead-letter log
    for event in batch.drain(..) {
        let _ = write_to_dead_letter_log(&event);
    }
}

async fn execute_transaction(pool: &Arc<DbPool>, events: &[WriteEvent]) -> anyhow::Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;

    for event in events {
        let sql_params: Vec<SqlValue> = event.params.iter().map(json_to_sql_value).collect();
        // Convert sql_params to a slice of references to SqlValue
        let param_refs: Vec<&dyn rusqlite::ToSql> = sql_params.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
        tx.execute(&event.sql, param_refs.as_slice())?;
    }

    tx.commit()?;
    Ok(())
}

fn json_to_sql_value(val: &serde_json::Value) -> SqlValue {
    match val {
        serde_json::Value::Null => SqlValue::Null,
        serde_json::Value::Bool(b) => SqlValue::Integer(if *b { 1 } else { 0 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                SqlValue::Real(f)
            } else {
                SqlValue::Null
            }
        }
        serde_json::Value::String(s) => SqlValue::Text(s.clone()),
        serde_json::Value::Array(arr) => SqlValue::Text(serde_json::to_string(arr).unwrap_or_default()),
        serde_json::Value::Object(obj) => SqlValue::Text(serde_json::to_string(obj).unwrap_or_default()),
    }
}

fn dead_letter_path() -> std::path::PathBuf {
    app_dir().join("logs").join("dead_letter_writes.jsonl")
}

fn write_to_dead_letter_log(event: &WriteEvent) -> anyhow::Result<()> {
    let path = dead_letter_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;
    
    use std::io::Write;
    let serialized = serde_json::to_string(event)?;
    writeln!(file, "{}", serialized)?;
    Ok(())
}

async fn replay_dead_letter_log(pool: &Arc<DbPool>) -> anyhow::Result<()> {
    let path = dead_letter_path();
    if !path.exists() { return Ok(()); }

    println!("[DbWriter] Found dead-letter writes log. Replaying...");
    let content = std::fs::read_to_string(&path)?;
    let mut remaining = Vec::new();

    for line in content.lines() {
        if line.trim().is_empty() { continue; }
        if let Ok(event) = serde_json::from_str::<WriteEvent>(line) {
            let single_event = vec![event.clone()];
            if execute_transaction(pool, &single_event).await.is_err() {
                // Keep event if it still fails
                remaining.push(event);
            }
        }
    }

    if remaining.is_empty() {
        let _ = std::fs::remove_file(&path);
    } else {
        // Rewrite log with remaining events
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&path)?;
        use std::io::Write;
        for event in remaining {
            let serialized = serde_json::to_string(&event)?;
            writeln!(file, "{}", serialized)?;
        }
    }

    Ok(())
}
