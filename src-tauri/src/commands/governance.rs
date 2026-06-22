use std::sync::Arc;
use tauri::State;
use crate::db::DbPool;

use crate::utils::id::new_id;
use chrono::Utc;
use serde_json::Value;

// ─── Policy CRUD ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_policies(pool: State<'_, Arc<DbPool>>) -> Result<Vec<Value>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, enabled, action_type, effect, conditions_json, created_at, updated_at
         FROM governance_policies ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;

    let policies: Vec<Value> = stmt.query_map([], |row| {
        let conditions_json: String = row.get(6).unwrap_or_else(|_| "{}".to_string());
        let conditions: Value = serde_json::from_str(&conditions_json).unwrap_or(Value::Object(Default::default()));
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "name": row.get::<_, String>(1)?,
            "description": row.get::<_, Option<String>>(2)?,
            "enabled": row.get::<_, i32>(3)? == 1,
            "action_type": row.get::<_, String>(4)?,
            "effect": row.get::<_, String>(5)?,
            "conditions": conditions,
            "created_at": row.get::<_, String>(7)?,
            "updated_at": row.get::<_, String>(8)?,
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(policies)
}

#[tauri::command]
pub async fn create_policy(
    pool: State<'_, Arc<DbPool>>,
    name: String,
    description: Option<String>,
    action_type: String,
    effect: String,
    conditions: Value,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let id = new_id();
    let now = Utc::now().to_rfc3339();
    let conditions_json = serde_json::to_string(&conditions).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO governance_policies (id, name, description, enabled, action_type, effect, conditions_json, created_at, updated_at)
         VALUES (?1,?2,?3,1,?4,?5,?6,?7,?7)",
        rusqlite::params![id, name, description, action_type, effect, conditions_json, now],
    ).map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub async fn update_policy(
    pool: State<'_, Arc<DbPool>>,
    id: String,
    name: String,
    description: Option<String>,
    action_type: String,
    effect: String,
    conditions: Value,
    enabled: bool,
) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let conditions_json = serde_json::to_string(&conditions).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE governance_policies SET name=?1, description=?2, action_type=?3, effect=?4, conditions_json=?5, enabled=?6, updated_at=?7 WHERE id=?8",
        rusqlite::params![name, description, action_type, effect, conditions_json, enabled as i32, now, id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn toggle_policy(
    pool: State<'_, Arc<DbPool>>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE governance_policies SET enabled=?1, updated_at=?2 WHERE id=?3",
        rusqlite::params![enabled as i32, now, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_policy(pool: State<'_, Arc<DbPool>>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM governance_policies WHERE id=?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Audit Log ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_audit_log(
    pool: State<'_, Arc<DbPool>>,
    limit: Option<i64>,
    workflow_id: Option<String>,
    decision_filter: Option<String>,
) -> Result<Vec<Value>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(100);

    let mut query = "SELECT a.id, a.timestamp, a.workflow_id, w.name, a.run_id, a.step_name,
                            a.action_type, a.policy_id, a.policy_name, a.decision, a.reason,
                            a.context_url, a.tokens_requested
                     FROM audit_log a
                     LEFT JOIN workflows w ON a.workflow_id = w.id
                     WHERE 1=1".to_string();

    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref wid) = workflow_id {
        query.push_str(" AND a.workflow_id=?");
        params.push(Box::new(wid.clone()));
    }
    if let Some(ref decision) = decision_filter {
        if decision != "all" {
            query.push_str(" AND a.decision=?");
            params.push(Box::new(decision.clone()));
        }
    }

    query.push_str(" ORDER BY a.timestamp DESC LIMIT ?");
    params.push(Box::new(limit));

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let entries: Vec<Value> = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "timestamp": row.get::<_, String>(1)?,
            "workflow_id": row.get::<_, Option<String>>(2)?,
            "workflow_name": row.get::<_, Option<String>>(3)?,
            "run_id": row.get::<_, Option<String>>(4)?,
            "step_name": row.get::<_, Option<String>>(5)?,
            "action_type": row.get::<_, String>(6)?,
            "policy_id": row.get::<_, Option<String>>(7)?,
            "policy_name": row.get::<_, Option<String>>(8)?,
            "decision": row.get::<_, String>(9)?,
            "reason": row.get::<_, Option<String>>(10)?,
            "context_url": row.get::<_, Option<String>>(11)?,
            "tokens_requested": row.get::<_, Option<i64>>(12)?,
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(entries)
}

// ─── Compliance Summary ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_compliance_summary(pool: State<'_, Arc<DbPool>>) -> Result<Value, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    let total_policies: i64 = conn.query_row(
        "SELECT COUNT(*) FROM governance_policies", [], |r| r.get(0)
    ).unwrap_or(0);

    let active_policies: i64 = conn.query_row(
        "SELECT COUNT(*) FROM governance_policies WHERE enabled=1", [], |r| r.get(0)
    ).unwrap_or(0);

    let audit_today: i64 = conn.query_row(
        "SELECT COUNT(*) FROM audit_log WHERE timestamp >= datetime('now', '-1 day')", [], |r| r.get(0)
    ).unwrap_or(0);

    let blocks_today: i64 = conn.query_row(
        "SELECT COUNT(*) FROM audit_log WHERE decision='block' AND timestamp >= datetime('now', '-1 day')", [], |r| r.get(0)
    ).unwrap_or(0);

    let warns_today: i64 = conn.query_row(
        "SELECT COUNT(*) FROM audit_log WHERE decision='warn' AND timestamp >= datetime('now', '-1 day')", [], |r| r.get(0)
    ).unwrap_or(0);

    let allows_today: i64 = conn.query_row(
        "SELECT COUNT(*) FROM audit_log WHERE decision='allow' AND timestamp >= datetime('now', '-1 day')", [], |r| r.get(0)
    ).unwrap_or(0);

    let blocks_week: i64 = conn.query_row(
        "SELECT COUNT(*) FROM audit_log WHERE decision='block' AND timestamp >= datetime('now', '-7 days')", [], |r| r.get(0)
    ).unwrap_or(0);

    // Compliance score: 100 - (blocks_today * 10) - (warns_today * 3), clamped 0-100
    let raw_score = 100_i64 - (blocks_today * 10) - (warns_today * 3);
    let compliance_score = raw_score.clamp(0, 100);

    // Top violated policies
    let mut vstmt = conn.prepare(
        "SELECT policy_name, COUNT(*) as cnt FROM audit_log
         WHERE decision IN ('block','warn') AND timestamp >= datetime('now', '-7 days') AND policy_name IS NOT NULL
         GROUP BY policy_name ORDER BY cnt DESC LIMIT 5"
    ).map_err(|e| e.to_string())?;

    let top_violations: Vec<Value> = vstmt.query_map([], |row| {
        Ok(serde_json::json!({
            "policy_name": row.get::<_, Option<String>>(0)?,
            "count": row.get::<_, i64>(1)?,
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(serde_json::json!({
        "total_policies": total_policies,
        "active_policies": active_policies,
        "compliance_score": compliance_score,
        "audit_events_today": audit_today,
        "blocks_today": blocks_today,
        "warns_today": warns_today,
        "allows_today": allows_today,
        "blocks_week": blocks_week,
        "top_violations": top_violations,
    }))
}

/// Export all active policies as a YAML string (for download/review)
#[tauri::command]
pub async fn export_policies_yaml(pool: State<'_, Arc<DbPool>>) -> Result<String, String> {
    let policies = list_policies(pool).await?;
    let yaml = serde_yaml::to_string(&policies).unwrap_or_else(|_| "{}".to_string());
    Ok(format!("# EdgeStack Governance Policies\n# Exported: {}\n\n{}", Utc::now().to_rfc3339(), yaml))
}

#[tauri::command]
pub async fn export_audit_chain_json(pool: State<'_, Arc<DbPool>>) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT event_id, timestamp, event_type, actor, resource, action, outcome, metadata, previous_hash, event_hash \
         FROM tamper_evident_audit_log ORDER BY timestamp ASC"
    ).map_err(|e| e.to_string())?;

    let entries: Vec<Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "event_id": row.get::<_, String>(0)?,
            "timestamp": row.get::<_, i64>(1)?,
            "event_type": row.get::<_, String>(2)?,
            "actor": row.get::<_, String>(3)?,
            "resource": row.get::<_, String>(4)?,
            "action": row.get::<_, String>(5)?,
            "outcome": row.get::<_, String>(6)?,
            "metadata": serde_json::from_str::<Value>(&row.get::<_, String>(7)?).unwrap_or_default(),
            "previous_hash": row.get::<_, String>(8)?,
            "event_hash": row.get::<_, String>(9)?,
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_audit_chain_integrity_cmd(pool: State<'_, Arc<DbPool>>) -> Result<bool, String> {
    crate::db::audit_chain::verify_audit_integrity(&pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn explain_retrieval_cmd(query: String) -> Result<serde_json::Value, String> {
    Ok(crate::services::retrieval_planner::explain_retrieval(&query))
}
