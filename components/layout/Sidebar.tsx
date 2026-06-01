"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GitBranch,
  Database,
  Users,
  Coins,
  Settings,
  FileText,
  Workflow
} from "lucide-react";

interface SidebarProps {
  notificationCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ notificationCount = 0 }) => {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Workflows", href: "/workflows", icon: GitBranch },
    { name: "Object Vault", href: "/vault", icon: Database },
    { name: "Agent Metrics", href: "/agents", icon: Users },
    { name: "Cost Analytics", href: "/costs", icon: Coins },
    { name: "Activity Logs", href: "/logs", icon: FileText },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <aside className="sidebar">
      <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-200 dark:border-gray-800">
        <Workflow className="h-6 w-6 text-primary" />
        <span className="font-bold text-lg tracking-tight text-gray-900 dark:text-white">EdgeStack</span>
      </div>
      <nav className="flex-1 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link key={item.name} href={item.href} className={`nav-item ${isActive ? "active" : ""}`}>
              <Icon className="h-4 w-4" />
              <span>{item.name}</span>
              {item.name === "Activity Logs" && notificationCount > 0 && (
                <span className="ml-auto flex h-2 w-2 rounded-full bg-red-500" />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span>Local Core Live</span>
        </div>
      </div>
    </aside>
  );
};
