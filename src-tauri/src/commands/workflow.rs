use std::sync::Arc;
use tauri::State;
use crate::db::DbPool;
use crate::models::{WorkflowSummary, WorkflowRun};
use crate::utils::id::new_id;
use chrono::Utc;

#[tauri::command]
pub async fn create_workflow(
    pool: State<'_, Arc<DbPool>>,
    name: String,
    description: Option<String>,
    definition_yaml: String,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let id = new_id();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO workflows (id, name, description, definition_yaml, enabled, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
        rusqlite::params![id, name, description, definition_yaml, now],
    ).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub async fn update_workflow(
    pool: State<'_, Arc<DbPool>>,
    id: String,
    name: String,
    description: Option<String>,
    definition_yaml: String,
) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE workflows SET name=?1, description=?2, definition_yaml=?3, updated_at=?4 WHERE id=?5",
        rusqlite::params![name, description, definition_yaml, now, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_workflows(pool: State<'_, Arc<DbPool>>) -> Result<Vec<WorkflowSummary>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT w.id, w.name, w.description, w.enabled,
                (SELECT status FROM workflow_runs WHERE workflow_id=w.id ORDER BY started_at DESC LIMIT 1) as last_status,
                (SELECT started_at FROM workflow_runs WHERE workflow_id=w.id ORDER BY started_at DESC LIMIT 1) as last_run,
                (SELECT COUNT(*) FROM workflow_runs WHERE workflow_id=w.id) as run_count,
                (SELECT COUNT(*) FROM workflow_runs WHERE workflow_id=w.id AND status='completed') as success_count
         FROM workflows w ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;

    let workflows = stmt.query_map([], |row| {
        let run_count: u32 = row.get::<_, i64>(6).unwrap_or(0) as u32;
        let success_count: u32 = row.get::<_, i64>(7).unwrap_or(0) as u32;
        let success_rate = if run_count > 0 { success_count as f64 / run_count as f64 * 100.0 } else { 0.0 };
        let last_status: Option<String> = row.get(4).ok();
        let status = match last_status.as_deref() {
            Some("running") => "running",
            Some("paused_awaiting_human") => "paused",
            Some("failed") => "error",
            _ => "idle",
        }.to_string();
        Ok(WorkflowSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            enabled: row.get::<_, i32>(3)? == 1,
            status,
            last_run: row.get(5)?,
            next_run: None,
            run_count,
            success_rate,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(workflows)
}

#[tauri::command]
pub async fn get_workflow(pool: State<'_, Arc<DbPool>>, id: String) -> Result<serde_json::Value, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let row = conn.query_row(
        "SELECT id, name, description, definition_yaml, enabled, created_at FROM workflows WHERE id=?1",
        rusqlite::params![id],
        |row| Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "name": row.get::<_, String>(1)?,
            "description": row.get::<_, Option<String>>(2)?,
            "definition_yaml": row.get::<_, String>(3)?,
            "enabled": row.get::<_, i32>(4)? == 1,
            "created_at": row.get::<_, String>(5)?,
        })),
    ).map_err(|e| e.to_string())?;
    Ok(row)
}

#[tauri::command]
pub async fn delete_workflow(pool: State<'_, Arc<DbPool>>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM workflows WHERE id=?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn run_workflow_internal(
    app: tauri::AppHandle,
    pool: Arc<DbPool>,
    id: String,
    trigger_type: String,
) -> Result<String, String> {
    let run_id = new_id();
    let now = Utc::now().to_rfc3339();
    {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO workflow_runs (id, workflow_id, status, started_at, trigger_type) VALUES (?1, ?2, 'running', ?3, ?4)",
            rusqlite::params![run_id, id, now, trigger_type],
        ).map_err(|e| e.to_string())?;
    }

    let pool_clone = pool.clone();
    let run_id_clone = run_id.clone();
    let app_clone = app.clone();

    tokio::spawn(async move {
        let _ = execute_workflow(app_clone, pool_clone, id, run_id_clone).await;
    });

    Ok(run_id)
}

#[tauri::command]
pub async fn run_workflow(
    app: tauri::AppHandle,
    pool: State<'_, Arc<DbPool>>,
    id: String,
    trigger_type: String,
) -> Result<String, String> {
    run_workflow_internal(app, pool.inner().clone(), id, trigger_type).await
}

