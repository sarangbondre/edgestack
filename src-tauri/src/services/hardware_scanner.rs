use anyhow::Result;
use sysinfo::{System, Disks};
use crate::models::HardwareProfile;

pub fn scan() -> Result<HardwareProfile> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_cores = sys.cpus().len() as u32;
    let cpu_brand = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());

    let ram_total_gb = sys.total_memory() as f64 / 1_073_741_824.0;
    let ram_available_gb = sys.available_memory() as f64 / 1_073_741_824.0;

    // GPU detection via CPU brand / environment heuristics
    let (gpu_vendor, gpu_vram_gb) = detect_gpu(&cpu_brand);

    // Disk space
    let disks = Disks::new_with_refreshed_list();
    let (disk_free_gb, _disk_total_gb) = disks
        .iter()
        .max_by_key(|d| d.total_space())
        .map(|d| {
            (
                d.available_space() as f64 / 1_073_741_824.0,
                d.total_space() as f64 / 1_073_741_824.0,
            )
        })
        .unwrap_or((50.0, 100.0));

    // Determine overall tier
    let tier = compute_tier(cpu_cores, ram_total_gb);

    Ok(HardwareProfile {
        // CPU
        cpu_label: format!("{}-core {} — great for AI", cpu_cores, cpu_brand),
        cpu_tier: if cpu_cores >= 8 { "STRONG".into() } else if cpu_cores >= 4 { "GOOD".into() } else { "CAPABLE".into() },
        // RAM
        ram_label: format!("{:.0} GB — handles {} models", ram_total_gb, ram_tier_label(ram_total_gb)),
        ram_tier: ram_tier_tag(ram_total_gb).into(),
        // GPU
        gpu_label: format!("{} — {}", gpu_vendor, gpu_speed_label(&gpu_vendor)),
        gpu_tier: if gpu_vendor != "None" { "AVAILABLE".into() } else { "CPU ONLY".into() },
        // Disk
        disk_label: format!("{:.0} GB free — we'll use up to 20 GB", disk_free_gb),
        disk_tier: if disk_free_gb > 50.0 { "PLENTY OF ROOM".into() } else if disk_free_gb > 20.0 { "ENOUGH SPACE".into() } else { "LIMITED".into() },
        // Raw values
        cpu_cores,
        cpu_brand,
        ram_total_gb,
        ram_available_gb,
        gpu_vendor,
        gpu_vram_gb,
        disk_free_gb,
        tier,
    })
}

fn detect_gpu(cpu_brand: &str) -> (String, f64) {
    let brand_lower = cpu_brand.to_lowercase();
    if brand_lower.contains("apple") || brand_lower.contains("m1") || brand_lower.contains("m2") || brand_lower.contains("m3") || brand_lower.contains("m4") {
        ("Apple Neural Engine".into(), 0.0)
    } else {
        // Try to detect NVIDIA/AMD via environment or system info
        if std::env::var("CUDA_VISIBLE_DEVICES").is_ok() {
            ("NVIDIA GPU".into(), 8.0)
        } else {
            ("None (CPU only)".into(), 0.0)
        }
    }
}

fn compute_tier(cores: u32, ram_gb: f64) -> String {
    if cores >= 8 && ram_gb >= 16.0 {
        "Excellent".into()
    } else if cores >= 4 && ram_gb >= 8.0 {
        "Good".into()
    } else if ram_gb >= 4.0 {
        "Capable".into()
    } else {
        "Minimal".into()
    }
}

fn ram_tier_label(ram_gb: f64) -> &'static str {
    if ram_gb >= 32.0 { "all" }
    else if ram_gb >= 16.0 { "advanced" }
    else if ram_gb >= 8.0 { "most" }
    else { "basic" }
}

fn ram_tier_tag(ram_gb: f64) -> &'static str {
    if ram_gb >= 16.0 { "EXCELLENT" }
    else if ram_gb >= 8.0 { "GOOD" }
    else if ram_gb >= 4.0 { "ADEQUATE" }
    else { "LIMITED" }
}

fn gpu_speed_label(vendor: &str) -> &'static str {
    if vendor.contains("Apple") { "AI will run fast" }
    else if vendor.contains("NVIDIA") { "CUDA acceleration available" }
    else if vendor.contains("AMD") { "ROCm acceleration available" }
    else { "CPU inference mode" }
}
