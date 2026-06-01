"use client";

import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Cpu, Check } from "lucide-react";

interface ModelOption {
  id: string;
  display_name: string;
  category: string;
  ollama_tag: string;
  description: string;
  good_at: string;
  download_gb: number;
  memory_gb: number;
  license: string;
  recommended: boolean;
}

interface ModelSelectionStepProps {
  ramGb: number;
  onNext: (selectedModel: ModelOption) => void;
  onBack: () => void;
}

export const ModelSelectionStep: React.FC<ModelSelectionStepProps> = ({
  ramGb,
  onNext,
  onBack,
}) => {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res: ModelOption[] = await invoke("get_model_recommendations", { ramGb });
        setModels(res);
        // Find default recommended model and select it
        const recommended = res.find((m) => m.recommended);
        if (recommended) {
          setSelectedId(recommended.id);
        } else if (res.length > 0) {
          setSelectedId(res[0].id);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchModels();
  }, [ramGb]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
  };

  const handleNext = () => {
    const selected = models.find((m) => m.id === selectedId);
    if (selected) {
      onNext(selected);
    }
  };

  return (
    <div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 text-center">Select AI Inference Model</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 text-center">
        EdgeStack runs this model completely offline. A larger model is more capable but requires more memory.
      </p>

      <div className="space-y-3 mb-6 max-h-[360px] overflow-y-auto pr-1">
        {models.map((model) => {
          const isSelected = model.id === selectedId;
          return (
            <div
              key={model.id}
              onClick={() => handleSelect(model.id)}
              className={`model-card ${isSelected ? "selected" : ""}`}
            >
              {model.recommended && (
                <div className="model-recommended-badge">
                  Recommended
                </div>
              )}
              <div className="flex justify-between items-start mb-1">
                <div>
                  <h4 className="font-semibold text-sm text-gray-950 dark:text-white flex items-center gap-1.5">
                    {model.display_name}
                    <span className="text-[10px] text-gray-400 font-normal">({model.ollama_tag})</span>
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{model.description}</p>
                </div>
                {isSelected && (
                  <span className="p-0.5 bg-primary text-white rounded-full">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded font-medium">
                  Good at: {model.good_at}
                </span>
                <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                  Download: {model.download_gb.toFixed(1)} GB
                </span>
                <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                  RAM Required: {model.memory_gb.toFixed(0)} GB
                </span>
                <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                  {model.license}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Button onClick={onBack} variant="secondary" className="flex-1 justify-center">
          Back
        </Button>
        <Button onClick={handleNext} disabled={!selectedId} className="flex-1 justify-center">
          Confirm & Install
        </Button>
      </div>
    </div>
  );
};
