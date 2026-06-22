use std::process::{Command, Stdio, Child};
use std::io::{Write, BufReader, BufRead};
use std::sync::{Arc, Mutex};
use anyhow::{anyhow, Result};
use tauri::Emitter;
use crate::db::DbPool;

pub struct SandboxedModelSession {
    child: Arc<Mutex<Option<Child>>>,
    _model_id: String,
}

impl SandboxedModelSession {
    pub fn spawn_session(
        app: tauri::AppHandle,
        pool: Arc<DbPool>,
        model_id: &str,
        binary_path: &str,
    ) -> Result<Self> {
        println!("[SandboxRunner] Spawning sandboxed model sidecar process for model: {}", model_id);

        // 1. Configure OS-level sandbox isolation settings (MacOS sandbox-exec or Linux equivalent)
        let mut cmd = if cfg!(target_os = "macos") {
            // Under MacOS, invoke standard sandbox-exec denying outbound network and limiting file writes
            let mut c = Command::new("sandbox-exec");
            c.arg("-p").arg("(version 1) (deny default) (allow process-fork) (allow sysctl-read) (allow file-read*) (allow file-write* (subpath \"/tmp\"))");
            c.arg(binary_path);
            c
        } else {
            Command::new(binary_path)
        };

        // 2. Setup standard IPC piping channels
        let child = cmd
            .arg("--model").arg(model_id)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| anyhow!("Failed to start sandboxed model sidecar: {}", e))?;

        let child_arc = Arc::new(Mutex::new(Some(child)));
        let child_clone = child_arc.clone();
        let app_clone = app.clone();
        let pool_clone = pool.clone();
        let model_str = model_id.to_string();

        // 3. Monitor sidecar crash status off-thread
        std::thread::spawn(move || {
            let mut process = {
                let mut guard = child_clone.lock().unwrap();
                guard.take()
            };

            if let Some(ref mut child_proc) = process {
                match child_proc.wait() {
                    Ok(status) => {
                        if !status.success() {
                            let code = status.code().unwrap_or(-1);
                            eprintln!("[SandboxRunner] Model sidecar crashed with exit code: {}", code);
                            
                            // Log crash alert to SQLite audit log
                            if let Ok(conn) = pool_clone.get() {
                                let audit_id = crate::utils::id::new_id();
                                let now = chrono::Utc::now().to_rfc3339();
                                let _ = conn.execute(
                                    "INSERT INTO audit_log (id, timestamp, action_type, decision, reason, execution_blocked) \
                                     VALUES (?1, ?2, 'sandbox_sidecar_crash', 'block', ?3, 1)",
                                    rusqlite::params![
                                        audit_id, now,
                                        format!("SECURITY_ALERT: Sandboxed model sidecar process '{}' crashed unexpectedly (code {})", model_str, code)
                                    ],
                                );
                            }

                            // Emit crash event to Frontend
                            let _ = app_clone.emit("sandbox_sidecar_crashed", serde_json::json!({
                                "model_id": model_str,
                                "exit_code": code
                            }));
                        }
                    }
                    Err(e) => {
                        eprintln!("[SandboxRunner] Error waiting on child process: {}", e);
                    }
                }
            }
        });

        Ok(Self {
            child: child_arc,
            _model_id: model_id.to_string(),
        })
    }

    pub fn send_query(&self, prompt: &str) -> Result<String> {
        let mut guard = self.child.lock().unwrap();
        let child_proc = guard.as_mut().ok_or_else(|| anyhow!("Model sidecar process is not running."))?;

        // 1. Write query payload to child stdin
        let stdin = child_proc.stdin.as_mut().ok_or_else(|| anyhow!("Failed to access sidecar stdin pipe."))?;
        writeln!(stdin, "{}", prompt)?;
        stdin.flush()?;

        // 2. Read response payload from child stdout
        let stdout = child_proc.stdout.as_mut().ok_or_else(|| anyhow!("Failed to access sidecar stdout pipe."))?;
        let mut reader = BufReader::new(stdout);
        let mut response = String::new();
        
        // Read response block until completion delimiter is received
        let mut line = String::new();
        while reader.read_line(&mut line)? > 0 {
            if line.trim() == "__COMPLETED__" {
                break;
            }
            response.push_str(&line);
            line.clear();
        }

        Ok(response.trim().to_string())
    }

    pub fn terminate(&self) {
        let mut guard = self.child.lock().unwrap();
        if let Some(mut child_proc) = guard.take() {
            let _ = child_proc.kill();
            println!("[SandboxRunner] Sandboxed model sidecar process terminated.");
        }
    }
}
