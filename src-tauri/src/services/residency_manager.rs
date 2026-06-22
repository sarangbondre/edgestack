use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use anyhow::Result;
use once_cell::sync::Lazy;
use serde_json::json;
use crate::db::DbPool;
use crate::services::sandboxed_runner::SandboxedModelSession;

#[derive(Clone)]
pub struct ResidentModel {
    pub model_id: String,
    pub ref_count: usize,
    pub last_used: Instant,
    pub session: Arc<SandboxedModelSession>,
}

pub struct ModelResidencyManager {
    registry: Mutex<HashMap<String, ResidentModel>>,
}

static MANAGER: Lazy<ModelResidencyManager> = Lazy::new(|| ModelResidencyManager {
    registry: Mutex::new(HashMap::new()),
});

impl ModelResidencyManager {
    pub fn get_instance() -> &'static Self {
        &MANAGER
    }

    pub fn acquire_model(
        &self,
        app: tauri::AppHandle,
        pool: Arc<DbPool>,
        model_id: &str,
        binary_path: &str,
    ) -> Result<Arc<SandboxedModelSession>> {
        let mut registry = self.registry.lock().unwrap();

        // 1. Check if model is already loaded
        if let Some(entry) = registry.get_mut(model_id) {
            entry.ref_count += 1;
            entry.last_used = Instant::now();
            println!("[ResidencyManager] Model '{}' already loaded. Incremented ref_count to {}.", model_id, entry.ref_count);
            return Ok(entry.session.clone());
        }

        // 2. Resource Enforcer: Perform LRU Eviction if memory limit exceeded
        self.enforce_residency_limits(&mut registry);

        // 3. Load model weights
        let session = SandboxedModelSession::spawn_session(app, pool, model_id, binary_path)?;
        let session_arc = Arc::new(session);

        let resident = ResidentModel {
            model_id: model_id.to_string(),
            ref_count: 1,
            last_used: Instant::now(),
            session: session_arc.clone(),
        };

        registry.insert(model_id.to_string(), resident);
        println!("[ResidencyManager] Model '{}' loaded and registered.", model_id);
        Ok(session_arc)
    }

    pub fn release_model(&self, model_id: &str) {
        let mut registry = self.registry.lock().unwrap();
        if let Some(entry) = registry.get_mut(model_id) {
            if entry.ref_count > 0 {
                entry.ref_count -= 1;
                println!("[ResidencyManager] Released model '{}'. Ref count: {}", model_id, entry.ref_count);

                if entry.ref_count == 0 {
                    // Schedule lazy eviction after idle timeout (e.g., 5 seconds for testing/concurrency)
                    let model_str = model_id.to_string();
                    tokio::spawn(async move {
                        tokio::time::sleep(Duration::from_secs(5)).await;
                        Self::get_instance().check_idle_eviction(&model_str);
                    });
                }
            }
        }
    }

    fn check_idle_eviction(&self, model_id: &str) {
        let mut registry = self.registry.lock().unwrap();
        let evict = if let Some(entry) = registry.get(model_id) {
            entry.ref_count == 0 && entry.last_used.elapsed() >= Duration::from_secs(5)
        } else {
            false
        };

        if evict {
            if let Some(entry) = registry.remove(model_id) {
                entry.session.terminate();
                println!("[ResidencyManager] Idle timeout reached. Evicted model '{}' from memory.", model_id);
            }
        }
    }

    fn enforce_residency_limits(&self, registry: &mut HashMap<String, ResidentModel>) {
        let max_loaded_models = 2; // Keep max 2 active models loaded concurrently to prevent OOM
        if registry.len() < max_loaded_models {
            return;
        }

        // Locate Least Recently Used (LRU) model with zero active references
        let mut lru_model_id: Option<String> = None;
        let mut oldest_use = Instant::now();

        for (id, entry) in registry.iter() {
            if entry.ref_count == 0 && entry.last_used < oldest_use {
                oldest_use = entry.last_used;
                lru_model_id = Some(id.clone());
            }
        }

        if let Some(evict_id) = lru_model_id {
            if let Some(entry) = registry.remove(&evict_id) {
                entry.session.terminate();
                println!("[ResidencyManager] Memory threshold met. LRU evicting model '{}' from registry.", evict_id);
            }
        }
    }

    pub fn get_residency_telemetry(&self) -> serde_json::Value {
        let registry = self.registry.lock().unwrap();
        let mut list = Vec::new();

        for (id, entry) in registry.iter() {
            list.push(json!({
                "model_id": id,
                "ref_count": entry.ref_count,
                "elapsed_since_use_secs": entry.last_used.elapsed().as_secs()
            }));
        }

        json!({
            "loaded_models_count": registry.len(),
            "resident_models": list
        })
    }
}
