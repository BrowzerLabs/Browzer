/**
 * Recording Handler
 *
 * Handles IPC communication for the recording system.
 */

import { BaseHandler } from './base/BaseHandler';

import {
  RecordingManager,
  RecorderMessage,
  WorkflowEnhancer,
} from '@/main/recording';

export class RecordingHandler extends BaseHandler {
  private recordingManager: RecordingManager | null = null;

  setRecordingManager(manager: RecordingManager): void {
    this.recordingManager = manager;
  }

  register(): void {
    // Start recording on the active tab
    this.handle('recording:start', async () => {
      if (!this.recordingManager) {
        throw new Error('Recording manager not initialized');
      }

      const activeTab = this.context.tabService.getActiveTab();
      if (!activeTab) {
        throw new Error('No active tab to record');
      }

      const result = await this.recordingManager.startRecording(
        activeTab.view,
        activeTab.id
      );

      // Return plain serializable object
      return { sessionId: result.sessionId };
    });

    // Stop recording
    this.handle('recording:stop', async () => {
      if (!this.recordingManager) {
        throw new Error('Recording manager not initialized');
      }

      const session = await this.recordingManager.stopRecording();
      if (!session) return null;

      // Return plain serializable copy without potential circular references
      return {
        id: session.id,
        startedAt: session.startedAt,
        stoppedAt: session.stoppedAt,
        actions: session.actions,
        status: session.status,
        initialUrl: session.initialUrl,
      };
    });

    // Discard recording
    this.handle('recording:discard', async () => {
      if (!this.recordingManager) {
        throw new Error('Recording manager not initialized');
      }

      await this.recordingManager.discardRecording();
      return true;
    });

    // Get current recording status
    this.handle('recording:status', async () => {
      if (!this.recordingManager) {
        return { status: 'idle' };
      }

      const session = this.recordingManager.getCurrentSession();
      return {
        status: this.recordingManager.getStatus(),
        sessionId: session?.id,
        actionCount: session?.actions.length || 0,
        actions: session?.actions || [],
      };
    });

    // Generate workflow from recorded session
    this.handle(
      'recording:generate-workflow',
      async (_, name: string, description: string) => {
        if (!this.recordingManager) {
          throw new Error('Recording manager not initialized');
        }

        const result = await this.recordingManager.generateWorkflow(
          name,
          description
        );
        return result;
      }
    );

    // Handle recorder events from injected script
    this.handle(
      'recording:recorder-event',
      async (_, tabId: string, message: RecorderMessage) => {
        if (!this.recordingManager) {
          return;
        }

        this.recordingManager.handleRecorderEvent(tabId, message);
      }
    );

    // ═══════════════════════════════════════════════════════════════════════
    // WORKFLOW MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    // List all workflows
    this.handle('recording:list-workflows', async () => {
      if (!this.recordingManager) {
        return [];
      }

      const storage = this.recordingManager.getStorageService();
      return storage.listWorkflows();
    });

    // Get a specific workflow
    this.handle('recording:get-workflow', async (_, workflowId: string) => {
      if (!this.recordingManager) {
        return null;
      }

      const storage = this.recordingManager.getStorageService();
      return storage.loadWorkflow(workflowId);
    });

    // Delete a workflow
    this.handle('recording:delete-workflow', async (_, workflowId: string) => {
      if (!this.recordingManager) {
        return false;
      }

      const storage = this.recordingManager.getStorageService();
      return storage.deleteWorkflow(workflowId);
    });

    // Update workflow
    this.handle(
      'recording:update-workflow',
      async (
        _,
        workflowId: string,
        updates: { name?: string; description?: string }
      ) => {
        if (!this.recordingManager) {
          return false;
        }

        const storage = this.recordingManager.getStorageService();
        return storage.updateWorkflow(workflowId, updates);
      }
    );

    // Export workflow as YAML
    this.handle('recording:export-workflow', async (_, workflowId: string) => {
      if (!this.recordingManager) {
        return null;
      }

      const storage = this.recordingManager.getStorageService();
      return storage.exportWorkflow(workflowId);
    });

    // Import workflow from YAML
    this.handle('recording:import-workflow', async (_, yamlContent: string) => {
      if (!this.recordingManager) {
        return null;
      }

      const storage = this.recordingManager.getStorageService();
      return storage.importWorkflow(yamlContent);
    });

    // Search workflows
    this.handle('recording:search-workflows', async (_, query: string) => {
      if (!this.recordingManager) {
        return [];
      }

      const storage = this.recordingManager.getStorageService();
      return storage.searchWorkflows(query);
    });

    // ═══════════════════════════════════════════════════════════════════════
    // AI ENHANCEMENT
    // ═══════════════════════════════════════════════════════════════════════

    // Enhance workflow with AI
    this.handle(
      'recording:enhance-workflow',
      async (
        _,
        workflowId: string,
        options?: {
          improveDescriptions?: boolean;
          detectVariables?: boolean;
        }
      ) => {
        if (!this.recordingManager) {
          return { success: false, error: 'Recording manager not initialized' };
        }

        const storage = this.recordingManager.getStorageService();
        const workflow = await storage.loadWorkflow(workflowId);

        if (!workflow) {
          return { success: false, error: 'Workflow not found' };
        }

        const enhancer = new WorkflowEnhancer();
        const result = await enhancer.enhance(workflow, options);

        if (result.success && result.workflow) {
          // Save the enhanced workflow
          await storage.saveWorkflow(result.workflow);
          return {
            success: true,
            workflow: result.workflow,
          };
        }

        return result;
      }
    );
  }
}
