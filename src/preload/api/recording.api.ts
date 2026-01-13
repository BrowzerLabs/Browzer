/**
 * Recording API for preload script
 *
 * Exposes recording functionality to the renderer process.
 */

import type { RecordingAPI } from '@/preload/types/recording.types';
import {
  invoke,
  createEventListener,
  createSimpleListener,
} from '@/preload/utils/ipc-helpers';

export const createRecordingAPI = (): RecordingAPI => ({
  // Recording control
  startRecording: () => invoke('recording:start'),
  stopRecording: () => invoke('recording:stop'),
  discardRecording: () => invoke('recording:discard'),
  getStatus: () => invoke('recording:status'),

  // Workflow generation
  generateWorkflow: (name: string, description: string) =>
    invoke('recording:generate-workflow', name, description),

  // Workflow management
  listWorkflows: () => invoke('recording:list-workflows'),
  getWorkflow: (workflowId: string) =>
    invoke('recording:get-workflow', workflowId),
  deleteWorkflow: (workflowId: string) =>
    invoke('recording:delete-workflow', workflowId),
  updateWorkflow: (
    workflowId: string,
    updates: { name?: string; description?: string }
  ) => invoke('recording:update-workflow', workflowId, updates),
  searchWorkflows: (query: string) =>
    invoke('recording:search-workflows', query),

  // Import/Export
  exportWorkflow: (workflowId: string) =>
    invoke('recording:export-workflow', workflowId),
  importWorkflow: (yamlContent: string) =>
    invoke('recording:import-workflow', yamlContent),

  // AI Enhancement
  enhanceWorkflow: (
    workflowId: string,
    options?: { improveDescriptions?: boolean; detectVariables?: boolean }
  ) => invoke('recording:enhance-workflow', workflowId, options),

  // Event listeners
  onRecordingStarted: (callback) =>
    createEventListener<{ sessionId: string }>('recording:started', callback),
  onRecordingStopped: (callback) =>
    createEventListener<{ session: any }>('recording:stopped', callback),
  onRecordingAction: (callback) =>
    createEventListener<any>('recording:action', callback),
  onRecordingStateChanged: (callback) =>
    createEventListener<{
      status: string;
      sessionId?: string;
      actionCount?: number;
    }>('recording:state-changed', callback),
});
