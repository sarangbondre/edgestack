"use client";

import React, { useEffect, useState } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { invoke } from "@tauri-apps/api/core";
import { Database, Folder, FolderPlus, FileCode, Trash2, HardDrive, Calendar } from "lucide-react";

interface VaultSummary {
  name: string;
  object_count: number;
  total_size_bytes: number;
  last_modified: string | null;
}

interface VaultObject {
  key: string;
  size_bytes: number;
  last_modified: string;
  content_type: string | null;
  workflow_name: string | null;
}

export default function VaultPage() {
  const [vaults, setVaults] = useState<VaultSummary[]>([]);
  const [selectedVault, setSelectedVault] = useState<string | null>(null);
  const [objects, setObjects] = useState<VaultObject[]>([]);
  const [loadingVaults, setLoadingVaults] = useState(true);
  const [loadingObjects, setLoadingObjects] = useState(false);

  // Create vault state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVaultName, setNewVaultName] = useState("");
  const [createError, setCreateError] = useState("");

  const fetchVaults = async () => {
    try {
      setLoadingVaults(true);
      const res: VaultSummary[] = await invoke("list_vaults");
      setVaults(res);
      if (res.length > 0 && !selectedVault) {
        setSelectedVault(res[0].name);
      }
      setLoadingVaults(false);
    } catch (e) {
      console.error(e);
      setLoadingVaults(false);
    }
  };

  const fetchObjects = async (vaultName: string) => {
    try {
      setLoadingObjects(true);
      const res: VaultObject[] = await invoke("list_vault_objects", { vaultName });
      setObjects(res);
      setLoadingObjects(false);
    } catch (e) {
      console.error(e);
      setLoadingObjects(false);
    }
  };

  useEffect(() => {
    fetchVaults();
  }, []);

  useEffect(() => {
    if (selectedVault) {
      fetchObjects(selectedVault);
    } else {
      setObjects([]);
    }
  }, [selectedVault]);

  const handleCreateVault = async () => {
    if (!newVaultName) return;
    try {
      setCreateError("");
      const cleanName = newVaultName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
      await invoke("create_vault", { name: cleanName });
      setNewVaultName("");
      setShowCreateModal(false);
      fetchVaults();
      setSelectedVault(cleanName);
    } catch (e: any) {
      setCreateError(e.toString() || "Failed to create vault.");
    }
  };

  const handleDeleteObject = async (key: string) => {
    if (!selectedVault) return;
    if (!confirm(`Are you sure you want to delete "${key}" from "${selectedVault}"?`)) return;
    try {
      await invoke("delete_vault_object", { vaultName: selectedVault, key });
      fetchObjects(selectedVault);
      fetchVaults(); // update metrics
    } catch (e) {
      console.error(e);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Layout title="Object Vault">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Object Vault (Local S3 Store)</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Secure, locally emulated block storage for output files and inputs</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-1.5">
          <FolderPlus className="h-4 w-4" /> Create Vault
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-180px)]">
        {/* Left side: Vault Folders */}
        <div className="space-y-3 lg:col-span-1 overflow-y-auto pr-1">
          {loadingVaults ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : vaults.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400 text-xs">
              No vaults configured.
            </div>
          ) : (
            vaults.map((vault) => {
              const isSelected = selectedVault === vault.name;
              return (
                <div
                  key={vault.name}
                  onClick={() => setSelectedVault(vault.name)}
                  className={`p-3 rounded-lg border cursor-pointer transition flex items-center gap-3 ${
                    isSelected
                      ? "border-primary bg-primary/5 dark:bg-primary/10"
                      : "border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
                  }`}
                >
                  <Folder className={`h-5 w-5 ${isSelected ? "text-primary fill-primary/10" : "text-gray-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs text-gray-900 dark:text-white truncate">{vault.name}</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 flex justify-between mt-1">
                      <span>{vault.object_count} files</span>
                      <span>{formatSize(vault.total_size_bytes)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right side: File Browser */}
        <div className="lg:col-span-3 border border-gray-250 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-950 h-full flex flex-col">
          {selectedVault ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" /> {selectedVault}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {objects.length} Objects stored
                </span>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loadingObjects ? (
                  <div className="flex justify-center py-20">
                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : objects.length === 0 ? (
                  <div className="empty-state py-20 text-center">
                    <div className="empty-state-icon">
                      <FileCode className="h-12 w-12 text-gray-300 dark:text-gray-700" />
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Vault is Empty</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                      There are no objects stored in this vault yet. Trigger a workflow configured to save outputs here.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-gray-250 dark:border-gray-800 text-gray-500 dark:text-gray-400 font-semibold bg-gray-50/50 dark:bg-gray-900/20">
                        <th className="p-3">File Key</th>
                        <th className="p-3">Size</th>
                        <th className="p-3">Creator Workflow</th>
                        <th className="p-3">Modified</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {objects.map((obj) => (
                        <tr key={obj.key} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                          <td className="p-3 font-medium text-gray-900 dark:text-white font-mono break-all">{obj.key}</td>
                          <td className="p-3 text-gray-500">{formatSize(obj.size_bytes)}</td>
                          <td className="p-3 text-gray-500">{obj.workflow_name || "Manual Integration"}</td>
                          <td className="p-3 text-gray-500">{new Date(obj.last_modified).toLocaleString()}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteObject(obj.key)}
                              className="btn btn-danger btn-sm p-1.5"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-500 dark:text-gray-400">
              <HardDrive className="h-16 w-16 text-gray-300 dark:text-gray-700 mb-3" />
              <h4 className="font-semibold text-sm">Select or Create a Vault</h4>
              <p className="text-xs max-w-xs mt-1">
                Your secure object files will list here. Choose a folder from the sidebar configuration.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Vault Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-2">Create New Vault</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Enter a unique name for your local S3 emulated storage bucket.
            </p>
            <input
              type="text"
              placeholder="my-agent-outputs"
              value={newVaultName}
              onChange={(e) => setNewVaultName(e.target.value)}
              className="input mb-4 text-xs"
              autoFocus
            />
            {createError && <p className="text-xs text-red-500 mb-4">{createError}</p>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setShowCreateModal(false)} variant="secondary" size="sm">
                Cancel
              </Button>
              <Button onClick={handleCreateVault} size="sm">
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
