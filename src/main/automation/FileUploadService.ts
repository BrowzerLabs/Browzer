import { ToolExecutionResult } from '@/shared/types';
import {
  BaseActionService,
  ExecutionContext,
  NodeParams,
} from './BaseActionService';
import fs from 'fs';

export interface FileUploadParams extends NodeParams {
  filePaths: string[];
  selector?: string;
}

export class FileUploadService extends BaseActionService {
  constructor(context: ExecutionContext) {
    super(context);
  }

  public async execute(params: FileUploadParams): Promise<ToolExecutionResult> {
    try {
      if (!params.filePaths || params.filePaths.length === 0) {
        return {
          success: false,
          error: 'File paths cannot be empty',
        };
      }

      for (const path of params.filePaths) {
        if (!fs.existsSync(path)) {
          return {
            success: false,
            error: `File does not exist: ${path}`,
          };
        }
      }

      await this.waitForNetworkIdle({
        timeout: 3000,
        idleTime: 500,
        maxInflightRequests: 0,
      });

      // MODE 1: Direct CDP node upload
      if (params.nodeId !== undefined) {
        await this.performFileUpload(params.nodeId, params.filePaths);
        return { success: true };
      }

      // MODE 2: CSS selector-based upload
      if (params.selector !== undefined) {
        return await this.findAndUploadBySelector(
          params.selector,
          params.filePaths
        );
      }

      // MODE 3: Attribute-based element finding
      if (params.role || params.name || params.attributes) {
        return await this.findAndUploadByAttributes(params);
      }

      return {
        success: false,
        error: 'Either nodeId, selector, or element attributes must be provided',
      };
    } catch (error) {
      console.error('[FileUploadService] Error:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown file upload error',
      };
    }
  }

  private async findAndUploadBySelector(
    selector: string,
    filePaths: string[]
  ): Promise<ToolExecutionResult> {
    try {
      const { root } = await this.cdp.sendCommand('DOM.getDocument');
      const { nodeId } = await this.cdp.sendCommand('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: selector,
      });

      if (!nodeId) {
        return {
          success: false,
          error: `Element not found with selector: ${selector}`,
        };
      }

      const { node } = await this.cdp.sendCommand('DOM.describeNode', {
        nodeId: nodeId,
      });

      if (!node.backendNodeId) {
        return {
          success: false,
          error: 'Could not get backend node ID for element',
        };
      }

      await this.performFileUpload(node.backendNodeId, filePaths);
      return { success: true };
    } catch (error) {
      console.error('[FileUploadService] Selector error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to upload file by selector',
      };
    }
  }

  private async findAndUploadByAttributes(
    params: FileUploadParams
  ): Promise<ToolExecutionResult> {
    try {
      const { nodes } = await this.cdp.sendCommand(
        'Accessibility.getFullAXTree',
        {
          depth: -1,
        }
      );

      if (!nodes || nodes.length === 0) {
        return { success: false, error: 'No accessibility nodes found' };
      }

      const bestMatch = this.findBestMatchingNode(nodes, params);

      if (!bestMatch) {
        return {
          success: false,
          error: 'No matching file input element found',
        };
      }

      console.log('[FileUploadService] Matched node:', {
        nodeId: bestMatch.backendDOMNodeId,
        role: bestMatch.role?.value,
        name: bestMatch.name?.value,
        score: bestMatch.score,
      });

      await this.performFileUpload(
        bestMatch.backendDOMNodeId,
        params.filePaths
      );
      return { success: true };
    } catch (error) {
      console.error('[FileUploadService] Attribute error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to upload file by attributes',
      };
    }
  }

  private async performFileUpload(
    backendNodeId: number,
    filePaths: string[]
  ): Promise<void> {
    await this.cdp.sendCommand('DOM.setFileInputFiles', {
      files: filePaths,
      backendNodeId: backendNodeId,
    });

    console.log('[FileUploadService] Files uploaded successfully:', {
      backendNodeId,
      fileCount: filePaths.length,
      files: filePaths,
    });
  }
}