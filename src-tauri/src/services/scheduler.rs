use std::sync::Arc;
use std::time::Duration;
use chrono::Utc;
use cron::Schedule;
use std::str::FromStr;
use crate::db::DbPool;
use crate::commands::workflow::run_workflow_internal;

pub fn start_scheduler(pool: Arc<DbPool>, app: tauri::AppHandle) {
    tokio::spawn(async move {
        println!("Workflow scheduler started");
        loop {
            tokio::time::sleep(Duration::from_secs(15)).await;
            if let Err(e) = tick_scheduler(&pool, &app).await {
                println!("Error in scheduler tick: {}", e);
            }
        }
    });
}

async fn tick_scheduler(pool: &Arc<DbPool>, app: &tauri::AppHandle) -> anyhow::Result<()> {
    // 1. Fetch workflows and their last run times in a scope to drop SQLite types
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
    }; // conn, stmt, rows are dropped here

    // 2. Evaluate schedules and run workflows
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
                    println!("Triggering scheduled workflow: {} ({}) at scheduled time: {:?}", check.name, check.id, next_time);
                    if let Err(e) = run_workflow_internal(app.clone(), pool.clone(), check.id, "schedule".to_string()).await {
                        println!("Failed to trigger scheduled workflow: {}", e);
                    }
                }
            }
        }
    }
    
    Ok(())
}

fn extract_schedule_from_yaml(yaml: &str) -> Option<String> {
    for line in yaml.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("schedule:") {
            let val = trimmed.trim_start_matches("schedule:").trim().trim_matches('"').trim_matches('\'');
            return Some(val.to_string());
        }
    }
    None
}

fn parse_schedule_to_cron(schedule_str: &str) -> Option<String> {
    let clean = schedule_str.trim().to_lowercase();
    if clean.is_empty() || clean == "manual" || clean == "on_webhook" {
        return None;
    }
    
    // If it already looks like a cron expression (starts with * or digits)
    if clean.chars().next().map(|c| c.is_digit(10) || c == '*' || c == '?').unwrap_or(false) && clean.contains(' ') {
        let parts: Vec<&str> = clean.split_whitespace().collect();
        if parts.len() == 5 {
            // Convert 5-field to 6-field by prepending sec="0"
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
        // Default to 8:00 AM weekday
        let hour = if clean.contains("9:00") || clean.contains("9 am") { 9 } else { 8 };
        return Some(format!("0 0 {} * * Mon-Fri *", hour));
    }

    None
}