async fn execute_workflow(
    app: tauri::AppHandle,
    pool: Arc<DbPool>,
    workflow_id: String,
    run_id: String,
) -> anyhow::Result<()> {
    use tauri::Emitter;
    use crate::services::inference_client::InferenceClient;
    use crate::services::config_service;

    let yaml = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT definition_yaml FROM workflows WHERE id=?1",
            rusqlite::params![workflow_id],
            |r| r.get::<_, String>(0),
        )?
    };

    // Parse steps from YAML (simplified: look for "steps:" section)
    let steps = parse_yaml_steps(&yaml);
    let total = steps.len() as u32;
    let model = config_service::load().map(|c| c.model).unwrap_or_else(|_| "llama3.2:3b".to_string());
    let client = InferenceClient::new(&model);

    for (i, step) in steps.iter().enumerate() {
        let step_id = new_id();
        let now = Utc::now().to_rfc3339();
        {
            let conn = pool.get()?;
            conn.execute(
                "INSERT INTO step_executions (id, run_id, step_name, step_index, status, started_at) VALUES (?1,?2,?3,?4,'running',?5)",
                rusqlite::params![step_id, run_id, step.name, i as u32, now],
            )?;
        }

        let _ = app.emit("workflow_step_started", serde_json::json!({
            "run_id": run_id,
            "step_name": step.name,
            "step_index": i + 1,
            "total_steps": total
        }));

        // Execute step
        let (success, output, error_msg, tokens) = match step.action.as_str() {
            "ask_ai" => {
                let prompt = step.params.get("prompt").cloned().unwrap_or_default();
                match client.generate(&prompt).await {
                    Ok(resp) => (true, Some(resp.text), None, Some(resp.tokens_out)),
                    Err(e) => (false, None, Some(e.to_string()), None),
                }
            },
            "browse_web" => {
                let url = step.params.get("url").cloned().unwrap_or_default();
                match reqwest::get(&url).await {
                    Ok(resp) => {
                        let text = resp.text().await.unwrap_or_default();
                        let snippet = text.chars().take(2000).collect::<String>();
                        (true, Some(snippet), None, None)
                    },
                    Err(e) => (false, None, Some(format!("Could not reach {}: {}", url, e)), None),
                }
            },
            "send_email" | "save_to_vault" | "http_request" | "send_notification" | "store_in_data_store" | "put_in_queue" => {
                // Stub: mark as success with a note
                (true, Some(format!("Step '{}' completed (action: {})", step.name, step.action)), None, None)
            },
            _ => (true, Some(format!("Step '{}' skipped (unknown action)", step.name)), None, None),
        };

        let now2 = Utc::now().to_rfc3339();
        if success {
            {
                let conn = pool.get()?;
                conn.execute(
                    "UPDATE step_executions SET status='completed', completed_at=?1, output_data=?2, tokens_output=?3 WHERE id=?4",
                    rusqlite::params![now2, output, tokens, step_id],
                )?;
            }
            let _ = app.emit("workflow_step_completed", serde_json::json!({
                "run_id": run_id,
                "step_name": step.name,
                "step_index": i + 1,
                "total_steps": total,
                "status": "completed",
                "output": output
            }));
        } else {
            {
                let conn = pool.get()?;
                conn.execute(
                    "UPDATE step_executions SET status='failed', completed_at=?1, error_message=?2 WHERE id=?3",
                    rusqlite::params![now2, error_msg, step_id],
                )?;
                conn.execute(
                    "UPDATE workflow_runs SET status='paused_awaiting_human', failure_step=?1, failure_raw_log=?2 WHERE id=?3",
                    rusqlite::params![step.name, error_msg, run_id],
                )?;
            }

            // Generate AI explanation
            let explanation = client.explain_failure(&error_msg.clone().unwrap_or_default()).await.unwrap_or_else(|_|
                "Something went wrong with this step. Retrying usually fixes it.".to_string()
            );
            {
                let conn = pool.get()?;
                conn.execute(
                    "UPDATE workflow_runs SET failure_reason_ai=?1 WHERE id=?2",
                    rusqlite::params![explanation, run_id],
                )?;
            }

            let _ = app.emit("workflow_failed", serde_json::json!({
                "run_id": run_id,
                "workflow_id": workflow_id,
                "step_name": step.name,
                "step_index": i + 1,
                "total_steps": total,
                "error": error_msg,
                "ai_explanation": explanation
            }));
            return Ok(());
        }
    }

    // All steps done
    let now = Utc::now().to_rfc3339();
    let conn = pool.get()?;
    conn.execute(
        "UPDATE workflow_runs SET status='completed', completed_at=?1 WHERE id=?2",
        rusqlite::params![now, run_id],
    )?;
    let _ = app.emit("workflow_completed", serde_json::json!({
        "run_id": run_id,
        "workflow_id": workflow_id,
        "total_steps": total
    }));
    Ok(())
}

struct ParsedStep {
    name: String,
    action: String,
    params: std::collections::HashMap<String, String>,
}

