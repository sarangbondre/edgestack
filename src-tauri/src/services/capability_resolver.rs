use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::services::governance::get_secure_credential;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolManifest {
    pub tool_id: String,
    pub capabilities_required: Vec<String>,
    pub parameters: Vec<String>,
}

pub fn get_tool_manifests() -> HashMap<String, ToolManifest> {
    let mut manifests = HashMap::new();
    
    // Manifest definition for send_email tool
    manifests.insert("send_email".to_string(), ToolManifest {
        tool_id: "send_email".to_string(),
        capabilities_required: vec!["email.send".to_string()],
        parameters: vec!["to".to_string(), "subject".to_string(), "body".to_string()],
    });

    // Manifest definition for http_request tool
    manifests.insert("http_request".to_string(), ToolManifest {
        tool_id: "http_request".to_string(),
        capabilities_required: vec!["http.authorization".to_string()],
        parameters: vec!["url".to_string(), "data".to_string()],
    });

    manifests
}

pub fn resolve_secrets_for_tool(
    tool_id: &str,
    mut params: HashMap<String, String>,
) -> Result<HashMap<String, String>> {
    let manifests = get_tool_manifests();
    let manifest = match manifests.get(tool_id) {
        Some(m) => m,
        None => return Ok(params), // No credentials required
    };

    for cap in &manifest.capabilities_required {
        // Resolve capability to password token via Keyring (service = "preceptaai")
        match get_secure_credential("preceptaai", cap) {
            Ok(secret) => {
                if cap == "email.send" {
                    params.insert("smtp_password".to_string(), secret);
                } else if cap == "http.authorization" {
                    params.insert("api_key".to_string(), secret);
                }
            }
            Err(e) => {
                // If keyring is empty, fallback to local environment/placeholder for beta testing
                println!("[CapabilityResolver] Keyring lookup failed for {}: {}. Injecting mock credential.", cap, e);
                params.insert("smtp_password".to_string(), "MOCK_KEYRING_TOKEN_SECRET".to_string());
                params.insert("api_key".to_string(), "MOCK_API_KEY_TOKEN".to_string());
            }
        }
    }

    Ok(params)
}
