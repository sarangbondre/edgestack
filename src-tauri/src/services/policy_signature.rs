use anyhow::{anyhow, Result};
use ed25519_dalek::{Verifier, Signature, VerifyingKey};
use std::path::Path;
use std::fs;
use crate::db::DbPool;

// Embedded public key for policy verification (hardcoded for security)
const PUBLIC_KEY_BYTES: [u8; 32] = [
    215, 90, 152, 1, 130, 177, 10, 183, 213, 219, 152, 92, 172, 225, 47, 162,
    73, 228, 230, 97, 89, 225, 12, 186, 37, 143, 252, 34, 40, 204, 254, 200
];

pub fn verify_signature(content: &str, signature_hex: &str) -> Result<()> {
    let public_key = VerifyingKey::from_bytes(&PUBLIC_KEY_BYTES)
        .map_err(|e| anyhow!("Invalid verifying key: {}", e))?;
    
    let sig_bytes = hex::decode(signature_hex)
        .map_err(|e| anyhow!("Invalid hex signature: {}", e))?;
    
    let signature = Signature::from_slice(&sig_bytes)
        .map_err(|e| anyhow!("Invalid signature format: {}", e))?;
    
    public_key.verify(content.as_bytes(), &signature)
        .map_err(|e| anyhow!("POLICY_TAMPER: Signature validation failed: {}", e))?;
        
    Ok(())
}

pub fn load_and_verify_policy_file(
    pool: &DbPool,
    policy_path: &Path,
) -> Result<String> {
    // 1. Load content
    let content = fs::read_to_string(policy_path)
        .map_err(|e| anyhow!("Failed to read policy file: {}", e))?;

    // 2. Load companion signature
    let sig_path = policy_path.with_extension("sig");
    if !sig_path.exists() {
        return Err(anyhow!("POLICY_TAMPER: Companion signature (.sig) file is missing."));
    }
    let signature_hex = fs::read_to_string(sig_path)?
        .trim()
        .to_string();

    // 3. Verify cryptographic integrity
    verify_signature(&content, &signature_hex)?;

    // 4. Rollback Prevention (Monotonic version check)
    // Parse version number from policy content (assumes YAML structure containing "version: X")
    let parsed: serde_yaml::Value = serde_yaml::from_str(&content)
        .map_err(|e| anyhow!("Invalid YAML structure: {}", e))?;
    
    let version = parsed.get("version")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let policy_name = parsed.get("name")
        .and_then(|n| n.as_str())
        .unwrap_or("unknown");

    // Check last applied version in DB
    let conn = pool.get()?;
    let db_version: Option<i64> = conn.query_row(
        "SELECT MAX(version) FROM governance_policies WHERE name = ?1",
        rusqlite::params![policy_name],
        |r| r.get(0)
    ).ok();

    if let Some(last_version) = db_version {
        if version < last_version {
            return Err(anyhow!(
                "Rollback Prevention: Policy version {} is lower than currently applied version {} for policy '{}'",
                version, last_version, policy_name
            ));
        }
    }

    Ok(content)
}
