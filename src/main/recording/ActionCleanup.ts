import { RecordedAction } from '@/shared/types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ActionCleanup - Removes unnecessary actions and fixes all dependencies
 * 
 * Handles the complex task of removing flagged actions while maintaining
 * data consistency across all related structures and files.
 */
export class ActionCleanup {
  
  /**
   * Remove unnecessary actions and fix all dependencies
   */
  public async cleanupActions(
    actions: RecordedAction[], 
    snapshotDirectory?: string
  ): Promise<{
    cleanedActions: RecordedAction[];
    removedCount: number;
    cleanedScreenshots: string[];
  }> {
    console.log('🧹 Starting action cleanup process...');
    
    const originalCount = actions.length;
    const unnecessaryActions = actions.filter(a => a.metadata?.unnecessary);
    
    if (unnecessaryActions.length === 0) {
      console.log('✨ No unnecessary actions found - recording is already clean');
      return {
        cleanedActions: actions,
        removedCount: 0,
        cleanedScreenshots: []
      };
    }
    
    console.log(`🗑️ Found ${unnecessaryActions.length} unnecessary actions to remove:`);
    unnecessaryActions.forEach((action, i) => {
      console.log(`  ${i + 1}. ${action.type} - ${action.metadata?.unnecessaryReason} - ${action.metadata?.unnecessaryDetails}`);
    });
    
    // Step 1: Remove unnecessary actions
    const cleanedActions = actions.filter(a => !a.metadata?.unnecessary);
    
    // Step 2: Clean up screenshots
    const cleanedScreenshots = await this.cleanupScreenshots(unnecessaryActions, snapshotDirectory);
    
    // Step 3: Fix action indices and references
    this.fixActionIndicesAndReferences(cleanedActions);
    
    // Step 4: Update VLM analysis indices
    this.updateVLMAnalysisIndices(cleanedActions);
    
    const removedCount = originalCount - cleanedActions.length;
    console.log(`✅ Cleanup complete: Removed ${removedCount} actions, ${cleanedScreenshots.length} screenshots`);
    
    return {
      cleanedActions,
      removedCount,
      cleanedScreenshots
    };
  }
  
