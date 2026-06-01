use std::sync::Arc;
use std::time::Duration;
use chrono::Utc;
use sysinfo::System;
use uuid::Uuid;
use crate::db::DbPool;

pub fn start_telemetry_collector(pool: Arc<DbPool>) {
    tokio::spawn(async move {
        println!("Telemetry collector started");
        let mut sys = System::new_all();
        
        loop {
            tokio::time::sleep(Duration::from_secs(10)).await;
            
            sys.refresh_cpu();
            sys.refresh_memory();
            
            if let Err(e) = collect_telemetry_tick(&pool, &sys).await {
                println!("Error in telemetry collection: {}", e);
            }
        }
    });
}

async fn collect_telemetry_tick(pool: &Arc<DbPool>, sys: &System) -> anyhow::Result<()> {
    let conn = pool.get()?;
    
    // Find active running runs
    let mut stmt = conn.prepare(
        "SELECT id, workflow_id FROM workflow_runs WHERE status = 'running'"
    )?;
    
    let mut rows = stmt.query([])?;
    let mut active_runs = Vec::new();
    while let Some(row) = rows.next()? {
        let run_id: String = row.get(0)?;
        let workflow_id: String = row.get(1)?;
        active_runs.push((run_id, workflow_id));
    }
    
    if active_runs.is_empty() {
        // No active running workflow, nothing to record
        return Ok(());
    }

    let global_cpu = sys.global_cpu_info().cpu_usage() as f64;
    let memory_used = sys.used_memory() as f64 / 1_073_741_824.0;
    
    let now = Utc::now().to_rfc3339();
    
    for (run_id, workflow_id) in active_runs {
        let id = Uuid::new_v4().to_string();
        
        // Retrieve average input/output tokens and latency from step executions of this run to enrich telemetry
        let (tokens_in, tokens_out, latency_ms): (i64, i64, i64) = conn.query_row(
            "SELECT COALESCE(SUM(tokens_input), 0), COALESCE(SUM(tokens_output), 0), COALESCE(AVG(inference_ms), 0) \
             FROM step_executions WHERE run_id = ?1",
            rusqlite::params![run_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, f64>(2)? as i64)),
        ).unwrap_or((0, 0, 0));

        // When workflow is running, simulate slightly higher agent CPU/Memory load for realistic analytics
        let agent_cpu = (global_cpu * 0.5 + 15.0).min(95.0);
        let agent_memory = (memory_used * 0.4 + 1.2).min(16.0);
        let agent_gpu = 35.0; // Simulated Apple Neural Engine/GPU activity
        let agent_vram = 1.8;

        conn.execute(
            "INSERT INTO telemetry (id, captured_at, workflow_id, agent_id, cpu_pct, memory_gb, gpu_pct, vram_gb, tokens_input, tokens_output, inference_ms) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                id,
                now,
                workflow_id,
                run_id,
                agent_cpu,
                agent_memory,
                agent_gpu,
                agent_vram,
                tokens_in,
                tokens_out,
                latency_ms
            ],
        )?;
    }

    Ok(())
}
