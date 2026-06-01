import React from "react";

interface BadgeProps {
  variant?: "ok" | "warn" | "error" | "paused" | "running" | "idle";
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "idle",
  children,
  className = "",
}) => {
  const getBadgeClass = () => {
    switch (variant) {
      case "ok":
        return "badge-ok";
      case "warn":
        return "badge-warn";
      case "error":
        return "badge-error";
      case "paused":
        return "badge-paused";
      case "running":
        return "badge-running";
      case "idle":
      default:
        return "badge-idle";
    }
  };

  return (
    <span className={`badge ${getBadgeClass()} ${className}`}>
      {children}
    </span>
  );
};
