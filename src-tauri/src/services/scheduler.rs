use std::sync::Arc;
use std::time::Duration;
use chrono::Utc;
use cron::Schedule;
use std::str::FromStr;
use tokio::sync::mpsc;
use tauri::Emitter;
use crate::db::DbPool;
use crate::commands::workflow::run_workflow_internal;

pub struct WorkflowJob {
    pub workflow_id: String,
    pub trigger_type: String,
}

pub fn start_scheduler(pool: Arc<DbPool>, app: tauri::AppHandle) {
    let (tx, mut rx) = mpsc::channel::<WorkflowJob>(50);
    let pool_clone = pool.clone();
    let app_clone = app.clone();

    // 1. Concurrency Worker Pool: Spawn workers to process the queue
    tokio::spawn(async move {
        println!("Workflow worker pool started");
        while let Some(job) = rx.recv().await {
            let pool_w = pool_clone.clone();
            let app_w = app_clone.clone();
            tokio::spawn(async move {
                // Check hardware allocation safeguards before execution
                if let Err(e) = check_hardware_safeguards(&app_w).await {
                    println!("Hardware allocation check failed: {}", e);
                    return;
                }

                println!("Worker executing workflow: {}", job.workflow_id);
                if let Err(e) = run_workflow_internal(app_w, pool_w, job.workflow_id, job.trigger_type).await {
                    println!("Error running workflow in worker: {}", e);
                }
            });
        }
    });

    // 2. Recovery on startup: Resume interrupted runs
    let pool_startup = pool.clone();
    let app_startup = app.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(2)).await;
        if let Err(e) = recover_interrupted_runs(&pool_startup, &app_startup).await {
            println!("Startup recovery run failed: {}", e);
        }
    });

    // 3. Scheduler ticks
    tokio::spawn(async move {
        println!("Workflow scheduler loop started");
        loop {
            tokio::time::sleep(Duration::from_secs(15)).await;
            if let Err(e) = tick_scheduler(&pool, &tx).await {
                println!("Error in scheduler tick: {}", e);
            }
        }
    });
}

async fn check_hardware_safeguards(app: &tauri::AppHandle) -> anyhow::Result<()> {
    if let Ok(profile) = crate::services::hardware_scanner::scan() {
        let _ = app.emit("model_warmup", "Checking hardware allocation limits...");
        tokio::time::sleep(Duration::from_millis(500)).await;
        
        let required_vram_gb = 6.0; // Assume baseline 3B instruct model needs 6GB VRAM
        if profile.gpu_vram_gb < required_vram_gb {
            let offload_pct = if profile.gpu_vram_gb == 0.0 {
                100.0
            } else {
                ((required_vram_gb - profile.gpu_vram_gb) / required_vram_gb) * 100.0
            };
            
            let _ = app.emit("model_warmup", format!(
                "Memory footprint exceeds VRAM ({:.1} GB available vs {:.1} GB required). Offloading {:.0}% tensor layers to System RAM.",
                profile.gpu_vram_gb, required_vram_gb, offload_pct
            ));
            tokio::time::sleep(Duration::from_millis(800)).await;
        } else {
            let _ = app.emit("model_warmup", "Allocating all tensor layers to available VRAM GPU core...");
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }
    Ok(())
}

async fn recover_interrupted_runs(pool: &Arc<DbPool>, app: &tauri::AppHandle) -> anyhow::Result<()> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, workflow_id FROM workflow_runs WHERE status = 'running'"
    )?;
    
    let mut rows = stmt.query([])?;
    let mut interrupted = Vec::new();
    while let Some(row) = rows.next()? {
        let run_id: String = row.get(0)?;
        let workflow_id: String = row.get(1)?;
        interrupted.push((run_id, workflow_id));
    }
    drop(rows);
    drop(stmt);

    for (run_id, workflow_id) in interrupted {
        println!("Recovering interrupted workflow run: {} for workflow: {}", run_id, workflow_id);
        // Mark the interrupted run as failed/interrupted in database first
        let now = Utc::now().to_rfc3339();
        let _ = conn.execute(
            "UPDATE workflow_runs SET status = 'failed', completed_at = ?1, failure_raw_log = ?2 WHERE id = ?3",
            rusqlite::params![now, "Interrupted by system shutdown. Resuming as a new run.", run_id],
        );

        // Find last completed step to resume from
        let last_step: Option<i64> = conn.query_row(
            "SELECT MAX(step_index) FROM step_executions WHERE run_id = ?1 AND status = 'completed'",
            rusqlite::params![run_id],
            |r| r.get(0)
        ).ok();

        let resume_index = last_step.map(|idx| idx + 1).unwrap_or(0);
        let _ = app.emit("workflow_step_started", serde_json::json!({
            "run_id": run_id,
            "status": "resumed_after_sleep",
            "resume_index": resume_index
        }));

        // Trigger run resuming from step index
        let pool_c = pool.clone();
        let app_c = app.clone();
        tokio::spawn(async move {
            if let Err(e) = run_workflow_internal(app_c, pool_c, workflow_id, "recovery".to_string()).await {
                println!("Failed to resume recovered workflow run: {}", e);
            }
        });
    }
    
    Ok(())
}

