"use client";

import React, { useState } from "react";
import { WelcomeStep } from "../../components/setup/WelcomeStep";
import { HardwareScanStep } from "../../components/setup/HardwareScanStep";
import { ModelSelectionStep } from "../../components/setup/ModelSelectionStep";
import { DownloadBenchmarkStep } from "../../components/setup/DownloadBenchmarkStep";
import { ResourceAllocationStep } from "../../components/setup/ResourceAllocationStep";
import { SetupSummaryStep } from "../../components/setup/SetupSummaryStep";

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

interface ModelOption {
  id: string;
  display_name: string;
  ollama_tag: string;
}

interface BenchmarkResult {
  tokens_per_second: number;
  first_token_ms: number;
  responses_per_minute: number;
}

interface ResourceConfig {
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  electricityRate: number;
}

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [resourceConfig, setResourceConfig] = useState<ResourceConfig | null>(null);

  const handleWelcomeNext = () => setStep(2);

  const handleScanNext = (profile: HardwareProfile) => {
    setHardwareProfile(profile);
    setStep(3);
  };

  const handleModelNext = (model: ModelOption) => {
    setSelectedModel(model);
    setStep(4);
  };

  const handleDownloadNext = (result: BenchmarkResult) => {
    setBenchmarkResult(result);
    setStep(5);
  };

  const handleResourceNext = (config: ResourceConfig) => {
    setResourceConfig(config);
    setStep(6);
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const renderStepDot = (dotIndex: number) => {
    if (step === dotIndex) return <div key={dotIndex} className="wizard-step-dot active" />;
    if (step > dotIndex) return <div key={dotIndex} className="wizard-step-dot done" />;
    return <div key={dotIndex} className="wizard-step-dot upcoming" />;
  };

  return (
    <div className="wizard-container font-sans">
      <div className="wizard-card">
        {/* Step dots */}
        <div className="wizard-step-indicator">
          {[1, 2, 3, 4, 5, 6].map((i) => renderStepDot(i))}
        </div>

        {/* Render current step component */}
        {step === 1 && <WelcomeStep onNext={handleWelcomeNext} />}
        {step === 2 && <HardwareScanStep onNext={handleScanNext} />}
        {step === 3 && (
          <ModelSelectionStep
            ramGb={hardwareProfile?.ram_total_gb || 8.0}
            onNext={handleModelNext}
            onBack={handleBack}
          />
        )}
        {step === 4 && selectedModel && (
          <DownloadBenchmarkStep
            selectedModel={selectedModel}
            onNext={handleDownloadNext}
            onBack={handleBack}
          />
        )}
        {step === 5 && hardwareProfile && (
          <ResourceAllocationStep
            hardwareProfile={hardwareProfile}
            onNext={handleResourceNext}
            onBack={handleBack}
          />
        )}
        {step === 6 && hardwareProfile && selectedModel && benchmarkResult && resourceConfig && (
          <SetupSummaryStep
            hardwareProfile={hardwareProfile}
            selectedModel={selectedModel}
            benchmarkResult={benchmarkResult}
            resourceConfig={resourceConfig}
            onBack={handleBack}
          />
        )}
      </div>
    </div>
  );
}
