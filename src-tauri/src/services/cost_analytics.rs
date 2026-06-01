use std::sync::Arc;
use std::time::Duration;
use chrono::{Utc, Duration as ChronoDuration};
use serde_json::Value;
use uuid::Uuid;
use crate::db::DbPool;
use crate::services::{inference_client::InferenceClient, config_service, hardware_scanner};
use crate::utils::fs::app_dir;

pub fn start_cost_analytics(pool: Arc<DbPool>) {
    tokio::spawn(async move {
        println!("Cost analytics loop started");
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            if let Err(e) = run_cost_cycle(&pool).await {
                println!("Error in cost cycle: {}", e);
            }
        }
    });
}

async fn run_cost_cycle(pool: &Arc<DbPool>) -> anyhow::Result<()> {
    let conn = pool.get()?;
    let now = Utc::now();
    let start_time = now - ChronoDuration::seconds(60);
    
    // 1. Fetch telemetry for the last 60 seconds
    let (tokens_in, tokens_out, cpu_avg, count): (i64, i64, f64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(tokens_input), 0), COALESCE(SUM(tokens_output), 0), COALESCE(AVG(cpu_pct), 0), COUNT(*) \
         FROM telemetry WHERE captured_at >= ?1",
        rusqlite::params![start_time.to_rfc3339()],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    ).unwrap_or((0, 0, 0.0, 0));

    if count == 0 {
        // No telemetry captured (system is completely idle), insert a zero cost estimate to maintain continuity
        let id = Uuid::new_v4().to_string();
        let now_str = now.to_rfc3339();
        conn.execute(
            "INSERT INTO cost_estimates (id, period_start, period_end, local_cost_usd, bedrock_equiv_usd, savings_usd, savings_pct, matched_tier, confidence, model_fit, model_used, generated_at) \
             VALUES (?1, ?2, ?3, 0.0, 0.0, 0.0, 100.0, 'Nova Lite', 'high', 'optimal', 'idle', ?4)",
            rusqlite::params![id, start_time.to_rfc3339(), now.to_rfc3339(), now_str],
        )?;
        return Ok(());
    }

    // 2. Load config and pricing
    let config = config_service::load().unwrap_or_default();
    let pricing_path = app_dir().join("bedrock_pricing.json");
    let pricing_content = std::fs::read_to_string(&pricing_path).unwrap_or_else(|_| "{}".to_string());
    let pricing_json: Value = serde_json::from_str(&pricing_content).unwrap_or_default();
    
    // Find matching tier
    let model_lower = config.model.to_lowercase();
    let matched_tier_name = if model_lower.contains("1.5b") || model_lower.contains("qwen") {
        "Nova Micro"
    } else if model_lower.contains("3b") || model_lower.contains("llama3.2") {
        "Nova Lite"
    } else if model_lower.contains("8b") || model_lower.contains("70b") {
        "Llama 3.3 70B"
    } else if model_lower.contains("7b") || model_lower.contains("llava") {
        "Nova Pro"
    } else {
        "Claude Haiku"
    };

    let mut input_price = 0.06;
    let mut output_price = 0.24;
    
    if let Some(tiers) = pricing_json.get("tiers").and_then(|t| t.as_array()) {
        for tier in tiers {
            if let Some(name) = tier.get("name").and_then(|n| n.as_str()) {
                if name == matched_tier_name {
                    input_price = tier.get("input_per_1m").and_then(|v| v.as_f64()).unwrap_or(input_price);
                    output_price = tier.get("output_per_1m").and_then(|v| v.as_f64()).unwrap_or(output_price);
                    break;
                }
            }
        }
    }

    // 3. Scan hardware to approximate TDP watts
    let hw = hardware_scanner::scan().ok();
    let tdp_watts = match hw.as_ref().map(|h| h.tier.as_str()) {
        Some("Excellent") => 35.0, // Apple Silicon / M-series TDP
        Some("Good") => 45.0,
        Some("Capable") => 65.0,
        _ => 95.0,
    };

    // 4. Query local model to get estimates
    let client = InferenceClient::new(&config.model);
    let estimate_val = client.generate_cost_estimate(
        tokens_in as u32,
        tokens_out as u32,
        cpu_avg,
        tdp_watts,
        60.0,
        config.electricity_rate_kwh,
        matched_tier_name,
        input_price,
        output_price,
    ).await.unwrap_or_else(|_| serde_json::json!({
        "local_cost_usd": (cpu_avg/100.0 * tdp_watts * (60.0/3600.0) * config.electricity_rate_kwh) / 1000.0,
        "bedrock_equiv_usd": (tokens_in as f64 / 1_000_000.0 * input_price) + (tokens_out as f64 / 1_000_000.0 * output_price),
        "matched_tier": matched_tier_name,
        "savings_pct": 75.0,
        "model_fit": "optimal",
        "confidence": "low"
    }));

    // 5. Store in SQLite
    let id = Uuid::new_v4().to_string();
    let local_cost = estimate_val["local_cost_usd"].as_f64().unwrap_or(0.0);
    let bedrock_equiv = estimate_val["bedrock_equiv_usd"].as_f64().unwrap_or(0.0);
    let savings_pct = estimate_val["savings_pct"].as_f64().unwrap_or(75.0);
    let confidence = estimate_val["confidence"].as_str().unwrap_or("medium").to_string();
    let model_fit = estimate_val["model_fit"].as_str().unwrap_or("optimal").to_string();
    let savings_usd = (bedrock_equiv - local_cost).max(0.0);

    conn.execute(
        "INSERT INTO cost_estimates (id, period_start, period_end, local_cost_usd, bedrock_equiv_usd, savings_usd, savings_pct, matched_tier, confidence, model_fit, model_used, generated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            id,
            start_time.to_rfc3339(),
            now.to_rfc3339(),
            local_cost,
            bedrock_equiv,
            savings_usd,
            savings_pct,
            matched_tier_name,
            confidence,
            model_fit,
            config.model,
            now.to_rfc3339()
        ],
    )?;

    Ok(())
}
