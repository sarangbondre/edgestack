import React from "react";

interface AlertProps {
  variant?: "info" | "warning" | "error" | "success";
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = "info",
  title,
  children,
  className = "",
}) => {
  const getVariantClass = () => {
    switch (variant) {
      case "warning":
        return "alert-warn text-amber-800 dark:text-amber-200";
      case "error":
        return "alert-error text-red-800 dark:text-red-200";
      case "success":
        return "alert-success text-emerald-800 dark:text-emerald-200";
      case "info":
      default:
        return "alert-info text-blue-800 dark:text-blue-200";
    }
  };

  const getIcon = () => {
    switch (variant) {
      case "warning":
        return (
          <svg className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case "error":
        return (
          <svg className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "success":
        return (
          <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "info":
      default:
        return (
          <svg className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className={`alert-banner ${getVariantClass()} ${className}`}>
      {getIcon()}
      <div className="flex-1">
        {title && <h5 className="font-semibold text-sm leading-5 mb-1">{title}</h5>}
        <div className="text-sm leading-5">{children}</div>
      </div>
    </div>
  );
};
