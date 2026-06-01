"use client";

import React, { useState } from "react";
import { Button } from "../ui/Button";
import { Cpu, Layout, HardDrive, DollarSign } from "lucide-react";

interface HardwareProfile {
  cpu_cores: number;
  ram_total_gb: number;
  disk_free_gb: number;
}

interface ResourceConfig {
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  electricityRate: number;
}

interface ResourceAllocationStepProps {
  hardwareProfile: HardwareProfile;
  onNext: (config: ResourceConfig) => void;
  onBack: () => void;
}

export const ResourceAllocationStep: React.FC<ResourceAllocationStepProps> = ({
  hardwareProfile,
  onNext,
  onBack,
}) => {
  // Defaults: 50% cores (min 1), 50% memory (min 2GB), 20GB disk
  const defaultCores = Math.max(Math.round(hardwareProfile.cpu_cores / 2), 1);
  const defaultMemory = Math.max(Math.round(hardwareProfile.ram_total_gb / 2), 2);
  const defaultDisk = Math.min(20, Math.round(hardwareProfile.disk_free_gb));

  const [cpuCores, setCpuCores] = useState(defaultCores);
  const [memoryGb, setMemoryGb] = useState(defaultMemory);
  const [diskGb, setDiskGb] = useState(defaultDisk);
  const [electricityRate, setElectricityRate] = useState(0.12);

  const handleNext = () => {
    onNext({
      cpuCores,
      memoryGb,
      diskGb,
      electricityRate,
    });
  };

  return (
    <div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 text-center">Allocate Local Resources</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 text-center">
        Control how much CPU, memory, and storage EdgeStack is allowed to use on your machine.
      </p>

      <div className="space-y-5 mb-6">
        {/* CPU Cores */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5" /> CPU Cores Limit</span>
            <span className="text-primary font-bold">{cpuCores} Cores / {hardwareProfile.cpu_cores} Total</span>
          </div>
          <input
            type="range"
            min="1"
            max={hardwareProfile.cpu_cores}
            step="1"
            value={cpuCores}
            onChange={(e) => setCpuCores(parseInt(e.target.value))}
            className="slider"
          />
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            More cores speed up inference, but leaving cores free keeps other apps responsive.
          </p>
        </div>

        {/* RAM Limit */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="flex items-center gap-1.5"><Layout className="h-3.5 w-3.5" /> Memory Limit (RAM)</span>
            <span className="text-primary font-bold">{memoryGb} GB / {hardwareProfile.ram_total_gb.toFixed(0)} GB Total</span>
          </div>
          <input
            type="range"
            min="2"
            max={Math.floor(hardwareProfile.ram_total_gb)}
            step="1"
            value={memoryGb}
            onChange={(e) => setMemoryGb(parseInt(e.target.value))}
            className="slider"
          />
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Allocate enough memory for the model to load fully (Balanced needs ~2-3 GB).
          </p>
        </div>

        {/* Storage limit */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" /> Storage Limit</span>
            <span className="text-primary font-bold">{diskGb} GB / {hardwareProfile.disk_free_gb.toFixed(0)} GB Free</span>
          </div>
          <input
            type="range"
            min="5"
            max={Math.floor(hardwareProfile.disk_free_gb)}
            step="5"
            value={diskGb}
            onChange={(e) => setDiskGb(parseInt(e.target.value))}
            className="slider"
          />
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Maximum disk space allocated for model storage, SQLite data, and files in the Object Vault.
          </p>
        </div>

        {/* Electricity Rate */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Local Electricity Rate</span>
            <span className="text-primary font-bold">${electricityRate.toFixed(3)} per kWh</span>
          </div>
          <input
            type="number"
            min="0"
            max="2"
            step="0.005"
            value={electricityRate}
            onChange={(e) => setElectricityRate(parseFloat(e.target.value) || 0)}
            className="input text-sm py-1.5"
          />
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Used to calculate accurate local running costs vs cloud provider pricing benchmarks.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={onBack} variant="secondary" className="flex-1 justify-center">
          Back
        </Button>
        <Button onClick={handleNext} className="flex-1 justify-center">
          Continue to Summary
        </Button>
      </div>
    </div>
  );
};
