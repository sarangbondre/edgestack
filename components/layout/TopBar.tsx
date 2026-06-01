"use client";

import React, { useEffect, useState } from "react";
import { Bell, Search, Settings, Sun, Moon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import Link from "next/link";

interface TopBarProps {
  title?: string;
  onNotificationClick?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ title = "Dashboard", onNotificationClick }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    // Poll unread notification count
    const fetchUnreadCount = async () => {
      try {
        const notifications: any[] = await invoke("get_agent_metrics"); // placeholder, or query notifications directly
        // Let's query notifications count if possible. Or set standard 0 for now.
      } catch (e) {
        console.error(e);
      }
    };
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleTheme = () => {
    const html = document.documentElement;
    if (html.classList.contains("dark")) {
      html.classList.remove("dark");
      setTheme("light");
    } else {
      html.classList.add("dark");
      setTheme("dark");
    }
  };

  return (
    <header className="topbar justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        {/* Search stub */}
        <div className="relative w-64 max-w-xs hidden sm:block">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-400" />
          </span>
          <input
            type="text"
            placeholder="Search workflows, logs..."
            className="input pl-9 pr-3 py-1.5 text-sm"
            disabled
          />
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          aria-label="Toggle Dark Mode"
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <Link
          href="/logs"
          className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          aria-label="View Activity Logs"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-red-500" />
          )}
        </Link>

        <Link
          href="/settings"
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          aria-label="View Settings"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
};
