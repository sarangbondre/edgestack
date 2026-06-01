use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use crate::utils::fs::app_dir;

static FLOCI_CHILD: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));

pub async fn start_floci() -> Result<()> {
    let jar_path = app_dir().join("bin").join("floci.jar");
    
    // Download jar if not exists
    if !jar_path.exists() {
        println!("Downloading floci.jar...");
        let url = "https://github.com/floci-io/floci/releases/latest/download/floci.jar";
        // We will try to download, but if it fails (offline or no internet), we write a fallback warning log.
        match reqwest::get(url).await {
            Ok(resp) => {
                if resp.status().is_success() {
                    let bytes = resp.bytes().await?;
                    std::fs::write(&jar_path, bytes)?;
                    println!("floci.jar downloaded successfully to {:?}", jar_path);
                } else {
                    println!("Failed to download floci.jar from release: HTTP {}", resp.status());
                }
            }
            Err(e) => {
                println!("Network error downloading floci.jar: {}. Please ensure java and floci.jar are placed at {:?}", e, jar_path);
            }
        }
    }

    // Check if port 4568 is already in use
    if check_port_in_use(4568) {
        println!("Port 4568 is already in use, assuming Floci is running");
        return Ok(());
    }

    if !jar_path.exists() {
        return Err(anyhow!("floci.jar is missing at {:?}. Cannot start infrastructure emulator.", jar_path));
    }

    // Launch subprocess: java -jar ~/edgestack/bin/floci.jar --port 4568
    let mut child = Command::new("java")
        .arg("-jar")
        .arg(&jar_path)
        .env("PORT", "4568")
        .env("SERVICES", "all")
        .env("STORAGE_MODE", "hybrid")
        .env("DATA_DIR", app_dir().join("floci").to_string_lossy().to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // Wait and check health
    let mut success = false;
    for _ in 0..10 {
        tokio::time::sleep(Duration::from_secs(1)).await;
        if check_port_in_use(4568) {
            success = true;
            break;
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(anyhow!("Floci process exited early with status: {}", status));
        }
    }

    if success {
        let mut guard = FLOCI_CHILD.lock().unwrap();
        *guard = Some(child);
        println!("Floci successfully started on port 4568");
        Ok(())
    } else {
        let _ = child.kill();
        Err(anyhow!("Timed out waiting for Floci to start on port 4568"))
    }
}

pub fn stop_floci() {
    let mut guard = FLOCI_CHILD.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        println!("Floci subprocess stopped");
    }
}

fn check_port_in_use(port: u16) -> bool {
    std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}
