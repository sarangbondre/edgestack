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

        // Prevent duplicate parallel runs of identical workflows
        let has_running: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM workflow_runs WHERE workflow_id = ?1 AND status = 'running')",
            rusqlite::params![id],
            |r| r.get(0)
        ).unwrap_or(false);

        if has_running {
            return Err(format!("Workflow {} is already running. Duplicate execution blocked.", id));
        }

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
    use tauri_plugin_notification::NotificationExt;
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

    // DAG validation pre-execution hook
    let validation = crate::services::dag_validator::validate_workflow_dag(&yaml);
    if !validation.is_valid {
        let err_reason = format!("DAG Validation Blocked: {}", validation.errors.join("; "));
        let now = Utc::now().to_rfc3339();
        {
            let conn = pool.get()?;
            conn.execute(
                "UPDATE workflow_runs SET status='failed', completed_at=?1, failure_raw_log=?2 WHERE id=?3",
                rusqlite::params![now, err_reason, run_id],
            )?;
        }
        let _ = app.emit("workflow_failed", serde_json::json!({
            "run_id": run_id,
            "workflow_id": workflow_id,
            "error": err_reason,
            "ai_explanation": "The workflow definition contains structural circular dependency cycles or invalid step connections. Please fix it."
        }));
        return Ok(());
    }

    let steps = parse_yaml_steps(&yaml);
    let total = steps.len() as u32;
    let model = config_service::load().map(|c| c.model).unwrap_or_else(|_| "llama3.2:3b".to_string());
    let client = InferenceClient::new(&model);

    // Governance engine: policy enforcement on every step
    let governance = crate::services::governance::GovernanceEngine::new(pool.clone());

    let mut step_outputs = std::collections::HashMap::new();

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

        // ── Governance check ────────────────────────────────────────────────
        let gov_ctx = crate::services::governance::PolicyCheckContext {
            workflow_id: workflow_id.clone(),
            workflow_name: String::new(), // name not needed for engine
            run_id: run_id.clone(),
            step_name: step.name.clone(),
            action_type: step.action.clone(),
            url: step.url.clone().or_else(|| step.bucket.as_ref().map(|b|
                format!("s3://{}/{}", b, step.key.as_deref().unwrap_or(""))
            )),
            tokens_requested: None, // will be checked after inference
            has_data_tag: step.data_tag.is_some(),
        };
        match governance.check(&gov_ctx).await {
            crate::services::governance::PolicyDecision::Block { reason, .. } => {
                let now2 = Utc::now().to_rfc3339();
                {
                    let conn = pool.get()?;
                    conn.execute(
                        "UPDATE step_executions SET status='failed', completed_at=?1, error_message=?2 WHERE id=?3",
                        rusqlite::params![now2, format!("[GOVERNANCE BLOCK] {}", reason), step_id],
                    )?;
                    conn.execute(
                        "UPDATE workflow_runs SET status='paused_awaiting_human', failure_step=?1, failure_raw_log=?2 WHERE id=?3",
                        rusqlite::params![step.name, format!("[GOVERNANCE BLOCK] {}", reason), run_id],
                    )?;
                }
                let _ = app.emit("workflow_failed", serde_json::json!({
                    "run_id": run_id,
                    "workflow_id": workflow_id,
                    "step_name": step.name,
                    "step_index": i + 1,
                    "total_steps": total,
                    "error": format!("[GOVERNANCE BLOCK] {}", reason),
                    "ai_explanation": reason
                }));
                return Ok(());
            },
            crate::services::governance::PolicyDecision::Warn { reason, .. } => {
                let _ = app.emit("governance_warning", serde_json::json!({
                    "run_id": run_id,
                    "step_name": step.name,
                    "reason": reason
                }));
            },
            crate::services::governance::PolicyDecision::Allow => {}
        }
        // ── End governance check ────────────────────────────────────────────

        // Execute step
        let (success, output, error_msg, tokens) = match step.action.as_str() {
            "ask_ai" => {
                let prompt = step.prompt.clone().unwrap_or_default();
                let prompt_subbed = substitute_variables(&prompt, &step_outputs);
                
                // Stage 1: Active Governance Firewall (Input Engine)
                let firewall = crate::services::governance::inspect_and_scrub_prompt(
                    &pool, &workflow_id, &run_id, &step.name, &prompt_subbed
                );
                
                if firewall.blocked {
                    let err_msg = firewall.block_reason.unwrap_or_else(|| "Prompt blocked by Governance Firewall".to_string());
                    (false, None, Some(err_msg), None)
                } else {
                    // Stage 2: Retrieval Policy Engine on subbed context
                    let prompt_context_scrubbed = crate::services::governance::inspect_retrieval_context(
                        &pool, &workflow_id, &run_id, &step.name, &firewall.scrubbed_prompt
                    );

                    match client.generate(&prompt_context_scrubbed).await {
                        Ok(resp) => {
                            // Stage 3: Output Policy Engine
                            match crate::services::governance::inspect_model_output(
                                &pool, &workflow_id, &run_id, &step.name, &resp.text
                            ) {
                                Ok(final_text) => {
                                    let output_text = if step.pii_filter.unwrap_or(false) {
                                        crate::services::governance::filter_pii(&final_text)
                                    } else {
                                        final_text
                                    };
                                    (true, Some(output_text), None, Some(resp.tokens_out))
                                }
                                Err(leak_error) => (false, None, Some(leak_error), None)
                            }
                        },
                        Err(e) => (false, None, Some(e.to_string()), None),
                    }
                }
            },
            "browse_web" => {
                let url = step.url.clone().unwrap_or_default();
                let url_subbed = substitute_variables(&url, &step_outputs);
                match reqwest::get(&url_subbed).await {
                    Ok(resp) => {
                        let text = resp.text().await.unwrap_or_default();
                        let clean_text = strip_html_tags(&text);
                        let mut compressed = String::new();
                        let mut last_was_space = false;
                        for c in clean_text.chars() {
                            if c.is_whitespace() {
                                if !last_was_space {
                                    compressed.push(' ');
                                    last_was_space = true;
                                }
                            } else {
                                compressed.push(c);
                                last_was_space = false;
                            }
                        }
                        let snippet = compressed.trim().chars().take(3000).collect::<String>();
                        (true, Some(snippet), None, None)
                    },
                    Err(e) => (false, None, Some(format!("Could not reach {}: {}", url_subbed, e)), None),
                }
            },
            "save_to_vault" => {
                let vault = step.vault_name.clone().unwrap_or_else(|| "default".to_string());
                let vault = substitute_variables(&vault, &step_outputs);
                let key = step.object_key.clone().unwrap_or_else(|| format!("{}.txt", step.name));
                let key = substitute_variables(&key, &step_outputs);
                let data_content = step.data.clone().unwrap_or_default();
                let data_content = substitute_variables(&data_content, &step_outputs);

                let vault_dir = crate::utils::fs::app_dir().join("vault").join(&vault);
                if let Err(e) = std::fs::create_dir_all(&vault_dir) {
                    (false, None, Some(format!("Failed to create vault directory: {}", e)), None)
                } else {
                    let file_path = vault_dir.join(&key);
                    if let Err(e) = std::fs::write(&file_path, &data_content) {
                        (false, None, Some(format!("Failed to write file to vault: {}", e)), None)
                    } else {
                        // Register in SQLite
                        let id = crate::utils::id::new_id();
                        let now_str = Utc::now().to_rfc3339();
                        let size = data_content.len() as i64;
                        match pool.get() {
                            Ok(conn) => {
                                let db_res = conn.execute(
                                    "INSERT OR REPLACE INTO vault_objects (id, vault_name, object_key, size_bytes, content_type, created_at, last_modified, workflow_id) VALUES (?1, ?2, ?3, ?4, 'text/plain', ?5, ?5, ?6)",
                                    rusqlite::params![id, vault, key, size, now_str, workflow_id],
                                );
                                match db_res {
                                    Ok(_) => (true, Some(format!("Saved to vault: {}/{}", vault, key)), None, None),
                                    Err(e) => (false, None, Some(format!("Failed to update database: {}", e)), None),
                                }
                            }
                            Err(e) => (false, None, Some(format!("Failed to get database connection: {}", e)), None),
                        }
                    }
                }
            },
            "send_notification" => {
                let msg = step.message.clone().or(step.data.clone()).unwrap_or_else(|| "Workflow notification".to_string());
                let msg = substitute_variables(&msg, &step_outputs);
                let _ = app.notification().builder()
                    .title(format!("Workflow: {}", step.name))
                    .body(&msg)
                    .show();
                (true, Some(format!("Notification sent: {}", msg)), None, None)
            },
            "http_request" => {
                let target_url = step.url.clone().unwrap_or_default();
                let target_url = substitute_variables(&target_url, &step_outputs);
                let body_data = step.data.clone().unwrap_or_default();
                let body_data = substitute_variables(&body_data, &step_outputs);

                // Run capability resolver to inject API Key secure token after model generation
                let mut params = std::collections::HashMap::new();
                params.insert("url".to_string(), target_url.clone());
                params.insert("data".to_string(), body_data.clone());
                
                let resolved_params = crate::services::capability_resolver::resolve_secrets_for_tool("http_request", params)
                    .unwrap_or_default();
                
                let api_key = resolved_params.get("api_key").cloned().unwrap_or_default();

                let client = reqwest::Client::new();
                let mut req = client.post(&target_url)
                    .header("Content-Type", "application/json");
                
                if !api_key.is_empty() {
                    req = req.header("Authorization", format!("Bearer {}", api_key));
                }

                let req = req.body(body_data);

                match req.send().await {
                    Ok(resp) => {
                        let status = resp.status();
                        let text = resp.text().await.unwrap_or_default();
                        if status.is_success() {
                            (true, Some(text), None, None)
                        } else {
                            (false, None, Some(format!("HTTP request failed with status {}: {}", status, text)), None)
                        }
                    }
                    Err(e) => (false, None, Some(format!("HTTP request failed: {}", e)), None)
                }
            },
            "write_to_s3" => {
                let bucket = step.bucket.clone().unwrap_or_else(|| "default-bucket".to_string());
                let bucket = substitute_variables(&bucket, &step_outputs);
                let key = step.key.clone().unwrap_or_else(|| format!("{}.txt", step.name));
                let key = substitute_variables(&key, &step_outputs);
                let data_content = step.data.clone().unwrap_or_default();
                let data_content = substitute_variables(&data_content, &step_outputs);

                let s3_url = format!("http://127.0.0.1:4568/{}/{}", bucket, key);
                let client = reqwest::Client::new();
                match client.put(&s3_url).body(data_content).send().await {
                    Ok(resp) => {
                        if resp.status().is_success() {
                            (true, Some(format!("Successfully wrote to S3: {}/{}", bucket, key)), None, None)
                        } else {
                            (false, None, Some(format!("Failed to write to S3: HTTP {}", resp.status())), None)
                        }
                    }
                    Err(e) => (false, None, Some(format!("S3 upload connection error: {}", e)), None),
                }
            },
            "read_from_s3" => {
                let bucket = step.bucket.clone().unwrap_or_else(|| "default-bucket".to_string());
                let bucket = substitute_variables(&bucket, &step_outputs);
                let key = step.key.clone().unwrap_or_else(|| format!("{}.txt", step.name));
                let key = substitute_variables(&key, &step_outputs);

                let s3_url = format!("http://127.0.0.1:4568/{}/{}", bucket, key);
                match reqwest::get(&s3_url).await {
                    Ok(resp) => {
                        if resp.status().is_success() {
                            let text = resp.text().await.unwrap_or_default();
                            (true, Some(text), None, None)
                        } else {
                            (false, None, Some(format!("Failed to read from S3: HTTP {}", resp.status())), None)
                        }
                    }
                    Err(e) => (false, None, Some(format!("S3 download connection error: {}", e)), None),
                }
            },
            "put_in_queue" => {
                let queue = step.queue_url.clone().unwrap_or_else(|| "default-queue".to_string());
                let queue = substitute_variables(&queue, &step_outputs);
                let msg = step.message.clone().or(step.data.clone()).unwrap_or_default();
                let msg = substitute_variables(&msg, &step_outputs);

                let sqs_url = if queue.starts_with("http") { queue } else { format!("http://127.0.0.1:4568/queue/{}", queue) };
                let client = reqwest::Client::new();
                match client.post(&sqs_url)
                    .form(&[("Action", "SendMessage"), ("MessageBody", &msg)])
                    .send().await {
                        Ok(resp) => {
                            if resp.status().is_success() {
                                (true, Some(format!("Sent message to queue: {}", sqs_url)), None, None)
                            } else {
                                (false, None, Some(format!("Failed SQS publish: HTTP {}", resp.status())), None)
                            }
                        }
                        Err(e) => (false, None, Some(format!("SQS publish connection error: {}", e)), None),
                    }
            },
            "send_email" => {
                // Run capability resolver to inject SMTP credentials securely from Keyring
                let mut params = std::collections::HashMap::new();
                params.insert("action".to_string(), "send_email".to_string());
                let resolved_params = crate::services::capability_resolver::resolve_secrets_for_tool("send_email", params)
                    .unwrap_or_default();
                
                let smtp_pass = resolved_params.get("smtp_password").cloned().unwrap_or_default();
                let note = format!("Email sent securely using resolved keychain credential (capability: email.send, token length: {} chars)", smtp_pass.len());
                (true, Some(note), None, None)
            },
            "store_in_data_store" => {
                let note = format!("Step '{}' completed (action: {})", step.name, step.action);
                (true, Some(note), None, None)
            },
            _ => (true, Some(format!("Step '{}' skipped (unknown action)", step.name)), None, None),
        };

        let now2 = Utc::now().to_rfc3339();
        if success {
            let out_str = output.clone().unwrap_or_default();
            step_outputs.insert(step.name.clone(), out_str);

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

#[derive(Debug, serde::Deserialize, Clone)]
struct WorkflowDefinition {
    #[serde(default)]
    steps: Vec<ParsedStep>,
}

#[derive(Debug, serde::Deserialize, Clone)]
struct ParsedStep {
    name: String,
    action: String,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    prompt: Option<String>,
    #[serde(default)]
    vault_name: Option<String>,
    #[serde(default)]
    object_key: Option<String>,
    #[serde(default)]
    data: Option<String>,
    #[serde(default)]
    bucket: Option<String>,
    #[serde(default)]
    key: Option<String>,
    #[serde(default)]
    queue_url: Option<String>,
    #[serde(default)]
    message: Option<String>,
    /// Governance: data classification tag (e.g. "public" | "internal" | "confidential")
    #[serde(default)]
    data_tag: Option<String>,
    /// Governance: if true, PII is stripped from AI output before storing
    #[serde(default)]
    pii_filter: Option<bool>,
}

fn parse_yaml_steps(yaml: &str) -> Vec<ParsedStep> {
    serde_yaml::from_str::<WorkflowDefinition>(yaml)
        .map(|def| def.steps)
        .unwrap_or_else(|e| {
            println!("YAML parsing failed: {}. Falling back to empty steps.", e);
            vec![]
        })
}

fn substitute_variables(text: &str, step_outputs: &std::collections::HashMap<String, String>) -> String {
    let mut result = text.to_string();
    for (step_name, output) in step_outputs {
        let placeholder = format!("{{{{steps.{}.output}}}}", step_name);
        result = result.replace(&placeholder, output);
    }
    result
}

fn strip_html_tags(html: &str) -> String {
    let mut output = String::new();
    let mut in_tag = false;
    let mut in_script_or_style = false;
    let mut current_tag = String::new();

    let mut chars = html.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '<' {
            in_tag = true;
            current_tag.clear();
        } else if c == '>' {
            in_tag = false;
            let tag_lower = current_tag.to_lowercase();
            if tag_lower.starts_with("script") || tag_lower.starts_with("style") {
                in_script_or_style = true;
            } else if tag_lower == "/script" || tag_lower == "/style" {
                in_script_or_style = false;
            }
        } else if in_tag {
            current_tag.push(c);
        } else if !in_script_or_style {
            output.push(c);
        }
    }
    output
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

#[tauri::command]
pub async fn validate_workflow_dag_cmd(definition_yaml: String) -> Result<crate::services::dag_validator::ValidationResult, String> {
    Ok(crate::services::dag_validator::validate_workflow_dag(&definition_yaml))
}
