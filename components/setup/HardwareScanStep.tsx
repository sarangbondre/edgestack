"use client";

import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { Cpu, HardDrive, Layout, Shield } from "lucide-react";

interface HardwareProfile {
  cpu_cores: number;
  cpu_brand: string;
  ram_total_gb: number;
  ram_available_gb: number;
  gpu_vendor: string;
  gpu_vram_gb: number;
  disk_free_gb: number;
  tier: string;
  cpu_label: string;
  cpu_tier: string;
  ram_label: string;
  ram_tier: string;
  gpu_label: string;
  gpu_tier: string;
  disk_label: string;
  disk_tier: string;
}

interface HardwareScanStepProps {
  onNext: (profile: HardwareProfile) => void;
}

export const HardwareScanStep: React.FC<HardwareScanStepProps> = ({ onNext }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const performScan = async () => {
      try {
        // Wait at least 2 seconds for visual scanning effect
        const startTime = Date.now();
        const res: HardwareProfile = await invoke("scan_hardware");
        const duration = Date.now() - startTime;
        const delay = Math.max(2000 - duration, 0);

        setTimeout(() => {
          setProfile(res);
          setLoading(false);
        }, delay);
      } catch (e: any) {
        console.error(e);
        setError(e.toString() || "Failed to scan system hardware.");
        setLoading(false);
      }
    };
    performScan();
  }, []);

  const getTierColor = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case "excellent":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
      case "good":
        return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800";
      case "capable":
        return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
      default:
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Spinner size="lg" className="mb-6" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Analyzing System Hardware</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
          Scanning CPU cores, RAM limits, GPU vendor, and storage speed...
        </p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="text-center py-6">
        <div className="p-3 bg-red-100 rounded-full text-red-600 inline-block mb-4">
          <Shield className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Scan Failed</h3>
        <p className="text-sm text-red-500 mb-6">{error || "Could not read hardware profile."}</p>
        <Button onClick={() => { setLoading(true); setError(null); }} className="w-full justify-center">
          Retry Scan
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 text-center">Hardware Scan Complete</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">
        EdgeStack auto-configured for your device tier:{" "}
        <span className="font-semibold text-primary">{profile.tier}</span>.
      </p>

      <div className="space-y-3 mb-6">
        {/* CPU */}
        <div className="hw-card">
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-gray-500" />
            <div>
              <div className="font-medium text-sm text-gray-950 dark:text-white">{profile.cpu_brand}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{profile.cpu_cores} Cores available</div>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded border font-semibold ${getTierColor(profile.cpu_tier)}`}>
            {profile.cpu_label}
          </span>
        </div>

        {/* RAM */}
        <div className="hw-card">
          <div className="flex items-center gap-3">
            <Layout className="h-5 w-5 text-gray-500" />
            <div>
              <div className="font-medium text-sm text-gray-950 dark:text-white">System Memory</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {profile.ram_total_gb.toFixed(1)} GB Total ({profile.ram_available_gb.toFixed(1)} GB Available)
              </div>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded border font-semibold ${getTierColor(profile.ram_tier)}`}>
            {profile.ram_label}
          </span>
        </div>

        {/* GPU */}
        <div className="hw-card">
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-gray-500" />
            <div>
              <div className="font-medium text-sm text-gray-950 dark:text-white">Graphics Processing Unit</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {profile.gpu_vendor !== "None" ? `${profile.gpu_vendor} (${profile.gpu_vram_gb.toFixed(1)} GB VRAM)` : "Integrated / No discrete GPU"}
              </div>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded border font-semibold ${getTierColor(profile.gpu_tier)}`}>
            {profile.gpu_label}
          </span>
        </div>

        {/* Disk */}
        <div className="hw-card">
          <div className="flex items-center gap-3">
            <HardDrive className="h-5 w-5 text-gray-500" />
            <div>
              <div className="font-medium text-sm text-gray-950 dark:text-white">Available Disk Space</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {profile.disk_free_gb.toFixed(1)} GB Free Space
              </div>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded border font-semibold ${getTierColor(profile.disk_tier)}`}>
            {profile.disk_label}
          </span>
        </div>
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg mb-6">
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Configuration Recommendation:</span> Based on your tier, we recommend using the{" "}
          <span className="font-semibold text-primary">Balanced</span> or{" "}
          <span className="font-semibold text-primary">Quick</span> model for optimal latency.
        </p>
      </div>

      <Button onClick={() => onNext(profile)} className="w-full justify-center">
        Continue to Model Selection
      </Button>
    </div>
  );
};
