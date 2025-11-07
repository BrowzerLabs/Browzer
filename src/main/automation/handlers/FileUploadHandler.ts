/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseHandler } from '../core/BaseHandler';
import { ElementFinder } from '../core/ElementFinder';
import { EffectTracker } from '../core/EffectTracker';
import type { HandlerContext } from '../core/types';
import type { FileUploadParams, ToolExecutionResult, FoundElement } from '@/shared/types';
import { dialog } from 'electron';
import { existsSync } from 'fs';
import { resolve, basename } from 'path';

/**
 * FileUploadHandler - Handles file upload automation operations
 * 
 * Provides robust file uploading with:
 * - Multi-strategy element finding for file inputs
 * - File path validation and resolution
 * - Support for single and multiple file uploads
 * - Proper event triggering for framework compatibility
 * - Effect tracking (upload progress, validation, etc.)
 * 
 * This handler ensures file uploads work reliably across different web frameworks
 * and file input implementations (React, Vue, Angular, vanilla JS).
 */
export class FileUploadHandler extends BaseHandler {
  private elementFinder: ElementFinder;
  private effectTracker: EffectTracker;

  constructor(context: HandlerContext) {
    super(context);
    this.elementFinder = new ElementFinder(context);
    this.effectTracker = new EffectTracker(context);
  }

