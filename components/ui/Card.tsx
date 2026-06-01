import React from "react";

interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  footer,
  className = "",
  children,
}) => {
  return (
    <div className={`card ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-base font-semibold leading-6 text-gray-900 dark:text-white">{title}</h3>}
          {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
      )}
      <div className="text-sm text-gray-700 dark:text-gray-300">{children}</div>
      {footer && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
          {footer}
        </div>
      )}
    </div>
  );
};
