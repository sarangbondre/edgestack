"use client";

import React, { useState, useEffect, useRef } from "react";

export default function WebGPULaunchpad() {
  const [model, setModel] = useState("onnx-community/Llama-3.2-1B-Instruct");
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful local assistant running inside the browser WebGPU sandbox.");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("idle"); // idle | warming | loading | running | success | error
  const [progressMsg, setProgressMsg] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);

  const checkStorageQuota = async () => {
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const quota = estimate.quota || 0;
        const usage = estimate.usage || 0;
        const remaining = quota - usage;
        if (remaining < 2 * 1024 * 1024 * 1024) {
          const remainingGB = (remaining / (1024 * 1024 * 1024)).toFixed(2);
          setQuotaWarning(`Low cache space warning: Only ${remainingGB} GB remaining in browser storage (recommended: >= 2.00 GB).`);
        } else {
          setQuotaWarning(null);
        }
      } catch (e) {
        console.error("Failed to estimate storage quota", e);
      }
    }
  };

  useEffect(() => {
    // 1. Check/Request persistent storage
    if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.persist === "function") {
      navigator.storage.persisted().then((persisted) => {
        setStoragePersisted(persisted);
      });
    }

    // Check storage quota
    checkStorageQuota();

    // 2. Instantiate Web Worker
    workerRef.current = new Worker(new URL("./worker.ts", import.meta.url));
    
    workerRef.current.onmessage = (e: MessageEvent) => {
      const { status, message, result, tokensIn, tokensOut, durationMs } = e.data;
      if (status) {
        setStatus(status);
      }
      if (message) {
        setProgressMsg(message);
      }
      if (status === "success") {
        setOutput(result);
        setStats({ tokensIn, tokensOut, durationMs });
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const requestPersistence = async () => {
    if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.persist === "function") {
      const granted = await navigator.storage.persist();
      setStoragePersisted(granted);
    }
  };

  const handleInference = async () => {
    if (!prompt.trim()) return;
    await checkStorageQuota();
    setStatus("warming");
    setOutput("");
    setStats(null);
    workerRef.current?.postMessage({
      model,
      prompt,
      system: systemPrompt,
    });
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>PreceptaAI WebGPU Launchpad</h1>
        <p style={styles.subtitle}>Execute client-side ONNX and Transformers.js model pipelines inside isolated browser sandboxes.</p>
      </header>

      {quotaWarning && (
        <div style={styles.quotaWarningBanner}>
          <span style={styles.warningIcon}>⚠️</span>
          <span>{quotaWarning}</span>
        </div>
      )}

      <div style={styles.dashboard}>
        {/* Settings Panel */}
        <div style={styles.panel}>
          <h2 style={styles.panelTitle}>Configuration</h2>
          
          <div style={styles.field}>
            <label style={styles.label}>Select Local Model</label>
            <select 
              style={styles.select} 
              value={model} 
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="onnx-community/Llama-3.2-1B-Instruct">Llama 3.2 1B Instruct (ONNX Quantized)</option>
              <option value="Xenova/Qwen1.5-0.5B-Chat">Qwen 1.5 0.5B Chat (Lightweight)</option>
              <option value="onnx-community/Phi-3-mini-4k-instruct">Phi-3 Mini 4K Instruct</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>System Instructions</label>
            <textarea 
              style={styles.textarea} 
              rows={3} 
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Persistent Storage Cache</label>
            <div style={styles.storageStatus}>
              {storagePersisted === true ? (
                <span style={styles.statusBadgeGreen}>✅ Protected (Persisted)</span>
              ) : storagePersisted === false ? (
                <div>
                  <span style={styles.statusBadgeYellow}>⚠️ Ephemeral (Subject to Eviction)</span>
                  <button onClick={requestPersistence} style={styles.btnMini}>Request Permanent Cache Lock</button>
                </div>
              ) : (
                <span>Unsupported Browser Storage API</span>
              )}
            </div>
          </div>
        </div>

        {/* Inference Panel */}
        <div style={styles.panel}>
          <h2 style={styles.panelTitle}>Execution Sandbox</h2>
          
          <div style={styles.field}>
            <label style={styles.label}>Prompt Input</label>
            <textarea 
              style={styles.textarea} 
              rows={4} 
              placeholder="Type your prompt here..." 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <button 
            style={status === "idle" || status === "success" ? styles.btn : styles.btnDisabled} 
            disabled={status !== "idle" && status !== "success"} 
            onClick={handleInference}
          >
            {status === "idle" || status === "success" ? "Execute WebGPU Pipeline" : "Processing..."}
          </button>

          {/* Execution Progress */}
          {status !== "idle" && (
            <div style={styles.progressContainer}>
              <div style={styles.progressHeader}>
                <span style={styles.progressLabel}>Device Status: {status.toUpperCase()}</span>
                <span style={styles.progressSpinner}>⏳</span>
              </div>
              <p style={styles.progressDetail}>{progressMsg}</p>
            </div>
          )}

          {/* Results Output */}
          {output && (
            <div style={styles.resultContainer}>
              <h3 style={styles.resultTitle}>Response Output</h3>
              <pre style={styles.output}>{output}</pre>

              {stats && (
                <div style={styles.statsContainer}>
                  <div style={styles.statBox}>
                    <span style={styles.statVal}>{stats.durationMs}ms</span>
                    <span style={styles.statLabel}>Inference Latency</span>
                  </div>
                  <div style={styles.statBox}>
                    <span style={styles.statVal}>{stats.tokensIn.toFixed(0)}</span>
                    <span style={styles.statLabel}>Input Tokens</span>
                  </div>
                  <div style={styles.statBox}>
                    <span style={styles.statVal}>{stats.tokensOut.toFixed(0)}</span>
                    <span style={styles.statLabel}>Output Tokens</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "40px",
    backgroundColor: "#0d0e12",
    color: "#e2e8f0",
    fontFamily: "'Inter', system-ui, sans-serif",
    minHeight: "100vh",
  },
  header: {
    marginBottom: "32px",
  },
  title: {
    fontSize: "2.2rem",
    fontWeight: 700,
    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    marginBottom: "8px",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: "1rem",
  },
  dashboard: {
    display: "grid",
    gridTemplateColumns: "1fr 1.5fr",
    gap: "24px",
  },
  panel: {
    backgroundColor: "#151821",
    padding: "24px",
    borderRadius: "12px",
    border: "1px solid #272a37",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  panelTitle: {
    fontSize: "1.2rem",
    fontWeight: 600,
    borderBottom: "1px solid #272a37",
    paddingBottom: "12px",
    marginBottom: "8px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "0.85rem",
    fontWeight: 500,
    color: "#94a3b8",
  },
  select: {
    backgroundColor: "#1f222f",
    color: "#e2e8f0",
    padding: "10px 14px",
    borderRadius: "6px",
    border: "1px solid #272a37",
    fontSize: "0.9rem",
  },
  textarea: {
    backgroundColor: "#1f222f",
    color: "#e2e8f0",
    padding: "12px",
    borderRadius: "6px",
    border: "1px solid #272a37",
    fontSize: "0.9rem",
    resize: "vertical",
    fontFamily: "inherit",
  },
  storageStatus: {
    backgroundColor: "#1f222f",
    padding: "12px",
    borderRadius: "6px",
    fontSize: "0.85rem",
  },
  statusBadgeGreen: {
    color: "#10b981",
    fontWeight: 600,
  },
  statusBadgeYellow: {
    color: "#f59e0b",
    fontWeight: 600,
    display: "block",
    marginBottom: "8px",
  },
  btnMini: {
    backgroundColor: "#6366f1",
    border: "none",
    color: "white",
    padding: "6px 12px",
    borderRadius: "4px",
    fontSize: "0.75rem",
    cursor: "pointer",
    fontWeight: 500,
  },
  btn: {
    backgroundColor: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
    background: "#6366f1",
    border: "none",
    color: "white",
    padding: "12px 20px",
    borderRadius: "6px",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.2s",
  },
  btnDisabled: {
    backgroundColor: "#272a37",
    border: "none",
    color: "#64748b",
    padding: "12px 20px",
    borderRadius: "6px",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "not-allowed",
  },
  progressContainer: {
    backgroundColor: "#1f222f",
    padding: "16px",
    borderRadius: "8px",
    border: "1px dashed #6366f1",
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  progressLabel: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#a855f7",
  },
  progressSpinner: {
    fontSize: "0.9rem",
  },
  progressDetail: {
    fontSize: "0.85rem",
    color: "#94a3b8",
    margin: 0,
  },
  resultContainer: {
    marginTop: "16px",
  },
  resultTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    marginBottom: "8px",
  },
  output: {
    backgroundColor: "#0d0e12",
    padding: "16px",
    borderRadius: "8px",
    border: "1px solid #272a37",
    color: "#e2e8f0",
    fontSize: "0.9rem",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    maxHeight: "300px",
    overflowY: "auto",
  },
  statsContainer: {
    display: "flex",
    gap: "16px",
    marginTop: "12px",
  },
  statBox: {
    backgroundColor: "#1f222f",
    padding: "10px 14px",
    borderRadius: "6px",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  statVal: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "#a855f7",
  },
  statLabel: {
    fontSize: "0.7rem",
    color: "#94a3b8",
    marginTop: "4px",
    textTransform: "uppercase",
  },
  quotaWarningBanner: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    border: "1px solid rgba(245, 158, 11, 0.3)",
    padding: "12px 16px",
    borderRadius: "8px",
    color: "#f59e0b",
    fontSize: "0.9rem",
    marginBottom: "24px",
    fontWeight: 500,
  },
  warningIcon: {
    fontSize: "1.2rem",
  },
};
