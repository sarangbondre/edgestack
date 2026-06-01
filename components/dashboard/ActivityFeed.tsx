"use client";

import React from "react";
import { Badge } from "../ui/Badge";
import { Play, CheckCircle2, XCircle, AlertCircle, Calendar } from "lucide-react";
import Link from "next/link";

interface Run {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  trigger_type: string;
  failure_step: string | null;
}

interface ActivityFeedProps {
  runs: Run[];
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ runs }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "paused_awaiting_human":
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      case "running":
      default:
        return <Play className="h-4 w-4 text-blue-500 spinner" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="ok">Completed</Badge>;
      case "failed":
        return <Badge variant="error">Failed</Badge>;
      case "paused_awaiting_human":
        return <Badge variant="paused">Needs Review</Badge>;
      case "running":
        return <Badge variant="running">Running</Badge>;
      default:
        return <Badge variant="idle">{status}</Badge>;
    }
  };

  if (runs.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <Calendar className="h-12 w-12 text-gray-300 dark:text-gray-700" />
        </div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No Recent Runs</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-xs">
          Your dashboard timeline is empty. Create a workflow in the builder to begin.
        </p>
        <Link href="/workflows" className="btn btn-primary btn-sm">
          Build a Workflow
        </Link>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-800">
      {runs.map((run) => (
        <div key={run.id} className="activity-item flex justify-between items-center py-3.5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">{getStatusIcon(run.status)}</div>
            <div>
              <div className="font-semibold text-sm text-gray-950 dark:text-white">
                {run.workflow_name}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="capitalize">Trigger: {run.trigger_type}</span>
                <span>•</span>
                <span>{new Date(run.started_at).toLocaleString()}</span>
                {run.status === "failed" && run.failure_step && (
                  <>
                    <span>•</span>
                    <span className="text-red-500 font-medium">Failed at: {run.failure_step}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {getStatusBadge(run.status)}
            <Link
              href={`/workflows/runs?workflowId=${run.workflow_id}&runId=${run.id}`}
              className="btn btn-ghost btn-sm"
            >
              Details
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
};
