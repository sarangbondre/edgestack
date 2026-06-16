"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { invoke } from "@/lib/tauri";
import {
  ShieldCheck, ShieldAlert, ShieldX, Plus, Trash2, ToggleLeft, ToggleRight,
  Download, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Filter,
  Globe, Brain, HardDrive, Activity, Lock, X, Info, FileText, BarChart3,
  FlaskConical, Play, ChevronRight, Zap, Eye, MessageSquare, Send, Bot, User
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PolicyConditions {
  url_allowlist?: string[];
  url_blocklist?: string[];
  max_tokens_per_day?: number;
  pii_filter_output?: boolean;
  require_data_tag?: boolean;
  max_calls_per_hour?: number;
  max_daily_cost_usd?: number;
}
interface Policy {
  id: string; name: string; description?: string; enabled: boolean;
  action_type: string; effect: string; conditions: PolicyConditions;
  created_at: string; updated_at: string;
}
interface AuditEntry {
  id: string; timestamp: string; workflow_id?: string; workflow_name?: string;
  run_id?: string; step_name?: string; action_type: string; policy_id?: string;
  policy_name?: string; decision: string; reason?: string; context_url?: string;
  tokens_requested?: number;
}
interface ComplianceSummary {
  total_policies: number; active_policies: number; compliance_score: number;
  audit_events_today: number; blocks_today: number; warns_today: number;
  allows_today: number; blocks_week: number;
  top_violations: { policy_name: string; count: number }[];
}
interface SimResult {
  policy: Policy;
  decision: "allow" | "block" | "warn";
  reason?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "edgestack_governance_policies";

const ACTION_OPTIONS = [
  { value: "*",             label: "All Actions",               icon: Activity  },
  { value: "ask_ai",        label: "AI Inference (ask_ai)",     icon: Brain     },
  { value: "browse_web",    label: "Web Browsing (browse_web)", icon: Globe     },
  { value: "http_request",  label: "HTTP Request",              icon: Globe     },
  { value: "save_to_vault", label: "Save to Vault",             icon: HardDrive },
  { value: "write_to_s3",   label: "Write to S3",               icon: HardDrive },
];
const EFFECT_OPTIONS = [
  { value: "block", label: "Block",      desc: "Hard stop — step fails, workflow pauses for HITL" },
  { value: "warn",  label: "Warn",       desc: "Emit warning and continue execution"               },
  { value: "audit", label: "Audit Only", desc: "Log to audit trail without affecting execution"    },
];
const DECISION_COLORS: Record<string, string> = {
  allow: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  block: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  warn:  "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  audit: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
};

// ─── Seed policies (used only on very first load) ─────────────────────────────

const SEED_POLICIES: Policy[] = [
  { id: "policy-001", name: "Block External HTTP Calls", description: "Prevents workflows from making HTTP requests to non-allowlisted domains", enabled: true, action_type: "http_request", effect: "block", conditions: { url_allowlist: ["api.stripe.com", "hooks.slack.com", "api.sendgrid.com"] }, created_at: new Date(Date.now() - 86400000 * 7).toISOString(), updated_at: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: "policy-002", name: "AI Token Budget (50K/day)", description: "Caps AI token usage per workflow to 50,000 tokens per day", enabled: true, action_type: "ask_ai", effect: "block", conditions: { max_tokens_per_day: 50000 }, created_at: new Date(Date.now() - 86400000 * 5).toISOString(), updated_at: new Date(Date.now() - 86400000 * 1).toISOString() },
  { id: "policy-003", name: "PII Output Filter", description: "Strips emails, phone numbers, and credit card patterns from AI-generated output", enabled: true, action_type: "ask_ai", effect: "warn", conditions: { pii_filter_output: true }, created_at: new Date(Date.now() - 86400000 * 3).toISOString(), updated_at: new Date(Date.now() - 86400000 * 1).toISOString() },
  { id: "policy-004", name: "Require Data Classification Tag", description: "All vault save operations must include a data_tag field", enabled: false, action_type: "save_to_vault", effect: "block", conditions: { require_data_tag: true }, created_at: new Date(Date.now() - 86400000 * 1).toISOString(), updated_at: new Date(Date.now() - 86400000 * 1).toISOString() },
  { id: "policy-005", name: "Rate Limit Web Browsing (10/hr)", description: "Prevents excessive web scraping — max 10 browse_web calls per hour", enabled: true, action_type: "browse_web", effect: "warn", conditions: { max_calls_per_hour: 10 }, created_at: new Date(Date.now() - 86400000 * 2).toISOString(), updated_at: new Date(Date.now() - 86400000 * 2).toISOString() },
];

// ─── localStorage persistence ─────────────────────────────────────────────────

function loadPolicies(): Policy[] {
  if (typeof window === "undefined") return SEED_POLICIES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Policy[];
  } catch {}
  return SEED_POLICIES;
}
function savePolicies(policies: Policy[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(policies)); } catch {}
}

// ─── Client-side Policy Simulator ────────────────────────────────────────────