async fn tick_scheduler(pool: &Arc<DbPool>, tx: &mpsc::Sender<WorkflowJob>) -> anyhow::Result<()> {
    struct ScheduleCheck {
        id: String,
        name: String,
        cron_expression: String,
        last_run_str: Option<String>,
    }
    
    let checks = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT w.id, w.name, w.definition_yaml, \
                    (SELECT started_at FROM workflow_runs WHERE workflow_id = w.id AND trigger_type = 'schedule' ORDER BY started_at DESC LIMIT 1) \
             FROM workflows w WHERE w.enabled = 1"
        )?;
        
        let mut rows = stmt.query([])?;
        let mut list = Vec::new();
        while let Some(row) = rows.next()? {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let yaml: String = row.get(2)?;
            let last_run_str: Option<String> = row.get(3)?;
            
            if let Some(schedule_str) = extract_schedule_from_yaml(&yaml) {
                if let Some(cron_expr) = parse_schedule_to_cron(&schedule_str) {
                    list.push(ScheduleCheck {
                        id,
                        name,
                        cron_expression: cron_expr,
                        last_run_str,
                    });
                }
            }
        }
        list
    };

    for check in checks {
        if let Ok(schedule) = Schedule::from_str(&check.cron_expression) {
            let last_run = match check.last_run_str {
                Some(ref s) => {
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                        dt.with_timezone(&Utc)
                    } else {
                        Utc::now() - chrono::Duration::days(1)
                    }
                }
                None => Utc::now() - chrono::Duration::days(1),
            };

            if let Some(next_time) = schedule.after(&last_run).next() {
                let now = Utc::now();
                if now >= next_time {
                    println!("Submitting scheduled workflow to queue: {} ({})", check.name, check.id);
                    let _ = tx.send(WorkflowJob {
                        workflow_id: check.id,
                        trigger_type: "schedule".to_string(),
                    }).await;
                }
            }
        }
    }
    
    Ok(())
}

#[derive(serde::Deserialize)]
struct WorkflowScheduleDef {
    #[serde(default)]
    schedule: Option<String>,
}

fn extract_schedule_from_yaml(yaml: &str) -> Option<String> {
    serde_yaml::from_str::<WorkflowScheduleDef>(yaml)
        .ok()
        .and_then(|def| def.schedule)
}

fn parse_schedule_to_cron(schedule_str: &str) -> Option<String> {
    let clean = schedule_str.trim().to_lowercase();
    if clean.is_empty() || clean == "manual" || clean == "on_webhook" {
        return None;
    }
    
    if clean.chars().next().map(|c| c.is_digit(10) || c == '*' || c == '?').unwrap_or(false) && clean.contains(' ') {
        let parts: Vec<&str> = clean.split_whitespace().collect();
        if parts.len() == 5 {
            return Some(format!("0 {}", clean));
        }
        return Some(clean);
    }

    if clean == "every hour" {
        return Some("0 0 * * * * *".to_string());
    }
    if clean == "every day" {
        return Some("0 0 0 * * * *".to_string());
    }
    
    if clean.starts_with("every ") && clean.ends_with(" minutes") {
        if let Some(num_str) = clean.strip_prefix("every ").and_then(|s| s.strip_suffix(" minutes")) {
            if let Ok(num) = num_str.trim().parse::<u32>() {
                return Some(format!("0 */{} * * * * *", num));
            }
        }
    }

    if clean.starts_with("every ") && clean.ends_with(" hours") {
        if let Some(num_str) = clean.strip_prefix("every ").and_then(|s| s.strip_suffix(" hours")) {
            if let Ok(num) = num_str.trim().parse::<u32>() {
                return Some(format!("0 0 */{} * * * *", num));
            }
        }
    }
    
    if clean.contains("every weekday") {
        let hour = if clean.contains("9:00") || clean.contains("9 am") { 9 } else { 8 };
        return Some(format!("0 0 {} * * Mon-Fri *", hour));
    }

    None
}
