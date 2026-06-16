import jsYaml from "js-yaml";

// Check if running in Tauri environment
const isTauri = typeof window !== "undefined" && (window as any).__TAURI_IPC__ !== undefined;

// Event listener registry
type Listener = (event: { payload: any }) => void;
const eventListeners: { [key: string]: Listener[] } = {};

export const listen = async <T>(
  eventName: string,
  handler: (event: { payload: T }) => void
): Promise<() => void> => {
  if (isTauri) {
    const { listen: tauriListen } = await import("@tauri-apps/api/event");
    return tauriListen(eventName, handler as any);
  }

  if (!eventListeners[eventName]) {
    eventListeners[eventName] = [];
  }
  eventListeners[eventName].push(handler as any);

  // Return unsubscribe function
  return () => {
    eventListeners[eventName] = eventListeners[eventName].filter((h) => h !== handler);
  };
};

export const emitMockEvent = (eventName: string, payload: any) => {
  if (eventListeners[eventName]) {
    eventListeners[eventName].forEach((h) => h({ payload }));
  }
};

// MOCK LOCAL DATABASE SEEDS
const defaultWorkflows = [
  {
    id: "wf_customer_support",
    name: "Customer Support Automation",
    description: "Fetches inbound support request ticket, reads context, drafts response using local AI, and saves to vault.",
    enabled: true,
    status: "idle",
    last_run: new Date(Date.now() - 3600000 * 2).toISOString(),
    next_run: new Date(Date.now() + 3600000 * 4).toISOString(),
    run_count: 24,
    success_rate: 100,
    definition_yaml: `name: Customer Support Automation
description: Fetches inbound support request ticket, reads context, drafts response using local AI, and saves to vault.
steps:
  - name: fetch_support_ticket
    action: browse_web
    url: https://api.mybusiness.com/tickets/latest
  - name: generate_support_reply
    action: ask_ai
    prompt: "You are a support assistant. Draft a helpful, empathetic reply to this customer ticket: {{steps.fetch_support_ticket.output}}. Suggest checking our status page if it's an outage."
  - name: save_draft_to_vault
    action: ask_ai
    prompt: "Save this reply drafted as a JSON document: {{steps.generate_support_reply.output}}"`
  },
  {
    id: "wf_lead_enrichment",
    name: "Lead Enrichment Agent",
    description: "Fetches target competitor pricing table, analyzes pricing trends, and saves competitor metrics.",
    enabled: true,
    status: "idle",
    last_run: new Date(Date.now() - 3600000 * 24).toISOString(),
    next_run: null,
    run_count: 12,
    success_rate: 91,
    definition_yaml: `name: Lead Enrichment Agent
description: Fetches target competitor pricing table, analyzes pricing trends, and saves competitor metrics.
steps:
  - name: fetch_pricing_page
    action: browse_web
    url: https://competitor.com/pricing
  - name: extract_price_points
    action: ask_ai
    prompt: "Extract all pricing tiers, feature lists, and monthly rates from this text: {{steps.fetch_pricing_page.output}}"`
  },
  {
    id: "wf_slack_feedback",
    name: "Slack Feedback Categorizer (HITL)",
    description: "Extracts customer feedback channels, categorizes sentiment, and publishes notifications (Demonstrates Human-in-the-Loop Gateway).",
    enabled: true,
    status: "idle",
    last_run: new Date(Date.now() - 3600000 * 48).toISOString(),
    next_run: null,
    run_count: 8,
    success_rate: 75,
    definition_yaml: `name: Slack Feedback Categorizer (HITL)
description: Extracts customer feedback channels, categorizes sentiment, and publishes notifications.
steps:
  - name: fetch_feedback_logs
    action: browse_web
    url: https://internal.chatlogs.local/feedback
  - name: categorize_urgency
    action: ask_ai
    prompt: "Classify feedback sentiment as positive, neutral, or negative: {{steps.fetch_feedback_logs.output}}"
  - name: post_slack_notification
    action: ask_ai
    prompt: "Send urgent negative comments to slack channel using SLACK_BOT_TOKEN client credential."`
  }
];

const defaultRuns = [
  {
    id: "run_d29381ea",
    workflow_id: "wf_customer_support",
    workflow_name: "Customer Support Automation",
    status: "completed",
    started_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    completed_at: new Date(Date.now() - 3600000 * 2 + 8000).toISOString(),
    trigger_type: "schedule",
    retry_count: 0,
    failure_step: null,
    failure_reason_ai: null,
    human_action: null,
    steps: [
      {
        step_name: "fetch_support_ticket",
        step_index: 0,
        status: "completed",
        started_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        completed_at: new Date(Date.now() - 3600000 * 2 + 2000).toISOString(),
        output: "Ticket #4082: Cannot connect local Ollama API from corporate VPC proxy. Returns SSL validation failed.",
        error: null,
        tokens_out: null
      },
      {
        step_name: "generate_support_reply",
        step_index: 1,
        status: "completed",
        started_at: new Date(Date.now() - 3600000 * 2 + 2000).toISOString(),
        completed_at: new Date(Date.now() - 3600000 * 2 + 5500).toISOString(),
        output: "Hello! If you are behind a corporate proxy, Ollama may fail SSL validation. Try setting environmental variable OLLAMA_SSL_BYPASS=true or importing your proxy certificate authority into Ollama's trusted root store.",
        error: null,
        tokens_out: 142
      },
      {
        step_name: "save_draft_to_vault",
        step_index: 2,
        status: "completed",
        started_at: new Date(Date.now() - 3600000 * 2 + 5500).toISOString(),
        completed_at: new Date(Date.now() - 3600000 * 2 + 8000).toISOString(),
        output: "{\n  \"ticketId\": 4082,\n  \"replyDrafted\": \"Hello! If you are behind a corporate proxy...\",\n  \"status\": \"pending_approval\"\n}",
        error: null,
        tokens_out: 68
      }
    ]
  },
  {
    id: "run_f9a8d2c4",
    workflow_id: "wf_lead_enrichment",
    workflow_name: "Lead Enrichment Agent",
    status: "completed",
    started_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    completed_at: new Date(Date.now() - 3600000 * 24 + 5000).toISOString(),
    trigger_type: "manual",
    retry_count: 0,
    failure_step: null,
    failure_reason_ai: null,
    human_action: null,
    steps: [
      {
        step_name: "fetch_pricing_page",
        step_index: 0,
        status: "completed",
        started_at: new Date(Date.now() - 3600000 * 24).toISOString(),
        completed_at: new Date(Date.now() - 3600000 * 24 + 2000).toISOString(),
        output: "Competitor Rates: Free Tier ($0), Starter Tier ($29/mo, limits to 5 users), Professional Tier ($99/mo, unlimited).",
        error: null,
        tokens_out: null
      },
      {
        step_name: "extract_price_points",
        step_index: 1,
        status: "completed",
        started_at: new Date(Date.now() - 3600000 * 24 + 2000).toISOString(),
        completed_at: new Date(Date.now() - 3600000 * 24 + 5000).toISOString(),
        output: "1. Free: $0/mo\n2. Starter: $29/mo (max 5 users)\n3. Professional: $99/mo (unlimited scale)",
        error: null,
        tokens_out: 85
      }
    ]
  }
];

const defaultNotifications = [
  {
    id: "notif_1",
    type: "failure",
    severity: "error",
    workflow_id: "wf_slack_feedback",
    run_id: "run_slack_failed_hitl",
    title: "Inference Paused — Slack Feedback Categorizer",
    body: "Step 'post_slack_notification' returned credential verification failure. Subprocess paused awaiting review.",
    sent_at: new Date(Date.now() - 3600000).toISOString(),
    read_at: null
  },
  {
    id: "notif_2",
    type: "cost",
    severity: "info",
    workflow_id: null,
    run_id: null,
    title: "Weekly Budget Report",
    body: "EdgeStack saved $248.50 in cloud alternative fees this week by running 324 local LLM workflows.",
    sent_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    read_at: new Date(Date.now() - 3600000 * 5).toISOString()
  }
];

const defaultVaults = [
  { name: "customer-support-replies", object_count: 12, total_size_bytes: 48200, last_modified: new Date().toISOString() },
  { name: "competitor-pricing-reports", object_count: 5, total_size_bytes: 124500, last_modified: new Date(Date.now() - 3600000 * 5).toISOString() }
];

