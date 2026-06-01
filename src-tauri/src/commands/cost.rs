use std::sync::Arc;
use tauri::State;
use crate::db::DbPool;
use crate::models::{CostSummary, DailyCost};
use crate::services::{inference_client::InferenceClient, config_service};
use crate::utils::fs::app_dir;

#[tauri::command]
pub async fn get_cost_summary(pool: State<'_, Arc<DbPool>>, period_days: u32) -> Result<CostSummary, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // Aggregate costs from DB
    let (total_local, total_cloud, matched_tier) = conn.query_row(
        "SELECT COALESCE(SUM(local_cost_usd),0), COALESCE(SUM(bedrock_equiv_usd),0), MAX(matched_tier) FROM cost_estimates WHERE period_start >= datetime('now', ?1)",
        rusqlite::params![format!("-{} days", period_days)],
        |row| Ok((
            row.get::<_, f64>(0)?,
            row.get::<_, f64>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    ).unwrap_or((0.0, 0.0, None));

    // Daily breakdown
    let mut stmt = conn.prepare(
        "SELECT DATE(period_start), COALESCE(SUM(local_cost_usd),0), COALESCE(SUM(bedrock_equiv_usd),0)
         FROM cost_estimates WHERE period_start >= datetime('now', ?1)
         GROUP BY DATE(period_start) ORDER BY DATE(period_start)"
    ).map_err(|e| e.to_string())?;
    let daily: Vec<DailyCost> = stmt.query_map(rusqlite::params![format!("-{} days", period_days)], |row| {
        Ok(DailyCost {
            date: row.get(0)?,
            local_cost: row.get(1)?,
            bedrock_equiv: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    let savings = total_cloud - total_local;
    let savings_pct = if total_cloud > 0.0 { savings / total_cloud * 100.0 } else { 0.0 };

    Ok(CostSummary {
        period_days,
        total_local_cost: total_local,
        total_bedrock_equiv: total_cloud,
        total_savings: savings,
        savings_pct,
        matched_tier: matched_tier.unwrap_or_else(|| "Nova Lite".to_string()),
        daily_breakdown: daily,
        ai_insight: None,
    })
}

#[tauri::command]
pub async fn get_cost_history(pool: State<'_, Arc<DbPool>>) -> Result<Vec<serde_json::Value>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT local_cost_usd, bedrock_equiv_usd, savings_pct, matched_tier, confidence, model_fit, generated_at FROM cost_estimates ORDER BY generated_at DESC LIMIT 100"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "local_cost": row.get::<_, f64>(0)?,
            "bedrock_equiv": row.get::<_, f64>(1)?,
            "savings_pct": row.get::<_, f64>(2)?,
            "matched_tier": row.get::<_, String>(3)?,
            "confidence": row.get::<_, String>(4)?,
            "model_fit": row.get::<_, String>(5)?,
            "generated_at": row.get::<_, String>(6)?,
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn update_electricity_rate(pool: State<'_, Arc<DbPool>>, rate: f64) -> Result<(), String> {
    let mut config = config_service::load().unwrap_or_default();
    config.electricity_rate_kwh = rate;
    config_service::save(&config).map_err(|e| e.to_string())
}