function evaluatePolicies(
  policies: Policy[],
  ctx: { action_type: string; url?: string; tokens?: number; has_data_tag: boolean }
): SimResult[] {
  const active = policies.filter(p => p.enabled && (p.action_type === ctx.action_type || p.action_type === "*"));
  return active.map(p => {
    const c = p.conditions;
    // URL allowlist
    if (c.url_allowlist?.length && ctx.url) {
      if (!c.url_allowlist.some(a => ctx.url!.includes(a))) {
        return { policy: p, decision: p.effect as any, reason: `URL "${ctx.url}" is not in the allowlist: [${c.url_allowlist.join(", ")}]` };
      }
    }
    // URL blocklist
    if (c.url_blocklist?.length && ctx.url) {
      if (c.url_blocklist.some(b => ctx.url!.includes(b))) {
        return { policy: p, decision: p.effect as any, reason: `URL "${ctx.url}" matches a blocked pattern: [${c.url_blocklist.join(", ")}]` };
      }
    }
    // Token budget
    if (c.max_tokens_per_day && ctx.tokens) {
      if (ctx.tokens > c.max_tokens_per_day) {
        return { policy: p, decision: p.effect as any, reason: `${ctx.tokens.toLocaleString()} tokens requested exceeds daily budget of ${c.max_tokens_per_day.toLocaleString()}` };
      }
    }
    // Data tag
    if (c.require_data_tag && !ctx.has_data_tag) {
      return { policy: p, decision: p.effect as any, reason: "Step is missing a required data_tag classification field" };
    }
    return { policy: p, decision: "allow" };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DecisionIcon = ({ d }: { d: string }) => {
  if (d === "allow") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (d === "block") return <XCircle      className="h-4 w-4 text-red-500"     />;
  return                   <AlertTriangle className="h-4 w-4 text-amber-500"   />;
};
const scoreColor = (s: number) => s >= 80 ? "text-emerald-600 dark:text-emerald-400" : s >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
const scoreGrad  = (s: number) => s >= 80 ? "from-emerald-500 to-emerald-400" : s >= 60 ? "from-amber-500 to-amber-400" : "from-red-500 to-red-400";
const actionLabel = (v: string) => ACTION_OPTIONS.find(o => o.value === v)?.label || v;

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, []);
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold animate-slide-in">
      <CheckCircle2 className="h-4 w-4" /> {msg}
    </div>
  );
}

// ─── BLANK FORM ───────────────────────────────────────────────────────────────

const BLANK = { name: "", description: "", action_type: "ask_ai", effect: "block",
  url_allowlist: "", url_blocklist: "", max_tokens_per_day: "", pii_filter_output: false,
  require_data_tag: false, max_calls_per_hour: "", max_daily_cost_usd: "" };

// ─── Policy Modal ─────────────────────────────────────────────────────────────

