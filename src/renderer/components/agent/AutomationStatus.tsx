import React from 'react';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Item } from '@/renderer/ui/item';
import { Progress } from '@/renderer/ui/progress';

interface AutomationStep {
  id: string;
  action: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

interface AutomationStatusProps {
  isExecuting: boolean;
  steps: AutomationStep[];
  completedCount: number;
  totalCount: number;
}

export function AutomationStatus({ isExecuting, steps, completedCount, totalCount }: AutomationStatusProps) {
  if (!isExecuting || steps.length === 0) return null;

  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <Item className="bg-gray-900 border border-gray-800">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span className="text-sm font-medium">Executing Automation</span>
          </div>
          <span className="text-xs text-gray-400">
            {completedCount}/{totalCount} steps
          </span>
        </div>

        {/* Progress Bar */}
        <Progress value={progress} className="h-1.5" />

        {/* Steps List - Show only last 3 steps */}
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {steps.slice(-3).map((step) => (
            <div
              key={step.id}
              className="flex items-start gap-2 text-xs p-2 rounded bg-gray-800/50"
            >
              <div className="mt-0.5">
                {step.status === 'completed' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                )}
                {step.status === 'failed' && (
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                )}
                {step.status === 'running' && (
                  <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                )}
                {step.status === 'pending' && (
                  <Clock className="w-3.5 h-3.5 text-gray-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-gray-300">{step.description}</p>
                {step.error && (
                  <p className="text-red-400 text-[10px] mt-0.5 truncate">{step.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Item>
  );
}
