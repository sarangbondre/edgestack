use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::db::DbPool;
use chrono::Utc;
use crate::utils::id::new_id;

// ─── Data Types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    /// Which workflow step action this applies to: "ask_ai" | "browse_web" | "http_request" | "save_to_vault" | "write_to_s3" | "*"
    pub action_type: String,
    /// "block" | "warn" | "audit"
    pub effect: String,
    pub conditions: PolicyConditions,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PolicyConditions {
    /// For browse_web / http_request: only allow URLs in this list (None = no restriction)
    pub url_allowlist: Option<Vec<String>>,
    /// For browse_web / http_request: block URLs matching these patterns
    pub url_blocklist: Option<Vec<String>>,
    /// For ask_ai: max tokens per day per workflow (0 = unlimited)
    pub max_tokens_per_day: Option<i64>,
    /// For ask_ai: strip PII (emails, phone numbers) from output before storing
    pub pii_filter_output: Option<bool>,
    /// For save_to_vault / write_to_s3: require a `vault_tag` field to be present
    pub require_data_tag: Option<bool>,
    /// For any action: maximum number of executions per hour
    pub max_calls_per_hour: Option<i64>,
    /// For any action: maximum daily budget in USD-equivalent (based on cost analytics)
    pub max_daily_cost_usd: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: String,
    pub workflow_id: Option<String>,
    pub workflow_name: Option<String>,
    pub run_id: Option<String>,
    pub step_name: Option<String>,
    pub action_type: String,
    pub policy_id: Option<String>,
    pub policy_name: Option<String>,
    pub decision: String, // "allow" | "block" | "warn" | "audit"
    pub reason: Option<String>,
    pub context_url: Option<String>,
    pub tokens_requested: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyCheckContext {
    pub workflow_id: String,
    pub workflow_name: String,
    pub run_id: String,
    pub step_name: String,
    pub action_type: String,
    pub url: Option<String>,
    pub tokens_requested: Option<i64>,
    pub has_data_tag: bool,
}

#[derive(Debug, Clone)]
pub enum PolicyDecision {
    Allow,
    Warn { reason: String, policy_id: String },
    Block { reason: String, policy_id: String },
}

// ─── Governance Engine ─────────────────────────────────────────────────────────

pub struct GovernanceEngine {
    pool: Arc<DbPool>,
}

impl GovernanceEngine {
    pub fn new(pool: Arc<DbPool>) -> Self {
        Self { pool }
    }

    /// Main entry point — checks all enabled policies for a given step action.
    /// Returns the most restrictive decision (block > warn > allow).
    pub async fn check(&self, ctx: &PolicyCheckContext) -> PolicyDecision {
        let policies = match self.load_policies_for_action(&ctx.action_type) {
            Ok(p) => p,
            Err(e) => {
                println!("[Governance] Failed to load policies: {}", e);
                return PolicyDecision::Allow;
            }
        };

        let mut final_decision = PolicyDecision::Allow;

        for policy in &policies {
            if !policy.enabled { continue; }

            let decision = self.evaluate(&policy, ctx);

            // Write audit record regardless of outcome
            self.write_audit(ctx, &policy, &decision);

            // Escalate: block > warn > allow
            match &decision {
                PolicyDecision::Block { .. } => {
                    final_decision = decision;
                    break; // No need to check further policies
                }
                PolicyDecision::Warn { .. } => {
                    if !matches!(final_decision, PolicyDecision::Block { .. }) {
                        final_decision = decision;
                    }
                }
                PolicyDecision::Allow => {}
            }
        }

        final_decision
    }

    fn evaluate(&self, policy: &PolicyRule, ctx: &PolicyCheckContext) -> PolicyDecision {
        let cond = &policy.conditions;
        let effect = policy.effect.as_str();

        // 1. URL allowlist check
        if let Some(allowlist) = &cond.url_allowlist {
            if let Some(url) = &ctx.url {
                if !allowlist.is_empty() && !allowlist.iter().any(|a| url.contains(a.as_str())) {
                    let reason = format!("URL '{}' is not in the allowed list for policy '{}'", url, policy.name);
                    return match_effect(effect, reason, &policy.id);
                }
            }
        }

        // 2. URL blocklist check
        if let Some(blocklist) = &cond.url_blocklist {
            if let Some(url) = &ctx.url {
                if blocklist.iter().any(|b| url.contains(b.as_str())) {
                    let reason = format!("URL '{}' is blocked by policy '{}'", url, policy.name);
                    return match_effect(effect, reason, &policy.id);
                }
            }
        }

        // 3. Token budget check (daily, per workflow)
        if let Some(max_tokens) = cond.max_tokens_per_day {
            if max_tokens > 0 {
                if let Some(requested) = ctx.tokens_requested {
                    let used_today = self.get_tokens_used_today(&ctx.workflow_id).unwrap_or(0);
                    if used_today + requested > max_tokens {
                        let reason = format!(
                            "Token budget exceeded: {} used today, {} requested, limit is {} (policy '{}')",
                            used_today, requested, max_tokens, policy.name
                        );
                        return match_effect(effect, reason, &policy.id);
                    }
                }
            }
        }

        // 4. Data tag requirement
        if let Some(true) = cond.require_data_tag {
            if !ctx.has_data_tag {
                let reason = format!("Step '{}' must include a data classification tag (policy '{}')", ctx.step_name, policy.name);
                return match_effect(effect, reason, &policy.id);
            }
        }

        // 5. Rate limiting (calls per hour)
        if let Some(max_per_hour) = cond.max_calls_per_hour {
            if max_per_hour > 0 {
                let calls = self.get_calls_last_hour(&ctx.workflow_id, &ctx.action_type).unwrap_or(0);
                if calls >= max_per_hour {
                    let reason = format!(
                        "Rate limit exceeded: {} calls/hour for action '{}' (policy '{}')",
                        max_per_hour, ctx.action_type, policy.name
                    );
                    return match_effect(effect, reason, &policy.id);
                }
            }
        }

        PolicyDecision::Allow
    }

    fn load_policies_for_action(&self, action_type: &str) -> Result<Vec<PolicyRule>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, description, enabled, action_type, effect, conditions_json, created_at, updated_at
             FROM governance_policies
             WHERE enabled=1 AND (action_type=?1 OR action_type='*')
             ORDER BY created_at ASC"
        )?;
        let policies: Vec<PolicyRule> = stmt.query_map(rusqlite::params![action_type], |row| {
            let conditions_json: String = row.get(6).unwrap_or_else(|_| "{}".to_string());
            let conditions: PolicyConditions = serde_json::from_str(&conditions_json).unwrap_or_default();
            Ok(PolicyRule {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                enabled: row.get::<_, i32>(3)? == 1,
                action_type: row.get(4)?,
                effect: row.get(5)?,
                conditions,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok(policies)
    }

    fn get_tokens_used_today(&self, workflow_id: &str) -> Result<i64> {
        let conn = self.pool.get()?;
        let total: i64 = conn.query_row(
            "SELECT COALESCE(SUM(tokens_output), 0) FROM telemetry
             WHERE workflow_id=?1 AND captured_at >= datetime('now', '-1 day')",
            rusqlite::params![workflow_id],
            |row| row.get(0),
        )?;
        Ok(total)
    }

    fn get_calls_last_hour(&self, workflow_id: &str, action_type: &str) -> Result<i64> {
        let conn = self.pool.get()?;
        // Approximate by counting audit log entries for this workflow + action in last hour
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM audit_log
             WHERE workflow_id=?1 AND action_type=?2 AND timestamp >= datetime('now', '-1 hour')",
            rusqlite::params![workflow_id, action_type],
            |row| row.get(0),
        ).unwrap_or(0);
        Ok(count)
    }

    fn write_audit(&self, ctx: &PolicyCheckContext, policy: &PolicyRule, decision: &PolicyDecision) {
        let (decision_str, reason) = match decision {
            PolicyDecision::Allow => ("allow", None),
            PolicyDecision::Warn { reason, .. } => ("warn", Some(reason.clone())),
            PolicyDecision::Block { reason, .. } => ("block", Some(reason.clone())),
        };

        if let Ok(conn) = self.pool.get() {
            let id = new_id();
            let now = Utc::now().to_rfc3339();
            let _ = conn.execute(
                "INSERT INTO audit_log (id, timestamp, workflow_id, run_id, step_name, action_type, policy_id, policy_name, decision, reason, context_url, tokens_requested)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                rusqlite::params![
                    id, now,
                    ctx.workflow_id, ctx.run_id, ctx.step_name, ctx.action_type,
                    policy.id, policy.name,
                    decision_str, reason,
                    ctx.url, ctx.tokens_requested
                ],
            );
        }
    }
}

fn match_effect(effect: &str, reason: String, policy_id: &str) -> PolicyDecision {
    match effect {
        "block" => PolicyDecision::Block { reason, policy_id: policy_id.to_string() },
        "warn"  => PolicyDecision::Warn  { reason, policy_id: policy_id.to_string() },
        _       => PolicyDecision::Allow,
    }
}

// ─── PII Firewall & Security ───────────────────────────────────────────────────

pub struct PromptFirewallResult {
    pub scrubbed_prompt: String,
    pub pii_count: usize,
    pub blocked: bool,
    pub block_reason: Option<String>,
}

pub fn inspect_and_scrub_prompt(
    pool: &DbPool,
    workflow_id: &str,
    run_id: &str,
    step_name: &str,
    prompt: &str,
) -> PromptFirewallResult {
    let mut pii_count = 0;
    
    // 1. Detect SSN
    let ssn_re = regex::Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap();
    pii_count += ssn_re.find_iter(prompt).count();
    let prompt = ssn_re.replace_all(prompt, "[SSN_REDACTED]").to_string();

    // 2. Detect Emails
    let email_re = regex::Regex::new(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}").unwrap();
    pii_count += email_re.find_iter(&prompt).count();
    let prompt = email_re.replace_all(&prompt, "[EMAIL_REDACTED]").to_string();

    // 3. Detect Phone numbers
    let phone_re = regex::Regex::new(r"(\+?[\d\s\-().]{7,15}\d)").unwrap();
    pii_count += phone_re.find_iter(&prompt).count();
    let prompt = phone_re.replace_all(&prompt, "[PHONE_REDACTED]").to_string();

    // 4. Detect Credit Cards
    let cc_re = regex::Regex::new(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b").unwrap();
    pii_count += cc_re.find_iter(&prompt).count();
    let prompt = cc_re.replace_all(&prompt, "[CC_REDACTED]").to_string();

    // 5. Detect potential API Keys
    let api_key_re = regex::Regex::new(r"\b(sk-[a-zA-Z0-9]{20,40}|gapi-[a-zA-Z0-9]{20,40})\b").unwrap();
    pii_count += api_key_re.find_iter(&prompt).count();
    let prompt = api_key_re.replace_all(&prompt, "[API_KEY_REDACTED]").to_string();

    // 6. Stage 1 Injection & Jailbreak detection
    let injection_re = regex::Regex::new(r"(?i)(ignore previous instructions|system override|jailbreak|you are now mode|do anything now|dan mode|developer mode)").unwrap();
    let injection_detected = injection_re.is_match(&prompt);

    let blocked = pii_count > 0 || injection_detected;
    let block_reason = if injection_detected {
        Some("Prompt blocked: potential prompt injection / jailbreak payload detected.".to_string())
    } else if pii_count > 0 {
        Some(format!("Prompt blocked: PII prompt firewall block ({} matches found)", pii_count))
    } else {
        None
    };

    // Log to SQLite Audit database
    if let Ok(conn) = pool.get() {
        let audit_id = crate::utils::id::new_id();
        let now = Utc::now().to_rfc3339();
        let decision = if blocked { "block" } else { "allow" };
        let execution_blocked_int = if blocked { 1 } else { 0 };

        let _ = conn.execute(
            "INSERT INTO audit_log (id, timestamp, workflow_id, run_id, step_name, action_type, decision, reason, pii_detected_count, execution_blocked)
             VALUES (?1, ?2, ?3, ?4, ?5, 'ask_ai', ?6, ?7, ?8, ?9)",
            rusqlite::params![
                audit_id, now, workflow_id, run_id, step_name,
                decision, block_reason.clone().unwrap_or_else(|| "Passed input checks".to_string()), pii_count as i64, execution_blocked_int
            ],
        );
    }

    PromptFirewallResult {
        scrubbed_prompt: prompt,
        pii_count,
        blocked,
        block_reason,
    }
}

// Stage 2 — Retrieval Policy Engine (HIPAA / Residency Checks)
pub fn inspect_retrieval_context(
    pool: &DbPool,
    workflow_id: &str,
    run_id: &str,
    step_name: &str,
    context: &str,
) -> String {
    // Basic HIPAA scanning: Redact Medical Record Numbers (MRN) or PHI markers
    let phi_re = regex::Regex::new(r"(?i)\b(mrn-\d{5,10}|medical record|patient name:|phi:)\b").unwrap();
    let has_phi = phi_re.is_match(context);
    
    let result_text = if has_phi {
        phi_re.replace_all(context, "[PHI_REDACTED_BY_GOVERNANCE]").to_string()
    } else {
        context.to_string()
    };

    if has_phi {
        if let Ok(conn) = pool.get() {
            let audit_id = crate::utils::id::new_id();
            let now = Utc::now().to_rfc3339();
            let _ = conn.execute(
                "INSERT INTO audit_log (id, timestamp, workflow_id, run_id, step_name, action_type, decision, reason, pii_detected_count, execution_blocked)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'retrieval_context', 'warn', 'PHI/HIPAA data scrubbed from context', 1, 0)",
                rusqlite::params![audit_id, now, workflow_id, run_id, step_name],
            );
        }
    }

    result_text
}

// Stage 3 — Output Policy Engine (Safety and Leak Protection)
pub fn inspect_model_output(
    pool: &DbPool,
    workflow_id: &str,
    run_id: &str,
    step_name: &str,
    output: &str,
) -> Result<String, String> {
    // 1. Detect if model leaks secrets (e.g. standard private key headers)
    let secret_re = regex::Regex::new(r"(?i)(-----BEGIN PRIVATE KEY-----|client_secret|client_id|database_url)").unwrap();
    let leak_detected = secret_re.is_match(output);

    if leak_detected {
        if let Ok(conn) = pool.get() {
            let audit_id = crate::utils::id::new_id();
            let now = Utc::now().to_rfc3339();
            let _ = conn.execute(
                "INSERT INTO audit_log (id, timestamp, workflow_id, run_id, step_name, action_type, decision, reason, pii_detected_count, execution_blocked)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'ask_ai_output', 'block', 'Blocked response: Model output contained private credentials', 0, 1)",
                rusqlite::params![audit_id, now, workflow_id, run_id, step_name],
            );
        }
        return Err("Execution Blocked: Model response generated sensitive credential tokens or API keys.".to_string());
    }

    Ok(output.to_string())
}

pub fn filter_pii(text: &str) -> String {
    let email_re = regex::Regex::new(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}").unwrap();
    let result = email_re.replace_all(text, "[EMAIL_REDACTED]");
    let phone_re = regex::Regex::new(r"(\+?[\d\s\-().]{7,15}\d)").unwrap();
    let result = phone_re.replace_all(&result, "[PHONE_REDACTED]");
    let cc_re = regex::Regex::new(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b").unwrap();
    cc_re.replace_all(&result, "[CC_REDACTED]").to_string()
}

// ─── Keyring Secure Storage Integration ──────────────────────────────────────────

pub fn store_secure_credential(service: &str, username: &str, secret: &str) -> Result<()> {
    let entry = keyring::Entry::new(service, username)?;
    entry.set_password(secret)?;
    Ok(())
}

pub fn get_secure_credential(service: &str, username: &str) -> Result<String> {
    let entry = keyring::Entry::new(service, username)?;
    let secret = entry.get_password()?;
    Ok(secret)
}

pub fn delete_secure_credential(service: &str, username: &str) -> Result<()> {
    let entry = keyring::Entry::new(service, username)?;
    entry.delete_password()?;
    Ok(())
}
