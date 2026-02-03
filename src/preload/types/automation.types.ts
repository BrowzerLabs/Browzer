import {
  UpdateScheduledAutomationParams,
  ScheduledAutomation,
  ScheduledAutomationRun,
  CreateScheduledAutomationParams,
} from '@/shared/types';

export interface AutomationAPI {
  createScheduledAutomation: (
    params: CreateScheduledAutomationParams
  ) => Promise<{
    success: boolean;
    data?: ScheduledAutomation;
    error?: string;
  }>;
  updateScheduledAutomation: (
    params: UpdateScheduledAutomationParams
  ) => Promise<{
    success: boolean;
    data?: ScheduledAutomation;
    error?: string;
  }>;
  deleteScheduledAutomation: (
    id: string
  ) => Promise<{ success: boolean; error?: string }>;
  getScheduledAutomation: (
    id: string
  ) => Promise<{
    success: boolean;
    data?: ScheduledAutomation;
    error?: string;
  }>;
  getAllScheduledAutomations: () => Promise<{
    success: boolean;
    data?: ScheduledAutomation[];
    error?: string;
  }>;
  toggleScheduledAutomation: (
    id: string,
    enabled: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  getRunHistory: (
    scheduledAutomationId: string
  ) => Promise<{
    success: boolean;
    data?: ScheduledAutomationRun[];
    error?: string;
  }>;
  getRecentRuns: (
    limit?: number
  ) => Promise<{
    success: boolean;
    data?: ScheduledAutomationRun[];
    error?: string;
  }>;
}
