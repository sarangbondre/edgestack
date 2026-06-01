import React from "react";

interface ProgressBarProps {
  value: number; // 0 to 100
  label?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  label,
  className = "",
}) => {
  // Clamp value between 0 and 100
  const percentage = Math.min(Math.max(value, 0), 100);

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">
          <span>{label}</span>
          <span>{Math.round(percentage)}%</span>
        </div>
      )}
      <div className="progress-bar-track w-full">
        <div
          className="progress-bar-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
