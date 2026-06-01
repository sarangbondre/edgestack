"use client";

import React, { useState, useEffect } from "react";
import { Layout } from "../../../components/layout/Layout";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { invoke } from "@tauri-apps/api/core";
import { useRouter } from "next/navigation";
import { Save, Eye, Code, ArrowLeft, Plus, Play, Info } from "lucide-react";
import Link from "next/link";
import Editor from "@monaco-editor/react";
import jsYaml from "js-yaml";

const DEFAULT_YAML = `name: "My Business Agent"
description: "Briefly explain what this agent automates"
steps:
  - name: "fetch_webpage"
    action: "browse_web"
    url: "https://example.com"

  - name: "analyze_content"
    action: "ask_ai"
    prompt: "Read this webpage content and summarize the core business model:\\n\\n{{steps.fetch_webpage.output}}"

  - name: "save_to_vault"
    action: "save_to_vault"
`;

export default function NewWorkflowPage() {
  const router = useRouter();
  const [name, setName] = useState("My Business Agent");
  const [description, setDescription] = useState("Briefly explain what this agent automates");
  const [yamlCode, setYamlCode] = useState(DEFAULT_YAML);
  const [activeTab, setActiveTab] = useState<"visual" | "yaml">("yaml");
  const [parsedSteps, setParsedSteps] = useState<any[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Validate YAML and parse steps
  const validateAndParse = (yamlStr: string) => {
    try {
      setValidationError(null);
      const parsed: any = jsYaml.load(yamlStr);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid YAML structure. Root must be a map.");
      }
      
      if (parsed.name) setName(parsed.name);
      if (parsed.description) setDescription(parsed.description);
      
      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        setParsedSteps([]);
        return;
      }
      
      setParsedSteps(parsed.steps);
    } catch (e: any) {
      setValidationError(e.message || "Failed to parse YAML.");
    }
  };

  useEffect(() => {
    validateAndParse(yamlCode);
  }, [yamlCode]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await invoke("create_workflow", {
        name,
        description: description || null,
        definitionYaml: yamlCode,
      });
      setSaving(false);
      router.push("/workflows");
    } catch (e: any) {
      console.error(e);
      setValidationError(e.toString() || "Failed to save workflow.");
      setSaving(false);
    }
  };

  const addStep = (actionType: string) => {
    try {
      const parsed: any = jsYaml.load(yamlCode) || {};
      const steps = parsed.steps || [];
      
      const newStepName = `${actionType}_step_${steps.length + 1}`;
      let newStep: any = {
        name: newStepName,
        action: actionType,
      };

      if (actionType === "browse_web") {
        newStep.url = "https://example.com";
      } else if (actionType === "ask_ai") {
        newStep.prompt = "Analyze output: {{steps.fetch_webpage.output}}";
      }

      steps.push(newStep);
      parsed.steps = steps;
      
      const newYaml = jsYaml.dump(parsed);
      setYamlCode(newYaml);
    } catch (e) {
      console.error("Failed to add step:", e);
    }
  };

  return (
    <Layout title="Workflow Editor">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Link href="/workflows" className="btn btn-ghost btn-sm p-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              {name || "Untitled Agent"}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{description || "Edit workflow settings below"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Visual/YAML toggle */}
          <div className="flex rounded-lg border border-gray-250 dark:border-gray-800 p-0.5 bg-gray-50 dark:bg-gray-900 mr-2">
            <button
              onClick={() => setActiveTab("visual")}
              className={`px-3 py-1 text-xs font-semibold rounded-md border-none cursor-pointer flex items-center gap-1 ${
                activeTab === "visual"
                  ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-250"
              }`}
            >
              <Eye className="h-3.5 w-3.5" /> Visual Canvas
            </button>
            <button
              onClick={() => setActiveTab("yaml")}
              className={`px-3 py-1 text-xs font-semibold rounded-md border-none cursor-pointer flex items-center gap-1 ${
                activeTab === "yaml"
                  ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-250"
              }`}
            >
              <Code className="h-3.5 w-3.5" /> YAML Editor
            </button>
          </div>

          <Button onClick={handleSave} loading={saving} disabled={!!validationError} className="flex items-center gap-1.5">
            <Save className="h-4 w-4" /> Save Workflow
          </Button>
        </div>
      </div>

      {validationError && (
        <Alert variant="error" title="YAML Compilation Error" className="mb-4">
          <span className="font-mono text-xs">{validationError}</span>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-180px)]">
        {/* Editor or Canvas */}
        <div className="lg:col-span-3 border border-gray-250 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-950 h-full flex flex-col">
          {activeTab === "yaml" ? (
            <Editor
              height="100%"
              defaultLanguage="yaml"
              theme="vs-dark"
              value={yamlCode}
              onChange={(val) => setYamlCode(val || "")}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollbar: { vertical: "auto", horizontal: "auto" },
              }}
            />
          ) : (
            <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-gray-50 dark:bg-gray-900/50">
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-lg mb-4 text-blue-800 dark:text-blue-300">
                <Info className="h-4 w-4" />
                <p className="text-[11px]">
                  Visual layout represents execution flow. Add actions on the sidebar or edit YAML directly to customize triggers.
                </p>
              </div>

              {/* Start node */}
              <div className="flex flex-col items-center">
                <div className="flow-node trigger border-green-500 bg-green-50 dark:bg-green-950/30 text-center font-bold">
                  Start (Manual / Schedule)
                </div>
                <div className="h-6 w-0.5 bg-gray-300 dark:bg-gray-700" />
              </div>

              {/* Steps list rendering */}
              {parsedSteps.length === 0 ? (
                <div className="text-center py-10 text-gray-500 dark:text-gray-400 text-xs">
                  No execution steps added yet. Use the sidebar to append a new step.
                </div>
              ) : (
                parsedSteps.map((step, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <div className="flow-node action max-w-sm w-full p-4 border border-blue-500 bg-blue-50/50 dark:bg-blue-950/20">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-mono text-[10px] text-gray-400">Step {idx + 1}</span>
                        <Badge variant="running" className="capitalize text-[9px] py-0">{step.action}</Badge>
                      </div>
                      <div className="font-semibold text-sm text-gray-950 dark:text-white truncate">
                        {step.name}
                      </div>
                      {step.url && (
                        <div className="text-[10px] text-gray-500 truncate mt-1">URL: {step.url}</div>
                      )}
                      {step.prompt && (
                        <div className="text-[10px] text-gray-500 truncate mt-1">Prompt: {step.prompt}</div>
                      )}
                    </div>
                    {idx < parsedSteps.length - 1 && (
                      <div className="h-6 w-0.5 bg-gray-300 dark:bg-gray-700" />
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Sidebar palette */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-bold text-sm text-gray-950 dark:text-white mb-3">Add Automation Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => addStep("browse_web")}
                className="w-full flex items-center gap-2 p-2.5 border border-gray-250 dark:border-gray-800 rounded-lg text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-900 border-dashed"
              >
                <Plus className="h-4 w-4 text-primary" />
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">Fetch Webpage</div>
                  <div className="text-[10px] text-gray-500">Read a URL & extract text</div>
                </div>
              </button>

              <button
                onClick={() => addStep("ask_ai")}
                className="w-full flex items-center gap-2 p-2.5 border border-gray-250 dark:border-gray-800 rounded-lg text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-900 border-dashed"
              >
                <Plus className="h-4 w-4 text-indigo-500" />
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">Ask Local AI</div>
                  <div className="text-[10px] text-gray-500">Process content using local model</div>
                </div>
              </button>

              <button
                onClick={() => addStep("save_to_vault")}
                className="w-full flex items-center gap-2 p-2.5 border border-gray-250 dark:border-gray-800 rounded-lg text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-900 border-dashed"
                disabled
              >
                <Plus className="h-4 w-4 text-emerald-500" />
                <div>
                  <div className="font-semibold text-gray-400">Save to Object Vault</div>
                  <div className="text-[10px] text-gray-400">Upload to local S3 storage</div>
                </div>
              </button>

              <button
                onClick={() => addStep("send_email")}
                className="w-full flex items-center gap-2 p-2.5 border border-gray-250 dark:border-gray-800 rounded-lg text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-900 border-dashed"
                disabled
              >
                <Plus className="h-4 w-4 text-amber-500" />
                <div>
                  <div className="font-semibold text-gray-400">Send Email Alert</div>
                  <div className="text-[10px] text-gray-400">Deliver notifications via SES</div>
                </div>
              </button>
            </div>
          </Card>

          <Card className="p-4 bg-gray-50 dark:bg-gray-900">
            <h4 className="font-semibold text-xs text-gray-900 dark:text-white mb-1.5">Quick Guide</h4>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-normal">
              You can reference outputs of previous steps in prompts using brackets syntax:{" "}
              <code className="bg-black/5 dark:bg-white/10 px-1 rounded font-mono">
                {"{{steps.[Step Name].output}}"}
              </code>.
            </p>
          </Card>
        </div>
      </div>
    </Layout>
  );
}


