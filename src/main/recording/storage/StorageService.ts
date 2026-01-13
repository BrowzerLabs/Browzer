/**
 * Storage Service
 *
 * Handles persistence of workflow definitions to the file system.
 * Stores workflows in the user's app data directory.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

import * as yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';

import {
  WorkflowDefinition,
  StoredWorkflowMetadata,
  MetadataIndex,
} from '../types';

export class StorageService {
  private storageDir = '';
  private workflowsDir = '';
  private metadataPath = '';
  private initialized = false;

  constructor() {
    // Paths are initialized lazily in initialize() to ensure app is ready
  }

  private initializePaths(): void {
    if (this.storageDir) return; // Already initialized

    // Use Electron's userData directory for storage
    const userDataPath = app.getPath('userData');
    this.storageDir = path.join(userDataPath, 'workflows');
    this.workflowsDir = path.join(this.storageDir, 'definitions');
    this.metadataPath = path.join(this.storageDir, 'metadata.json');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize paths now that app is ready
    this.initializePaths();

    // Create directories if they don't exist
    await fs.mkdir(this.workflowsDir, { recursive: true });

    // Create metadata file if doesn't exist
    try {
      await fs.access(this.metadataPath);
    } catch {
      await this.saveMetadata({ workflows: [] });
    }

    this.initialized = true;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SAVE WORKFLOW
  // ═══════════════════════════════════════════════════════════════════════

  async saveWorkflow(
    workflow: WorkflowDefinition
  ): Promise<{ workflowId: string; filePath: string }> {
    await this.initialize();

    // Generate ID if not present
    const workflowId = workflow.id || uuidv4();
    workflow.id = workflowId;

    // Clean workflow before saving
    const cleanedWorkflow = this.cleanWorkflowForStorage(workflow);

    // Generate file path
    const fileName = `${workflowId}.workflow.yaml`;
    const filePath = path.join(this.workflowsDir, fileName);

    // Convert to YAML
    const yamlContent = this.toYaml(cleanedWorkflow);

    // Write workflow file
    await fs.writeFile(filePath, yamlContent, 'utf-8');

    // Update metadata index
    await this.addToMetadata({
      id: workflowId,
      name: workflow.name,
      description: workflow.description,
      version: workflow.version,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      file_path: `definitions/${fileName}`,
      generation_mode: workflow.metadata?.generation_mode || 'recording',
      step_count: workflow.steps.length,
      variable_count: workflow.input_schema?.length || 0,
    });

    console.log(`[StorageService] Saved workflow: ${filePath}`);

    return { workflowId, filePath };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LOAD WORKFLOW
  // ═══════════════════════════════════════════════════════════════════════

  async loadWorkflow(workflowId: string): Promise<WorkflowDefinition | null> {
    await this.initialize();

    const metadata = await this.getWorkflowMetadata(workflowId);
    if (!metadata) return null;

    const filePath = path.join(this.storageDir, metadata.file_path);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return yaml.parse(content) as WorkflowDefinition;
    } catch (error) {
      console.error(`[StorageService] Failed to load workflow: ${error}`);
      return null;
    }
  }

  async loadWorkflowFromFile(
    filePath: string
  ): Promise<WorkflowDefinition | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return yaml.parse(content) as WorkflowDefinition;
    } catch (error) {
      console.error(`[StorageService] Failed to load workflow file: ${error}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIST & SEARCH
  // ═══════════════════════════════════════════════════════════════════════

  async listWorkflows(): Promise<StoredWorkflowMetadata[]> {
    await this.initialize();
    const metadata = await this.loadMetadata();
    return metadata.workflows;
  }

  async searchWorkflows(query: string): Promise<StoredWorkflowMetadata[]> {
    const workflows = await this.listWorkflows();
    const lowerQuery = query.toLowerCase();

    return workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(lowerQuery) ||
        w.description.toLowerCase().includes(lowerQuery)
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UPDATE WORKFLOW
  // ═══════════════════════════════════════════════════════════════════════

  async updateWorkflow(
    workflowId: string,
    updates: Partial<Pick<WorkflowDefinition, 'name' | 'description' | 'steps'>>
  ): Promise<boolean> {
    await this.initialize();

    const workflow = await this.loadWorkflow(workflowId);
    if (!workflow) return false;

    // Apply updates
    if (updates.name) workflow.name = updates.name;
    if (updates.description) workflow.description = updates.description;
    if (updates.steps) workflow.steps = updates.steps;

    // Update metadata timestamp
    if (workflow.metadata) {
      workflow.metadata.updated_at = new Date().toISOString();
    }

    // Save updated workflow
    await this.saveWorkflow(workflow);

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════════════════

  async deleteWorkflow(workflowId: string): Promise<boolean> {
    await this.initialize();

    const metadata = await this.getWorkflowMetadata(workflowId);
    if (!metadata) return false;

    // Delete file
    const filePath = path.join(this.storageDir, metadata.file_path);
    try {
      await fs.unlink(filePath);
    } catch {
      // File might not exist
    }

    // Remove from metadata
    await this.removeFromMetadata(workflowId);

    console.log(`[StorageService] Deleted workflow: ${workflowId}`);

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // METADATA MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  private async loadMetadata(): Promise<MetadataIndex> {
    try {
      const content = await fs.readFile(this.metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { workflows: [] };
    }
  }

  private async saveMetadata(metadata: MetadataIndex): Promise<void> {
    const content = JSON.stringify(metadata, null, 2);
    await fs.writeFile(this.metadataPath, content, 'utf-8');
  }

  private async addToMetadata(workflow: StoredWorkflowMetadata): Promise<void> {
    const metadata = await this.loadMetadata();

    // Remove existing entry if updating
    metadata.workflows = metadata.workflows.filter((w) => w.id !== workflow.id);

    // Add new entry at the beginning
    metadata.workflows.unshift(workflow);

    await this.saveMetadata(metadata);
  }

  private async removeFromMetadata(workflowId: string): Promise<void> {
    const metadata = await this.loadMetadata();
    metadata.workflows = metadata.workflows.filter((w) => w.id !== workflowId);
    await this.saveMetadata(metadata);
  }

  private async getWorkflowMetadata(
    workflowId: string
  ): Promise<StoredWorkflowMetadata | null> {
    const metadata = await this.loadMetadata();
    return metadata.workflows.find((w) => w.id === workflowId) || null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // YAML CONVERSION
  // ═══════════════════════════════════════════════════════════════════════

  private toYaml(workflow: WorkflowDefinition): string {
    return yaml.stringify(workflow, {
      indent: 2,
      lineWidth: 120,
    });
  }

  private cleanWorkflowForStorage(
    workflow: WorkflowDefinition
  ): WorkflowDefinition {
    const cleaned = { ...workflow };

    // Remove internal metadata
    if (cleaned.metadata) {
      delete cleaned.metadata.action_count;
    }

    // Clean steps
    cleaned.steps = cleaned.steps.map((step) => {
      const cleanStep = { ...step };

      // Remove verbose fields
      delete (cleanStep as any).boundingRect;
      delete (cleanStep as any).index;

      // Limit selector strategies to top 3
      if (
        cleanStep.selectorStrategies &&
        cleanStep.selectorStrategies.length > 3
      ) {
        cleanStep.selectorStrategies = cleanStep.selectorStrategies.slice(0, 3);
      }

      return cleanStep;
    });

    return cleaned;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXPORT/IMPORT
  // ═══════════════════════════════════════════════════════════════════════

  async exportWorkflow(workflowId: string): Promise<string | null> {
    const workflow = await this.loadWorkflow(workflowId);
    if (!workflow) return null;
    return this.toYaml(workflow);
  }

  async importWorkflow(yamlContent: string): Promise<string | null> {
    try {
      const workflow = yaml.parse(yamlContent) as WorkflowDefinition;

      // Generate new ID to avoid conflicts
      workflow.id = uuidv4();

      // Update metadata
      if (workflow.metadata) {
        workflow.metadata.created_at = new Date().toISOString();
        workflow.metadata.updated_at = new Date().toISOString();
      }

      const result = await this.saveWorkflow(workflow);
      return result.workflowId;
    } catch (error) {
      console.error(`[StorageService] Failed to import workflow: ${error}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════

  getStorageDirectory(): string {
    this.initializePaths();
    return this.storageDir;
  }
}
