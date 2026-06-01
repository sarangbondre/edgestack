use std::sync::Arc;
use tauri::State;
use crate::db::DbPool;
use crate::models::AgentMetrics;

#[tauri::command]
pub async fn get_agent_metrics(pool: State<'_, Arc<DbPool>>) -> Result<Vec<AgentMetrics>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT w.id, w.name,
                (SELECT COUNT(*) FROM step_executions se JOIN workflow_runs wr ON se.run_id=wr.id WHERE wr.workflow_id=w.id AND DATE(se.started_at)=DATE('now')) as tasks_today,
                (SELECT COUNT(*) FROM workflow_runs WHERE workflow_id=w.id AND status='completed') * 100.0 / MAX(1, (SELECT COUNT(*) FROM workflow_runs WHERE workflow_id=w.id)) as success_rate,
                COALESCE((SELECT AVG(inference_ms) FROM step_executions se JOIN workflow_runs wr ON se.run_id=wr.id WHERE wr.workflow_id=w.id AND se.inference_ms IS NOT NULL), 0) as avg_ms,
                COALESCE((SELECT AVG(cpu_pct) FROM telemetry WHERE workflow_id=w.id AND captured_at > datetime('now', '-1 hour')), 0) as cpu_avg,
                COALESCE((SELECT AVG(memory_gb) FROM telemetry WHERE workflow_id=w.id AND captured_at > datetime('now', '-1 hour')), 0) as mem_avg,
                (SELECT status FROM workflow_runs WHERE workflow_id=w.id ORDER BY started_at DESC LIMIT 1) as last_status,
                (SELECT started_at FROM workflow_runs WHERE workflow_id=w.id ORDER BY started_at DESC LIMIT 1) as last_run
         FROM workflows w"
    ).map_err(|e| e.to_string())?;

    let metrics = stmt.query_map([], |row| {
        let last_status: Option<String> = row.get(7).ok();
        let status = match last_status.as_deref() {
            Some("running") => "running",
            Some("paused_awaiting_human") => "paused",
            Some("failed") => "error",
            _ => "ok",
        }.to_string();
        Ok(AgentMetrics {
            workflow_id: row.get(0)?,
            workflow_name: row.get(1)?,
            tasks_today: row.get::<_, i64>(2)? as u32,
            success_rate: row.get(3)?,
            avg_response_ms: row.get::<_, f64>(4)? as u64,
            cpu_avg_pct: row.get(5)?,
            memory_gb: row.get(6)?,
            status,
            last_run: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(metrics)
}
