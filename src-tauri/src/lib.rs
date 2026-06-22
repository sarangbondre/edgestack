use tauri::Manager;

pub mod commands;
pub mod db;
pub mod models;
pub mod services;
pub mod utils;

pub use models::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Init filesystem layout (~/edgestack/)
            utils::fs::ensure_app_dirs()?;

            // Init SQLite database
            let pool = db::init_pool()?;
            db::run_migrations(&pool)?;

            // Audit chain integrity check on startup
            match db::audit_chain::verify_audit_integrity(&pool) {
                Ok(true) => println!("Audit log integrity verified successfully."),
                Ok(false) => {
                    eprintln!("AUDIT_INTEGRITY_VIOLATION: Audit chain has been tampered with!");
                    panic!("AUDIT_INTEGRITY_VIOLATION: Tampering detected in system audit logs. Halting execution.");
                }
                Err(e) => {
                    eprintln!("Failed to verify audit log integrity: {}", e);
                }
            }

            // Verify policy signatures in policies/ folder
            let policies_dir = utils::fs::app_dir().join("policies");
            if let Ok(entries) = std::fs::read_dir(&policies_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let path = entry.path();
                    if path.extension().map_or(false, |ext| ext == "yaml" || ext == "yml") {
                        if let Err(e) = services::policy_signature::load_and_verify_policy_file(&pool, &path) {
                            eprintln!("POLICY_TAMPER: Policy verification failed for {:?}: {}", path, e);
                            panic!("POLICY_TAMPER: Failed to verify integrity of policy files: {}", e);
                        }
                    }
                }
            }

            let pool_arc = std::sync::Arc::new(pool);

            // Store pool in app state
            app.manage(pool_arc.clone());

            // Init centralized SQLite writer
            let writer = db::writer::DbWriter::new(pool_arc.clone());
            let writer_arc = std::sync::Arc::new(writer);
            app.manage(writer_arc.clone());

            // Copy default assets if first launch
            utils::fs::copy_default_assets()?;

            // Start background services (non-blocking)
            let app_for_services = app_handle.clone();
            let pool_for_services = pool_arc.clone();
            tauri::async_runtime::spawn(async move {
                // 1. Start Telemetry collector loop (10s interval)
                services::telemetry_collector::start_telemetry_collector(pool_for_services.clone());

                // 2. Start Cost analytics loop (60s interval)
                services::cost_analytics::start_cost_analytics(pool_for_services.clone());

                // 3. Start Workflow Scheduler loop (15s interval)
                services::scheduler::start_scheduler(pool_for_services.clone(), app_for_services);

                // 3. Start Floci JVM subprocess (port 4568)
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                if let Err(e) = services::floci_manager::start_floci().await {
                    println!("Failed to start Floci JVM subprocess: {}", e);
                }

                // 4. Start Bedrock AI Bridge Proxy Interceptor (port 4566)
                if let Err(e) = services::bedrock_interceptor::start_interceptor().await {
                    println!("Failed to start Bedrock Proxy Interceptor: {}", e);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Setup
            commands::setup::scan_hardware,
            commands::setup::get_model_recommendations,
            commands::setup::save_setup_config,
            commands::setup::is_setup_complete,
            // Inference / Ollama
            commands::inference::check_ollama,
            commands::inference::pull_model,
            commands::inference::list_models,
            commands::inference::generate,
            commands::inference::run_benchmark,
            commands::inference::generate_chat_response,
            // Workflows
            commands::workflow::create_workflow,
            commands::workflow::update_workflow,
            commands::workflow::list_workflows,
            commands::workflow::get_workflow,
            commands::workflow::delete_workflow,
            commands::workflow::run_workflow,
            commands::workflow::list_runs,
            commands::workflow::list_all_runs,
            commands::workflow::get_run,
            commands::workflow::validate_workflow_dag_cmd,
            // Failure & Circuit Breaker
            commands::failure::record_human_action,
            commands::failure::get_failure_review,
            commands::failure::get_circuit_breaker_state,
            commands::failure::list_notifications,
            commands::failure::mark_all_notifications_read,
            // Vault
            commands::vault::list_vaults,
            commands::vault::list_vault_objects,
            commands::vault::create_vault,
            commands::vault::delete_vault_object,
            commands::vault::import_file_to_vault,
            commands::vault::download_vault_object,
            // Compute
            commands::compute::list_instances,
            commands::compute::create_instance,
            commands::compute::start_instance,
            commands::compute::stop_instance,
            commands::compute::restart_instance,
            commands::compute::delete_instance,
            commands::compute::list_active_containers,
            commands::compute::get_compute_telemetry,
            commands::compute::execute_container_command,
            // Costs
            commands::cost::get_cost_summary,
            commands::cost::get_cost_history,
            commands::cost::update_electricity_rate,
            // Settings
            commands::settings::get_config,
            commands::settings::update_config,
            commands::settings::store_secret,
            commands::settings::get_secret_names,
            commands::settings::delete_secret,
            // Telemetry
            commands::telemetry::get_agent_metrics,
            // Governance & Compliance
            commands::governance::list_policies,
            commands::governance::create_policy,
            commands::governance::update_policy,
            commands::governance::toggle_policy,
            commands::governance::delete_policy,
            commands::governance::list_audit_log,
            commands::governance::get_compliance_summary,
            commands::governance::export_policies_yaml,
            commands::governance::export_audit_chain_json,
            commands::governance::verify_audit_chain_integrity_cmd,
            commands::governance::explain_retrieval_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running EdgeStack");
}
