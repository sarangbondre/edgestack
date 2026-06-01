"use client";

import React, { useEffect, useState } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { invoke } from "@tauri-apps/api/core";
import { Settings, ShieldAlert, Key, HelpCircle, Save, Trash2, Plus } from "lucide-react";

interface AppConfig {
  setup_complete: boolean;
  model: string;
  max_cpu_cores: number;
  max_memory_gb: number;
  max_disk_gb: number;
  electricity_rate_kwh: number;
  desktop_notifications: boolean;
  theme: string;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Secrets list
  const [secrets, setSecrets] = useState<string[]>([]);
  const [newSecretName, setNewSecretName] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [secretError, setSecretError] = useState("");

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res: AppConfig = await invoke("get_config");
      setConfig(res);
      
      const secretNames: string[] = await invoke("get_secret_names");
      setSecrets(secretNames);
      
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleUpdateConfig = async (key: string, value: string) => {
    if (!config) return;
    try {
      await invoke("update_config", { key, value });
      // Update local state
      setConfig((prev: any) => {
        const next = { ...prev };
        if (key === "model") next.model = value;
        if (key === "theme") next.theme = value;
        if (key === "electricity_rate") next.electricity_rate_kwh = parseFloat(value) || 0.12;
        if (key === "desktop_notifications") next.desktop_notifications = value === "true";
        return next;
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddSecret = async () => {
    if (!newSecretName || !newSecretValue) return;
    try {
      setSecretError("");
      await invoke("store_secret", { name: newSecretName, value: newSecretValue });
      // Update list (add to mock list since backend get_secret_names returns empty mock by default)
      setSecrets((prev) => [...prev.filter((s) => s !== newSecretName), newSecretName]);
      setNewSecretName("");
      setNewSecretValue("");
    } catch (e: any) {
      setSecretError(e.toString() || "Failed to save secret.");
    }
  };

  const handleDeleteSecret = async (name: string) => {
    if (!confirm(`Are you sure you want to delete secret key "${name}"?`)) return;
    try {
      await invoke("delete_secret", { name });
      setSecrets((prev) => prev.filter((s) => s !== name));
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <Layout title="Settings">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Settings">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Node Configurations</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Control system resources, select AI models, and secure API keys locally</p>
        </div>
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Config Saved" className="mb-4">
          Node configurations updated successfully.
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left side: System configs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Engine model */}
          <Card className="p-5">
            <h3 className="font-bold text-sm text-gray-950 dark:text-white mb-4">AI Model Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Active Model Tag</label>
                <select
                  value={config?.model}
                  onChange={(e) => handleUpdateConfig("model", e.target.value)}
                  className="input text-xs py-2 w-full"
                >
                  <option value="llama3.2:3b">llama3.2:3b (Balanced - Llama 3.2 3B)</option>
                  <option value="qwen2.5:1.5b">qwen2.5:1.5b (Quick Assistant - Qwen 2.5 1.5B)</option>
                  <option value="llama3.1:8b">llama3.1:8b (Deep Thinker - Llama 3.1 8B)</option>
                  <option value="llava:7b">llava:7b (Vision - LLaVA 7B)</option>
                  <option value="mistral:7b">mistral:7b (Multilingual - Mistral 7B)</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Ensure the model tag is downloaded via the Setup wizard or run `ollama pull [tag]` before selecting.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Electricity Utility Rate ($/kWh)</label>
                <input
                  type="number"
                  step="0.005"
                  value={config?.electricity_rate_kwh}
                  onChange={(e) => handleUpdateConfig("electricity_rate", e.target.value)}
                  className="input text-xs py-2"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-800">
                <div>
                  <div className="text-xs font-semibold text-gray-900 dark:text-white">Desktop Notifications</div>
                  <div className="text-[10px] text-gray-500">Alerts when a workflow fails and circuit breaker triggers.</div>
                </div>
                <input
                  type="checkbox"
                  checked={config?.desktop_notifications}
                  onChange={(e) => handleUpdateConfig("desktop_notifications", e.target.checked ? "true" : "false")}
                  className="h-4 w-4 text-primary focus:ring-primary rounded"
                />
              </div>
            </div>
          </Card>

          {/* Secure Keychain */}
          <Card className="p-5">
            <h3 className="font-bold text-sm text-gray-950 dark:text-white mb-2 flex items-center gap-1.5">
              <Key className="h-4 w-4 text-primary" /> Object Vault Keychain (Local Credential Manager)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-normal">
              Store API keys for HTTP step credentials. EdgeStack saves credentials inside your computer's OS secure keychain (Apple Keychain / Credential Vault) and never writes them to raw database fields.
            </p>

            {secretError && <p className="text-xs text-red-500 mb-3">{secretError}</p>}

            <div className="flex gap-2.5 mb-5 items-end">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-gray-500 mb-1.5 block">Key Label</label>
                <input
                  type="text"
                  placeholder="SLACK_BOT_TOKEN"
                  value={newSecretName}
                  onChange={(e) => setNewSecretName(e.target.value)}
                  className="input text-xs py-2"
                />
              </div>
              <div className="flex-[2]">
                <label className="text-[10px] font-semibold text-gray-500 mb-1.5 block">API Key Value</label>
                <input
                  type="password"
                  placeholder="••••••••••••••••"
                  value={newSecretValue}
                  onChange={(e) => setNewSecretValue(e.target.value)}
                  className="input text-xs py-2"
                />
              </div>
              <Button onClick={handleAddSecret} size="sm" className="flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Key
              </Button>
            </div>

            <div className="space-y-2 border-t border-gray-250 dark:border-gray-800 pt-4">
              <h4 className="text-xs font-semibold text-gray-950 dark:text-white mb-2">Stored Keychain Access Keys</h4>
              {secrets.length === 0 ? (
                <div className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                  No secure API keys stored. Add one above to reference it as `{"{{secrets.[LABEL]}}"}` in workflows.
                </div>
              ) : (
                secrets.map((secName) => (
                  <div key={secName} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-850 rounded">
                    <span className="font-mono text-xs font-semibold text-gray-900 dark:text-white">{secName}</span>
                    <button
                      onClick={() => handleDeleteSecret(secName)}
                      className="btn btn-danger btn-sm p-1.5"
                      aria-label="Delete secret key"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Right side: system status stub info */}
        <div>
          <Card className="p-4 bg-gray-50 dark:bg-gray-900">
            <h4 className="font-semibold text-xs text-gray-900 dark:text-white mb-1.5">Keychain Security Note</h4>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-normal mb-3">
              EdgeStack references API keys under label values during workflow execution. Your passwords remain encrypted by your operating system, maintaining HIPAA, SOC-2, and business compliance.
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
              <HelpCircle className="h-4 w-4" /> Locked by System Keychain
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
