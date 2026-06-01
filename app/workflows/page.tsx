"use client";

import React, { useEffect, useState } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { invoke } from "@tauri-apps/api/core";
import { GitBranch, Play, Plus, Trash2, Calendar, CheckCircle } from "lucide-react";
import Link from "next/link";

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  status: string; // "idle" | "running" | "paused" | "error"
  last_run: string | null;
  next_run: string | null;
  run_count: number;
  success_rate: number;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  const fetchWorkflows = async () => {
    try {
      const res: Workflow[] = await invoke("list_workflows");
      setWorkflows(res);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
    const interval = setInterval(fetchWorkflows, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRun = async (id: string) => {
    try {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      // Start workflow
      await invoke("run_workflow", { id, triggerType: "manual" });
      setTimeout(() => {
        setRunningIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        fetchWorkflows();
      }, 1500);
    } catch (e) {
      console.error(e);
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this workflow? All run logs will be deleted.")) return;
    try {
      await invoke("delete_workflow", { id });
      fetchWorkflows();
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge variant="running">Running</Badge>;
      case "paused":
        return <Badge variant="paused">Awaiting human</Badge>;
      case "error":
        return <Badge variant="error">Failed</Badge>;
      case "idle":
      default:
        return <Badge variant="idle">Idle</Badge>;
    }
  };

  return (
    <Layout title="Workflows">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Your Automation Agents</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Manage and execute your private local workflow networks</p>
        </div>
        <Link href="/workflows/new" className="btn btn-primary flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> New Workflow
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : workflows.length === 0 ? (
        <Card className="empty-state max-w-xl mx-auto mt-10">
          <div className="empty-state-icon">
            <GitBranch className="h-14 w-14 text-gray-300 dark:text-gray-700" />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">No Workflows Created</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
            You don't have any automated workflows set up yet. Build your first workflow to run tasks offline.
          </p>
          <Link href="/workflows/new" className="btn btn-primary flex items-center gap-1">
            <Plus className="h-4 w-4" /> Build First Agent
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {workflows.map((wf) => (
            <Card key={wf.id} className="hover:border-primary/50 transition duration-150">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-gray-950 dark:text-white">
                      {wf.name}
                    </h3>
                    {getStatusBadge(wf.status)}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {wf.description || "No description provided."}
                  </p>
                  <div className="flex flex-wrap items-center gap-4 text-[10px] text-gray-400 dark:text-gray-500 pt-2 font-medium">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Last Run: {wf.last_run ? new Date(wf.last_run).toLocaleString() : "Never"}
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Success Rate: {wf.success_rate.toFixed(0)}% ({wf.run_count} runs)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-auto">
                  <Button
                    onClick={() => handleRun(wf.id)}
                    loading={runningIds.has(wf.id)}
                    size="sm"
                    className="flex items-center gap-1"
                  >
                    <Play className="h-3.5 w-3.5" /> Run Now
                  </Button>
                  <Link
                    href={`/workflows/edit?id=${wf.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(wf.id)}
                    className="btn btn-danger btn-sm p-2"
                    aria-label="Delete workflow"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}