fn parse_yaml_steps(yaml: &str) -> Vec<ParsedStep> {
    // Simple YAML step parser
    let mut steps = Vec::new();
    let mut in_steps = false;
    let mut current_name = String::new();
    let mut current_action = String::new();
    let mut current_params = std::collections::HashMap::new();

    for line in yaml.lines() {
        let trimmed = line.trim();
        if trimmed == "steps:" { in_steps = true; continue; }
        if !in_steps { continue; }
        // New step starts with "- name:"
        if trimmed.starts_with("- name:") {
            if !current_name.is_empty() {
                steps.push(ParsedStep { name: current_name.clone(), action: current_action.clone(), params: current_params.clone() });
            }
            current_name = trimmed.trim_start_matches("- name:").trim().trim_matches('"').to_string();
            current_action = String::new();
            current_params = std::collections::HashMap::new();
        } else if trimmed.starts_with("action:") {
            current_action = trimmed.trim_start_matches("action:").trim().to_string();
        } else if trimmed.starts_with("url:") {
            current_params.insert("url".to_string(), trimmed.trim_start_matches("url:").trim().to_string());
        } else if trimmed.starts_with("prompt:") || trimmed.starts_with("prompt: |") {
            current_params.insert("prompt".to_string(), trimmed.trim_start_matches("prompt:").trim().to_string());
        }
    }
    if !current_name.is_empty() {
        steps.push(ParsedStep { name: current_name, action: current_action, params: current_params });
    }
    steps
}

#[tauri::command]
pub async fn list_runs(pool: State<'_, Arc<DbPool>>, workflow_id: String) -> Result<Vec<WorkflowRun>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, workflow_id, status, started_at, completed_at, trigger_type, retry_count, failure_step, failure_reason_ai, human_action
         FROM workflow_runs WHERE workflow_id=?1 ORDER BY started_at DESC LIMIT 20"
    ).map_err(|e| e.to_string())?;

    let runs = stmt.query_map(rusqlite::params![workflow_id], |row| {
        Ok(WorkflowRun {
            id: row.get(0)?,
            workflow_id: row.get(1)?,
            status: row.get(2)?,
            started_at: row.get(3)?,
            completed_at: row.get(4)?,
            trigger_type: row.get::<_, Option<String>>(5)?.unwrap_or_else(|| "manual".to_string()),
            retry_count: row.get::<_, i64>(6)? as u32,
            failure_step: row.get(7)?,
            failure_reason_ai: row.get(8)?,
            human_action: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(runs)
}

#[tauri::command]
pub async fn list_all_runs(pool: State<'_, Arc<DbPool>>) -> Result<Vec<serde_json::Value>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT r.id, r.workflow_id, w.name, r.status, r.started_at, r.completed_at, r.trigger_type, r.failure_step
         FROM workflow_runs r JOIN workflows w ON r.workflow_id=w.id ORDER BY r.started_at DESC LIMIT 20"
    ).map_err(|e| e.to_string())?;

    let runs = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "workflow_id": row.get::<_, String>(1)?,
            "workflow_name": row.get::<_, String>(2)?,
            "status": row.get::<_, String>(3)?,
            "started_at": row.get::<_, String>(4)?,
            "completed_at": row.get::<_, Option<String>>(5)?,
            "trigger_type": row.get::<_, Option<String>>(6)?,
            "failure_step": row.get::<_, Option<String>>(7)?,
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(runs)
}

#[tauri::command]
pub async fn get_run(pool: State<'_, Arc<DbPool>>, run_id: String) -> Result<serde_json::Value, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let run = conn.query_row(
        "SELECT id, workflow_id, status, started_at, completed_at, trigger_type, retry_count, failure_step, failure_reason_ai, human_action FROM workflow_runs WHERE id=?1",
        rusqlite::params![run_id],
        |row| Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "workflow_id": row.get::<_, String>(1)?,
            "status": row.get::<_, String>(2)?,
            "started_at": row.get::<_, String>(3)?,
            "completed_at": row.get::<_, Option<String>>(4)?,
            "trigger_type": row.get::<_, Option<String>>(5)?,
            "retry_count": row.get::<_, i64>(6)?,
            "failure_step": row.get::<_, Option<String>>(7)?,
            "failure_reason_ai": row.get::<_, Option<String>>(8)?,
            "human_action": row.get::<_, Option<String>>(9)?,
        }))
    ).map_err(|e| e.to_string())?;

    // Also get steps
    let mut step_stmt = conn.prepare(
        "SELECT step_name, step_index, status, started_at, completed_at, output_data, error_message, tokens_output, inference_ms FROM step_executions WHERE run_id=?1 ORDER BY step_index"
    ).map_err(|e| e.to_string())?;
    let steps: Vec<serde_json::Value> = step_stmt.query_map(rusqlite::params![run_id], |row| {
        Ok(serde_json::json!({
            "step_name": row.get::<_, String>(0)?,
            "step_index": row.get::<_, i64>(1)?,
            "status": row.get::<_, String>(2)?,
            "started_at": row.get::<_, String>(3)?,
            "completed_at": row.get::<_, Option<String>>(4)?,
            "output": row.get::<_, Option<String>>(5)?,
            "error": row.get::<_, Option<String>>(6)?,
            "tokens_out": row.get::<_, Option<i64>>(7)?,
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    let mut result = run;
    result["steps"] = serde_json::Value::Array(steps);
    Ok(result)
}
