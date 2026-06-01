use std::sync::Arc;
use tauri::State;
use crate::db::DbPool;
use chrono::Utc;

#[tauri::command]
pub async fn record_human_action(
    pool: State<'_, Arc<DbPool>>,
    run_id: String,
    action: String, // "retry_now" | "retry_delayed" | "skip" | "stop"
    delay_minutes: Option<u32>,
) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let new_status = match action.as_str() {
        "retry_now" | "retry_delayed" => "running",
        "skip" => "skipped",
        "stop" => "stopped",
        _ => "skipped",
    };
    conn.execute(
        "UPDATE workflow_runs SET human_action=?1, human_action_at=?2, status=?3, approved_retry_delay=?4 WHERE id=?5",
        rusqlite::params![action, now, new_status, delay_minutes.map(|m| m as i32), run_id],
    ).map_err(|e| e.to_string())?;

    // Update circuit breaker
    let workflow_id: String = conn.query_row(
        "SELECT workflow_id FROM workflow_runs WHERE id=?1",
        rusqlite::params![run_id],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    if action == "stop" {
        conn.execute(
            "UPDATE circuit_breaker_state SET state='OPEN' WHERE workflow_id=?1",
            rusqlite::params![workflow_id],
        ).map_err(|e| e.to_string())?;
    } else if action == "retry_now" || action == "retry_delayed" {
        // Upsert to HALF_OPEN
        conn.execute(
            "INSERT INTO circuit_breaker_state (workflow_id, state, consecutive_failures, last_failure_at) VALUES (?1, 'HALF_OPEN', 0, ?2)
             ON CONFLICT(workflow_id) DO UPDATE SET state='HALF_OPEN'",
            rusqlite::params![workflow_id, now],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_failure_review(pool: State<'_, Arc<DbPool>>, run_id: String) -> Result<serde_json::Value, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT r.id, w.name, r.started_at, r.failure_step, r.failure_reason_ai, r.failure_raw_log, r.retry_count
         FROM workflow_runs r JOIN workflows w ON r.workflow_id = w.id WHERE r.id=?1",
        rusqlite::params![run_id],
        |row| Ok(serde_json::json!({
            "run_id": row.get::<_, String>(0)?,
            "workflow_name": row.get::<_, String>(1)?,
            "started_at": row.get::<_, String>(2)?,
            "failure_step": row.get::<_, Option<String>>(3)?,
            "ai_explanation": row.get::<_, Option<String>>(4)?,
            "raw_log": row.get::<_, Option<String>>(5)?,
            "retry_count": row.get::<_, i64>(6)?,
        }))
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_circuit_breaker_state(pool: State<'_, Arc<DbPool>>, workflow_id: String) -> Result<serde_json::Value, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    match conn.query_row(
        "SELECT state, consecutive_failures, last_failure_at, next_retry_at FROM circuit_breaker_state WHERE workflow_id=?1",
        rusqlite::params![workflow_id],
        |row| Ok(serde_json::json!({
            "state": row.get::<_, String>(0)?,
            "consecutive_failures": row.get::<_, i64>(1)?,
            "last_failure_at": row.get::<_, Option<String>>(2)?,
            "next_retry_at": row.get::<_, Option<String>>(3)?,
        }))
    ) {
        Ok(v) => Ok(v),
        Err(_) => Ok(serde_json::json!({
            "state": "CLOSED",
            "consecutive_failures": 0,
            "last_failure_at": null,
            "next_retry_at": null
        }))
    }
}

#[tauri::command]
pub async fn list_notifications(pool: State<'_, Arc<DbPool>>) -> Result<Vec<serde_json::Value>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, type, severity, workflow_id, run_id, title, body, sent_at, read_at FROM notifications ORDER BY sent_at DESC LIMIT 50"
    ).map_err(|e| e.to_string())?;
    
    let list = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "type": row.get::<_, String>(1)?,
            "severity": row.get::<_, String>(2)?,
            "workflow_id": row.get::<_, Option<String>>(3)?,
            "run_id": row.get::<_, Option<String>>(4)?,
            "title": row.get::<_, String>(5)?,
            "body": row.get::<_, String>(6)?,
            "sent_at": row.get::<_, String>(7)?,
            "read_at": row.get::<_, Option<String>>(8)?,
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(list)
}

#[tauri::command]
pub async fn mark_all_notifications_read(pool: State<'_, Arc<DbPool>>) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE notifications SET read_at=?1 WHERE read_at IS NULL",
        rusqlite::params![now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

