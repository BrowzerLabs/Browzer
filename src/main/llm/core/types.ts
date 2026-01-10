import { AutomationStatus, ToolExecutionResult } from '@/shared/types';

export interface AutomationStep {
  toolName: string;
  toolUseId: string;
  input: any;
  order: number;
}

export interface AutomationPlan {
  steps: AutomationStep[];
}

export interface ExecutedStep {
  stepNumber: number;
  toolName: string;
  success: boolean;
  result?: ToolExecutionResult;
  error?: string;
}

export interface CompletedPlan {
  phaseNumber: number;
  plan: AutomationPlan;
  stepsExecuted: number;
}

export interface PlanExecutionResult {
  status: AutomationStatus;
  isComplete: boolean;
  error?: string;
}

export interface IterativeAutomationResult {
  success: boolean;
  plan?: AutomationPlan;
  executionResults: any[];
  error?: string;
  analysis?: string;
  totalStepsExecuted: number;
}
