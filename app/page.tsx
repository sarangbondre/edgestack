"use client";

import React, { useEffect, useState } from "react";
import { Layout } from "../components/layout/Layout";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { AlertBanner } from "../components/dashboard/AlertBanner";
import { ActivityFeed } from "../components/dashboard/ActivityFeed";
import { FailureReview } from "../components/workflow/FailureReview";
import { invoke } from "@tauri-apps/api/core";
import {
  Play,
  Activity,
  DollarSign,
  Heart,
  GitBranch,
  ShieldCheck,
  ArrowUpRight,
  TrendingUp
} from "lucide-react";
import Link from "next/link";

interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  status: string;
  run_count: number;
}

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

interface CostSummary {
  total_savings: number;
  savings_pct: number;
  matched_tier: string;
}

interface ReviewDetails {
  run_id: string;
  workflow_name: string;
  failure_step: string;
  ai_explanation: string;
  raw_log: string;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [savings, setSavings] = useState<CostSummary | null>(null);
  const [aiOnline, setAiOnline] = useState(false);
  const [pausedRuns, setPausedRuns] = useState<any[]>([]);

  // Modal control
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
  const [reviewDetails, setReviewDetails] = useState<ReviewDetails | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);

  const fetchData = async () => {
    try {
      // 1. Fetch workflows list
      const workflowList: Workflow[] = await invoke("list_workflows");
      setWorkflows(workflowList);

      // 2. Fetch recent runs
      const recentRuns: Run[] = await invoke("list_all_runs");
      setRuns(recentRuns);

      // Filter runs that are paused
      const paused = recentRuns.filter((r) => r.status === "paused_awaiting_human");
      setPausedRuns(paused);

      // 3. Fetch cost summary (7 days)
      const cost: CostSummary = await invoke("get_cost_summary", { periodDays: 7 });
      setSavings(cost);

      // 4. Check Ollama engine health
      const health: boolean = await invoke("check_ollama");
      setAiOnline(health);

      setLoading(false);
    } catch (e) {
      console.error("Dashboard failed to fetch data:", e);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleReviewTrigger = async (runId: string) => {
    try {
      setLoadingReview(true);
      setReviewRunId(runId);
      const details: ReviewDetails = await invoke("get_failure_review", { runId });
      setReviewDetails(details);
      setLoadingReview(false);
    } catch (e) {
      console.error(e);
      setLoadingReview(false);
      setReviewRunId(null);
    }
  };

  const handleActionComplete = () => {
    setReviewRunId(null);
    setReviewDetails(null);
    fetchData();
  };

  // Stats derivations
  const activeWorkflowsCount = workflows.filter((w) => w.enabled).length;
  const runningRunsCount = runs.filter((r) => r.status === "running").length;
  const totalRunsCount = workflows.reduce((acc, w) => acc + w.run_count, 0);

  return (
    <Layout title="Dashboard">
      {/* Human-in-the-Loop alert banner */}
      <AlertBanner
        pausedRuns={pausedRuns}
        onReview={handleReviewTrigger}
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        {/* Active Workflows */}
        <Card className="metric-card hover:shadow-md transition">
          <div className="flex justify-between items-start mb-2">
            <span className="metric-label flex items-center gap-1.5"><GitBranch className="h-4 w-4 text-primary" /> Active Agents</span>
            {runningRunsCount > 0 && (
              <Badge variant="running" className="animate-pulse">
                {runningRunsCount} Active
              </Badge>
            )}
          </div>
          <div className="metric-value">{activeWorkflowsCount}</div>
          <span className="text-[10px] text-gray-500 mt-1">{workflows.length} Total Workflows configured</span>
        </Card>

        {/* Total executions */}
        <Card className="metric-card hover:shadow-md transition">
          <div className="flex justify-between items-start mb-2">
            <span className="metric-label flex items-center gap-1.5"><Activity className="h-4 w-4 text-indigo-500" /> Runs Completed</span>
            <Badge variant="ok">Live Node</Badge>
          </div>
          <div className="metric-value">{totalRunsCount}</div>
          <span className="text-[10px] text-gray-500 mt-1">Total workflow steps executed locally</span>
        </Card>

        {/* Savings */}
        <Card className="metric-card hover:shadow-md transition">
          <div className="flex justify-between items-start mb-2">
            <span className="metric-label flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-emerald-500" /> Weekly Savings</span>
            {savings && savings.total_savings > 0 && (
              <span className="flex items-center text-[10px] text-emerald-600 dark:text-emerald-400 font-bold gap-0.5">
                <TrendingUp className="h-3 w-3" /> {savings.savings_pct.toFixed(0)}% saved
              </span>
            )}
          </div>
          <div className="metric-value text-emerald-600 dark:text-emerald-400">
            ${savings ? savings.total_savings.toFixed(2) : "0.00"}
          </div>
          <span className="text-[10px] text-gray-500 mt-1">VS equivalent cloud: {savings?.matched_tier || "Nova Lite"}</span>
        </Card>

        {/* Engine status */}
        <Card className="metric-card hover:shadow-md transition">
          <div className="flex justify-between items-start mb-2">
            <span className="metric-label flex items-center gap-1.5"><Heart className="h-4 w-4 text-red-500" /> Inference Engine</span>
            {aiOnline ? <Badge variant="ok">Healthy</Badge> : <Badge variant="error">Offline</Badge>}
          </div>
          <div className="metric-value text-sm font-semibold mt-1">
            {aiOnline ? "Local Core Online" : "Connecting..."}
          </div>
          <span className="text-[10px] text-gray-500 mt-2">Checking Ollama port 11434...</span>
        </Card>
      </div>

      {/* Main dashboard body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 columns: Activity Feed */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Recent Execution History</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Live feed of local agents executing workflow graphs</p>
              </div>
              <Link href="/workflows" className="btn btn-secondary btn-sm flex items-center gap-1">
                View All <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <ActivityFeed runs={runs} />
          </Card>
        </div>

        {/* Right column: Quick Actions & Status */}
        <div className="space-y-6">
          <Card className="p-5">
            <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-4">Node Config Quickview</h4>
            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Active Model:</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  {workflows.length > 0 ? "llama3.2:3b (Balanced)" : "None"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Storage Pool:</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">Local SSD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Security Layer:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" /> 100% Secure
                </span>
              </div>
            </div>
            <div className="mt-5 border-t border-gray-250 dark:border-gray-800 pt-4 flex gap-2">
              <Link href="/workflows" className="btn btn-primary btn-sm flex-1 justify-center">
                New Workflow
              </Link>
              <Link href="/settings" className="btn btn-secondary btn-sm flex-1 justify-center">
                Configure Node
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* Failure review intervention modal */}
      {reviewRunId && reviewDetails && (
        <FailureReview
          runId={reviewRunId}
          workflowName={reviewDetails.workflow_name}
          failureStep={reviewDetails.failure_step}
          aiExplanation={reviewDetails.ai_explanation}
          rawLog={reviewDetails.raw_log}
          onActionComplete={handleActionComplete}
          onClose={() => setReviewRunId(null)}
        />
      )}
    </Layout>
  );
}