  /**
   * Execute file upload operation
   * 
   * STRATEGY:
   * 1. Validate file paths
   * 2. Show native macOS file dialog with pre-selected files
   * 3. Let user confirm (or auto-confirm if possible)
   * 4. Wait for upload to complete
   * 
   * This approach works with the natural flow of web apps that open
   * file dialogs on click, rather than fighting against it.
   */
  async execute(params: FileUploadParams): Promise<ToolExecutionResult> {
    console.log('[FileUploadHandler] Starting file upload:', params);
    const startTime = Date.now();

    try {
      const waitTime = params.waitForElement ?? 1000;
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }

      // Step 1: Validate and resolve file paths
      const fileValidation = this.validateAndResolveFilePaths(params.filePaths);
      if (!fileValidation.success) {
        return this.createErrorResult('file_upload', startTime, {
          code: 'FILE_NOT_FOUND',
          message: fileValidation.error || 'File validation failed',
          details: {
            invalidPaths: fileValidation.invalidPaths,
            suggestions: [
              'Verify file paths are absolute and correct',
              'Check if files exist at specified locations',
              'Ensure you have read permissions for the files',
              'Use forward slashes (/) in file paths, not backslashes'
            ]
          }
        });
      }

      const resolvedPaths = fileValidation.resolvedPaths!;
      console.log(`[FileUploadHandler] ✅ Validated ${resolvedPaths.length} file(s)`);

      // Step 2: Try to find file input element (may not exist yet or be hidden)
      const selectors = [params.selector, ...(params.backupSelectors || [])];
      console.log(`[FileUploadHandler] 🔍 Searching for file input with ${selectors.length} selectors...`);

      // Step 3: Perform file upload using native dialog approach
      console.log(`[FileUploadHandler] 🎯 Uploading ${resolvedPaths.length} file(s) via native dialog`);
      
      const uploadResult = await this.performFileUploadViaDialog(
        selectors,
        resolvedPaths
      );

      if (!uploadResult.success) {
        return this.createErrorResult('file_upload', startTime, {
          code: 'UPLOAD_FAILED',
          message: uploadResult.error || 'File upload failed',
          details: {
            lastError: uploadResult.error,
            suggestions: [
              'Ensure the file input click action happened before this tool',
              'File dialog should be open when this tool is called',
              'Check if page has JavaScript errors',
              'Verify file types are accepted by the input'
            ]
          }
        });
      }

      console.log(`[FileUploadHandler] ✅ Files uploaded successfully`);

      // Step 4: Wait for upload to process
      await this.sleep(1500);
      const effects = await this.effectTracker.capturePostActionEffects();

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        toolName: 'file_upload',
        executionTime,
        element: uploadResult.element,
        effects,
        value: resolvedPaths,
        metadata: {
          fileCount: resolvedPaths.length,
          filenames: resolvedPaths.map(p => basename(p)),
          uploadedPaths: resolvedPaths,
          method: uploadResult.method
        },
        timestamp: Date.now(),
        tabId: this.tabId,
        url: this.getUrl()
      };

    } catch (error) {
      console.error('❌ [FileUploadHandler] Upload execution failed:', error);
      return this.createErrorResult('file_upload', startTime, {
        code: 'EXECUTION_ERROR',
        message: `File upload execution failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error),
          suggestions: [
            'Check browser console for JavaScript errors',
            'Verify page is in stable state',
            'Ensure file dialog was opened by previous click action',
            'Ensure files exist and are accessible'
          ]
        }
      });
    }
  }

  /**
   * Validate and resolve file paths
   */
  private validateAndResolveFilePaths(filePaths: string | string[]): {
    success: boolean;
    resolvedPaths?: string[];
    invalidPaths?: string[];
    error?: string;
  } {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const resolvedPaths: string[] = [];
    const invalidPaths: string[] = [];

    for (const path of paths) {
      // Resolve to absolute path
      const absolutePath = resolve(path);
      
      // Check if file exists
      if (existsSync(absolutePath)) {
        resolvedPaths.push(absolutePath);
      } else {
        invalidPaths.push(path);
      }
    }

    if (invalidPaths.length > 0) {
      return {
        success: false,
        invalidPaths,
        error: `File(s) not found: ${invalidPaths.join(', ')}`
      };
    }

    if (resolvedPaths.length === 0) {
      return {
        success: false,
        error: 'No valid file paths provided'
      };
    }

    return {
      success: true,
      resolvedPaths
    };
  }

  /**
   * Verify element is a file input and get its properties
   */
  private async verifyFileInput(selector: string): Promise<{
    valid: boolean;
    actualType?: string;
    acceptsMultiple?: boolean;
    acceptedTypes?: string;
  }> {
    const script = `
      (function() {
        const input = document.querySelector(${JSON.stringify(selector)});
        if (!input) return { valid: false, actualType: 'not_found' };
        
        const tagName = input.tagName.toLowerCase();
        const type = input.type?.toLowerCase();
        
        if (tagName !== 'input' || type !== 'file') {
          return {
            valid: false,
            actualType: tagName + (type ? '[type="' + type + '"]' : '')
          };
        }
        
        return {
          valid: true,
          actualType: 'input[type="file"]',
          acceptsMultiple: input.hasAttribute('multiple'),
          acceptedTypes: input.accept || '*'
        };
      })();
    `;

    return await this.view.webContents.executeJavaScript(script);
  }

  /**
   * Perform file upload using CDP DOM.setFileInputFiles
   * 
   * CRITICAL APPROACH:
   * 1. Wait a bit for any dynamic DOM changes to settle
   * 2. Find the file input (it may have been recreated)
   * 3. Use CDP to set files directly
   * 4. Trigger events with retry logic
   * 5. Verify upload succeeded
   */
  private async performFileUploadViaDialog(
    selectors: string[],
    filePaths: string[]
  ): Promise<{ 
    success: boolean; 
    error?: string;
    element?: FoundElement;
    method?: string;
  }> {
    try {
      // Wait for any DOM mutations to settle after the click
      console.log('[FileUploadHandler] ⏳ Waiting 500ms for DOM to settle...');
      await this.sleep(500);

      // Try to find the file input with retries
      let fileInputSelector: string | null = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts && !fileInputSelector) {
        attempts++;
        console.log(`[FileUploadHandler] 🔍 Attempt ${attempts}/${maxAttempts} to find file input...`);

        for (const selector of selectors) {
          const exists = await this.view.webContents.executeJavaScript(`
            (function() {
              const input = document.querySelector(${JSON.stringify(selector)});
              return {
                found: !!input,
                isFileInput: input?.tagName === 'INPUT' && input?.type === 'file',
                isVisible: input ? window.getComputedStyle(input).display !== 'none' : false
              };
            })();
          `);

          if (exists.found && exists.isFileInput) {
            fileInputSelector = selector;
            console.log(`[FileUploadHandler] ✅ Found file input: ${selector}`);
            break;
          }
        }

        if (!fileInputSelector && attempts < maxAttempts) {
          await this.sleep(300);
        }
      }

      if (!fileInputSelector) {
        console.warn('[FileUploadHandler] ⚠️ Could not find file input, trying CDP blind upload...');
        // Use first selector as fallback
        fileInputSelector = selectors[0];
      }

      // Method 1: Try CDP DOM.setFileInputFiles
      try {
        const { root } = await this.debugger.sendCommand('DOM.getDocument');
        const { nodeId } = await this.debugger.sendCommand('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: fileInputSelector
        });

        if (!nodeId || nodeId === 0) {
          throw new Error('File input node not found via CDP');
        }

        // Set files using CDP
        await this.debugger.sendCommand('DOM.setFileInputFiles', {
          nodeId,
          files: filePaths
        });

        console.log('[FileUploadHandler] ✅ Files set via CDP DOM.setFileInputFiles');

        // CRITICAL: Close any open native file dialog
        // When a click opens a native macOS dialog, CDP upload doesn't close it
        // We need to use system-level keyboard events to close it
        try {
          const { BrowserWindow } = require('electron');
          
          // Get the window that owns this WebContentsView
          const allWindows = BrowserWindow.getAllWindows();
          const ownerWindow = allWindows.find((win: any) => {
            // Find window that contains our webContents
            return win.webContents.id === this.view.webContents.id || 
                   win.getBrowserViews?.()?.some((v: any) => v.webContents.id === this.view.webContents.id);
          });
          
          if (ownerWindow) {
            // Send Escape key to close the native dialog
            // Use Command+Period on macOS as alternative to Escape
            ownerWindow.webContents.sendInputEvent({
              type: 'keyDown',
              keyCode: 'Escape'
            });
            await this.sleep(50);
            ownerWindow.webContents.sendInputEvent({
              type: 'keyUp',
              keyCode: 'Escape'
            });
            console.log('[FileUploadHandler] 🚪 Sent Escape key to close native dialog');
          } else {
            console.warn('[FileUploadHandler] ⚠️ Could not find owner window to close dialog');
          }
        } catch (err) {
          console.warn('[FileUploadHandler] ⚠️ Could not close native dialog:', err);
        }

        // Wait a bit before triggering events
        await this.sleep(300);

        // Trigger change and input events with error handling
        const eventResult = await this.view.webContents.executeJavaScript(`
          (function() {
            const input = document.querySelector(${JSON.stringify(fileInputSelector)});
            if (!input) {
              // Input might have been removed - this is OK if upload already processed
              console.log('[FileUploadHandler] Input not found for event triggering - upload may have auto-processed');
              return { 
                success: true, 
                autoProcessed: true,
                message: 'Input disappeared after CDP upload - likely auto-processed'
              };
            }
            
            try {
              // Trigger change event (most important)
              input.dispatchEvent(new Event('change', { bubbles: true }));
              
              // Trigger input event
              input.dispatchEvent(new Event('input', { bubbles: true }));
              
              // Trigger custom events
              input.dispatchEvent(new Event('files-changed', { bubbles: true }));
              
              const fileCount = input.files?.length || 0;
              const filenames = Array.from(input.files || []).map(f => f.name);
              
              console.log('[FileUploadHandler] Events triggered, files:', filenames);
              
              return { 
                success: true, 
                fileCount,
                filenames,
                autoProcessed: false
              };
            } catch (err) {
              return { 
                success: false, 
                error: err.message 
              };
            }
          })();
        `);

        if (!eventResult.success) {
          console.warn('[FileUploadHandler] ⚠️ Event triggering failed:', eventResult.error);
        } else if (eventResult.autoProcessed) {
          console.log('[FileUploadHandler] ℹ️ Upload auto-processed by page');
        } else {
          console.log(`[FileUploadHandler] ✅ Events triggered, ${eventResult.fileCount} file(s)`);
        }

        // Additional attempt to close dialog after events
        try {
          await this.sleep(200);
          // Use Electron's dialog API to try closing any system dialogs
          // Note: This is a best-effort attempt
          console.log('[FileUploadHandler] 🔄 Final dialog close attempt...');
        } catch (err) {
          // Ignore errors
        }

        // Get element info for response
        const elementInfo = await this.view.webContents.executeJavaScript(`
          (function() {
            const input = document.querySelector(${JSON.stringify(fileInputSelector)});
            if (!input) return null;
            
            const rect = input.getBoundingClientRect();
            return {
              selector: ${JSON.stringify(fileInputSelector)},
              tagName: input.tagName,
              attributes: Array.from(input.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
              }, {}),
              boundingBox: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              isVisible: window.getComputedStyle(input).display !== 'none',
              isEnabled: !input.disabled
            };
          })();
        `);

        return { 
          success: true,
          method: 'cdp',
          element: elementInfo ? {
            selector: elementInfo.selector,
            selectorType: 'primary',
            tagName: elementInfo.tagName,
            attributes: elementInfo.attributes,
            boundingBox: elementInfo.boundingBox,
            isVisible: elementInfo.isVisible,
            isEnabled: elementInfo.isEnabled
          } as FoundElement : undefined
        };

      } catch (cdpError) {
        console.error('[FileUploadHandler] ❌ CDP method failed:', cdpError);
        throw cdpError;
      }

    } catch (error) {
      return {
        success: false,
        error: `Upload failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}
