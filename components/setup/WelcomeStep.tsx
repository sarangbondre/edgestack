"use client";

import React from "react";
import { Button } from "../ui/Button";
import { Workflow, Cpu, ShieldAlert, Coins } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext }) => {
  return (
    <div className="text-center">
      <div className="flex justify-center mb-6">
        <div className="p-4 bg-primary/10 rounded-full text-primary">
          <Workflow className="h-16 w-16" />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome to PreceptaAI</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">
        Your private, local-first AI business automation hub. Run workflows offline, securely, and with zero API costs.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8 text-left">
        <div className="p-3 border border-gray-200 dark:border-gray-800 rounded-lg">
          <Cpu className="h-5 w-5 text-indigo-500 mb-2" />
          <h4 className="font-semibold text-xs text-gray-900 dark:text-white mb-1">Local AI</h4>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Uses your CPU/GPU to run inference offline.</p>
        </div>
        <div className="p-3 border border-gray-200 dark:border-gray-800 rounded-lg">
          <ShieldAlert className="h-5 w-5 text-emerald-500 mb-2" />
          <h4 className="font-semibold text-xs text-gray-900 dark:text-white mb-1">Private</h4>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Data never leaves your machine. HIPAA compliant.</p>
        </div>
        <div className="p-3 border border-gray-200 dark:border-gray-800 rounded-lg">
          <Coins className="h-5 w-5 text-amber-500 mb-2" />
          <h4 className="font-semibold text-xs text-gray-900 dark:text-white mb-1">No API Bills</h4>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Benchmarked against AWS cloud alternatives.</p>
        </div>
      </div>

      <Button onClick={onNext} className="w-full justify-center btn-lg">
        Let's Begin
      </Button>
    </div>
  );
};
