"use client";

import React, { useEffect, useState } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { invoke } from "@tauri-apps/api/core";
import { Coins, Zap, HelpCircle, ArrowUpRight, TrendingUp } from "lucide-react";

interface DailyCost {
  date: string;
  local_cost: number;
  bedrock_equiv: number;
}

interface CostSummary {
  period_days: number;
  total_local_cost: number;
  total_bedrock_equiv: number;
  total_savings: number;
  savings_pct: number;
  matched_tier: string;
  daily_breakdown: DailyCost[];
  ai_insight: string | null;
}

export default function CostsPage() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCosts = async () => {
      try {
        const res: CostSummary = await invoke("get_cost_summary", { periodDays: 7 });
        setSummary(res);
        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };
    fetchCosts();
  }, []);

  if (loading) {
    return (
      <Layout title="Cost Analytics">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  // Calculate some display parameters
  const savings = summary ? summary.total_savings : 0.0;
  const cloudCost = summary ? summary.total_bedrock_equiv : 0.0;
  const localCost = summary ? summary.total_local_cost : 0.0;
  const pct = summary ? summary.savings_pct : 0.0;
  
  // Daily bars calculation
  const maxVal = summary?.daily_breakdown.reduce((max, day) => {
    return Math.max(max, day.bedrock_equiv, day.local_cost);
  }, 0.01) || 1.0;

  return (
    <Layout title="Cost Analytics">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">AI Cost & Savings Analyzer</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Comparing local CPU/GPU electricity costs vs. equivalent cloud API pricing</p>
        </div>
      </div>

      {/* Savings Hero */}
      <Card className="mb-6 p-8 bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/50 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="savings-label uppercase font-bold text-[10px] tracking-wider text-emerald-800 dark:text-emerald-400 mb-1">
              Estimated Total Savings (This Week)
            </div>
            <div className="savings-hero text-emerald-600 dark:text-emerald-400">
              ${savings.toFixed(2)}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 max-w-md">
              Your device runs inference locally. This calculation benchmarks your tokens against equivalent{" "}
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {summary?.matched_tier || "Nova Lite"}
              </span>{" "}
              cloud calls, factoring in local electricity draw.
            </p>
          </div>
          <div className="p-6 bg-white dark:bg-gray-900 rounded-xl border border-emerald-100 dark:border-emerald-950 shadow-sm flex flex-col items-center justify-center">
            <span className="text-emerald-600 dark:text-emerald-400 p-2 bg-emerald-50 dark:bg-emerald-950 rounded-full mb-2">
              <TrendingUp className="h-6 w-6" />
            </span>
            <span className="text-2xl font-bold text-gray-950 dark:text-white">{pct.toFixed(0)}%</span>
            <span className="text-[10px] text-gray-500 uppercase font-semibold mt-1">Cost Reduction</span>
          </div>
        </div>
      </Card>

      {/* Grid of comparisons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <Card className="metric-card">
          <span className="metric-label flex items-center gap-1.5"><Zap className="h-4 w-4 text-amber-500" /> Local Power Cost</span>
          <div className="metric-value">${localCost.toFixed(3)}</div>
          <span className="text-[10px] text-gray-500">Based on hardware profiling under load</span>
        </Card>
        <Card className="metric-card">
          <span className="metric-label flex items-center gap-1.5"><Coins className="h-4 w-4 text-blue-500" /> Cloud API Benchmark</span>
          <div className="metric-value">${cloudCost.toFixed(3)}</div>
          <span className="text-[10px] text-gray-500">Equivalent model pricing per 1M tokens</span>
        </Card>
        <Card className="metric-card bg-gray-50 dark:bg-gray-900/50">
          <span className="metric-label flex items-center gap-1.5"><HelpCircle className="h-4 w-4 text-gray-500" /> Cloud Tier Matched</span>
          <div className="metric-value text-base mt-2 font-bold text-gray-900 dark:text-white">
            {summary?.matched_tier || "Nova Lite"}
          </div>
          <span className="text-[10px] text-gray-500">Selected based on model parameters & accuracy</span>
        </Card>
      </div>

      {/* Daily comparison chart */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-6">Daily Cost Comparison</h3>
        
        {summary?.daily_breakdown.length === 0 ? (
          <div className="text-center py-10 text-xs text-gray-500">
            No cost history recorded. Runs will log daily metrics here.
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {summary?.daily_breakdown.map((day) => {
              const localPct = (day.local_cost / maxVal) * 100;
              const cloudPct = (day.bedrock_equiv / maxVal) * 100;
              return (
                <div key={day.date} className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{day.date}</span>
                    <div className="flex gap-4 text-[10px] font-medium text-gray-500">
                      <span>Local: ${day.local_cost.toFixed(3)}</span>
                      <span>Cloud: ${day.bedrock_equiv.toFixed(3)}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {/* Cloud Bar */}
                    <div className="h-2 w-full bg-gray-100 dark:bg-gray-950 rounded-full overflow-hidden">
                      <div
                        className="bg-gray-400 dark:bg-gray-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(cloudPct, 1)}%` }}
                      />
                    </div>
                    {/* Local Bar */}
                    <div className="h-2 w-full bg-gray-100 dark:bg-gray-950 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(localPct, 1)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex justify-end gap-6 text-[10px] font-semibold text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-800">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 bg-emerald-500 rounded-full inline-block" /> Local Electricity</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 bg-gray-400 dark:bg-gray-600 rounded-full inline-block" /> Cloud Alternative</span>
            </div>
          </div>
        )}
      </Card>
    </Layout>
  );
}
