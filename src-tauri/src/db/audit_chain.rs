use anyhow::{anyhow, Result};
use sha2::{Sha256, Digest};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use crate::db::DbPool;
use crate::db::writer::{DbWriter, WriteEvent};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditChainEntry {
    pub event_id: String,
    pub timestamp: i64,
    pub event_type: String,
    pub actor: String,
    pub resource: String,
    pub action: String,
    pub outcome: String,
    pub metadata: String,
    pub previous_hash: String,
    pub event_hash: String,
}

const GENESIS_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

pub fn compute_event_hash(
    event_id: &str,
    timestamp: i64,
    event_type: &str,
    actor: &str,
    resource: &str,
    action: &str,
    outcome: &str,
    metadata: &str,
    previous_hash: &str,
) -> String {
    let mut hasher = Sha256::new();
    let data = format!(
        "{}{}{}{}{}{}{}{}{}",
        event_id, timestamp, event_type, actor, resource, action, outcome, metadata, previous_hash
    );
    hasher.update(data.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn get_last_event_hash(pool: &DbPool) -> Result<String> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT event_hash FROM tamper_evident_audit_log ORDER BY timestamp DESC, event_id DESC LIMIT 1"
    )?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        let hash: String = row.get(0)?;
        Ok(hash)
    } else {
        Ok(GENESIS_HASH.to_string())
    }
}

pub async fn append_audit_event(
    writer: &DbWriter,
    pool: &DbPool,
    event_type: &str,
    actor: &str,
    resource: &str,
    action: &str,
    outcome: &str,
    metadata: serde_json::Value,
) -> Result<String> {
    let event_id = uuid::Uuid::new_v4().to_string();
    let timestamp = Utc::now().timestamp_millis();
    let metadata_str = serde_json::to_string(&metadata).unwrap_or_default();
    
    // Get last hash
    let previous_hash = get_last_event_hash(pool)?;
    let event_hash = compute_event_hash(
        &event_id, timestamp, event_type, actor, resource, action, outcome, &metadata_str, &previous_hash
    );

    let write_event = WriteEvent {
        event_id: event_id.clone(),
        table: "tamper_evident_audit_log".to_string(),
        operation: "INSERT".to_string(),
        sql: "INSERT INTO tamper_evident_audit_log (event_id, timestamp, event_type, actor, resource, action, outcome, metadata, previous_hash, event_hash) \
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)".to_string(),
        params: vec![
            serde_json::Value::String(event_id.clone()),
            serde_json::Value::Number(serde_json::Number::from(timestamp)),
            serde_json::Value::String(event_type.to_string()),
            serde_json::Value::String(actor.to_string()),
            serde_json::Value::String(resource.to_string()),
            serde_json::Value::String(action.to_string()),
            serde_json::Value::String(outcome.to_string()),
            serde_json::Value::String(metadata_str),
            serde_json::Value::String(previous_hash),
            serde_json::Value::String(event_hash),
        ],
        priority: "HIGH".to_string(),
        timestamp,
    };

    writer.write(write_event).await.map_err(|e| anyhow!(e))?;
    Ok(event_id)
}

pub fn verify_audit_integrity(pool: &DbPool) -> Result<bool> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT event_id, timestamp, event_type, actor, resource, action, outcome, metadata, previous_hash, event_hash \
         FROM tamper_evident_audit_log ORDER BY timestamp ASC, event_id ASC"
    )?;

    let mut rows = stmt.query([])?;
    let mut expected_previous_hash = GENESIS_HASH.to_string();

    while let Some(row) = rows.next()? {
        let entry = AuditChainEntry {
            event_id: row.get(0)?,
            timestamp: row.get(1)?,
            event_type: row.get(2)?,
            actor: row.get(3)?,
            resource: row.get(4)?,
            action: row.get(5)?,
            outcome: row.get(6)?,
            metadata: row.get(7)?,
            previous_hash: row.get(8)?,
            event_hash: row.get(9)?,
        };

        // 1. Verify links
        if entry.previous_hash != expected_previous_hash {
            println!(
                "[AuditIntegrity] Chain broken at event {}. Expected previous hash {}, got {}",
                entry.event_id, expected_previous_hash, entry.previous_hash
            );
            return Ok(false);
        }

        // 2. Verify record signature hash
        let recalculated = compute_event_hash(
            &entry.event_id,
            entry.timestamp,
            &entry.event_type,
            &entry.actor,
            &entry.resource,
            &entry.action,
            &entry.outcome,
            &entry.metadata,
            &entry.previous_hash,
        );

        if entry.event_hash != recalculated {
            println!(
                "[AuditIntegrity] Tamper detected at event {}. Recalculated hash {}, stored hash {}",
                entry.event_id, recalculated, entry.event_hash
            );
            return Ok(false);
        }

        expected_previous_hash = entry.event_hash;
    }

    Ok(true)
}