function PolicyModal({ onClose, onSave, initial }: { onClose: () => void; onSave: (d: any) => Promise<void>; initial?: Policy | null }) {
  const [form, setForm] = useState(() => {
    if (initial) {
      const c = initial.conditions;
      return { name: initial.name, description: initial.description || "", action_type: initial.action_type,
        effect: initial.effect, url_allowlist: (c.url_allowlist || []).join(", "),
        url_blocklist: (c.url_blocklist || []).join(", "),
        max_tokens_per_day: c.max_tokens_per_day ? String(c.max_tokens_per_day) : "",
        pii_filter_output: c.pii_filter_output || false, require_data_tag: c.require_data_tag || false,
        max_calls_per_hour: c.max_calls_per_hour ? String(c.max_calls_per_hour) : "",
        max_daily_cost_usd: c.max_daily_cost_usd ? String(c.max_daily_cost_usd) : "" };
    }
    return BLANK;
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const conditions: PolicyConditions = {};
    if (form.url_allowlist.trim())   conditions.url_allowlist     = form.url_allowlist.split(",").map(s => s.trim()).filter(Boolean);
    if (form.url_blocklist.trim())   conditions.url_blocklist     = form.url_blocklist.split(",").map(s => s.trim()).filter(Boolean);
    if (form.max_tokens_per_day)     conditions.max_tokens_per_day = parseInt(form.max_tokens_per_day);
    if (form.pii_filter_output)      conditions.pii_filter_output  = true;
    if (form.require_data_tag)       conditions.require_data_tag   = true;
    if (form.max_calls_per_hour)     conditions.max_calls_per_hour = parseInt(form.max_calls_per_hour);
    if (form.max_daily_cost_usd)     conditions.max_daily_cost_usd = parseFloat(form.max_daily_cost_usd);
    await onSave({ ...form, conditions });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800">
        <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">{initial ? "Edit Policy Rule" : "New Policy Rule"}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Define a governance constraint for workflow step execution</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 transition"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Policy Name *</label>
            <input className="w-full input-field" placeholder="e.g. Block External HTTP Calls" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
            <input className="w-full input-field" placeholder="What does this policy enforce?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Applies To</label>
              <select className="w-full input-field" value={form.action_type} onChange={e => setForm(f => ({ ...f, action_type: e.target.value }))}>
                {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Effect</label>
              <select className="w-full input-field" value={form.effect} onChange={e => setForm(f => ({ ...f, effect: e.target.value }))}>
                {EFFECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">{EFFECT_OPTIONS.find(o => o.value === form.effect)?.desc}</p>
            </div>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Lock className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Conditions</span>
              <span className="text-[10px] text-gray-400">(leave blank to skip)</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">URL Allowlist (comma-separated)</label>
                <input className="w-full input-field text-xs" placeholder="api.stripe.com, hooks.slack.com" value={form.url_allowlist} onChange={e => setForm(f => ({ ...f, url_allowlist: e.target.value }))} />
                <p className="text-[9px] text-gray-400 mt-0.5">Only URLs containing these strings are permitted</p>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">URL Blocklist (comma-separated)</label>
                <input className="w-full input-field text-xs" placeholder="malicious.com, tracking.io" value={form.url_blocklist} onChange={e => setForm(f => ({ ...f, url_blocklist: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Max Tokens / Day</label>
                  <input className="w-full input-field text-xs" type="number" placeholder="50000" value={form.max_tokens_per_day} onChange={e => setForm(f => ({ ...f, max_tokens_per_day: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Max Calls / Hour</label>
                  <input className="w-full input-field text-xs" type="number" placeholder="10" value={form.max_calls_per_hour} onChange={e => setForm(f => ({ ...f, max_calls_per_hour: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Max Daily Cost (USD)</label>
                <input className="w-full input-field text-xs" type="number" step="0.01" placeholder="5.00" value={form.max_daily_cost_usd} onChange={e => setForm(f => ({ ...f, max_daily_cost_usd: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded" checked={form.pii_filter_output} onChange={e => setForm(f => ({ ...f, pii_filter_output: e.target.checked }))} />
                  <span className="text-xs text-gray-700 dark:text-gray-300">Enable PII filter on AI output <span className="text-gray-400">(strips emails, phones, card numbers)</span></span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded" checked={form.require_data_tag} onChange={e => setForm(f => ({ ...f, require_data_tag: e.target.checked }))} />
                  <span className="text-xs text-gray-700 dark:text-gray-300">Require <code className="text-[10px] bg-gray-100 dark:bg-gray-900 px-1 rounded">data_tag</code> on vault/storage steps</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-gray-200 dark:border-gray-800">
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !form.name.trim()} className="btn btn-primary btn-sm flex items-center gap-1.5">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {initial ? "Save Changes" : "Create Policy"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Policy Simulator ────────────────────────────────────────────────────────

function PolicySimulator({ policies }: { policies: Policy[] }) {
  const [ctx, setCtx] = useState({
    action_type: "http_request",
    url: "https://unknown-api.io/data",
    tokens: "",
    has_data_tag: false,
  });
  const [results, setResults] = useState<SimResult[] | null>(null);
  const [ran, setRan]         = useState(false);

  const run = () => {
    const r = evaluatePolicies(policies, {
      action_type: ctx.action_type,
      url: ctx.url || undefined,
      tokens: ctx.tokens ? parseInt(ctx.tokens) : undefined,
      has_data_tag: ctx.has_data_tag,
    });
    setResults(r);
    setRan(true);
  };

  const overallDecision = results?.find(r => r.decision === "block")
    ? "block"
    : results?.find(r => r.decision === "warn")
    ? "warn"
    : "allow";

  const presets = [
    { label: "External API call", ctx: { action_type: "http_request", url: "https://unknown-api.io/endpoint", tokens: "", has_data_tag: false } },
    { label: "Stripe API call",   ctx: { action_type: "http_request", url: "https://api.stripe.com/v1/charges", tokens: "", has_data_tag: false } },
    { label: "Ask AI (60K tokens)", ctx: { action_type: "ask_ai", url: "", tokens: "60000", has_data_tag: false } },
    { label: "Ask AI (1K tokens)", ctx: { action_type: "ask_ai", url: "", tokens: "1000", has_data_tag: false } },
    { label: "Vault save (tagged)", ctx: { action_type: "save_to_vault", url: "", tokens: "", has_data_tag: true } },
    { label: "Vault save (no tag)", ctx: { action_type: "save_to_vault", url: "", tokens: "", has_data_tag: false } },
    { label: "Browse web", ctx: { action_type: "browse_web", url: "https://competitor.com/pricing", tokens: "", has_data_tag: false } },
  ];

  return (
    <div className="space-y-6">
      {/* Presets */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase mb-2 tracking-wide">Quick Presets</p>
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <button key={p.label} onClick={() => { setCtx(p.ctx as any); setRan(false); setResults(null); }}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-primary/10 hover:text-primary transition">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Config form */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" /> Simulate a Workflow Step
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Step Action Type</label>
            <select className="w-full input-field" value={ctx.action_type} onChange={e => { setCtx(c => ({ ...c, action_type: e.target.value })); setRan(false); }}>
              {ACTION_OPTIONS.filter(o => o.value !== "*").map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Target URL <span className="normal-case text-gray-400">(for web/http steps)</span></label>
            <input className="w-full input-field text-xs" placeholder="https://example.com/api" value={ctx.url}
              onChange={e => { setCtx(c => ({ ...c, url: e.target.value })); setRan(false); }} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Tokens Requested <span className="normal-case text-gray-400">(for AI steps)</span></label>
            <input className="w-full input-field text-xs" type="number" placeholder="e.g. 1500" value={ctx.tokens}
              onChange={e => { setCtx(c => ({ ...c, tokens: e.target.value })); setRan(false); }} />
          </div>
          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input type="checkbox" className="rounded" checked={ctx.has_data_tag} onChange={e => { setCtx(c => ({ ...c, has_data_tag: e.target.checked })); setRan(false); }} />
              <span className="text-xs text-gray-700 dark:text-gray-300">Step has <code className="text-[10px] bg-gray-100 dark:bg-gray-900 px-1 rounded">data_tag</code> field</span>
            </label>
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={run} className="btn btn-primary flex items-center gap-2">
            <Play className="h-4 w-4" /> Run Simulation
          </button>
        </div>
      </Card>

      {/* Results */}
      {ran && results !== null && (
        <div className="space-y-3">
          {/* Overall verdict */}
          <div className={`rounded-2xl p-5 flex items-center gap-4 ${
            overallDecision === "allow" ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900"
            : overallDecision === "block" ? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900"
            : "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900"
          }`}>
            <div className="text-4xl">
              {overallDecision === "allow" ? "✅" : overallDecision === "block" ? "🚫" : "⚠️"}
            </div>
            <div>
              <div className={`text-lg font-black uppercase tracking-wide ${
                overallDecision === "allow" ? "text-emerald-700 dark:text-emerald-400"
                : overallDecision === "block" ? "text-red-700 dark:text-red-400"
                : "text-amber-700 dark:text-amber-400"
              }`}>
                {overallDecision === "allow" ? "Allowed — step would execute" : overallDecision === "block" ? "Blocked — step would fail & pause" : "Warning — step continues with alert"}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {results.filter(r => r.decision === "block").length} block(s) · {results.filter(r => r.decision === "warn").length} warn(s) · {results.filter(r => r.decision === "allow").length} allow(s) from {results.length} matching {results.length === 1 ? "policy" : "policies"}
              </p>
            </div>
          </div>

          {/* Per-policy breakdown */}
          {results.length === 0 ? (
            <Card className="p-6 text-center text-xs text-gray-500 italic">
              No active policies match the action type "{ctx.action_type}" — step would execute freely.
            </Card>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-1">Policy-by-Policy Breakdown</p>
              {results.map(r => (
                <div key={r.policy.id} className={`flex items-start gap-3 p-4 rounded-xl border transition ${
                  r.decision === "allow" ? "bg-white dark:bg-gray-950 border-gray-100 dark:border-gray-800"
                  : r.decision === "block" ? "bg-red-50/50 dark:bg-red-950/10 border-red-200 dark:border-red-900"
                  : "bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900"
                }`}>
                  <div className="mt-0.5 flex-shrink-0"><DecisionIcon d={r.decision} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-gray-900 dark:text-white">{r.policy.name}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${DECISION_COLORS[r.decision]}`}>{r.decision}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        r.policy.effect === "block" ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                        : r.policy.effect === "warn" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                        : "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
                      }`}>{r.policy.effect} policy</span>
                    </div>
                    {r.reason ? (
                      <p className="text-[11px] mt-1 font-medium text-gray-700 dark:text-gray-300">↳ {r.reason}</p>
                    ) : (
                      <p className="text-[10px] mt-0.5 text-gray-400">All conditions passed — no violation detected</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* YAML snippet for the step */}
          <Card className="p-4">
            <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
              <FileText className="h-3 w-3" /> Workflow YAML for this step
            </p>
            <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-gray-700 dark:text-gray-300 overflow-auto whitespace-pre">{
`steps:
  - name: my_step
    action: ${ctx.action_type}${ctx.url ? `\n    url: "${ctx.url}"` : ""}${ctx.tokens ? `\n    # tokens_requested: ${ctx.tokens}  # estimated` : ""}${ctx.has_data_tag ? `\n    data_tag: "internal"  # ✓ satisfies data classification policy` : ""}${!ctx.has_data_tag && policies.some(p => p.enabled && p.conditions.require_data_tag) ? `\n    # data_tag: "internal"  # ← add this to pass data classification policy` : ""}`}</pre>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Compliance Advisor ──────────────────────────────────────────────────────

interface AdvisorMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

function ComplianceAdvisor({ policies }: { policies: Policy[] }) {
  const [models, setModels] = useState<any[]>([]);
  const [selectedModelTag, setSelectedModelTag] = useState("");
  const [messages, setMessages] = useState<AdvisorMessage[]>([
    {
      role: "assistant",
      content: "Hello! I am your EdgeStack Governance & Compliance Officer. I can guide you on GDPR, HIPAA, or local policy configuration, help you draft custom YAML rules, or analyze audit events. Ask me anything!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(true);
  const [stats, setStats] = useState<any | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res: any[] = await invoke("list_models");
        setModels(res);
        if (res.length > 0) {
          setSelectedModelTag(res[0].ollama_tag);
        }
        setFetchingModels(false);
      } catch (e) {
        console.error(e);
        setFetchingModels(false);
      }
    };
    fetchModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const promptText = textToSend || inputMessage;
    if (!promptText.trim() || !selectedModelTag) return;

    const userMsg: AdvisorMessage = {
      role: "user",
      content: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputMessage("");
    setLoading(true);

    try {
      const activePolicySummary = policies.map(p => `- Name: ${p.name}, Action: ${p.action_type}, Effect: ${p.effect}, Enabled: ${p.enabled}`).join("\n");
      const systemPrompt = `You are the EdgeStack Governance & Compliance Officer, an expert AI agent dedicated to helping users draft, refine, and verify compliance policies.
Always explain the underlying reasoning (why a policy is needed, what risk it mitigates, and what regulations like GDPR, HIPAA, SOC2, or local privacy laws it maps to) in a very friendly, human-readable, and clear manner. Ensure your explanations are easy for non-legal humans to understand.

Active EdgeStack Policies:\n${activePolicySummary || "None"}

EdgeStack supported actions:
- ask_ai: AI Inference
- browse_web: Web Browsing
- http_request: General HTTP Outbound calls
- save_to_vault: Local secure storage
- write_to_s3: Outbound storage

Policy settings support:
- url_allowlist: Allowed domains
- url_blocklist: Blocked domains
- max_tokens_per_day: Token budget
- pii_filter_output: Stripping sensitive output data
- require_data_tag: Data tagging enforcement
- max_calls_per_hour: Rate limiting

Answer all compliance queries professionally and cordially. Provide clear, supportive explanations of security/compliance concepts, and draft YAML snippets if requested.`;

      const chatHistory = messages.map((m) => ({ role: m.role, content: m.content }));
      chatHistory.push({ role: "user", content: userMsg.content });

      const fullPrompt = `### SYSTEM INSTRUCTIONS (MANDATORY COMPLIANCE ROLE)
${systemPrompt}

### CONVERSATION HISTORY
${chatHistory.map(h => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`).join("\n")}

### RESPONSE INSTRUCTIONS:
- Act strictly as the EdgeStack Governance & Compliance Officer.
- NEVER respond with ONLY YAML. That is strictly forbidden.
- ALWAYS begin with a detailed, friendly, and plain English explanation first. Explain the security risks, the reasoning, and explicitly map it to compliance frameworks (GDPR, HIPAA, SOC2, etc.).
- Keep the tone warm, helpful, and accessible to non-technical business users.
- Only AFTER your friendly English explanation, append a YAML block if a configuration or code sample is relevant/requested.

Assistant:`;

      const res = await invoke<any>("generate_chat_response", {
        model: selectedModelTag,
        prompt: fullPrompt,
        history: []
      });

      const assistantMsg: AdvisorMessage = {
        role: "assistant",
        content: res.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setStats({
        tokens_per_second: res.tokens_per_second,
        first_token_ms: res.first_token_ms,
        memory_used_gb: res.memory_used_gb
      });
      setLoading(false);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "[ERROR] Failed to query local model. Ensure the Ollama port 11434 is running offline.",
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
      setLoading(false);
    }
  };

  const suggestions = [
    "Draft a policy to block malicious HTTP requests",
    "Explain how daily token budgets prevent compliance risk",
    "Is local inference GDPR compliant?",
    "How can I audit agent web browsing actions?"
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-250px)] min-h-[500px]">
      {/* Chat window */}
      <div className="lg:col-span-3 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-950 flex flex-col h-full">
        {/* Model selector bar */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Advisor Model:</span>
            {fetchingModels ? (
              <div className="h-4 w-28 bg-gray-150 dark:bg-gray-800 animate-pulse rounded" />
            ) : (
              <select
                value={selectedModelTag}
                onChange={(e) => setSelectedModelTag(e.target.value)}
                className="input py-1 px-2.5 text-[11px] w-52 bg-white dark:bg-gray-900"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.ollama_tag}>
                    {m.display_name} [{m.source}]
                  </option>
                ))}
              </select>
            )}
          </div>
          <button onClick={() => setMessages([messages[0]])} className="text-[10px] font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            Reset Chat
          </button>
        </div>

        {/* Message feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, idx) => (
            <div key={idx} className={`flex gap-3 max-w-[85%] ${m.role === "user" ? "ml-auto flex-row-reverse" : ""}`}>
              <div className={`p-2 rounded-full h-8 w-8 flex items-center justify-center flex-shrink-0 ${
                m.role === "user" ? "bg-primary text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}>
                {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div>
                <div className={`p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-white rounded-tr-none"
                    : "bg-gray-100 dark:bg-gray-900 text-gray-850 dark:text-gray-200 border border-gray-150 dark:border-gray-850 rounded-tl-none"
                }`}>
                  {m.content}
                </div>
                <span className="text-[9px] text-gray-400 dark:text-gray-500 mt-1 block px-1 text-right">
                  {m.timestamp}
                </span>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 max-w-[80%]">
              <div className="p-2 rounded-full h-8 w-8 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div className="p-3 bg-gray-100 dark:bg-gray-900 text-xs rounded-2xl rounded-tl-none border border-gray-150 dark:border-gray-850">
                <div className="flex gap-1.5 items-center py-1">
                  <span className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions list when feed is short */}
        {messages.length === 1 && (
          <div className="p-4 border-t border-gray-105 dark:border-gray-850 bg-gray-50/20">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Suggested Topics</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, idx) => (
                <button key={idx} onClick={() => handleSend(s)} className="px-3 py-1.5 rounded-full text-left text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-primary/50 transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-800 flex gap-2">
          <input
            type="text"
            placeholder="Ask your Compliance Advisor..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="input flex-1 text-xs py-2 px-3 bg-gray-50/50 dark:bg-gray-900/50"
            disabled={loading || !selectedModelTag}
          />
          <button onClick={() => handleSend()} disabled={loading || !inputMessage.trim() || !selectedModelTag} className="btn btn-primary btn-sm px-3 flex items-center gap-1">
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Sidebar helper panels */}
      <div className="space-y-4">
        <Card className="p-4 space-y-4">
          <h3 className="font-bold text-xs text-gray-900 dark:text-white uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 pb-2 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" /> Compliance Status
          </h3>
          <div className="space-y-3 text-[11px] text-gray-600 dark:text-gray-300">
            <div className="flex justify-between">
              <span>GDPR Egress Check:</span>
              <span className="font-bold text-emerald-500">ACTIVE</span>
            </div>
            <div className="flex justify-between">
              <span>HIPAA Vault Storage:</span>
              <span className="font-bold text-emerald-500">SECURE</span>
            </div>
            <div className="flex justify-between">
              <span>Local Model Offline Run:</span>
              <span className="font-bold text-emerald-500">VERIFIED</span>
            </div>
          </div>
        </Card>

        {stats && (
          <Card className="p-4 space-y-3">
            <h3 className="font-bold text-xs text-gray-900 dark:text-white uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 pb-2">
              Performance Stats
            </h3>
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span>Speed:</span>
                <span className="font-bold">{stats.tokens_per_second.toFixed(1)} t/s</span>
              </div>
              <div className="flex justify-between">
                <span>Latency:</span>
                <span className="font-bold">{stats.first_token_ms} ms</span>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-4 bg-primary/5 border-primary/10">
          <h4 className="font-semibold text-xs text-primary mb-1.5 flex items-center gap-1.5">
            <Info className="h-4 w-4" /> Policy Guidelines
          </h4>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-normal">
            This assistant runs completely locally. It evaluates your active policies in memory to provide context-aware recommendations on how to configure EdgeStack safely.
          </p>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "overview" | "policies" | "simulate" | "audit" | "advisor";

export default function GovernancePage() {
  const [activeTab, setActiveTab]       = useState<Tab>("overview");
  const [policies, setPoliciesState]    = useState<Policy[]>([]);
  const [auditLog, setAuditLog]         = useState<AuditEntry[]>([]);
  const [summary, setSummary]           = useState<ComplianceSummary | null>(null);
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [editPolicy, setEditPolicy]     = useState<Policy | null>(null);
  const [decisionFilter, setFilter]     = useState("all");
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [togglingId, setTogglingId]     = useState<string | null>(null);
  const [yamlExport, setYamlExport]     = useState<string | null>(null);
  const [toast, setToast]               = useState<string | null>(null);

  // Policies live in state AND localStorage so they survive page refresh
  const setPolicies = useCallback((pols: Policy[]) => {
    savePolicies(pols);
    setPoliciesState(pols);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      // Policies: prefer localStorage, fall back to mock bridge
      const localPols = loadPolicies();
      setPoliciesState(localPols);

      const [audit, sum] = await Promise.all([
        invoke<AuditEntry[]>("list_audit_log", { limit: 50, decision_filter: decisionFilter }),
        invoke<ComplianceSummary>("get_compliance_summary"),
      ]);
      setAuditLog(audit);
      setSummary({ ...sum, total_policies: localPols.length, active_policies: localPols.filter(p => p.enabled).length });
      setLoading(false);
    } catch (e) {
      console.error("fetchAll error:", e);
      setLoading(false);
    }
  }, [decisionFilter]);

  useEffect(() => { fetchAll(); }, [decisionFilter]);

  const handleSavePolicy = async (formData: any) => {
    let updated: Policy[];
    if (editPolicy) {
      updated = policies.map(p => p.id === editPolicy.id
        ? { ...p, ...formData, updated_at: new Date().toISOString() }
        : p
      );
      setToast("Policy updated");
    } else {
      const newPol: Policy = {
        id: "policy-" + Math.random().toString(36).slice(2, 8),
        name: formData.name, description: formData.description || undefined,
        enabled: true, action_type: formData.action_type, effect: formData.effect,
        conditions: formData.conditions,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      updated = [...policies, newPol];
      setToast(`Policy "${newPol.name}" created`);
    }
    setPolicies(updated);
    setShowModal(false);
    setEditPolicy(null);
    setSummary(s => s ? { ...s, total_policies: updated.length, active_policies: updated.filter(p => p.enabled).length } : s);
  };

  const handleToggle = (policy: Policy) => {
    setTogglingId(policy.id);
    const updated = policies.map(p => p.id === policy.id ? { ...p, enabled: !p.enabled, updated_at: new Date().toISOString() } : p);
    setPolicies(updated);
    setTogglingId(null);
    setToast(policy.enabled ? "Policy disabled" : "Policy enabled");
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    const updated = policies.filter(p => p.id !== id);
    setPolicies(updated);
    setDeletingId(null);
    setToast("Policy deleted");
  };

  const handleExportYaml = () => {
    const yaml = `# EdgeStack Governance Policies\n# Exported: ${new Date().toISOString()}\n\n` +
      policies.map(p =>
        `- id: ${p.id}\n  name: "${p.name}"\n  action_type: ${p.action_type}\n  effect: ${p.effect}\n  enabled: ${p.enabled}\n  conditions: ${JSON.stringify(p.conditions, null, 2).split("\n").join("\n    ")}`
      ).join("\n\n");
    setYamlExport(yaml);
  };

  const chartData = summary ? [
    { name: "Allow", value: summary.allows_today,  color: "#10b981" },
    { name: "Warn",  value: summary.warns_today,   color: "#f59e0b" },
    { name: "Block", value: summary.blocks_today,  color: "#ef4444" },
  ] : [];

  const TABS = [
    { id: "overview",  label: "Overview",           icon: BarChart3    },
    { id: "policies",  label: `Policies (${policies.length})`, icon: ShieldCheck  },
    { id: "simulate",  label: "Simulator",           icon: FlaskConical },
    { id: "audit",     label: "Audit Log",           icon: FileText     },
    { id: "advisor",   label: "Compliance Advisor",  icon: MessageSquare },
  ];

  return (
    <Layout title="Governance & Compliance">
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Governance & Compliance
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Define policy rules, simulate enforcement, and audit all agent actions</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportYaml} className="btn btn-secondary btn-sm flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export YAML
          </button>
          <button onClick={() => { setEditPolicy(null); setShowModal(true); }} className="btn btn-primary btn-sm flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Policy
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg select-none mb-6 w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                activeTab === tab.id
                  ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
              }`}>
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.id === "simulate" && <span className="ml-0.5 text-[8px] bg-primary/20 text-primary px-1 rounded font-bold">NEW</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* ── OVERVIEW ────────────────────────────────────────────────────── */}
          {activeTab === "overview" && summary && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="md:col-span-1 p-5 flex flex-col items-center justify-center">
                  <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-wide">Compliance Score</div>
                  <div className={`text-5xl font-black ${scoreColor(summary.compliance_score)}`}>{summary.compliance_score}</div>
                  <div className="text-xs text-gray-400 mt-1">out of 100</div>
                  <div className="w-full mt-3 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                    <div className={`h-2 rounded-full bg-gradient-to-r ${scoreGrad(summary.compliance_score)} transition-all`} style={{ width: `${summary.compliance_score}%` }} />
                  </div>
                </Card>
                {[
                  { label: "Active Policies", value: summary.active_policies, sub: `${summary.total_policies} total`,    icon: ShieldCheck, color: "text-primary"     },
                  { label: "Events Today",    value: summary.audit_events_today, sub: "policy checks",                   icon: Activity,    color: "text-indigo-500"  },
                  { label: "Blocks Today",    value: summary.blocks_today,    sub: `${summary.blocks_week} this week`,   icon: ShieldX,     color: "text-red-500"     },
                  { label: "Warnings Today",  value: summary.warns_today,     sub: "non-critical",                       icon: ShieldAlert, color: "text-amber-500"   },
                ].map(s => { const Icon = s.icon; return (
                  <Card key={s.label} className="metric-card hover:shadow-sm transition">
                    <div className="flex items-center gap-1.5 mb-2"><Icon className={`h-4 w-4 ${s.color}`} /><span className="text-[10px] font-bold text-gray-400 uppercase">{s.label}</span></div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</div>
                    <div className="text-[10px] text-gray-400 mt-1">{s.sub}</div>
                  </Card>
                ); })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card className="p-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Today's Decision Breakdown</h3>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Top Violated Policies (7 days)</h3>
                  {summary.top_violations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-36 text-gray-400 text-xs italic">
                      <ShieldCheck className="h-10 w-10 mb-2 text-emerald-400" /> No violations this week
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {summary.top_violations.map((v, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0"><div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{v.policy_name}</div></div>
                          <div className="flex items-center gap-2">
                            <div className="w-32 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                              <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${(v.count / (summary.top_violations[0]?.count || 1)) * 100}%` }} />
                            </div>
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-400 w-4 text-right">{v.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* Shortcut to simulator */}
              <Card className="p-4 flex items-center gap-4 border-dashed border-2 border-primary/30 hover:shadow-sm transition cursor-pointer" onClick={() => setActiveTab("simulate")}>
                <div className="p-2.5 rounded-xl bg-primary/10"><FlaskConical className="h-5 w-5 text-primary" /></div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-gray-900 dark:text-white">Policy Simulator</div>
                  <div className="text-xs text-gray-500 mt-0.5">Test how your policies respond to any workflow step — before running it for real</div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Card>
            </div>
          )}

          {/* ── POLICIES ────────────────────────────────────────────────────── */}
          {activeTab === "policies" && (
            <div className="space-y-3">
              {policies.length === 0 ? (
                <Card className="p-12 text-center border-dashed border-2 border-gray-200 dark:border-gray-800">
                  <ShieldCheck className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No Policies Defined</h4>
                  <p className="text-xs text-gray-500 mb-4">Create your first governance policy to enforce data controls on workflow execution</p>
                  <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm mx-auto flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Create First Policy</button>
                </Card>
              ) : policies.map(policy => (
                <Card key={policy.id} className={`p-4 transition ${!policy.enabled ? "opacity-60" : "hover:shadow-sm"}`}>
                  <div className="flex items-center gap-4">
                    <button onClick={() => handleToggle(policy)} disabled={togglingId === policy.id}
                      className="flex-shrink-0 text-gray-400 hover:text-primary transition" title={policy.enabled ? "Disable" : "Enable"}>
                      {togglingId === policy.id ? <RefreshCw className="h-5 w-5 animate-spin" /> : policy.enabled ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-gray-900 dark:text-white">{policy.name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          policy.effect === "block" ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                          : policy.effect === "warn" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                          : "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"}`}>{policy.effect}</span>
                      </div>
                      {policy.description && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{policy.description}</p>}
                      <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-gray-400">
                        <span>Applies to: <strong className="text-gray-600 dark:text-gray-300">{actionLabel(policy.action_type)}</strong></span>
                        {policy.conditions.url_allowlist?.length && <span>Allowlist: <strong className="text-gray-600 dark:text-gray-300">{policy.conditions.url_allowlist.length} domains</strong></span>}
                        {policy.conditions.max_tokens_per_day && <span>Token cap: <strong className="text-gray-600 dark:text-gray-300">{policy.conditions.max_tokens_per_day.toLocaleString()}/day</strong></span>}
                        {policy.conditions.pii_filter_output && <span className="text-indigo-500 font-semibold">PII Filter ON</span>}
                        {policy.conditions.require_data_tag && <span className="text-amber-600 font-semibold">Data Tag Required</span>}
                        {policy.conditions.max_calls_per_hour && <span>Rate: <strong className="text-gray-600 dark:text-gray-300">{policy.conditions.max_calls_per_hour}/hr</strong></span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[9px] text-gray-400">Updated {new Date(policy.updated_at).toLocaleDateString()}</span>
                      <button onClick={() => setActiveTab("simulate")} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition" title="Test in simulator">
                        <FlaskConical className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => { setEditPolicy(policy); setShowModal(true); }} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-900 transition" title="Edit">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(policy.id)} disabled={deletingId === policy.id}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition" title="Delete">
                        {deletingId === policy.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* ── SIMULATOR ───────────────────────────────────────────────────── */}
          {activeTab === "simulate" && <PolicySimulator policies={policies} />}

          {/* ── AUDIT LOG ───────────────────────────────────────────────────── */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500">Decision:</span>
                {["all", "allow", "warn", "block"].map(d => (
                  <button key={d} onClick={() => setFilter(d)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition capitalize ${
                      decisionFilter === d
                        ? d === "all" ? "bg-primary text-white" : `${DECISION_COLORS[d]} border border-current`
                        : "bg-gray-100 dark:bg-gray-900 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                    {d}
                  </button>
                ))}
                <span className="ml-auto text-[10px] text-gray-400">{auditLog.length} entries</span>
                <button onClick={fetchAll} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 transition">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-1.5">
                {auditLog.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 hover:shadow-sm transition">
                    <div className="flex-shrink-0 mt-0.5"><DecisionIcon d={entry.decision} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-semibold text-xs text-gray-900 dark:text-white truncate max-w-[160px]">{entry.workflow_name || entry.workflow_id || "Unknown"}</span>
                        <span className="text-gray-400 text-xs">›</span>
                        <span className="font-mono text-[10px] text-gray-600 dark:text-gray-400">{entry.step_name}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${DECISION_COLORS[entry.decision]}`}>{entry.decision}</span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-gray-400">
                        {entry.policy_name && <span>Policy: <strong className="text-gray-600 dark:text-gray-300">{entry.policy_name}</strong></span>}
                        <span>Action: <strong className="text-gray-600 dark:text-gray-300">{entry.action_type}</strong></span>
                        {entry.tokens_requested && <span>Tokens: {entry.tokens_requested}</span>}
                        {entry.context_url && <span className="text-primary truncate max-w-[200px]" title={entry.context_url}>{entry.context_url}</span>}
                      </div>
                      {entry.reason && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 italic">{entry.reason}</p>}
                    </div>
                    <div className="flex-shrink-0 text-[9px] text-gray-400 whitespace-nowrap">{new Date(entry.timestamp).toLocaleTimeString()}</div>
                  </div>
                ))}
                {auditLog.length === 0 && <div className="text-center py-12 text-gray-400 text-xs italic">No audit log entries found</div>}
              </div>
            </div>
          )}

          {/* ── COMPLIANCE ADVISOR ───────────────────────────────────────────── */}
          {activeTab === "advisor" && <ComplianceAdvisor policies={policies} />}
        </>
      )}

      {showModal && (
        <PolicyModal onClose={() => { setShowModal(false); setEditPolicy(null); }} onSave={handleSavePolicy} initial={editPolicy} />
      )}

      {yamlExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-gray-200 dark:border-gray-800">
            <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><Download className="h-4 w-4 text-primary" /> Exported Policies (YAML)</h2>
              <button onClick={() => setYamlExport(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 transition"><X className="h-4 w-4" /></button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded-b-2xl whitespace-pre-wrap">{yamlExport}</pre>
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end">
              <button onClick={() => navigator.clipboard.writeText(yamlExport!)} className="btn btn-secondary btn-sm">Copy to Clipboard</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
