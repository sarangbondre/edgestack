"use client";

import React, { useEffect, useState } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { invoke } from "@tauri-apps/api/core";
import { Cpu, Users, Gauge, CheckCircle2, ShieldAlert } from "lucide-react";

interface AgentMetrics {
  workflow_id: string;
  workflow_name: string;
  tasks_today: number;
  success_rate: number;
  avg_response_ms: number;
  cpu_avg_pct: number;
  memory_gb: number;
  status: string;
  last_run: string | null;
}

export default function AgentsPage() {
  const [metrics, setMetrics] = useState<AgentMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res: AgentMetrics[] = await invoke("get_agent_metrics");
        setMetrics(res);
        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge variant="running">Executing</Badge>;
      case "paused":
        return <Badge variant="paused">Needs Action</Badge>;
      case "error":
        return <Badge variant="error">Degraded</Badge>;
      case "ok":
      default:
        return <Badge variant="ok">Healthy</Badge>;
    }
  };

  return (
    <Layout title="Agent Metrics">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Active Agent Telemetry</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Live profiling of local agent resource usage, success rates, and latency speeds</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : metrics.length === 0 ? (
        <Card className="empty-state max-w-md mx-auto">
          <div className="empty-state-icon">
            <Users className="h-12 w-12 text-gray-300 dark:text-gray-700" />
          </div>
          <h4 className="text-sm font-semibold mb-1">No Active Agents</h4>
          <p className="text-xs text-gray-500 mb-4">Run workflows to log agent hardware telemetry records here.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {metrics.map((agent) => (
            <Card key={agent.workflow_id} className="hover:shadow-sm transition">
              <div className="flex justify-between items-start border-b border-gray-200 dark:border-gray-800 pb-3 mb-4">
                <div>
                  <h3 className="font-bold text-sm text-gray-950 dark:text-white">{agent.workflow_name}</h3>
                  <span className="text-[10px] text-gray-500">
                    Last Run: {agent.last_run ? new Date(agent.last_run).toLocaleTimeString() : "Never"}
                  </span>
                </div>
                {getStatusBadge(agent.status)}
              </div>

              <div className="grid grid-cols-3 gap-3 text-center mb-5">
                <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded border border-gray-150 dark:border-gray-800">
                  <div className="text-[9px] font-bold text-gray-500 uppercase">Tasks Today</div>
                  <div className="text-sm font-bold mt-1 text-gray-900 dark:text-white">{agent.tasks_today}</div>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded border border-gray-150 dark:border-gray-800">
                  <div className="text-[9px] font-bold text-gray-500 uppercase">Success Rate</div>
                  <div className="text-sm font-bold mt-1 text-gray-900 dark:text-white">{agent.success_rate.toFixed(0)}%</div>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded border border-gray-150 dark:border-gray-800">
                  <div className="text-[9px] font-bold text-gray-500 uppercase">Avg Response</div>
                  <div className="text-sm font-bold mt-1 text-gray-900 dark:text-white">
                    {agent.avg_response_ms > 0 ? `${(agent.avg_response_ms / 1000).toFixed(1)}s` : "0.0s"}
                  </div>
                </div>
              </div>

              {/* Resource Gauges */}
              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-semibold text-gray-500">
                    <span className="flex items-center gap-1"><Cpu className="h-3 w-3" /> Average CPU Usage</span>
                    <span>{agent.cpu_avg_pct.toFixed(1)}%</span>
                  </div>
                  <div className="progress-bar-track w-full">
                    <div className="progress-bar-fill" style={{ width: `${Math.max(agent.cpu_avg_pct, 2)}%` }} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-semibold text-gray-500">
                    <span className="flex items-center gap-1"><Gauge className="h-3 w-3" /> Average Memory (RAM)</span>
                    <span>{agent.memory_gb.toFixed(1)} GB</span>
                  </div>
                  <div className="progress-bar-track w-full">
                    <div className="progress-bar-fill bg-indigo-500" style={{ width: `${Math.min((agent.memory_gb / 16.0) * 100, 100)}%` }} />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}
