"use client";

import React, { useEffect, useState, Suspense } from "react";
import { Layout } from "../../../components/layout/Layout";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Alert } from "../../../components/ui/Alert";
import { FailureReview } from "../../../components/workflow/FailureReview";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Play, CheckCircle2, XCircle, AlertCircle, Clock, ShieldAlert } from "lucide-react";
import Link from "next/link";

interface StepExecution {
  step_name: string;
  step_index: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  output: string | null;
  error: string | null;
  tokens_out: number | null;
}

interface RunDetails {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  trigger_type: string;
  retry_count: number;
  failure_step: string | null;
  failure_reason_ai: string | null;
  human_action: string | null;
  steps: StepExecution[];
}

function RunDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId") as string;
  const workflowId = searchParams.get("workflowId") as string;

  const [run, setRun] = useState<RunDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDetails, setReviewDetails] = useState<any>(null);

  const fetchDetails = async () => {
    try {
      const res: RunDetails = await invoke("get_run", { runId });
      setRun(res);
      setLoading(false);
      
      if (res.status === "paused_awaiting_human") {
        const review: any = await invoke("get_failure_review", { runId });
        setReviewDetails(review);
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (runId) {
      fetchDetails();
    }
  }, [runId]);

  useEffect(() => {
    let unlistenStarted: any = null;
    let unlistenCompleted: any = null;
    let unlistenFailed: any = null;

    const setupListeners = async () => {
      unlistenStarted = await listen<any>("workflow_step_started", (e) => {
        if (e.payload.run_id === runId) fetchDetails();
      });
      unlistenCompleted = await listen<any>("workflow_step_completed", (e) => {
        if (e.payload.run_id === runId) fetchDetails();
      });
      unlistenFailed = await listen<any>("workflow_failed", (e) => {
        if (e.payload.run_id === runId) fetchDetails();
      });
    };

    setupListeners();

    return () => {
      if (unlistenStarted) unlistenStarted();
      if (unlistenCompleted) unlistenCompleted();
      if (unlistenFailed) unlistenFailed();
    };
  }, [runId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "paused_awaiting_human":
        return <AlertCircle className="h-5 w-5 text-amber-500 animate-pulse" />;
      case "running":
      default:
        return <Clock className="h-5 w-5 text-blue-500 spinner" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="ok">Completed</Badge>;
      case "failed":
        return <Badge variant="error">Failed</Badge>;
      case "paused_awaiting_human":
        return <Badge variant="paused">Awaiting Human</Badge>;
      case "running":
        return <Badge variant="running">Running</Badge>;
      default:
        return <Badge variant="idle">{status}</Badge>;
    }
  };

  const handleActionComplete = () => {
    setShowReviewModal(false);
    fetchDetails();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!run) {
    return (
      <Card className="empty-state max-w-md mx-auto">
        <h4 className="text-sm font-semibold mb-1">Execution Not Found</h4>
        <p className="text-xs text-gray-500 mb-4">Could not load details for this run instance.</p>
        <Link href="/workflows" className="btn btn-primary btn-sm">
          Back to Workflows
        </Link>
      </Card>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Link href="/workflows" className="btn btn-ghost btn-sm p-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              Run ID: {run.id.substring(0, 8)}...
              {getStatusBadge(run.status)}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Started: {new Date(run.started_at).toLocaleString()}
            </p>
          </div>
        </div>

        {run.status === "paused_awaiting_human" && (
          <Button
            onClick={() => setShowReviewModal(true)}
            variant="danger"
            className="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white border-none"
          >
            <ShieldAlert className="h-4 w-4" /> Review & Action
          </Button>
        )}
      </div>

      {run.status === "paused_awaiting_human" && run.failure_reason_ai && (
        <Alert variant="warning" title="Inference Paused — Root Cause Analyzed" className="mb-6">
          <p className="text-xs font-semibold italic">"{run.failure_reason_ai}"</p>
          <Button onClick={() => setShowReviewModal(true)} size="sm" variant="secondary" className="mt-2.5 btn-sm">
            Address Blockage
          </Button>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Steps List */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-bold text-sm text-gray-950 dark:text-white">Execution Steps Log</h3>
          {run.steps.length === 0 ? (
            <div className="text-xs text-gray-500">No steps recorded.</div>
          ) : (
            run.steps.map((step) => (
              <Card key={step.step_index} className="p-4 hover:border-gray-300 dark:hover:border-gray-700 transition">
                <div className="flex justify-between items-start gap-4 mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(step.status)}
                    <h4 className="font-semibold text-sm text-gray-900 dark:text-white">
                      {step.step_name}
                    </h4>
                  </div>
                  <span className="text-[10px] text-gray-500">
                    Step {step.step_index + 1}
                  </span>
                </div>

                <div className="text-xs text-gray-500 space-y-1">
                  <div>Started: {new Date(step.started_at).toLocaleTimeString()}</div>
                  {step.completed_at && (
                    <div>Completed: {new Date(step.completed_at).toLocaleTimeString()}</div>
                  )}
                  {step.tokens_out && (
                    <div>Inference: {step.tokens_out} tokens evaluated</div>
                  )}
                </div>

                {/* Outputs/Errors */}
                {step.output && (
                  <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-150 dark:border-gray-800">
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Output Data</div>
                    <pre className="text-[11px] font-mono text-gray-700 dark:text-gray-300 break-all max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {step.output}
                    </pre>
                  </div>
                )}

                {step.error && (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-100 dark:border-red-900 text-red-800 dark:text-red-300">
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1">Execution Error</div>
                    <pre className="text-[11px] font-mono break-all font-semibold max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {step.error}
                    </pre>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <Card className="p-5">
            <h4 className="font-bold text-sm text-gray-950 dark:text-white mb-4 font-sans">Run Information</h4>
            <div className="space-y-3.5 text-xs text-gray-600 dark:text-gray-300">
              <div className="flex justify-between">
                <span>Trigger Profile:</span>
                <span className="font-semibold capitalize text-gray-900 dark:text-white">{run.trigger_type}</span>
              </div>
              <div className="flex justify-between">
                <span>Retries Attempted:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{run.retry_count} times</span>
              </div>
              {run.human_action && (
                <div className="flex justify-between">
                  <span>Human Action Taken:</span>
                  <span className="font-semibold capitalize text-gray-900 dark:text-white">{run.human_action}</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {showReviewModal && reviewDetails && (
        <FailureReview
          runId={runId}
          workflowName={reviewDetails.workflow_name}
          failureStep={reviewDetails.failure_step}
          aiExplanation={reviewDetails.ai_explanation}
          rawLog={reviewDetails.raw_log}
          onActionComplete={handleActionComplete}
          onClose={() => setShowReviewModal(false)}
        />
      )}
    </>
  );
}

export default function RunDetailsPage() {
  return (
    <Layout title="Execution Details">
      <Suspense fallback={
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      }>
        <RunDetailsContent />
      </Suspense>
    </Layout>
  );
}
