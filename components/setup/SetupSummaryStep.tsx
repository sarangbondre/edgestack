"use client";

import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { Alert } from "../ui/Alert";
import { CheckCircle2, Shield, BatteryCharging, Gauge } from "lucide-react";
import { useRouter } from "next/navigation";

interface HardwareProfile {
  cpu_cores: number;
  ram_total_gb: number;
  tier: string;
}

interface ModelOption {
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

interface SetupSummaryStepProps {
  hardwareProfile: HardwareProfile;
  selectedModel: ModelOption;
  benchmarkResult: BenchmarkResult;
  resourceConfig: ResourceConfig;
  onBack: () => void;
}

export const SetupSummaryStep: React.FC<SetupSummaryStepProps> = ({
  hardwareProfile,
  selectedModel,
  benchmarkResult,
  resourceConfig,
  onBack,
}) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const fetchAiSummary = async () => {
      try {
        setLoading(true);
        const prompt = `
          You are a precise setup assistant for EdgeStack.
          Summarize this local AI node configuration in 3 short, encouraging sentences for a business founder.
          
          Hardware Tier: ${hardwareProfile.tier} (${hardwareProfile.cpu_cores} Cores, ${hardwareProfile.ram_total_gb.toFixed(0)} GB RAM).
          Allocated limits: ${resourceConfig.cpuCores} Cores, ${resourceConfig.memoryGb} GB RAM, ${resourceConfig.diskGb} GB Storage.
          Local model: ${selectedModel.display_name} running at ${benchmarkResult.tokens_per_second.toFixed(1)} tokens per second with ${benchmarkResult.first_token_ms}ms first-token response latency.
          Local electricity rate: $${resourceConfig.electricityRate.toFixed(2)} per kWh.
          
          In the sentences, highlight that:
          1. Their system is fully prepared to run private workflows.
          2. Explain that local execution costs only pennies of electricity (specifically mention estimated cost of less than a few cents per 1,000 queries at their rate of $${resourceConfig.electricityRate.toFixed(2)}/kWh).
          3. Reassure them that their data remains completely secure and local on their device, with $0 cloud API subscription bills.
          
          Do not include any headers, greeting, or wrapping markers. Start directly with the summary text.
        `;

        const res: { text: string } = await invoke("generate", { prompt });
        setAiSummary(res.text.trim());
        setLoading(false);
      } catch (e) {
        console.error("AI Summary generation failed:", e);
        // Fallback summary
        setAiSummary(
          `Your setup is complete! EdgeStack is configured to run ${selectedModel.display_name} locally on your ${hardwareProfile.tier}-tier machine. ` +
          `Using ${resourceConfig.cpuCores} CPU cores and ${resourceConfig.memoryGb} GB RAM, you will experience fast, private inference of ~${benchmarkResult.responses_per_minute} responses/minute ` +
          `at your electricity rate of $${resourceConfig.electricityRate.toFixed(2)}/kWh, with zero recurring cloud API subscription bills.`
        );
        setLoading(false);
      }
    };
    fetchAiSummary();
  }, [hardwareProfile, selectedModel, benchmarkResult, resourceConfig]);

  const handleFinish = async () => {
    try {
      setSaving(true);
      await invoke("save_setup_config", {
        model: selectedModel.ollama_tag,
        cpuCores: resourceConfig.cpuCores,
        memoryGb: resourceConfig.memoryGb,
        diskGb: resourceConfig.diskGb,
        electricityRate: resourceConfig.electricityRate,
      });
      // Redirect to main page
      router.push("/");
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.toString() || "Failed to save configuration.");
      setSaving(false);
    }
  };

  return (
    <div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 text-center flex items-center justify-center gap-1.5">
        <CheckCircle2 className="h-5 w-5 text-green-500" /> Setup Summary
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 text-center">
        Your private AI node is ready. Review your setup profile and launch the hub.
      </p>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-10 border border-gray-150 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 rounded-xl mb-6">
          <Spinner size="md" className="mb-2" />
          <span className="text-xs text-gray-500 dark:text-gray-400">AI is analyzing configuration...</span>
        </div>
      ) : (
        <div className="space-y-4 mb-6">
          {/* AI generated paragraph */}
          <div className="p-4 bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-xl">
            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-relaxed">
              {aiSummary}
            </p>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 border border-gray-250 dark:border-gray-800 rounded-lg text-center">
              <Gauge className="h-4 w-4 mx-auto text-primary mb-1.5" />
              <div className="text-[10px] text-gray-500 dark:text-gray-400">Response Speed</div>
              <div className="text-xs font-bold text-gray-950 dark:text-white mt-0.5">
                {benchmarkResult.tokens_per_second.toFixed(1)} t/s
              </div>
            </div>
            <div className="p-3 border border-gray-250 dark:border-gray-800 rounded-lg text-center">
              <BatteryCharging className="h-4 w-4 mx-auto text-amber-500 mb-1.5" />
              <div className="text-[10px] text-gray-500 dark:text-gray-400">Energy Cost</div>
              <div className="text-xs font-bold text-gray-950 dark:text-white mt-0.5">
                Low (Pennies)
              </div>
            </div>
            <div className="p-3 border border-gray-250 dark:border-gray-800 rounded-lg text-center">
              <Shield className="h-4 w-4 mx-auto text-emerald-500 mb-1.5" />
              <div className="text-[10px] text-gray-500 dark:text-gray-400">Data Privacy</div>
              <div className="text-xs font-bold text-gray-950 dark:text-white mt-0.5">
                100% Local
              </div>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <Alert variant="error" title="Saving Error" className="mb-4">
          {errorMsg}
        </Alert>
      )}

      <div className="flex gap-3">
        <Button onClick={onBack} variant="secondary" disabled={saving} className="flex-1 justify-center">
          Back
        </Button>
        <Button onClick={handleFinish} loading={saving} className="flex-1 justify-center btn-primary">
          Open EdgeStack
        </Button>
      </div>
    </div>
  );
};
