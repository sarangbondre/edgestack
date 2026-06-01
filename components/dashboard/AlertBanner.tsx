"use client";

import React from "react";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";

interface PausedRun {
  id: string;
  workflow_id: string;
  workflow_name: string;
  started_at: string;
  failure_step: string;
}

interface AlertBannerProps {
  pausedRuns: PausedRun[];
  onReview: (runId: string) => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ pausedRuns, onReview }) => {
  if (pausedRuns.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {pausedRuns.map((run) => (
        <Alert
          key={run.id}
          variant="warning"
          title="Agent Awaiting Human Action (Circuit Breaker Triggered)"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs">
                Workflow <span className="font-semibold">"{run.workflow_name}"</span> has paused at step{" "}
                <span className="font-semibold">"{run.failure_step}"</span>.
                Your execution state is preserved. Nothing has been lost.
              </p>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                Paused at: {new Date(run.started_at).toLocaleString()}
              </span>
            </div>
            <Button
              onClick={() => onReview(run.id)}
              size="sm"
              variant="danger"
              className="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white border-none self-start sm:self-auto"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Review & Action
            </Button>
          </div>
        </Alert>
      ))}
    </div>
  );
};
