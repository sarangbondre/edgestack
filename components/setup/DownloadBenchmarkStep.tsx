"use client";

import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import { Alert } from "../ui/Alert";
import { Spinner } from "../ui/Spinner";
import { Play } from "lucide-react";

interface ModelOption {
  id: string;
  display_name: string;
  ollama_tag: string;
}

interface BenchmarkResult {
  model_name: string;
  tokens_per_second: number;
  first_token_ms: number;
  memory_used_gb: number;
  cpu_pct: number;
  responses_per_minute: number;
}

interface DownloadBenchmarkStepProps {
  selectedModel: ModelOption;
  onNext: (result: BenchmarkResult) => void;
  onBack: () => void;
}

export const DownloadBenchmarkStep: React.FC<DownloadBenchmarkStepProps> = ({
  selectedModel,
  onNext,
  onBack,
}) => {
  const [phase, setPhase] = useState<"checking" | "pulling" | "benchmarking" | "done" | "error">("checking");
  const [statusText, setStatusText] = useState("Checking AI Engine connection...");
  const [downloadPct, setDownloadPct] = useState(0);
  const [benchmarkStep, setBenchmarkStep] = useState(0);
  const [benchmarkTotal, setBenchmarkTotal] = useState(5);
  const [benchmarkLabel, setBenchmarkLabel] = useState("");
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let unlistenDownload: (() => void) | null = null;
    let unlistenBenchmark: (() => void) | null = null;

    const runProcess = async () => {
      try {
        // 1. Check if Ollama is running
        setPhase("checking");
        const isOllamaRunning: boolean = await invoke("check_ollama");
        
        if (!isOllamaRunning) {
          // If Ollama is not running, we warn the user and fail early.
          throw new Error(
            "Local AI daemon (Ollama) is not running. Please make sure Ollama is installed and running on your machine (https://ollama.com) before proceeding."
          );
        }

        // 2. Start pulling the model
        setPhase("pulling");
        setStatusText("Requesting model pull from local engine...");

        // Setup event listener for download progress
        unlistenDownload = await listen<{ pct: number; status: string }>(
          "model_download_progress",
          (event) => {
            const { pct, status } = event.payload;
            setDownloadPct(pct);
            setStatusText(`Downloading ${selectedModel.display_name}: ${status}`);
          }
        );

        await invoke("pull_model", { modelName: selectedModel.ollama_tag });

        // 3. Start benchmarking
        setPhase("benchmarking");
        setDownloadPct(100);
        setStatusText("Running hardware speed test...");

        unlistenBenchmark = await listen<{ step: number; total: number; label: string }>(
          "benchmark_progress",
          (event) => {
            const { step, total, label } = event.payload;
            setBenchmarkStep(step);
            setBenchmarkTotal(total);
            setBenchmarkLabel(label);
          }
        );

        const result: BenchmarkResult = await invoke("run_benchmark", { modelName: selectedModel.ollama_tag });
        setBenchmarkResult(result);
        setPhase("done");
        setStatusText("Performance benchmarking complete!");
      } catch (e: any) {
        console.error(e);
        setErrorMsg(e.toString() || "An unexpected error occurred.");
        setPhase("error");
      }
    };

    runProcess();

    return () => {
      if (unlistenDownload) unlistenDownload();
      if (unlistenBenchmark) unlistenBenchmark();
    };
  }, [selectedModel]);

  return (
    <div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 text-center">Installing AI Inference Model</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 text-center">
        Downloading model files to your machine and benchmarking execution performance.
      </p>

      <div className="p-6 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 mb-6">
        {phase === "checking" && (
          <div className="flex flex-col items-center py-4">
            <Spinner size="md" className="mb-3" />
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{statusText}</p>
          </div>
        )}

        {phase === "pulling" && (
          <div className="space-y-4 py-2">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-700 dark:text-gray-300">
              <span className="truncate max-w-[200px]">{statusText}</span>
              <span>{downloadPct}%</span>
            </div>
            <ProgressBar value={downloadPct} />
            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-normal">
              Note: This is a one-time download (~1–4 GB depending on selection). Downloading will resume if interrupted.
            </p>
          </div>
        )}

        {phase === "benchmarking" && (
          <div className="space-y-4 py-2">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-700 dark:text-gray-300">
              <span>{benchmarkLabel || "Running speed test..."}</span>
              <span>Step {benchmarkStep} of {benchmarkTotal}</span>
            </div>
            <ProgressBar value={(benchmarkStep / benchmarkTotal) * 100} />
            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-normal">
              Measuring response speed (tokens per second) and memory footprints under load.
            </p>
          </div>
        )}

        {phase === "done" && benchmarkResult && (
          <div className="space-y-4 py-2 text-center">
            <div className="inline-flex p-2 bg-green-100 dark:bg-green-950/30 rounded-full text-green-600 dark:text-green-400 mb-2">
              <Play className="h-6 w-6" />
            </div>
            <h4 className="font-semibold text-sm text-gray-900 dark:text-white">Inference Engine Tuned</h4>
            <div className="grid grid-cols-2 gap-4 text-left mt-3">
              <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-150 dark:border-gray-750">
                <div className="text-xs text-gray-500 dark:text-gray-400">Tokens/Sec</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  {benchmarkResult.tokens_per_second.toFixed(1)} t/s
                </div>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-150 dark:border-gray-750">
                <div className="text-xs text-gray-500 dark:text-gray-400">Latency to First Token</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  {benchmarkResult.first_token_ms} ms
                </div>
              </div>
            </div>
          </div>
        )}

        {phase === "error" && (
          <Alert variant="error" title="Setup Error">
            <p className="text-xs">{errorMsg}</p>
          </Alert>
        )}
      </div>

      <div className="flex gap-3">
        {(phase === "error" || phase === "checking") && (
          <Button onClick={onBack} variant="secondary" className="flex-1 justify-center">
            Back
          </Button>
        )}
        {phase === "done" && benchmarkResult && (
          <Button onClick={() => onNext(benchmarkResult)} className="w-full justify-center">
            Continue to Resource Allocation
          </Button>
        )}
      </div>
    </div>
  );
};
