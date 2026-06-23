"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { invoke } from "@/lib/tauri";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Spinner } from "../ui/Spinner";

interface LayoutProps {
  title?: string;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ title, children }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(false);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        // Run setup completion check
        const complete: boolean = await invoke("is_setup_complete");
        setSetupComplete(complete);
        if (!complete) {
          router.replace("/setup");
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error("Failed to check setup:", e);
        // Fallback in case Tauri APIs fail (e.g. running in plain browser dev server)
        setLoading(false);
      }
    };
    checkSetup();
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading PreceptaAI...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <TopBar title={title} />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
};