const defaultVaultObjects = [
  { key: "reply_ticket_4082.json", size_bytes: 1205, last_modified: new Date(Date.now() - 3600000 * 2).toISOString(), content_type: "application/json", workflow_name: "Customer Support Automation" },
  { key: "reply_ticket_4079.json", size_bytes: 984, last_modified: new Date(Date.now() - 3600000 * 4).toISOString(), content_type: "application/json", workflow_name: "Customer Support Automation" },
  { key: "pricing_matrix_june.txt", size_bytes: 4200, last_modified: new Date(Date.now() - 3600000 * 24).toISOString(), content_type: "text/plain", workflow_name: "Lead Enrichment Agent" }
];

// Helper to initialize local storage
const initializeLocalStorage = () => {
  if (typeof window === "undefined") return;

  if (!localStorage.getItem("edgestack_workflows")) {
    localStorage.setItem("edgestack_workflows", JSON.stringify(defaultWorkflows));
  }
  if (!localStorage.getItem("edgestack_runs")) {
    localStorage.setItem("edgestack_runs", JSON.stringify(defaultRuns));
  }
  if (!localStorage.getItem("edgestack_notifications")) {
    localStorage.setItem("edgestack_notifications", JSON.stringify(defaultNotifications));
  }
  if (!localStorage.getItem("edgestack_vaults")) {
    localStorage.setItem("edgestack_vaults", JSON.stringify(defaultVaults));
  }
  if (!localStorage.getItem("edgestack_vault_objects")) {
    localStorage.setItem("edgestack_vault_objects", JSON.stringify(defaultVaultObjects));
  }
  if (!localStorage.getItem("edgestack_secrets")) {
    localStorage.setItem("edgestack_secrets", JSON.stringify(["SLACK_BOT_TOKEN", "AWS_VAULT_KEY"]));
  }
  if (!localStorage.getItem("edgestack_config")) {
    localStorage.setItem("edgestack_config", JSON.stringify({
      setup_complete: false,
      model: "llama3.2:3b",
      max_cpu_cores: 4,
      max_memory_gb: 8,
      max_disk_gb: 20,
      electricity_rate_kwh: 0.15,
      desktop_notifications: true,
      theme: "dark"
    }));
  }
  if (!localStorage.getItem("edgestack_instances")) {
    localStorage.setItem("edgestack_instances", JSON.stringify([
      { id: "i-local-a3f8c2d1", name: "alpine-edge", state: "running", image: "Alpine Linux", cpu_cores: 2, memory_gb: 4, disk_gb: 20, uptime_seconds: 43200, created_at: new Date().toISOString() },
      { id: "i-local-b5f6d7e8", name: "db-primary", state: "stopped", image: "Debian 12", cpu_cores: 4, memory_gb: 8, disk_gb: 40, uptime_seconds: 0, created_at: new Date().toISOString() },
      { id: "i-local-c9d0e1f2", name: "k3s-control-node", state: "running", image: "Ubuntu 22.04 LTS", cpu_cores: 8, memory_gb: 16, disk_gb: 80, uptime_seconds: 172800, created_at: new Date().toISOString() },
      { id: "i-local-d3e4f5a6", name: "ollama-worker-1", state: "running", image: "Ubuntu 22.04 LTS", cpu_cores: 4, memory_gb: 8, disk_gb: 50, uptime_seconds: 86400, created_at: new Date().toISOString() }
    ]));
  }
  if (!localStorage.getItem("edgestack_containers")) {
    localStorage.setItem("edgestack_containers", JSON.stringify([
      { id: "c-nginx-web", instance_id: "i-local-c9d0e1f2", name: "web-gateway", status: "running", cpu_pct: 1.2, memory_mb: 45, network_io: "1.2 KB/s", block_io: "0 B/s", image: "nginx:alpine", created_at: new Date().toISOString() },
      { id: "c-postgres-db", instance_id: "i-local-c9d0e1f2", name: "postgres-primary", status: "running", cpu_pct: 0.8, memory_mb: 120, network_io: "512 B/s", block_io: "4.2 KB/s", image: "postgres:15-alpine", created_at: new Date().toISOString() },
      { id: "c-redis-cache", instance_id: "i-local-d3e4f5a6", name: "redis-shared", status: "running", cpu_pct: 0.2, memory_mb: 15, network_io: "2.1 KB/s", block_io: "0 B/s", image: "redis:alpine", created_at: new Date().toISOString() },
      { id: "c-ollama-service", instance_id: "i-local-a3f8c2d1", name: "ollama-inference", status: "running", cpu_pct: 12.5, memory_mb: 4300, network_io: "0 B/s", block_io: "12.8 KB/s", image: "ollama/ollama", created_at: new Date().toISOString() },
      { id: "c-workflow-worker", instance_id: "i-local-a3f8c2d1", name: "workflow-runner-1", status: "running", cpu_pct: 0.5, memory_mb: 85, network_io: "124 B/s", block_io: "0 B/s", image: "python:3.11-slim", created_at: new Date().toISOString() },
      { id: "c-telemetry-agent", instance_id: "i-local-a3f8c2d1", name: "sys-metrics-collector", status: "running", cpu_pct: 0.4, memory_mb: 32, network_io: "340 B/s", block_io: "0 B/s", image: "gcr.io/cadvisor:latest", created_at: new Date().toISOString() },
      { id: "c-db-sync", instance_id: "i-local-b5f6d7e8", name: "backup-agent", status: "stopped", cpu_pct: 0.0, memory_mb: 0, network_io: "0 B/s", block_io: "0 B/s", image: "restic/restic:latest", created_at: new Date().toISOString() },
      { id: "c-cert-manager", instance_id: "i-local-c9d0e1f2", name: "cert-manager", status: "running", cpu_pct: 0.1, memory_mb: 28, network_io: "45 B/s", block_io: "0 B/s", image: "cert-manager-controller:v1.12.0", created_at: new Date().toISOString() },
      { id: "c-fluent-bit", instance_id: "i-local-c9d0e1f2", name: "log-shipper", status: "running", cpu_pct: 0.6, memory_mb: 18, network_io: "4.8 KB/s", block_io: "1.2 KB/s", image: "fluent/fluent-bit:latest", created_at: new Date().toISOString() },
      { id: "c-node-exporter", instance_id: "i-local-c9d0e1f2", name: "node-exporter", status: "running", cpu_pct: 0.3, memory_mb: 12, network_io: "180 B/s", block_io: "0 B/s", image: "prom/node-exporter:latest", created_at: new Date().toISOString() },
      { id: "c-app-proxy", instance_id: "i-local-d3e4f5a6", name: "envoy-sidecar", status: "running", cpu_pct: 0.7, memory_mb: 24, network_io: "3.2 KB/s", block_io: "0 B/s", image: "envoyproxy/envoy:v1.26.0", created_at: new Date().toISOString() },
      { id: "c-auth-portal", instance_id: "i-local-d3e4f5a6", name: "oauth2-proxy", status: "running", cpu_pct: 0.4, memory_mb: 22, network_io: "150 B/s", block_io: "0 B/s", image: "bitnami/oauth2-proxy:latest", created_at: new Date().toISOString() }
    ]));
  }
};

initializeLocalStorage();

// Running execution background loops registry
const activeSimulations: { [runId: string]: NodeJS.Timeout | any } = {};