  /**
   * Clean up screenshot files for removed actions
   */
  private async cleanupScreenshots(
    removedActions: RecordedAction[], 
    snapshotDirectory?: string
  ): Promise<string[]> {
    const cleanedScreenshots: string[] = [];
    
    if (!snapshotDirectory) {
      console.log('⚠️ No snapshot directory provided - skipping screenshot cleanup');
      return cleanedScreenshots;
    }
    
    for (const action of removedActions) {
      if (action.snapshotPath) {
        try {
          const fullPath = path.isAbsolute(action.snapshotPath) 
            ? action.snapshotPath 
            : path.join(snapshotDirectory, action.snapshotPath);
            
          if (fs.existsSync(fullPath)) {
            await fs.promises.unlink(fullPath);
            cleanedScreenshots.push(fullPath);
            console.log(`🗑️ Deleted screenshot: ${path.basename(fullPath)}`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to delete screenshot ${action.snapshotPath}:`, error);
        }
      }
    }
    
    return cleanedScreenshots;
  }
  
  /**
   * Fix action indices and previousAction/nextAction references
   */
  private fixActionIndicesAndReferences(actions: RecordedAction[]): void {
    console.log('🔗 Fixing action references and indices...');
    
    // Update actionIndex in variables and VLM data
    actions.forEach((action, newIndex) => {
      // Fix VLM analysis action indices
      if (action.metadata?.vlmEnhancements) {
        const vlm = action.metadata.vlmEnhancements;
        if (vlm.smartVariable) {
          vlm.smartVariable.actionIndex = newIndex;
          // Update actionId to reflect new index
          vlm.smartVariable.actionId = `${action.type}-${action.timestamp}`;
        }
      }
    });
    
    // Rebuild previousAction/nextAction references
    for (let i = 0; i < actions.length; i++) {
      const current = actions[i];
      const previous = i > 0 ? actions[i - 1] : null;
      const next = i < actions.length - 1 ? actions[i + 1] : null;
      
      // Update previous action reference
      if (previous) {
        current.previousAction = {
          id: i - 1,
          type: previous.type,
          timestamp: previous.timestamp,
          target: previous.target?.selector || 'unknown',
          value: previous.value,
          summary: this.generateActionSummary(previous, i - 1)
        };
      } else {
        delete current.previousAction;
      }
      
      // Update next action reference
      if (next) {
        current.nextAction = {
          id: i + 1,
          type: next.type,
          timestamp: next.timestamp,
          target: next.target?.selector || 'unknown',
          value: next.value,
          summary: this.generateActionSummary(next, i + 1)
        };
      } else {
        delete current.nextAction;
      }
    }
    
    console.log(`✅ Fixed references for ${actions.length} remaining actions`);
  }
  
  /**
   * Update VLM analysis indices after cleanup
   */
  private updateVLMAnalysisIndices(actions: RecordedAction[]): void {
    actions.forEach((action, newIndex) => {
      if (action.metadata?.vlmEnhancements?.smartVariable) {
        // Update variable ID to reflect new index
        const variable = action.metadata.vlmEnhancements.smartVariable;
        const variableName = variable.semanticName || variable.actualName || 'variable';
        const cleanName = this.sanitizeVariableName(variableName);
        
        // Update with new index
        if (action.metadata.vlmAnalysisId) {
          action.metadata.vlmAnalysisId = `vlm-var-${newIndex}`;
        }
      }
    });
  }
  
  /**
   * Generate human-readable action summary
   */
  private generateActionSummary(action: RecordedAction, index: number): string {
    switch (action.type) {
      case 'input':
        const value = action.value?.toString() || '';
        const truncated = value.length > 20 ? value.substring(0, 20) + '...' : value;
        return `Input "${truncated}" in ${action.target?.selector || 'field'}`;
        
      case 'click':
        const text = action.target?.text || action.target?.selector || 'element';
        return `Click on ${text}`;
        
      case 'select':
        return `Select "${action.value}" from ${action.target?.selector || 'dropdown'}`;
        
      case 'navigate':
        return `Navigate to ${action.url}`;
        
      case 'keypress':
        return `Press ${action.metadata?.key || action.value}`;
        
      default:
        return `${action.type} on ${action.target?.selector || 'element'}`;
    }
  }
  
  /**
   * Sanitize variable name for use in IDs
   */
  private sanitizeVariableName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }
  
  /**
   * Validate cleanup results
   */
  public validateCleanup(originalActions: RecordedAction[], cleanedActions: RecordedAction[]): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    // Check that no necessary actions were removed
    const necessaryActions = originalActions.filter(a => !a.metadata?.unnecessary);
    if (cleanedActions.length !== necessaryActions.length) {
      issues.push(`Expected ${necessaryActions.length} actions, got ${cleanedActions.length}`);
    }
    
    // Check action reference integrity
    for (let i = 0; i < cleanedActions.length; i++) {
      const action = cleanedActions[i];
      
      // Check previous reference
      if (action.previousAction && action.previousAction.id !== i - 1) {
        issues.push(`Action ${i} has incorrect previous reference: ${action.previousAction.id}`);
      }
      
      // Check next reference
      if (action.nextAction && action.nextAction.id !== i + 1) {
        issues.push(`Action ${i} has incorrect next reference: ${action.nextAction.id}`);
      }
    }
    
    // Check VLM data consistency
    cleanedActions.forEach((action, index) => {
      if (action.metadata?.vlmEnhancements?.smartVariable) {
        const variable = action.metadata.vlmEnhancements.smartVariable;
        if (variable.actionIndex !== undefined && variable.actionIndex !== index) {
          issues.push(`Action ${index} VLM variable has incorrect actionIndex: ${variable.actionIndex}`);
        }
      }
    });
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
}