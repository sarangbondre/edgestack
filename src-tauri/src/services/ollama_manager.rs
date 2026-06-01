use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use crate::utils::fs::app_dir;

static OLLAMA_CHILD: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));

pub async fn start_ollama() -> Result<()> {
    // 1. Check if already running
    if check_port_in_use(11434) {
        println!("Ollama is already running on port 11434");
        return Ok(());
    }

    let bin_path = app_dir().join("bin").join("ollama");

    // 2. Download if not exists
    if !bin_path.exists() {
        println!("Downloading Ollama binary for macOS...");
        let url = "https://github.com/ollama/ollama/releases/download/v0.3.14/ollama-darwin";
        match reqwest::get(url).await {
            Ok(resp) => {
                if resp.status().is_success() {
                    let bytes = resp.bytes().await?;
                    std::fs::write(&bin_path, bytes)?;
                    
                    // Set executable permissions on macOS/Linux
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        if let Ok(metadata) = std::fs::metadata(&bin_path) {
                            let mut perms = metadata.permissions();
                            perms.set_mode(0o755); // executable
                            let _ = std::fs::set_permissions(&bin_path, perms);
                        }
                    }
                    println!("Ollama binary downloaded successfully to {:?}", bin_path);
                } else {
                    println!("Failed to download Ollama: HTTP {}", resp.status());
                }
            }
            Err(e) => {
                println!("Network error downloading Ollama: {}", e);
            }
        }
    }

    if !bin_path.exists() {
        return Err(anyhow!("Ollama binary is missing at {:?}", bin_path));
    }

    // 3. Spawn child process
    let mut child = Command::new(&bin_path)
        .arg("serve")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // 4. Wait for response
    let mut success = false;
    for _ in 0..15 {
        tokio::time::sleep(Duration::from_secs(1)).await;
        if check_port_in_use(11434) {
            success = true;
            break;
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(anyhow!("Ollama serve process exited early with status: {}", status));
        }
    }

    if success {
        let mut guard = OLLAMA_CHILD.lock().unwrap();
        *guard = Some(child);
        println!("Ollama serve successfully started on port 11434");
        Ok(())
    } else {
        let _ = child.kill();
        Err(anyhow!("Timed out waiting for Ollama to start on port 11434"))
    }
}

pub fn stop_ollama() {
    let mut guard = OLLAMA_CHILD.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        println!("Ollama serve subprocess stopped");
    }
}

fn check_port_in_use(port: u16) -> bool {
    std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}
