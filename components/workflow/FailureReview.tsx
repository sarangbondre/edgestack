"use client";

import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { ShieldAlert, RefreshCw, SkipForward, Ban, Clock, ChevronDown, ChevronUp } from "lucide-react";

interface FailureReviewProps {
  runId: string;
  workflowName: string;
  failureStep: string;
  aiExplanation: string;
  rawLog: string;
  onActionComplete: () => void;
  onClose: () => void;
}

export const FailureReview: React.FC<FailureReviewProps> = ({
  runId,
  workflowName,
  failureStep,
  aiExplanation,
  rawLog,
  onActionComplete,
  onClose,
}) => {
  const [action, setAction] = useState<"retry_now" | "retry_delayed" | "skip" | "stop">("retry_now");
  const [delayMinutes, setDelayMinutes] = useState(15);
  const [showRawLog, setShowRawLog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setErrorMsg("");
      
      const tauriAction = action; // e.g. "retry_now"
      const delay = action === "retry_delayed" ? delayMinutes : null;

      await invoke("record_human_action", {
        runId,
        action: tauriAction,
        delayMinutes: delay,
      });

      onActionComplete();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.toString() || "Failed to submit human action choice.");
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box max-w-xl">
        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 pb-4 mb-4">
          <div className="p-2 bg-amber-100 dark:bg-amber-950/30 rounded text-amber-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Human Intervention Required</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Preserving execution state for run ID: {runId.substring(0, 8)}...</p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="text-sm">
            <span className="text-gray-500 dark:text-gray-400">Workflow:</span>{" "}
            <span className="font-semibold text-gray-950 dark:text-white">{workflowName}</span>
          </div>
          
          <div className="text-sm">
            <span className="text-gray-500 dark:text-gray-400">Failed Step:</span>{" "}
            <span className="font-mono bg-red-50 dark:bg-red-950/30 text-red-600 px-2 py-0.5 rounded text-xs font-semibold">
              {failureStep}
            </span>
          </div>

          {/* AI Explanation */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-xl">
            <h5 className="font-semibold text-xs text-blue-800 dark:text-blue-300 mb-1.5 uppercase tracking-wider">AI Root Cause Analysis</h5>
            <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed font-medium">
              "{aiExplanation || "The AI is currently formulating an explanation for this issue."}"
            </p>
          </div>

          {/* Raw Log Toggle */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowRawLog(!showRawLog)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900 text-xs font-semibold text-gray-700 dark:text-gray-300 border-none hover:bg-gray-100 dark:hover:bg-gray-850"
            >
              <span>View Raw Error Logs</span>
              {showRawLog ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showRawLog && (
              <pre className="p-3 bg-black text-gray-300 font-mono text-[10px] overflow-x-auto max-h-[160px] border-t border-gray-250 dark:border-gray-800">
                {rawLog || "No raw logs available for this failure."}
              </pre>
            )}
          </div>

          {/* Options list */}
          <div className="space-y-2 border-t border-gray-200 dark:border-gray-800 pt-4">
            <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-2">Select Human Action</h4>
            
            {/* Option 1: Retry now */}
            <label className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-850 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900">
              <input
                type="radio"
                name="humanAction"
                checked={action === "retry_now"}
                onChange={() => setAction("retry_now")}
                className="text-primary focus:ring-primary"
              />
              <RefreshCw className="h-4 w-4 text-gray-500" />
              <div>
                <div className="text-xs font-semibold text-gray-900 dark:text-white">Retry Step Immediately</div>
                <div className="text-[10px] text-gray-500">Attempts executing this specific step again right now.</div>
              </div>
            </label>

            {/* Option 2: Retry delayed */}
            <label className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-850 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900">
              <input
                type="radio"
                name="humanAction"
                checked={action === "retry_delayed"}
                onChange={() => setAction("retry_delayed")}
                className="text-primary focus:ring-primary"
              />
              <Clock className="h-4 w-4 text-gray-500" />
              <div className="flex-1">
                <div className="text-xs font-semibold text-gray-900 dark:text-white">Retry with Backoff delay</div>
                <div className="text-[10px] text-gray-500">Wait a brief moment before re-triggering step.</div>
                {action === "retry_delayed" && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-700 dark:text-gray-300">Minutes to wait:</span>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={delayMinutes}
                      onChange={(e) => setDelayMinutes(parseInt(e.target.value) || 15)}
                      className="input text-xs py-1 w-20"
                    />
                  </div>
                )}
              </div>
            </label>

            {/* Option 3: Skip */}
            <label className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-850 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900">
              <input
                type="radio"
                name="humanAction"
                checked={action === "skip"}
                onChange={() => setAction("skip")}
                className="text-primary focus:ring-primary"
              />
              <SkipForward className="h-4 w-4 text-gray-500" />
              <div>
                <div className="text-xs font-semibold text-gray-900 dark:text-white">Skip Step & Proceed</div>
                <div className="text-[10px] text-gray-500">Mark step as skipped, ignore outputs, and continue next tasks.</div>
              </div>
            </label>

            {/* Option 4: Stop */}
            <label className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-850 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900">
              <input
                type="radio"
                name="humanAction"
                checked={action === "stop"}
                onChange={() => setAction("stop")}
                className="text-primary focus:ring-primary"
              />
              <Ban className="h-4 w-4 text-red-500" />
              <div>
                <div className="text-xs font-semibold text-red-600 dark:text-red-400">Abort Execution permanently</div>
                <div className="text-[10px] text-gray-500">Stop this workflow run completely. Releases allocated node.</div>
              </div>
            </label>
          </div>
        </div>

        {errorMsg && (
          <Alert variant="error" title="Submitting Error" className="mb-4">
            {errorMsg}
          </Alert>
        )}

        <div className="flex gap-3 justify-end">
          <Button onClick={onClose} variant="secondary" disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting} variant={action === "stop" ? "danger" : "primary"}>
            Submit Action
          </Button>
        </div>
      </div>
    </div>
  );
};