const simulateRunProcess = (runId: string, workflowId: string, currentStepIndex: number = 0, isRetry: boolean = false) => {
  const runWork = () => {
    if (typeof window === "undefined") return;

    const runs = JSON.parse(localStorage.getItem("edgestack_runs") || "[]");
    const runIdx = runs.findIndex((r: any) => r.id === runId);
    if (runIdx === -1) return;

    const run = runs[runIdx];
    const steps = run.steps;

    // Finish workflow if completed all steps
    if (currentStepIndex >= steps.length) {
      run.status = "completed";
      run.completed_at = new Date().toISOString();
      runs[runIdx] = run;
      localStorage.setItem("edgestack_runs", JSON.stringify(runs));

      // Update workflow count and status
      const workflows = JSON.parse(localStorage.getItem("edgestack_workflows") || "[]");
      const wfIdx = workflows.findIndex((w: any) => w.id === workflowId);
      if (wfIdx !== -1) {
        workflows[wfIdx].status = "idle";
        workflows[wfIdx].run_count += 1;
        workflows[wfIdx].last_run = new Date().toISOString();
        localStorage.setItem("edgestack_workflows", JSON.stringify(workflows));
      }

      // Add completion notification
      const notifications = JSON.parse(localStorage.getItem("edgestack_notifications") || "[]");
      notifications.unshift({
        id: `notif_${Math.random().toString(36).substr(2, 9)}`,
        type: "system",
        severity: "info",
        workflow_id: workflowId,
        run_id: runId,
        title: "Workflow Run Completed",
        body: `Workflow '${run.workflow_name}' completed all steps successfully.`,
        sent_at: new Date().toISOString(),
        read_at: null
      });
      localStorage.setItem("edgestack_notifications", JSON.stringify(notifications));

      emitMockEvent("workflow_step_completed", { run_id: runId });
      delete activeSimulations[runId];
      return;
    }

    // Process current step
    const step = steps[currentStepIndex];
    step.status = "running";
    step.started_at = new Date().toISOString();
    runs[runIdx] = run;
    localStorage.setItem("edgestack_runs", JSON.stringify(runs));

    // Update workflow active status
    const workflows = JSON.parse(localStorage.getItem("edgestack_workflows") || "[]");
    const wfIdx = workflows.findIndex((w: any) => w.id === workflowId);
    if (wfIdx !== -1) {
      workflows[wfIdx].status = "running";
      localStorage.setItem("edgestack_workflows", JSON.stringify(workflows));
    }

    emitMockEvent("workflow_step_started", { run_id: runId });

    // Step execution delay: 2.5 seconds
    activeSimulations[runId] = setTimeout(() => {
      // Simulate failure on the Slack POST step if this is not a retry
      if (workflowId === "wf_slack_feedback" && step.step_name === "post_slack_notification" && !isRetry) {
        // Halt and trigger Human-in-the-Loop
        step.status = "failed";
        step.error = "[ERROR] Credential Error: Slack Bot client token SLACK_BOT_TOKEN failed authorization check.\n[ERROR] HTTP 401: Unauthorized";
        
        run.status = "paused_awaiting_human";
        run.failure_step = step.step_name;
        run.failure_reason_ai = "Local LLM evaluation indicates the Slack integration key SLACK_BOT_TOKEN stored in the Keychain is missing or expired, preventing API dispatch.";
        run.failure_raw_log = `[2026-06-04T12:00:04Z] [INFO] Initiating request to slack.com/api/chat.postMessage\n[2026-06-04T12:00:05Z] [WARN] Auth header check failed.\n[2026-06-04T12:00:05Z] [ERROR] HTTP 401 Unauthorized client response.\n[2026-06-04T12:00:05Z] [FATAL] Step 'post_slack_notification' failed execution in Slack Feedback Categorizer. Awaiting human intervention.`;

        runs[runIdx] = run;
        localStorage.setItem("edgestack_runs", JSON.stringify(runs));

        // Update workflow status
        if (wfIdx !== -1) {
          workflows[wfIdx].status = "paused";
          localStorage.setItem("edgestack_workflows", JSON.stringify(workflows));
        }

        // Add failure notification
        const notifications = JSON.parse(localStorage.getItem("edgestack_notifications") || "[]");
        notifications.unshift({
          id: `notif_${Math.random().toString(36).substr(2, 9)}`,
          type: "failure",
          severity: "error",
          workflow_id: workflowId,
          run_id: runId,
          title: "Inference Paused — Slack Feedback Categorizer",
          body: "Workflow post_slack_notification step failed authorization. Paused awaiting operator intervention.",
          sent_at: new Date().toISOString(),
          read_at: null
        });
        localStorage.setItem("edgestack_notifications", JSON.stringify(notifications));

        emitMockEvent("workflow_failed", { run_id: runId });
        delete activeSimulations[runId];
        return;
      }

      // Success branch
      step.status = "completed";
      step.completed_at = new Date().toISOString();
      step.tokens_out = Math.floor(50 + Math.random() * 200);

      // Generate a mock output
      if (step.step_name.includes("fetch")) {
        step.output = `HTTP GET completed with 200 OK. Payload size: 4.8 KB. Contents: [Seeded raw text dataset for ${step.step_name} containing business data, user comments, and pricing values.]`;
      } else if (step.step_name.includes("extract") || step.step_name.includes("categorize") || step.step_name.includes("reply")) {
        step.output = `Local LLM Output:\n- Content: Evaluated inputs successfully.\n- Sentiment categorizations: Positive (60%), Neutral (30%), Critical (10%).\n- Recommendation: Alert operator to critical item immediately.`;
      } else {
        step.output = `Operation executed successfully. Saved outputs to file vault workspace: /vault/${step.step_name}.json. Size: 1.2 KB.`;
        // Also save object to mock vault!
        try {
          const vaults = JSON.parse(localStorage.getItem("edgestack_vaults") || "[]");
          const vaultObjects = JSON.parse(localStorage.getItem("edgestack_vault_objects") || "[]");
          const targetVault = vaults.length > 0 ? vaults[0].name : "customer-support-replies";

          const newObj = {
            key: `${step.step_name}_output_${Math.floor(Math.random() * 1000)}.json`,
            size_bytes: Math.floor(100 + Math.random() * 1200),
            last_modified: new Date().toISOString(),
            content_type: "application/json",
            workflow_name: run.workflow_name
          };
          vaultObjects.unshift(newObj);
          localStorage.setItem("edgestack_vault_objects", JSON.stringify(vaultObjects));

          // Increment vault count
          const vIdx = vaults.findIndex((v: any) => v.name === targetVault);
          if (vIdx !== -1) {
            vaults[vIdx].object_count += 1;
            vaults[vIdx].total_size_bytes += newObj.size_bytes;
            vaults[vIdx].last_modified = new Date().toISOString();
            localStorage.setItem("edgestack_vaults", JSON.stringify(vaults));
          }
        } catch (e) {
          console.error("Vault injection failed:", e);
        }
      }

      runs[runIdx] = run;
      localStorage.setItem("edgestack_runs", JSON.stringify(runs));

      emitMockEvent("workflow_step_completed", { run_id: runId });

      // Run next step
      simulateRunProcess(runId, workflowId, currentStepIndex + 1, isRetry);
    }, 2500);
  };

  runWork();
};

