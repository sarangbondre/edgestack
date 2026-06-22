use anyhow::{anyhow, Result};
use sha2::{Sha256, Digest};
use std::io::Read;
use std::path::Path;
use std::fs::File;
use chrono::Utc;
use crate::db::DbPool;

fn compute_file_sha256(path: &Path) -> Result<String> {
    let mut file = File::open(path)
        .map_err(|e| anyhow!("Failed to open model file for hash check: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 { break; }
        hasher.update(&buffer[..count]);
    }
    Ok(hex::encode(hasher.finalize()))
}

pub fn register_model(
    pool: &DbPool,
    model_id: &str,
    name: &str,
    publisher: &str,
    source_url: &str,
    file_path: &Path,
    license: &str,
) -> Result<()> {
    let hash = if file_path.exists() {
        compute_file_sha256(file_path)?
    } else {
        "0000000000000000000000000000000000000000000000000000000000000000".to_string()
    };

    let conn = pool.get()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR REPLACE INTO model_trust_registry (model_id, name, publisher, source_url, sha256_hash, license, trust_level, last_verified_at, is_active) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'COMMUNITY', ?7, 1)",
        rusqlite::params![model_id, name, publisher, source_url, hash, license, now],
    )?;

    Ok(())
}

pub fn verify_model_trust(
    pool: &DbPool,
    model_id: &str,
    file_path: &Path,
) -> Result<()> {
    let conn = pool.get()?;
    
    // Check if model exists in registry
    let mut stmt = conn.prepare(
        "SELECT sha256_hash, trust_level, is_active FROM model_trust_registry WHERE model_id = ?1"
    )?;
    
    let mut rows = stmt.query(rusqlite::params![model_id])?;
    let registry_info = if let Some(row) = rows.next()? {
        let stored_hash: String = row.get(0)?;
        let trust_level: String = row.get(1)?;
        let is_active: i32 = row.get(2)?;
        Some((stored_hash, trust_level, is_active == 1))
    } else {
        None
    };
    drop(rows);
    drop(stmt);

    let (stored_hash, trust_level, is_active) = match registry_info {
        Some(info) => info,
        None => {
            // Auto register on first load as COMMUNITY
            println!("[TrustRegistry] Model '{}' not registered. Auto-registering...", model_id);
            register_model(
                pool, model_id, model_id, "HuggingFace", "https://huggingface.co", file_path, "Llama-Community"
            )?;
            return Ok(());
        }
    };

    if !is_active {
        return Err(anyhow!("SECURITY_ALERT: The model '{}' is disabled in the trust registry.", model_id));
    }

    if trust_level == "UNTRUSTED" {
        return Err(anyhow!("SECURITY_ALERT: The model '{}' is marked as UNTRUSTED.", model_id));
    }

    if file_path.exists() {
        let computed = compute_file_sha256(file_path)?;
        if computed != stored_hash {
            // Raise SECURITY_ALERT in audit log
            let audit_id = crate::utils::id::new_id();
            let now = Utc::now().to_rfc3339();
            let _ = conn.execute(
                "INSERT INTO audit_log (id, timestamp, action_type, decision, reason, execution_blocked) \
                 VALUES (?1, ?2, 'model_trust_verification', 'block', ?3, 1)",
                rusqlite::params![
                    audit_id, now,
                    format!("SECURITY_ALERT: Hash mismatch on model {}. Stored: {}, Computed: {}", model_id, stored_hash, computed)
                ],
            );
            return Err(anyhow!("SECURITY_ALERT: Cryptographic hash mismatch on model '{}'. Weight file may be corrupted or tampered.", model_id));
        }
    }

    // Update last verified timestamp
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE model_trust_registry SET last_verified_at = ?1 WHERE model_id = ?2",
        rusqlite::params![now, model_id],
    )?;

    Ok(())
}

pub fn approve_model(
    pool: &DbPool,
    model_id: &str,
    trust_level: &str,
    admin_user: &str,
) -> Result<()> {
    let conn = pool.get()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE model_trust_registry SET trust_level = ?1, approved_by = ?2, approved_at = ?3, last_verified_at = ?3 \
         WHERE model_id = ?4",
        rusqlite::params![trust_level, admin_user, now, model_id],
    )?;
    Ok(())
}