// MOCK TAURI INTERCEPTOR
export const invoke = async (cmd: string, args?: any): Promise<any> => {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke(cmd, args);
  }

  // Brief latency simulation to feel natural (100ms)
  await new Promise((resolve) => setTimeout(resolve, 80));

  // Switch statement for mock handlers
  switch (cmd) {
    case "is_setup_complete": {
      const config = JSON.parse(localStorage.getItem("edgestack_config") || "{}");
      return !!config.setup_complete;
    }

    case "scan_hardware": {
      await new Promise((resolve) => setTimeout(resolve, 1500)); // scan takes longer
      return {
        cpu_cores: 12,
        cpu_brand: "Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz",
        ram_total_gb: 16.0,
        ram_available_gb: 6.0,
        gpu_vendor: "AMD Radeon Pro 5300M",
        gpu_vram_gb: 4.0,
        disk_free_gb: 388.0,
        tier: "Good Performance",
        cpu_label: "12 Cores (Intel i7-9750H)",
        cpu_tier: "good",
        ram_label: "16 GB (6.0 GB Available)",
        ram_tier: "capable",
        gpu_label: "AMD Radeon Pro 5300M (4 GB)",
        gpu_tier: "good",
        disk_label: "388.0 GB Free",
        disk_tier: "ssd"
      };
    }

    case "get_model_recommendations": {
      return [
        {
          id: "llama32",
          display_name: "Llama 3.2 3B (Balanced)",
          category: "Balanced",
          ollama_tag: "llama3.2:3b",
          description: "Perfect blend of speed and reasoning capability for day-to-day business tasks.",
          good_at: "General text, logic, email templates, categorizations",
          download_gb: 2.0,
          memory_gb: 4.0,
          license: "Llama 3.2 License",
          recommended: true
        },
        {
          id: "qwen15",
          display_name: "Qwen 2.5 1.5B (Lightweight)",
          category: "Lightweight",
          ollama_tag: "qwen2.5:1.5b",
          description: "Ultra-fast response model suited for basic scraping and simple extraction workloads.",
          good_at: "Structured extraction, parsing, basic tasks",
          download_gb: 1.2,
          memory_gb: 2.0,
          license: "Apache 2.0",
          recommended: false
        },
        {
          id: "llama31",
          display_name: "Llama 3.1 8B (Deep Thinking)",
          category: "Heavy Reasoning",
          ollama_tag: "llama3.1:8b",
          description: "Larger parameter set for writing complex drafts, financial reports, or code pipelines.",
          good_at: "Complex agent chains, deep reasoning, long content writing",
          download_gb: 4.7,
          memory_gb: 8.0,
          license: "Llama 3.1 License",
          recommended: false
        }
      ];
    }

    case "save_setup_config": {
      const config = JSON.parse(localStorage.getItem("edgestack_config") || "{}");
      config.setup_complete = true;
      config.model = args.model;
      config.max_cpu_cores = args.cpuCores;
      config.max_memory_gb = args.memoryGb;
      config.max_disk_gb = args.diskGb;
      config.electricity_rate_kwh = args.electricityRate;
      localStorage.setItem("edgestack_config", JSON.stringify(config));
      return true;
    }

    case "check_ollama": {
      return true;
    }

    case "pull_model": {
      // Pull progress loops
      let pct = 0;
      const interval = setInterval(() => {
        pct += 10;
        emitMockEvent("model_download_progress", {
          pct,
          status: pct < 100 ? `Downloading model shards (${pct}%)` : "Extracting model files..."
        });
        if (pct >= 100) {
          clearInterval(interval);
        }
      }, 300);
      await new Promise((resolve) => setTimeout(resolve, 3300));
      return true;
    }

    case "run_benchmark": {
      const steps = [
        { step: 1, label: "Warm up model in VRAM..." },
        { step: 2, label: "Evaluating prompt ingestion..." },
        { step: 3, label: "Benchmarking output generations..." },
        { step: 4, label: "Measuring memory footprints..." },
        { step: 5, label: "Finalizing benchmarks..." }
      ];

      for (const s of steps) {
        emitMockEvent("benchmark_progress", { step: s.step, total: 5, label: s.label });
        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      return {
        model_name: args.modelName || "llama3.2:3b",
        tokens_per_second: 32.4,
        first_token_ms: 180,
        memory_used_gb: 4.1,
        cpu_pct: 28.5,
        responses_per_minute: 185
      };
    }

    case "get_config": {
      return JSON.parse(localStorage.getItem("edgestack_config") || "{}");
    }

    case "update_config": {
      const config = JSON.parse(localStorage.getItem("edgestack_config") || "{}");
      if (args.key === "model") config.model = args.value;
      if (args.key === "theme") config.theme = args.value;
      if (args.key === "electricity_rate") config.electricity_rate_kwh = parseFloat(args.value) || 0.12;
      if (args.key === "desktop_notifications") config.desktop_notifications = args.value === "true";
      localStorage.setItem("edgestack_config", JSON.stringify(config));
      return true;
    }

    case "get_secret_names": {
      return JSON.parse(localStorage.getItem("edgestack_secrets") || "[]");
    }

    case "store_secret": {
      const secrets = JSON.parse(localStorage.getItem("edgestack_secrets") || "[]");
      if (!secrets.includes(args.name)) {
        secrets.push(args.name);
      }
      localStorage.setItem("edgestack_secrets", JSON.stringify(secrets));
      return true;
    }

    case "delete_secret": {
      let secrets = JSON.parse(localStorage.getItem("edgestack_secrets") || "[]");
      secrets = secrets.filter((s: string) => s !== args.name);
      localStorage.setItem("edgestack_secrets", JSON.stringify(secrets));
      return true;
    }

    case "list_workflows": {
      return JSON.parse(localStorage.getItem("edgestack_workflows") || "[]");
    }

    case "get_workflow": {
      const workflows = JSON.parse(localStorage.getItem("edgestack_workflows") || "[]");
      return workflows.find((w: any) => w.id === args.id) || null;
    }

    case "create_workflow": {
      const workflows = JSON.parse(localStorage.getItem("edgestack_workflows") || "[]");
      const id = `wf_${Math.random().toString(36).substr(2, 9)}`;
      const newWf = {
        id,
        name: args.name,
        description: args.description || null,
        enabled: true,
        status: "idle",
        last_run: null,
        next_run: null,
        run_count: 0,
        success_rate: 100,
        definition_yaml: args.definitionYaml
      };
      workflows.push(newWf);
      localStorage.setItem("edgestack_workflows", JSON.stringify(workflows));
      return id;
    }

    case "update_workflow": {
      const workflows = JSON.parse(localStorage.getItem("edgestack_workflows") || "[]");
      const idx = workflows.findIndex((w: any) => w.id === args.id);
      if (idx !== -1) {
        workflows[idx].name = args.name;
        workflows[idx].description = args.description;
        workflows[idx].definition_yaml = args.definitionYaml;
        localStorage.setItem("edgestack_workflows", JSON.stringify(workflows));
        return true;
      }
      throw new Error("Workflow not found.");
    }

    case "delete_workflow": {
      let workflows = JSON.parse(localStorage.getItem("edgestack_workflows") || "[]");
      workflows = workflows.filter((w: any) => w.id !== args.id);
      localStorage.setItem("edgestack_workflows", JSON.stringify(workflows));
      
      // Also delete runs
      let runs = JSON.parse(localStorage.getItem("edgestack_runs") || "[]");
      runs = runs.filter((r: any) => r.workflow_id !== args.id);
      localStorage.setItem("edgestack_runs", JSON.stringify(runs));
      return true;
    }

    case "list_all_runs":
    case "list_runs": {
      return JSON.parse(localStorage.getItem("edgestack_runs") || "[]");
    }

    case "get_run": {
      const runs = JSON.parse(localStorage.getItem("edgestack_runs") || "[]");
      return runs.find((r: any) => r.id === args.runId) || null;
    }

    case "run_workflow": {
      const workflows = JSON.parse(localStorage.getItem("edgestack_workflows") || "[]");
      const wf = workflows.find((w: any) => w.id === args.id);
      if (!wf) throw new Error("Workflow not found");

      // Parse YAML steps
      let stepsParsed: any[] = [];
      try {
        const parsed: any = jsYaml.load(wf.definition_yaml);
        if (parsed && Array.isArray(parsed.steps)) {
          stepsParsed = parsed.steps;
        }
      } catch (e) {
        console.error("YAML load failed, using defaults", e);
      }

      if (stepsParsed.length === 0) {
        stepsParsed = [
          { name: "initialize_job", action: "ask_ai" },
          { name: "process_data", action: "ask_ai" },
          { name: "save_outcome", action: "ask_ai" }
        ];
      }

      const runId = `run_${Math.random().toString(36).substr(2, 8)}`;
      const runSteps = stepsParsed.map((s, idx) => ({
        step_name: s.name,
        step_index: idx,
        status: "pending",
        started_at: "",
        completed_at: null,
        output: null,
        error: null,
        tokens_out: null
      }));

      const newRun = {
        id: runId,
        workflow_id: wf.id,
        workflow_name: wf.name,
        status: "running",
        started_at: new Date().toISOString(),
        completed_at: null,
        trigger_type: args.triggerType || "manual",
        retry_count: 0,
        failure_step: null,
        failure_reason_ai: null,
        human_action: null,
        steps: runSteps
      };

      const runs = JSON.parse(localStorage.getItem("edgestack_runs") || "[]");
      runs.unshift(newRun);
      localStorage.setItem("edgestack_runs", JSON.stringify(runs));

      // Trigger background simulation
      simulateRunProcess(runId, wf.id, 0);
      return runId;
    }

    case "record_human_action": {
      const runs = JSON.parse(localStorage.getItem("edgestack_runs") || "[]");
      const runIdx = runs.findIndex((r: any) => r.id === args.runId);
      if (runIdx === -1) throw new Error("Run not found");

      const run = runs[runIdx];
      const pausedStepIndex = run.steps.findIndex((s: any) => s.status === "failed");
      if (pausedStepIndex === -1) throw new Error("No failed step to action");

      run.human_action = args.action;
      run.retry_count += 1;

      if (args.action === "stop") {
        run.status = "failed";
        run.completed_at = new Date().toISOString();
        runs[runIdx] = run;
        localStorage.setItem("edgestack_runs", JSON.stringify(runs));

        // Update workflow
        const workflows = JSON.parse(localStorage.getItem("edgestack_workflows") || "[]");
        const wfIdx = workflows.findIndex((w: any) => w.id === run.workflow_id);
        if (wfIdx !== -1) {
          workflows[wfIdx].status = "error";
          localStorage.setItem("edgestack_workflows", JSON.stringify(workflows));
        }

        emitMockEvent("workflow_failed", { run_id: args.runId });
        return true;
      }

      if (args.action === "skip") {
        run.steps[pausedStepIndex].status = "completed";
        run.steps[pausedStepIndex].output = "[SKIPPED] Skipped by human operator.";
        run.status = "running";
        run.failure_step = null;
        run.failure_reason_ai = null;
        run.failure_raw_log = null;
        runs[runIdx] = run;
        localStorage.setItem("edgestack_runs", JSON.stringify(runs));

        simulateRunProcess(args.runId, run.workflow_id, pausedStepIndex + 1);
        return true;
      }

      if (args.action === "retry_now") {
        run.status = "running";
        run.failure_step = null;
        run.failure_reason_ai = null;
        run.failure_raw_log = null;
        runs[runIdx] = run;
        localStorage.setItem("edgestack_runs", JSON.stringify(runs));

        // Resume simulation and pass isRetry = true so the step succeeds
        simulateRunProcess(args.runId, run.workflow_id, pausedStepIndex, true);
        return true;
      }

      if (args.action === "retry_delayed") {
        run.status = "running";
        run.failure_step = null;
        run.failure_reason_ai = null;
        run.failure_raw_log = null;
        runs[runIdx] = run;
        localStorage.setItem("edgestack_runs", JSON.stringify(runs));

        setTimeout(() => {
          simulateRunProcess(args.runId, run.workflow_id, pausedStepIndex, true);
        }, (args.delayMinutes || 1) * 5000); // 5s per simulated delay minute
        return true;
      }

      throw new Error("Invalid action choice.");
    }

    case "get_failure_review": {
      const runs = JSON.parse(localStorage.getItem("edgestack_runs") || "[]");
      const r = runs.find((run: any) => run.id === args.runId);
      if (!r) throw new Error("Run not found");
      return {
        run_id: args.runId,
        workflow_name: r.workflow_name,
        failure_step: r.failure_step || "post_slack_notification",
        ai_explanation: r.failure_reason_ai || "Local LLM evaluation indicates the Slack integration key SLACK_BOT_TOKEN stored in the Keychain is missing or expired, preventing API dispatch.",
        raw_log: r.failure_raw_log || "[FATAL] Step 'post_slack_notification' failed execution in Slack Feedback Categorizer. Awaiting human intervention."
      };
    }

    case "get_circuit_breaker_state": {
      return {
        workflow_id: args.workflowId,
        state: "CLOSED",
        consecutive_failures: 0,
        last_failure_at: null,
        next_retry_at: null
      };
    }

    case "list_notifications": {
      return JSON.parse(localStorage.getItem("edgestack_notifications") || "[]");
    }

    case "mark_all_notifications_read": {
      const list = JSON.parse(localStorage.getItem("edgestack_notifications") || "[]");
      const readList = list.map((n: any) => ({ ...n, read_at: new Date().toISOString() }));
      localStorage.setItem("edgestack_notifications", JSON.stringify(readList));
      return true;
    }

    case "list_vaults": {
      return JSON.parse(localStorage.getItem("edgestack_vaults") || "[]");
    }

    case "list_vault_objects": {
      const list = JSON.parse(localStorage.getItem("edgestack_vault_objects") || "[]");
      return list;
    }

    case "create_vault": {
      const vaults = JSON.parse(localStorage.getItem("edgestack_vaults") || "[]");
      if (vaults.some((v: any) => v.name === args.name)) {
        throw new Error("Vault already exists.");
      }
      vaults.push({
        name: args.name,
        object_count: 0,
        total_size_bytes: 0,
        last_modified: new Date().toISOString()
      });
      localStorage.setItem("edgestack_vaults", JSON.stringify(vaults));
      return true;
    }

    case "delete_vault_object": {
      let objects = JSON.parse(localStorage.getItem("edgestack_vault_objects") || "[]");
      const obj = objects.find((o: any) => o.key === args.key);
      if (!obj) throw new Error("Object not found.");
      objects = objects.filter((o: any) => o.key !== args.key);
      localStorage.setItem("edgestack_vault_objects", JSON.stringify(objects));

      // Subtract stats
      const vaults = JSON.parse(localStorage.getItem("edgestack_vaults") || "[]");
      const vIdx = vaults.findIndex((v: any) => v.name === args.vaultName);
      if (vIdx !== -1) {
        vaults[vIdx].object_count = Math.max(0, vaults[vIdx].object_count - 1);
        vaults[vIdx].total_size_bytes = Math.max(0, vaults[vIdx].total_size_bytes - obj.size_bytes);
        localStorage.setItem("edgestack_vaults", JSON.stringify(vaults));
      }
      return true;
    }

    case "get_cost_summary": {
      const config = JSON.parse(localStorage.getItem("edgestack_config") || "{}");
      const rate = config.electricity_rate_kwh || 0.15;
      
      const runs = JSON.parse(localStorage.getItem("edgestack_runs") || "[]");
      const successCount = runs.filter((r: any) => r.status === "completed").length;
      
      // Calculate fake but nice numbers
      const dailyBreakdown = [
        { date: "May 29", local_cost: 0.02 * rate, bedrock_equiv: 1.25 },
        { date: "May 30", local_cost: 0.05 * rate, bedrock_equiv: 2.80 },
        { date: "May 31", local_cost: 0.03 * rate, bedrock_equiv: 1.95 },
        { date: "Jun 01", local_cost: 0.08 * rate, bedrock_equiv: 4.40 },
        { date: "Jun 02", local_cost: 0.12 * rate, bedrock_equiv: 6.90 },
        { date: "Jun 03", local_cost: 0.06 * rate, bedrock_equiv: 3.50 },
        { date: "Jun 04", local_cost: 0.04 * rate + (successCount * 0.01), bedrock_equiv: 2.10 + (successCount * 0.8) }
      ];

      const localSum = dailyBreakdown.reduce((sum, d) => sum + d.local_cost, 0);
      const bedrockSum = dailyBreakdown.reduce((sum, d) => sum + d.bedrock_equiv, 0);
      const savings = bedrockSum - localSum;
      const pct = (savings / (bedrockSum || 1.0)) * 100;

      return {
        period_days: args.periodDays || 7,
        total_local_cost: localSum,
        total_bedrock_equiv: bedrockSum,
        total_savings: savings,
        savings_pct: pct,
        matched_tier: "Nova Lite",
        daily_breakdown: dailyBreakdown,
        ai_insight: "Weekly local processing costs only $0.09 compared to $22.90 on Cloud APIs."
      };
    }

    case "get_cost_history": {
      return [];
    }

    case "get_agent_metrics": {
      const runs = JSON.parse(localStorage.getItem("edgestack_runs") || "[]");
      const workflows = JSON.parse(localStorage.getItem("edgestack_workflows") || "[]");

      return workflows.map((wf: any) => {
        const wfRuns = runs.filter((r: any) => r.workflow_id === wf.id);
        const successes = wfRuns.filter((r: any) => r.status === "completed").length;
        const total = wfRuns.length;
        
        return {
          workflow_id: wf.id,
          workflow_name: wf.name,
          tasks_today: total,
          success_rate: total > 0 ? (successes / total) * 100 : 100,
          avg_response_ms: 1200 + Math.floor(Math.random() * 800),
          cpu_avg_pct: wf.status === "running" ? 42.5 : 0.5,
          memory_gb: wf.status === "running" ? 4.2 : 0.8,
          status: wf.status === "running" ? "running" : wf.status === "paused" ? "paused" : "ok",
          last_run: wf.last_run
        };
      });
    }

    case "list_models": {
      const standardModels = [
        {
          id: "llama32",
          display_name: "Llama 3.2 3B (Balanced)",
          category: "Balanced",
          ollama_tag: "llama3.2:3b",
          description: "Perfect blend of speed and reasoning capability for day-to-day business tasks.",
          good_at: "General text, logic, email templates, categorizations",
          download_gb: 2.0,
          memory_gb: 4.0,
          license: "Llama 3.2 License",
          recommended: true,
          source: "Ollama"
        },
        {
          id: "qwen15",
          display_name: "Qwen 2.5 1.5B (Lightweight)",
          category: "Lightweight",
          ollama_tag: "qwen2.5:1.5b",
          description: "Ultra-fast response model suited for basic scraping and simple extraction workloads.",
          good_at: "Structured extraction, parsing, basic tasks",
          download_gb: 1.2,
          memory_gb: 2.0,
          license: "Apache 2.0",
          recommended: false,
          source: "Ollama"
        },
        {
          id: "llama31",
          display_name: "Llama 3.1 8B (Deep Thinking)",
          category: "Heavy Reasoning",
          ollama_tag: "llama3.1:8b",
          description: "Larger parameter set for writing complex drafts, financial reports, or code pipelines.",
          good_at: "Complex agent chains, deep reasoning, long content writing",
          download_gb: 4.7,
          memory_gb: 8.0,
          license: "Llama 3.1 License",
          recommended: false,
          source: "Ollama"
        }
      ];
      
      const customModels = JSON.parse(localStorage.getItem("edgestack_custom_models") || "[]");
      return [...standardModels, ...customModels];
    }

    case "download_hf_model": {
      const { repoId, filename } = args;
      let pct = 0;
      const interval = setInterval(() => {
        pct += 10;
        emitMockEvent("hf_download_progress", {
          pct,
          status: pct < 100 ? `Downloading GGUF shards from HF (${pct}%)` : "Verifying model integrity..."
        });
        if (pct >= 100) {
          clearInterval(interval);
          
          // Register custom model
          const customModels = JSON.parse(localStorage.getItem("edgestack_custom_models") || "[]");
          const tag = `hf:${repoId.toLowerCase().split("/")[1] || "model"}`;
          const newModel = {
            id: `hf_${Math.random().toString(36).substr(2, 9)}`,
            display_name: `${repoId.split("/")[1] || "HF Model"} (${filename.split(".").slice(-1)[0] || "GGUF"})`,
            category: "Hugging Face Pull",
            ollama_tag: tag,
            description: `Model downloaded directly from HF Repo: ${repoId}`,
            good_at: "Custom task processing",
            download_gb: 3.5,
            memory_gb: 6.0,
            license: "Hugging Face Model License",
            recommended: false,
            source: "Hugging Face"
          };
          customModels.push(newModel);
          localStorage.setItem("edgestack_custom_models", JSON.stringify(customModels));
        }
      }, 300);
      
      await new Promise((resolve) => setTimeout(resolve, 3300));
      return true;
    }

    case "register_local_model": {
      const { name, filePath, memoryGb, sizeGb } = args;
      const customModels = JSON.parse(localStorage.getItem("edgestack_custom_models") || "[]");
      const tag = `local:${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      const newModel = {
        id: `local_${Math.random().toString(36).substr(2, 9)}`,
        display_name: `${name} (Local GGUF)`,
        category: "Local Upload",
        ollama_tag: tag,
        description: `Imported local model path: ${filePath}`,
        good_at: "Offline processing",
        download_gb: parseFloat(sizeGb) || 3.0,
        memory_gb: parseFloat(memoryGb) || 6.0,
        license: "Proprietary / Custom",
        recommended: false,
        source: "Local Disk"
      };
      customModels.push(newModel);
      localStorage.setItem("edgestack_custom_models", JSON.stringify(customModels));
      return true;
    }

    case "uninstall_model": {
      const { tag } = args;
      let customModels = JSON.parse(localStorage.getItem("edgestack_custom_models") || "[]");
      customModels = customModels.filter((m: any) => m.ollama_tag !== tag);
      localStorage.setItem("edgestack_custom_models", JSON.stringify(customModels));
      return true;
    }

    case "generate_chat_response": {
      const { model, prompt, history } = args;
      const promptLower = prompt.toLowerCase();
      
      // Calculate speed specs based on model
      let speed = 25.5;
      let latency = 210;
      let vram = 4.2;
      
      if (model.includes("qwen")) {
        speed = 52.4;
        latency = 120;
        vram = 2.1;
      } else if (model.includes("llama3.1") || model.includes("8b")) {
        speed = 18.2;
        latency = 320;
        vram = 7.8;
      } else if (model.includes("local") || model.includes("hf")) {
        speed = 30.5;
        latency = 190;
        vram = 5.8;
      }

      // Check if prompt is related to compliance/governance advisor
      if (promptLower.includes("governance") || promptLower.includes("compliance") || promptLower.includes("policy")) {
        return {
          text: `I would be happy to help you with that. Maintaining data security and controlling external integrations is crucial for enterprise compliance.

### Regulatory Reasoning & Rationale:
* **GDPR Compliance (Article 32):** Restricting external HTTP connections ensures that personal data (PII) is never transmitted to unauthorized third parties without explicit user consent.
* **SOC2 & HIPAA Security Controls:** Restricting outbound traffic prevents accidental data exfiltration and guarantees a secure audit trail of all data moving outside your local network.
* **Operational Guardrails:** Implementing rate limits and token budgets protects your local host resources from infinite loops and unexpected third-party API billings.

Here is a sample YAML configuration to enforce this policy:

\`\`\`yaml
# EdgeStack Governance Policy
id: "policy-block-http"
name: "Block External HTTP Calls"
action_type: "http_request"
effect: "block"
enabled: true
conditions:
  url_allowlist:
    - "api.stripe.com"
    - "api.sendgrid.com"
    - "hooks.slack.com"
\`\`\`

By deploying this policy, any unauthorized HTTP request made by your local agents will be intercepted and blocked, and the event is permanently logged in the secure local audit database. Let me know if you would like to adjust the conditions or if you have questions about specific compliance rules!`,
          tokens_per_second: speed,
          first_token_ms: latency,
          memory_used_gb: vram
        };
      }

      // Check if prompt is from the Copilot requesting a workflow
      if (promptLower.includes("workflow") || promptLower.includes("scraper") || promptLower.includes("agent") || promptLower.includes("slack") || promptLower.includes("categorize") || promptLower.includes("fetch")) {
        // Return a workflow builder copilot reply containing GGUF/YAML markup
        return {
          text: `I have designed a local workflow block that automates this scenario. It leverages local tools to fetch and process data offline, ensuring absolute compliance and security.

Here is the YAML layout:

\`\`\`yaml
# Generated by EdgeStack Builder Copilot
name: "Local Web Scraper & Summarizer"
description: "Automatically extracts content from a URL, summarizes key items with local LLM, and logs warnings"
steps:
  - name: "fetch_target_webpage"
    action: "browse_web"
    url: "https://example-news-feed.local/feed"

  - name: "analyze_webpage_content"
    action: "ask_ai"
    prompt: "Identify the top 3 warnings and core trends from this text payload:\\n\\n{{steps.fetch_target_webpage.output}}"

  - name: "save_summary_to_vault"
    action: "save_to_vault"
\`\`\`

You can review this pipeline and click **"Apply YAML to Editor"** above to load these steps directly into your Monaco canvas!`,
          tokens_per_second: speed,
          first_token_ms: latency,
          memory_used_gb: vram
        };
      }

      // Standard chat responses
      const answers = [
        "That is an excellent point. Running this workflow on your Intel i7-9750H core ensures that no data leaves your physical SSD. To optimize latency further, we can allocate 6 threads.",
        "To query your SQLite database from a local prompt step, you can structure your prompt template like this: `Querying user analytics for {{steps.fetch_records.output}}`. This runs fully offline.",
        "Local models can be fine-tuned or loaded using GGUF quantization. For example, Qwen 2.5 1.5B is exceptional at structured outputs (such as JSON regex extractions), while Llama 3.1 8B excels at writing detailed paragraphs.",
        "EdgeStack intercepts AWS Bedrock calls. If you configure your local app to point to port 4566, the Bedrock bridge redirects queries here, saving you AWS API bills."
      ];
      
      const randomAnswer = answers[Math.floor(Math.random() * answers.length)];
      
      return {
        text: `[Model: ${model}]\n\n${randomAnswer}\n\nIs there any other local automation task I can assist with?`,
        tokens_per_second: speed,
        first_token_ms: latency,
        memory_used_gb: vram
      };
    }

    case "generate": {
      // AI mock replies
      const promptLower = (args.prompt || "").toLowerCase();
      if (promptLower.includes("summarize this local ai node configuration")) {
        return {
          text: `Your private AI node is fully ready to execute secure workflows using your ${args.prompt.match(/Hardware Tier: ([^\n]+)/)?.[1] || "High Performance"} hardware. By deploying local models like llama3.2:3b, your operations cost less than three cents per 1,000 requests, representing huge cost savings. Best of all, your business data and API secrets remain 100% private and protected on your physical device.`
        };
      }
      return {
        text: "I am EdgeStack's local AI engine. I processed your request completely offline. The outputs are generated and verified on your CPU/GPU cores safely."
      };
    }

    case "import_file_to_vault": {
      const { vaultName, srcPath } = args;
      const file_name = srcPath.split(/[\\/]/).pop() || "uploaded_file.txt";
      const vaults = JSON.parse(localStorage.getItem("edgestack_vaults") || "[]");
      const vaultObjects = JSON.parse(localStorage.getItem("edgestack_vault_objects") || "[]");
      
      const newObj = {
        key: file_name,
        size_bytes: 1024 + Math.floor(Math.random() * 5000),
        last_modified: new Date().toISOString(),
        content_type: file_name.endsWith(".json") ? "application/json" : "text/plain",
        workflow_name: null
      };
      
      // Remove previous duplicate key in same vault
      const filtered = vaultObjects.filter((o: any) => !(o.key === file_name && vaults.some((v: any) => v.name === vaultName)));
      filtered.unshift(newObj);
      localStorage.setItem("edgestack_vault_objects", JSON.stringify(filtered));
      
      // Update stats
      const vIdx = vaults.findIndex((v: any) => v.name === vaultName);
      if (vIdx !== -1) {
        vaults[vIdx].object_count += 1;
        vaults[vIdx].total_size_bytes += newObj.size_bytes;
        vaults[vIdx].last_modified = new Date().toISOString();
        localStorage.setItem("edgestack_vaults", JSON.stringify(vaults));
      }
      return true;
    }

    case "download_vault_object": {
      return true;
    }

    case "list_instances": {
      return JSON.parse(localStorage.getItem("edgestack_instances") || "[]");
    }

    case "create_instance": {
      const { name, image, cpuCores, memoryGb, diskGb } = args;
      const id = `i-local-${Math.random().toString(36).substr(2, 8)}`;
      const instances = JSON.parse(localStorage.getItem("edgestack_instances") || "[]");
      const newInst = {
        id,
        name,
        state: "running",
        image,
        cpu_cores: cpuCores,
        memory_gb: memoryGb,
        disk_gb: diskGb,
        uptime_seconds: 0,
        created_at: new Date().toISOString()
      };
      instances.push(newInst);
      localStorage.setItem("edgestack_instances", JSON.stringify(instances));

      // Add a container
      const containers = JSON.parse(localStorage.getItem("edgestack_containers") || "[]");
      containers.push({
        id: `c-${name.toLowerCase().replace(/[^a-z0-9]/g, "")}-app`,
        instance_id: id,
        name: `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}-service`,
        status: "running",
        cpu_pct: 0.5,
        memory_mb: 64,
        network_io: "128 B/s",
        block_io: "0 B/s",
        image: "alpine:latest",
        created_at: new Date().toISOString()
      });
      localStorage.setItem("edgestack_containers", JSON.stringify(containers));
      return id;
    }

    case "start_instance": {
      const { id } = args;
      const instances = JSON.parse(localStorage.getItem("edgestack_instances") || "[]");
      const idx = instances.findIndex((i: any) => i.id === id);
      if (idx !== -1) {
        instances[idx].state = "running";
        instances[idx].uptime_seconds = 60;
        localStorage.setItem("edgestack_instances", JSON.stringify(instances));
      }
      // Start containers
      const containers = JSON.parse(localStorage.getItem("edgestack_containers") || "[]");
      containers.forEach((c: any) => {
        if (c.instance_id === id) {
          c.status = "running";
          c.cpu_pct = 0.5;
          c.memory_mb = 64;
        }
      });
      localStorage.setItem("edgestack_containers", JSON.stringify(containers));
      return true;
    }

    case "stop_instance": {
      const { id } = args;
      const instances = JSON.parse(localStorage.getItem("edgestack_instances") || "[]");
      const idx = instances.findIndex((i: any) => i.id === id);
      if (idx !== -1) {
        instances[idx].state = "stopped";
        instances[idx].uptime_seconds = 0;
        localStorage.setItem("edgestack_instances", JSON.stringify(instances));
      }
      // Stop containers
      const containers = JSON.parse(localStorage.getItem("edgestack_containers") || "[]");
      containers.forEach((c: any) => {
        if (c.instance_id === id) {
          c.status = "stopped";
          c.cpu_pct = 0.0;
          c.memory_mb = 0;
        }
      });
      localStorage.setItem("edgestack_containers", JSON.stringify(containers));
      return true;
    }

    case "restart_instance": {
      const { id } = args;
      const instances = JSON.parse(localStorage.getItem("edgestack_instances") || "[]");
      const idx = instances.findIndex((i: any) => i.id === id);
      if (idx !== -1) {
        instances[idx].state = "running";
        instances[idx].uptime_seconds = 5;
        localStorage.setItem("edgestack_instances", JSON.stringify(instances));
      }
      // Restart containers
      const containers = JSON.parse(localStorage.getItem("edgestack_containers") || "[]");
      containers.forEach((c: any) => {
        if (c.instance_id === id) {
          c.status = "running";
          c.cpu_pct = 0.8;
          c.memory_mb = 72;
        }
      });
      localStorage.setItem("edgestack_containers", JSON.stringify(containers));
      return true;
    }

    case "delete_instance": {
      const { id } = args;
      let instances = JSON.parse(localStorage.getItem("edgestack_instances") || "[]");
      instances = instances.filter((i: any) => i.id !== id);
      localStorage.setItem("edgestack_instances", JSON.stringify(instances));
      
      let containers = JSON.parse(localStorage.getItem("edgestack_containers") || "[]");
      containers = containers.filter((c: any) => c.instance_id !== id);
      localStorage.setItem("edgestack_containers", JSON.stringify(containers));
      return true;
    }

    case "list_active_containers": {
      return JSON.parse(localStorage.getItem("edgestack_containers") || "[]");
    }

    case "get_compute_telemetry": {
      const instances = JSON.parse(localStorage.getItem("edgestack_instances") || "[]");
      const containers = JSON.parse(localStorage.getItem("edgestack_containers") || "[]");
      
      const total = instances.length;
      const activeInst = instances.filter((i: any) => i.state === "running").length;
      const activeCont = containers.filter((c: any) => c.status === "running").length;
      
      // fluctuate metrics slightly
      const randomFluctuation = (Math.random() - 0.5) * 5; // -2.5% to +2.5%
      const cpu = Math.min(100, Math.max(5, 24.5 + randomFluctuation));
      const ram = Math.min(100, Math.max(10, 58.2 + randomFluctuation * 0.5));
      const disk = 44.8; // disk doesn't fluctuate much

      return {
        cpu_percent: cpu,
        memory_percent: ram,
        disk_percent: disk,
        active_instances: activeInst,
        total_instances: total,
        active_containers: activeCont
      };
    }

    case "execute_container_command": {
      const { containerId, command } = args;
      const clean_cmd = (command || "").trim();
      if (!clean_cmd) return "";
      
      const parts = clean_cmd.split(/\s+/);
      const main_cmd = parts[0].toLowerCase();
      
      switch (main_cmd) {
        case "help":
          return "Available commands:\n  help      - Show this help list\n  ls        - List directory contents\n  pwd       - Print working directory\n  uname -a  - Print operating system details\n  top       - Show process dashboard\n  ps        - List active processes\n  cat <file>- Read mock files\n  clear     - Reset screen";
        case "ls":
          return "total 24\ndrwxr-xr-x    1 root     root          4096 Jun 15 08:00 .\ndrwxr-xr-x    1 root     root          4096 Jun 15 08:00 ..\n-rw-r--r--    1 root     root           128 Jun 15 08:02 app.py\n-rw-r--r--    1 root     root            45 Jun 15 08:00 config.json\ndrwxr-xr-x    2 root     root          4096 Jun 15 08:00 logs";
        case "pwd":
          return "/workspace";
        case "uname":
          if (parts.includes("-a")) {
            return `Linux ${containerId} 6.1.0-21-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.90-1 (2026-06-15) x86_64 GNU/Linux`;
          }
          return "Linux";
        case "cat":
          if (parts.length < 2) return "Usage: cat <filename>";
          const filename = parts[1];
          if (filename === "config.json") {
            return "{\n  \"env\": \"production\",\n  \"port\": 8080,\n  \"debug\": false\n}";
          } else if (filename === "app.py") {
            return "import os\nprint('Starting service container...')\n# Mock service container daemon";
          }
          return `cat: ${filename}: No such file or directory`;
        case "top":
        case "ps":
          return "PID   USER     TIME  COMMAND\n    1 root      0:05 python app.py\n   12 root      0:00 ps\nContainer active on host node. System overhead: normal.";
        default:
          return `${main_cmd}: command not found. Type 'help' for suggestions.`;
      }
    }

    // ── Governance & Compliance ────────────────────────────────────────────────

    case "list_policies": {
      if (!(window as any).__mock_policies) {
        (window as any).__mock_policies = [
          {
            id: "policy-001",
            name: "Block External HTTP Calls",
            description: "Prevents workflows from making HTTP requests to non-allowlisted domains",
            enabled: true,
            action_type: "http_request",
            effect: "block",
            conditions: {
              url_allowlist: ["api.stripe.com", "hooks.slack.com", "api.sendgrid.com"],
            },
            created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
            updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          },
          {
            id: "policy-002",
            name: "AI Token Budget (50K/day)",
            description: "Caps AI token usage per workflow to 50,000 tokens per day to control costs",
            enabled: true,
            action_type: "ask_ai",
            effect: "block",
            conditions: {
              max_tokens_per_day: 50000,
            },
            created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
            updated_at: new Date(Date.now() - 86400000 * 1).toISOString(),
          },
          {
            id: "policy-003",
            name: "PII Output Filter",
            description: "Strips emails, phone numbers, and credit card patterns from AI-generated output before storage",
            enabled: true,
            action_type: "ask_ai",
            effect: "warn",
            conditions: {
              pii_filter_output: true,
            },
            created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
            updated_at: new Date(Date.now() - 86400000 * 1).toISOString(),
          },
          {
            id: "policy-004",
            name: "Require Data Classification Tag",
            description: "All vault save operations must include a data_tag field (public / internal / confidential)",
            enabled: false,
            action_type: "save_to_vault",
            effect: "block",
            conditions: {
              require_data_tag: true,
            },
            created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
            updated_at: new Date(Date.now() - 86400000 * 1).toISOString(),
          },
          {
            id: "policy-005",
            name: "Rate Limit Web Browsing (10/hr)",
            description: "Prevents excessive web scraping — max 10 browse_web calls per hour per workflow",
            enabled: true,
            action_type: "browse_web",
            effect: "warn",
            conditions: {
              max_calls_per_hour: 10,
            },
            created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
            updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          },
        ];
      }
      return (window as any).__mock_policies;
    }

    case "create_policy": {
      if (!(window as any).__mock_policies) (window as any).__mock_policies = [];
      const newId = "policy-" + Math.random().toString(36).slice(2, 8);
      const newPolicy = {
        id: newId,
        name: args.name,
        description: args.description || null,
        enabled: true,
        action_type: args.action_type,
        effect: args.effect,
        conditions: args.conditions || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      (window as any).__mock_policies = [...((window as any).__mock_policies || []), newPolicy];
      return newId;
    }

    case "update_policy": {
      const policies = (window as any).__mock_policies || [];
      (window as any).__mock_policies = policies.map((p: any) =>
        p.id === args.id
          ? { ...p, ...args, updated_at: new Date().toISOString() }
          : p
      );
      return null;
    }

    case "toggle_policy": {
      const policies = (window as any).__mock_policies || [];
      (window as any).__mock_policies = policies.map((p: any) =>
        p.id === args.id ? { ...p, enabled: args.enabled, updated_at: new Date().toISOString() } : p
      );
      return null;
    }

    case "delete_policy": {
      const policies = (window as any).__mock_policies || [];
      (window as any).__mock_policies = policies.filter((p: any) => p.id !== args.id);
      return null;
    }

    case "list_audit_log": {
      const limit = args.limit || 100;
      const wfFilter = args.workflow_id;
      const decFilter = args.decision_filter;

      const mockAudit = [
        { id: "al-001", timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(), workflow_id: "wf_customer_support", workflow_name: "Customer Support Automation", run_id: "run-abc1", step_name: "generate_support_reply", action_type: "ask_ai", policy_id: "policy-002", policy_name: "AI Token Budget (50K/day)", decision: "allow", reason: null, context_url: null, tokens_requested: 1200 },
        { id: "al-002", timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(), workflow_id: "wf_lead_enrichment", workflow_name: "Lead Enrichment Agent", run_id: "run-abc2", step_name: "fetch_pricing_page", action_type: "browse_web", policy_id: "policy-005", policy_name: "Rate Limit Web Browsing (10/hr)", decision: "warn", reason: "8 browse_web calls in the last hour (limit: 10)", context_url: "https://competitor.com/pricing", tokens_requested: null },
        { id: "al-003", timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), workflow_id: "wf_customer_support", workflow_name: "Customer Support Automation", run_id: "run-abc3", step_name: "call_payment_api", action_type: "http_request", policy_id: "policy-001", policy_name: "Block External HTTP Calls", decision: "block", reason: "URL 'https://unknown-api.io/endpoint' is not in the allowed list", context_url: "https://unknown-api.io/endpoint", tokens_requested: null },
        { id: "al-004", timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), workflow_id: "wf_lead_enrichment", workflow_name: "Lead Enrichment Agent", run_id: "run-abc4", step_name: "extract_price_points", action_type: "ask_ai", policy_id: "policy-003", policy_name: "PII Output Filter", decision: "warn", reason: "PII filter applied — email patterns detected in AI output", context_url: null, tokens_requested: 850 },
        { id: "al-005", timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), workflow_id: "wf_customer_support", workflow_name: "Customer Support Automation", run_id: "run-abc5", step_name: "save_draft_to_vault", action_type: "save_to_vault", policy_id: "policy-004", policy_name: "Require Data Classification Tag", decision: "allow", reason: null, context_url: null, tokens_requested: null },
        { id: "al-006", timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(), workflow_id: "wf_customer_support", workflow_name: "Customer Support Automation", run_id: "run-abc6", step_name: "fetch_support_ticket", action_type: "browse_web", policy_id: "policy-005", policy_name: "Rate Limit Web Browsing (10/hr)", decision: "allow", reason: null, context_url: "https://api.mybusiness.com/tickets/latest", tokens_requested: null },
        { id: "al-007", timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), workflow_id: "wf_lead_enrichment", workflow_name: "Lead Enrichment Agent", run_id: "run-abc7", step_name: "post_to_webhook", action_type: "http_request", policy_id: "policy-001", policy_name: "Block External HTTP Calls", decision: "block", reason: "URL 'https://hooks.zapier.com/catch/xyz' is not in the allowed list", context_url: "https://hooks.zapier.com/catch/xyz", tokens_requested: null },
        { id: "al-008", timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(), workflow_id: "wf_customer_support", workflow_name: "Customer Support Automation", run_id: "run-abc8", step_name: "generate_report", action_type: "ask_ai", policy_id: "policy-002", policy_name: "AI Token Budget (50K/day)", decision: "allow", reason: null, context_url: null, tokens_requested: 2400 },
      ];

      let filtered = mockAudit;
      if (wfFilter) filtered = filtered.filter((a: any) => a.workflow_id === wfFilter);
      if (decFilter && decFilter !== "all") filtered = filtered.filter((a: any) => a.decision === decFilter);
      return filtered.slice(0, limit);
    }

    case "get_compliance_summary": {
      const policies = (window as any).__mock_policies || [];
      const activePolicies = policies.filter((p: any) => p.enabled).length;
      return {
        total_policies: policies.length,
        active_policies: activePolicies,
        compliance_score: 73,
        audit_events_today: 8,
        blocks_today: 2,
        warns_today: 2,
        allows_today: 4,
        blocks_week: 5,
        top_violations: [
          { policy_name: "Block External HTTP Calls", count: 3 },
          { policy_name: "Rate Limit Web Browsing (10/hr)", count: 2 },
          { policy_name: "PII Output Filter", count: 1 },
        ],
      };
    }

    case "export_policies_yaml": {
      const policies = (window as any).__mock_policies || [];
      const yaml = policies.map((p: any) =>
        `- id: ${p.id}\n  name: "${p.name}"\n  action_type: ${p.action_type}\n  effect: ${p.effect}\n  enabled: ${p.enabled}`
      ).join("\n");
      return `# EdgeStack Governance Policies\n# Exported: ${new Date().toISOString()}\n\n${yaml}`;
    }

    default:
      console.warn(`Unrecognized mock invoke command: ${cmd}`, args);
      throw new Error(`Command '${cmd}' not supported by simulation bridge.`);
  }
};
