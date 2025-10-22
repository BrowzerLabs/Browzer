/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebContentsView } from "electron";
import { RecordedAction } from '@/shared/types';
import { SnapshotManager } from './SnapshotManager';
import { VLMService, VLMAnalysisRequest, VLMAnalysisResponse } from '../services/VLMService';

export class ActionRecorder {
  private view: WebContentsView | null = null;
  private isRecording = false;
  private actions: RecordedAction[] = [];
  private debugger: Electron.Debugger | null = null;
  public onActionCallback?: (action: RecordedAction) => void;
  private snapshotManager: SnapshotManager;
  private vlmService: VLMService;

  // VLM enhancement data
  private vlmAnalysisResults: Map<number, VLMAnalysisResponse> = new Map();
  private recordingScreenshots: Array<{ base64: string; timestamp: number; dimensions: any }> = [];

  // Tab context for current recording
  private currentTabId: string | null = null;
  private currentTabUrl: string | null = null;
  private currentTabTitle: string | null = null;
  private currentWebContentsId: number | null = null;
  
  // Store the script identifier so we can remove it later
  private injectedScriptId: string | null = null;

  private recentNetworkRequests: Array<{
    url: string;
    method: string;
    type: string;
    status?: number;
    timestamp: number;
    completed: boolean;
  }> = [];

  private pendingActions = new Map<string, {
    action: RecordedAction;
    timestamp: number;
    verificationDeadline: number;
  }>();


  constructor(view?: WebContentsView) {
    if (view) {
      this.view = view;
      this.debugger = view.webContents.debugger;
    }
    this.snapshotManager = new SnapshotManager();
    this.vlmService = VLMService.getInstance();
    
    // Log VLM service status
    const vlmStatus = this.vlmService.getStatus();
    console.log('🧠 VLM Service Status:', vlmStatus);
  }

  /**
   * Set callback for real-time action notifications
   */
  public setActionCallback(callback: (action: RecordedAction) => void): void {
    this.onActionCallback = callback;
  }

  /**
   * Set the current tab context for recorded actions
   */
  public setTabContext(tabId: string, tabUrl: string, tabTitle: string, webContentsId: number): void {
    this.currentTabId = tabId;
    this.currentTabUrl = tabUrl;
    this.currentTabTitle = tabTitle;
    this.currentWebContentsId = webContentsId;
  }

  /**
   * Switch to a different WebContentsView during active recording
   * This is the key method for multi-tab recording support
   */
  public async switchWebContents(
    newView: WebContentsView,
    tabId: string,
    tabUrl: string,
    tabTitle: string
  ): Promise<boolean> {
    if (!this.isRecording) {
      console.warn('Cannot switch WebContents: not recording');
      return false;
    }

    try {
      console.log(`🔄 Switching recording to tab: ${tabId} (${tabTitle})`);

      // Detach from current debugger if attached
      if (this.debugger && this.debugger.isAttached()) {
        try {
          this.debugger.detach();
        } catch (error) {
          console.warn('Error detaching previous debugger:', error);
        }
      }

      // Update to new view
      this.view = newView;
      this.debugger = newView.webContents.debugger;
      this.currentTabId = tabId;
      this.currentTabUrl = tabUrl;
      this.currentTabTitle = tabTitle;
      this.currentWebContentsId = newView.webContents.id;

      // Attach debugger to new view
      this.debugger.attach('1.3');
      console.log('✅ CDP Debugger attached to new tab');

      // Re-enable CDP domains
      await this.enableCDPDomains();

      // Re-setup event listeners
      this.setupEventListeners();

      console.log(`✅ Recording switched to tab: ${tabId}`);
      return true;

    } catch (error) {
      console.error('Failed to switch WebContents:', error);
      return false;
    }
  }

  /**
   * Start recording user actions
   */
  public async startRecording(
    tabId?: string,
    tabUrl?: string,
    tabTitle?: string,
    webContentsId?: number,
    recordingId?: string
  ): Promise<void> {
    if (this.isRecording) {
      console.warn('Recording already in progress');
      return;
    }

    if (!this.view) {
      throw new Error('No WebContentsView set for recording');
    }

    try {
      this.debugger = this.view.webContents.debugger;
      
      // Attach debugger if not already attached (could be attached by PasswordAutomation)
      if (!this.debugger.isAttached()) {
        this.debugger.attach('1.3');
        console.log('✅ CDP Debugger attached');
      } else {
        console.log('✅ CDP Debugger already attached, reusing existing connection');
      }

      this.actions = [];
      this.isRecording = true;

      // Reset VLM data for new recording
      this.vlmAnalysisResults.clear();
      this.recordingScreenshots = [];

      // Set initial tab context
      if (tabId && tabUrl && tabTitle) {
        this.currentTabId = tabId;
        this.currentTabUrl = tabUrl;
        this.currentTabTitle = tabTitle;
        this.currentWebContentsId = webContentsId || this.view.webContents.id;
      }

      // Initialize snapshot manager for this recording
      if (recordingId) {
        await this.snapshotManager.initializeRecording(recordingId);
      }

      await this.enableCDPDomains();
      this.setupEventListeners();

      console.log('🎬 Recording started');
      console.log('📊 Enhanced metadata capture enabled:');
      console.log('  ☑️ Checkbox/Radio: All options + group context');
      console.log('  📋 Form Context: Field relationships + validation');
      console.log('  🔄 Step Tracking: Previous/next field sequence');
      console.log('  📊 Metadata analysis will be shown when recording stops');
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.isRecording = false;
      throw error;
    }
  }

  /**
   * Stop recording
   */
  public async stopRecording(): Promise<RecordedAction[]> {
    if (!this.isRecording) {
      console.warn('No recording in progress');
      return [];
    }

    try {
      // Disable browser-side monitoring script BEFORE detaching debugger
      if (this.debugger && this.debugger.isAttached() && this.currentWebContentsId) {
        try {
          // Disable the current script instance
          await this.debugger.sendCommand('Runtime.evaluate', {
            expression: 'window.__browzerRecorderInstalled = false; window.browzerRecordingActive = false;'
          });
          console.log('🔇 Browser-side monitoring script disabled');
          
          // Remove the script from future document loads
          if (this.injectedScriptId) {
            await this.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument', {
              identifier: this.injectedScriptId
            });
            console.log('🗑️ Injected script removed from new documents');
            this.injectedScriptId = null;
          }
        } catch (error) {
          console.error('Error disabling monitoring script:', error);
        }
      }

      if (this.debugger && this.debugger.isAttached()) {
        this.debugger.detach();
      }

      this.isRecording = false;
      this.actions.sort((a, b) => a.timestamp - b.timestamp);
      
      // Finalize snapshots
      await this.snapshotManager.finalizeRecording();
      
      console.log(`⏹️ Recording stopped. Captured ${this.actions.length} actions`);
      
      // Add action relations (previous/next) before analysis
      this.addActionRelations();
      
      // Run VLM analysis on recorded actions (Phase 1)
      await this.runVLMAnalysis();
      
      // Analyze and print metadata summary
      this.printMetadataAnalysis();
      
      // Reset tab context
      this.currentTabId = null;
      this.currentTabUrl = null;
      this.currentTabTitle = null;
      this.currentWebContentsId = null;
      this.injectedScriptId = null;
      
      return [...this.actions];
    } catch (error) {
      console.error('Error stopping recording:', error);
      return [...this.actions];
    }
  }

  /**
   * Check if currently recording
   */
  public isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get all recorded actions
   */
  public getActions(): RecordedAction[] {
    return [...this.actions];
  }

  /**
   * Run VLM analysis on recorded actions (Phase 1: Variable Detection + Error Detection)
   */
  private async runVLMAnalysis(): Promise<void> {
    if (!this.vlmService.isAvailable()) {
      console.log('🧠 VLM Analysis skipped - service not available');
      return;
    }

    console.log('🧠 Starting VLM analysis for Phase 1 enhancements...');
    
    try {
      // Generate recording ID for batch analysis
      const recordingId = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Get context information
      const context = {
        url: this.currentTabUrl || 'unknown',
        pageTitle: this.currentTabTitle || 'unknown'
      };

      // Run batch analysis for all actions
      const analysisResults = await this.vlmService.batchAnalyzeRecording(
        recordingId,
        this.actions,
        this.recordingScreenshots,
        context
      );

      // Store results for each action
      analysisResults.forEach((result, index) => {
        if (result) {
          this.vlmAnalysisResults.set(index, result);
          
          // Apply VLM enhancements to action metadata
          this.applyVLMEnhancements(index, result);
        }
      });

      console.log(`✅ VLM Analysis completed: ${analysisResults.length}/${this.actions.length} actions enhanced`);

    } catch (error) {
      console.error('❌ VLM Analysis failed:', error);
    }
  }

  /**
   * Check if action is eligible for smart variable enhancement
   */
  private isVariableEligibleAction(action: RecordedAction): boolean {
    // Only input-related actions can become variables
    const variableTypes = ['input', 'select', 'checkbox', 'radio'];
    return variableTypes.includes(action.type) && 
           action.target?.selector !== undefined &&
           action.value !== undefined;
  }

  /**
   * Apply VLM analysis results to action metadata
   */
  private applyVLMEnhancements(actionIndex: number, analysis: VLMAnalysisResponse): void {
    const action = this.actions[actionIndex];
    if (!action || !action.metadata) return;

    // Initialize VLM metadata section
    action.metadata.vlmEnhancements = {
      analysisId: analysis.analysisId,
      timestamp: analysis.timestamp,
      confidence: analysis.confidence,
      processingTime: analysis.processingTimeMs,
      modelUsed: analysis.modelUsed
    };

    // Phase 1: Apply Smart Variable Detection (only for variable-eligible actions)
    if (this.isVariableEligibleAction(action) && analysis.variableDetection) {
      // Ensure VLM enhancement is tied to the ACTUAL action element
      const actualSelector = action.target?.selector;
      const actualName = action.target?.name || action.target?.id || 'unnamed-field';
      
      // Find VLM variable that matches our actual element (or use the first one as fallback)
      const matchingVariable = analysis.variableDetection.variables.find(v => 
        v.fieldSelector === actualSelector
      ) || analysis.variableDetection.variables[0]; // Fallback to first variable

      if (matchingVariable) {
        action.metadata.vlmEnhancements.smartVariable = {
          // Use ACTUAL element data, enhanced with VLM insights
          actualSelector: actualSelector,
          actualName: actualName,
          actualType: action.target?.type || action.type,
          
          // VLM enhancements
          semanticName: matchingVariable.semanticName,
          purpose: matchingVariable.purpose,
          businessContext: matchingVariable.businessContext,
          substitutionHints: matchingVariable.substitutionHints,
          dataClassification: matchingVariable.dataClassification,
          requiredFormat: matchingVariable.requiredFormat,
          confidence: matchingVariable.confidence,
          
          // Link VLM suggestion to actual element
          vlmFieldSelector: matchingVariable.fieldSelector,
          selectorMatch: matchingVariable.fieldSelector === actualSelector
        };

        console.log(`🎯 Enhanced variable for action ${actionIndex}: ${actualName} → ${matchingVariable.semanticName}`);
        
        if (matchingVariable.fieldSelector !== actualSelector) {
          console.warn(`⚠️ VLM selector mismatch - Actual: ${actualSelector}, VLM: ${matchingVariable.fieldSelector}`);
        }
      }
    }

    // Phase 1: Apply Error Detection
    if (analysis.errorDetection) {
      action.metadata.vlmEnhancements.errorAnalysis = {
        errorDetected: analysis.errorDetection.errorDetected,
        errorType: analysis.errorDetection.errorType,
        visualCues: analysis.errorDetection.visualCues,
        errorMessage: analysis.errorDetection.errorMessage,
        errorCause: analysis.errorDetection.errorCause,
        recoverySuggestions: analysis.errorDetection.recoverySuggestions,
        alternativeActions: analysis.errorDetection.alternativeActions,
        errorSeverity: analysis.errorDetection.errorSeverity,
        confidence: analysis.errorDetection.confidence
      };

      if (analysis.errorDetection.errorDetected) {
        console.log(`🚨 Error detected in action ${actionIndex}: ${analysis.errorDetection.errorType}`);
      }
    }
  }

  /**
   * Capture screenshot for VLM analysis during recording
   */
  private async captureScreenshotForVLM(): Promise<{ base64: string; timestamp: number; dimensions: any } | null> {
    if (!this.view || !this.vlmService.isAvailable()) return null;

    try {
      const image = await this.view.webContents.capturePage();
      const base64 = image.toDataURL().replace(/^data:image\/png;base64,/, '');
      
      const screenshot = {
        base64,
        timestamp: Date.now(),
        dimensions: {
          width: image.getSize().width,
          height: image.getSize().height
        }
      };

      // Store screenshot for batch analysis
      this.recordingScreenshots.push(screenshot);
      
      return screenshot;
      
    } catch (error) {
      console.error('Failed to capture screenshot for VLM:', error);
      return null;
    }
  }

  /**
   * Add previous/next action relations to provide better workflow context
   */
  private addActionRelations(): void {
    console.log('🔗 Adding action relations...');
    
    for (let i = 0; i < this.actions.length; i++) {
      const currentAction = this.actions[i];
      
      // Add reference to previous action
      if (i > 0) {
        const previousAction = this.actions[i - 1];
        currentAction.previousAction = {
          id: i - 1, // Use array index as ID
          type: previousAction.type,
          timestamp: previousAction.timestamp,
          target: previousAction.target?.selector || 'unknown',
          value: previousAction.value,
          summary: this.getActionSummary(previousAction)
        };
      }
      
      // Add reference to next action
      if (i < this.actions.length - 1) {
        const nextAction = this.actions[i + 1];
        currentAction.nextAction = {
          id: i + 1, // Use array index as ID
          type: nextAction.type,
          timestamp: nextAction.timestamp,
          target: nextAction.target?.selector || 'unknown',
          value: nextAction.value,
          summary: this.getActionSummary(nextAction)
        };
      }
    }
    
    console.log(`✅ Added relations for ${this.actions.length} actions`);
  }

  /**
   * Generate a human-readable summary for an action
   */
  private getActionSummary(action: RecordedAction): string {
    switch (action.type) {
      case 'input':
        const fieldName = action.target?.name || action.target?.id || 'field';
        const inputType = action.target?.type || 'text';
        return `Enter ${inputType === 'password' ? 'password' : 'text'} in ${fieldName}`;
      
      case 'click':
        const clickTarget = action.target?.selector || 'element';
        return `Click on ${clickTarget}`;
      
      case 'select':
        const selectValue = action.value || 'option';
        return `Select "${selectValue}"`;
      
      case 'checkbox':
        const checked = action.value ? 'checked' : 'unchecked';
        const checkboxName = action.target?.name || action.target?.id || 'checkbox';
        return `Set ${checkboxName} to ${checked}`;
      
      case 'radio':
        const radioValue = action.value || 'option';
        const radioName = action.target?.name || 'radio group';
        return `Select "${radioValue}" in ${radioName}`;
      
      case 'submit':
        return 'Submit form';
      
      case 'navigate':
        return 'Navigate to new page';
      
      case 'keypress':
        const key = action.value || 'key';
        return `Press ${key}`;
      
      default:
        return `Perform ${action.type} action`;
    }
  }

  /**
   * Print VLM enhancements summary
   */
  private printVLMEnhancementsSummary(): void {
    const enhancedActions = this.actions.filter(action => action.metadata?.vlmEnhancements);
    
    if (enhancedActions.length === 0) {
      console.log(`\n🧠 VLM ENHANCEMENTS: None (feature disabled or not available)`);
      return;
    }

    console.log(`\n🧠 VLM ENHANCEMENTS SUMMARY:`);
    console.log(`Enhanced Actions: ${enhancedActions.length}/${this.actions.length}`);
    
    // Count smart variables found
    let totalSmartVariables = 0;
    let errorDetections = 0;
    let selectorMatches = 0;
    
    enhancedActions.forEach(action => {
      const vlm = action.metadata?.vlmEnhancements;
      if (vlm?.smartVariable) {
        totalSmartVariables++;
        if (vlm.smartVariable.selectorMatch) {
          selectorMatches++;
        }
      }
      if (vlm?.errorAnalysis?.errorDetected) {
        errorDetections++;
      }
    });

    console.log(`Smart Variables Detected: ${totalSmartVariables}`);
    console.log(`Selector Accuracy: ${selectorMatches}/${totalSmartVariables} exact matches`);
    console.log(`Error States Detected: ${errorDetections}`);
    
    if (totalSmartVariables > 0) {
      console.log(`\n📝 SMART VARIABLES FOUND:`);
      enhancedActions.forEach((action) => {
        const vlm = action.metadata?.vlmEnhancements;
        if (vlm?.smartVariable) {
          const variable = vlm.smartVariable;
          console.log(`  • ${variable.semanticName} (${variable.purpose})`);
          console.log(`    Element: ${variable.actualSelector}`);
          console.log(`    Original: ${variable.actualName} → Enhanced: ${variable.semanticName}`);
          console.log(`    Suggestions: ${variable.substitutionHints.join(', ')}`);
          console.log(`    Match Quality: ${variable.selectorMatch ? '✅ Exact' : '⚠️ Approximated'}`);
        }
      });
    }

    if (errorDetections > 0) {
      console.log(`\n🚨 ERROR STATES DETECTED:`);
      enhancedActions.forEach(action => {
        const vlm = action.metadata?.vlmEnhancements;
        if (vlm?.errorAnalysis?.errorDetected) {
          console.log(`  • ${vlm.errorAnalysis.errorType}: ${vlm.errorAnalysis.errorMessage}`);
          console.log(`    Recovery: ${vlm.errorAnalysis.recoverySuggestions.join(', ')}`);
        }
      });
    }
  }

  /**
   * Print comprehensive metadata analysis of recorded actions
   */
  private printMetadataAnalysis(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 METADATA ANALYSIS REPORT');
    console.log('='.repeat(80));
    
    if (this.actions.length === 0) {
      console.log('No actions recorded to analyze.');
      return;
    }

    // Group actions by type
    const actionsByType: { [key: string]: RecordedAction[] } = {};
    const formContexts: Set<string> = new Set();
    const validationRules: any[] = [];
    let checkboxGroups: any[] = [];
    let radioGroups: any[] = [];
    let selectOptions: any[] = [];

    this.actions.forEach(action => {
      const type = action.type;
      if (!actionsByType[type]) {
        actionsByType[type] = [];
      }
      actionsByType[type].push(action);

      // Collect form contexts
      if (action.metadata?.formContext?.hasForm) {
        const formId = action.metadata.formContext.formId || 'unnamed-form';
        formContexts.add(`${formId} (${action.metadata.formContext.fieldCount} fields)`);
      }

      // Collect validation rules
      if (action.metadata?.validation) {
        const validation = action.metadata.validation;
        if (validation.required || validation.pattern || validation.minLength > 0) {
          validationRules.push({
            field: action.target?.name || action.target?.id || 'unnamed',
            type: action.type,
            rules: validation
          });
        }
      }

      // Collect enhanced checkbox data
      if (action.type === 'checkbox' && action.metadata?.allOptions) {
        checkboxGroups.push({
          groupName: action.metadata.groupName || 'unnamed-group',
          totalOptions: action.metadata.totalOptions,
          selectedCount: action.metadata.selectedCount,
          options: action.metadata.allOptions
        });
      }

      // Collect enhanced radio data  
      if (action.type === 'radio' && action.metadata?.allOptions) {
        radioGroups.push({
          groupName: action.metadata.groupName || 'unnamed-group',
          totalOptions: action.metadata.totalOptions,
          selectedOption: action.metadata.selectedOption,
          allOptions: action.metadata.allOptions
        });
      }

      // Collect enhanced select data
      if (action.type === 'select' && action.metadata?.allOptions) {
        selectOptions.push({
          field: action.target?.name || action.target?.id || 'unnamed',
          totalOptions: action.metadata.optionCount,
          isMultiple: action.metadata.isMultiple,
          allOptions: action.metadata.allOptions
        });
      }
    });

    // Print summary
    console.log(`\n📈 SUMMARY:`);
    console.log(`Total Actions: ${this.actions.length}`);
    console.log(`Action Types: ${Object.keys(actionsByType).join(', ')}`);
    console.log(`Forms Detected: ${formContexts.size}`);
    
    // Print workflow sequence
    console.log(`\n🔄 WORKFLOW SEQUENCE:`);
    this.actions.forEach((action, index) => {
      const summary = this.getActionSummary(action);
      const connector = index < this.actions.length - 1 ? ' → ' : '';
      console.log(`  [${index + 1}] ${summary}${connector}`);
    });

    // Print action breakdown
    console.log(`\n🎯 ACTION BREAKDOWN:`);
    Object.entries(actionsByType).forEach(([type, actions]) => {
      console.log(`  ${type}: ${actions.length} actions`);
    });

    // Print form contexts
    if (formContexts.size > 0) {
      console.log(`\n📋 FORM CONTEXTS:`);
      formContexts.forEach(context => {
        console.log(`  • ${context}`);
      });
    }

    // Print validation rules
    if (validationRules.length > 0) {
      console.log(`\n✅ VALIDATION RULES DETECTED:`);
      validationRules.forEach(rule => {
        const validations = [];
        if (rule.rules.required) validations.push('required');
        if (rule.rules.pattern) validations.push(`pattern: ${rule.rules.pattern}`);
        if (rule.rules.minLength > 0) validations.push(`minLength: ${rule.rules.minLength}`);
        if (rule.rules.maxLength > 0) validations.push(`maxLength: ${rule.rules.maxLength}`);
        console.log(`  • ${rule.field} (${rule.type}): ${validations.join(', ')}`);
      });
    }

    // Print enhanced checkbox metadata
    if (checkboxGroups.length > 0) {
      console.log(`\n☑️ CHECKBOX GROUPS:`);
      checkboxGroups.forEach(group => {
        console.log(`  • ${group.groupName}: ${group.selectedCount}/${group.totalOptions} selected`);
        group.options.forEach((option: any) => {
          console.log(`    - ${option.label}: ${option.checked ? '✓' : '○'} (${option.value})`);
        });
      });
    }

    // Print enhanced radio metadata
    if (radioGroups.length > 0) {
      console.log(`\n🔘 RADIO GROUPS:`);
      radioGroups.forEach(group => {
        console.log(`  • ${group.groupName}: ${group.totalOptions} options`);
        group.allOptions.forEach((option: any) => {
          console.log(`    - ${option.label}: ${option.checked ? '●' : '○'} (${option.value})`);
        });
      });
    }

    // Print enhanced select metadata
    if (selectOptions.length > 0) {
      console.log(`\n📋 SELECT FIELDS:`);
      selectOptions.forEach(select => {
        console.log(`  • ${select.field}: ${select.totalOptions} options${select.isMultiple ? ' (multiple)' : ''}`);
        select.allOptions.forEach((option: any) => {
          console.log(`    - ${option.text}: ${option.selected ? '✓' : '○'} (${option.value})`);
        });
      });
    }

    // Print VLM enhancements summary
    this.printVLMEnhancementsSummary();

    // Print detailed actions with metadata
    console.log(`\n🔍 DETAILED ACTION LOG:`);
    this.actions.forEach((action, index) => {
      console.log(`\n[${index + 1}] ${action.type.toUpperCase()} at ${new Date(action.timestamp).toLocaleTimeString()}`);
      console.log(`  Target: ${action.target?.selector || 'unknown'}`);
      console.log(`  Value: ${action.value}`);
      
      // Show action relations
      if (action.previousAction || action.nextAction) {
        console.log(`  🔗 Action Relations:`);
        if (action.previousAction) {
          console.log(`    ← Previous: [${action.previousAction.id + 1}] ${action.previousAction.summary}`);
        }
        if (action.nextAction) {
          console.log(`    → Next: [${action.nextAction.id + 1}] ${action.nextAction.summary}`);
        }
      }

      // Show VLM enhancements
      if (action.metadata?.vlmEnhancements) {
        console.log(`  🧠 VLM Enhancements:`);
        const vlm = action.metadata.vlmEnhancements;
        console.log(`    Confidence: ${vlm.confidence}, Model: ${vlm.modelUsed}`);
        
        if (vlm.smartVariable) {
          console.log(`    📝 Smart Variable Enhancement:`);
          const variable = vlm.smartVariable;
          console.log(`      • ${variable.actualName} → ${variable.semanticName}`);
          console.log(`        Selector: ${variable.actualSelector}`);
          console.log(`        Purpose: ${variable.purpose}`);
          console.log(`        Context: ${variable.businessContext}`);
          console.log(`        Hints: ${variable.substitutionHints.join(', ')}`);
          console.log(`        Confidence: ${variable.confidence}`);
          
          if (!variable.selectorMatch) {
            console.log(`        ⚠️ Selector Mismatch: VLM suggested ${variable.vlmFieldSelector}`);
          }
        }

        if (vlm.errorAnalysis && vlm.errorAnalysis.errorDetected) {
          console.log(`    🚨 Error Analysis:`);
          console.log(`      Type: ${vlm.errorAnalysis.errorType}`);
          console.log(`      Message: ${vlm.errorAnalysis.errorMessage}`);
          console.log(`      Recovery: ${vlm.errorAnalysis.recoverySuggestions.join(', ')}`);
        }
      }
      
      if (action.metadata) {
        // Filter out VLM enhancements from main metadata display to avoid duplication
        const filteredMetadata = { ...action.metadata };
        delete filteredMetadata.vlmEnhancements;
        if (Object.keys(filteredMetadata).length > 0) {
          console.log(`  📋 Standard Metadata:`, JSON.stringify(filteredMetadata, null, 2));
        }
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ METADATA ANALYSIS COMPLETE');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Add an action directly to the recorded actions
   * Used for synthetic actions like tab-switch
   */
  public addAction(action: RecordedAction): void {
    this.actions.push(action);
  }

  /**
   * Get snapshot statistics
   */
  public async getSnapshotStats() {
    return await this.snapshotManager.getSnapshotStats();
  }

  /**
   * Get snapshots directory for a recording
   */
  public getSnapshotsDirectory(recordingId: string): string {
    return this.snapshotManager.getSnapshotsDirectory(recordingId);
  }

  /**
   * Clear recorded actions
   */
  public async clearActions(): Promise<void> {
    this.actions = [];
    this.pendingActions.clear();
    
    // Disable browser-side monitoring script if still attached
    if (this.currentWebContentsId && this.debugger && this.debugger.isAttached()) {
      try {
        await this.debugger.sendCommand('Runtime.evaluate', {
          expression: 'window.__browzerRecorderInstalled = false;'
        });
        console.log('🔇 Browser-side monitoring script disabled');
      } catch (error) {
        console.error('Error disabling monitoring script:', error);
      }
    }
    
    console.log('🧹 Actions cleared');
  }

  /**
   * Discard current recording session
   */
  public discardRecording(): void {
    if (this.isRecording) {
      try {
        // First, inject a script to stop the browser-side recording
        if (this.debugger && this.debugger.isAttached()) {
          this.debugger.sendCommand('Runtime.evaluate', {
            expression: `
              if (window.__browzerRecorderInstalled) {
                window.__browzerRecorderInstalled = false;
                console.log('🗑️ Browser-side recording disabled');
              }
            `,
            includeCommandLineAPI: false
          }).catch(() => {
            // Ignore errors if page is navigating or closed
          });
          
          // Remove the script from future document loads
          if (this.injectedScriptId) {
            this.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument', {
              identifier: this.injectedScriptId
            }).catch(() => {
              // Ignore errors if page is navigating or closed
            });
            this.injectedScriptId = null;
          }
          
          this.debugger.detach();
        }
      } catch (error) {
        console.warn('Error detaching debugger during discard:', error);
      }
    }

    this.isRecording = false;
    this.actions = [];
    this.pendingActions.clear();
    
    // Reset tab context
    this.currentTabId = null;
    this.currentTabUrl = null;
    this.currentTabTitle = null;
    this.currentWebContentsId = null;
    this.injectedScriptId = null;
    
    console.log('🗑️ Recording discarded');
  }

  /**
   * Get current tab context
   */
  public getCurrentTabContext(): { tabId: string | null; tabUrl: string | null; tabTitle: string | null; webContentsId: number | null } {
    return {
      tabId: this.currentTabId,
      tabUrl: this.currentTabUrl,
      tabTitle: this.currentTabTitle,
      webContentsId: this.currentWebContentsId
    };
  }

  /**
   * Set the view for recording (used when initializing or switching)
   */
  public setView(view: WebContentsView): void {
    this.view = view;
    this.debugger = view.webContents.debugger;
  }

  /**
   * Enable required CDP domains
   */
  private async enableCDPDomains(): Promise<void> {
    if (!this.debugger) {
      throw new Error('Debugger not initialized');
    }

    try {
      await this.debugger.sendCommand('DOM.enable');
      console.log('✓ DOM domain enabled');
      await this.debugger.sendCommand('Page.enable');
      console.log('✓ Page domain enabled');
      await this.debugger.sendCommand('Runtime.enable');
      console.log('✓ Runtime domain enabled');
      await this.debugger.sendCommand('Network.enable');
      console.log('✓ Network domain enabled');
      await this.debugger.sendCommand('Log.enable');
      console.log('✓ Log domain enabled');
      await this.debugger.sendCommand('DOM.getDocument', { depth: -1 });
      console.log('✓ DOM document loaded');

      await this.debugger.sendCommand('Page.setLifecycleEventsEnabled', { 
        enabled: true 
      });
      await this.injectEventTracker();
      console.log('✓ Event tracker injected');

    } catch (error) {
      console.error('Error enabling CDP domains:', error);
      throw error;
    }
  }

  /**
   * Inject event tracking script into the page
   */
  private async injectEventTracker(): Promise<void> {
    if (!this.debugger) return;

    const script = this.generateMonitoringScript();
    
    // Add script to evaluate on new documents and store the identifier
    const result = await this.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: script,
      runImmediately: true
    });
    this.injectedScriptId = result.identifier;
    
    await this.debugger.sendCommand('Runtime.evaluate', {
      expression: script,
      includeCommandLineAPI: false
    });
    console.log('✅ Event tracker injected (CSP-proof)');
  }

  private generateMonitoringScript(): string {
    return `
      (function() {
        if (window.__browzerRecorderInstalled) return;
        window.__browzerRecorderInstalled = true;
        window.browzerRecordingActive = true;
        
        // Helper function to check if recording is still active
        function shouldRecordAction() {
          return window.browzerRecordingActive === true;
        }
        
        function getFormContext(element) {
          const parentForm = element.closest('form');
          if (!parentForm) {
            return {
              hasForm: false,
              fieldCount: 0
            };
          }
          
          // Get form metadata
          const formInputs = parentForm.querySelectorAll('input, select, textarea');
          const formAction = parentForm.action || '';
          const formMethod = parentForm.method || 'get';
          
          // Find field position and neighboring fields
          const formElements = Array.from(formInputs);
          const currentIndex = formElements.indexOf(element);
          
          const previousField = currentIndex > 0 ? formElements[currentIndex - 1] : null;
          const nextField = currentIndex < formElements.length - 1 ? formElements[currentIndex + 1] : null;
          
          // Get field labels and context
          const getFieldInfo = function(field) {
            if (!field) return null;
            return {
              name: field.name || '',
              type: field.type || field.tagName.toLowerCase(),
              id: field.id || '',
              label: field.labels && field.labels[0] ? field.labels[0].innerText : 
                     (field.getAttribute('aria-label') || field.placeholder || '')
            };
          };
          
          return {
            hasForm: true,
            formAction: formAction,
            formMethod: formMethod,
            fieldCount: formElements.length,
            fieldPosition: currentIndex + 1,
            previousField: getFieldInfo(previousField),
            nextField: getFieldInfo(nextField),
            formId: parentForm.id || '',
            formName: parentForm.name || ''
          };
        }
        
        document.addEventListener('click', (e) => {
          const clickedElement = e.target;
          const interactiveElement = findInteractiveParent(clickedElement);
          
          // Skip click recording for inputs that are handled by change/input events
          const inputType = interactiveElement.type?.toLowerCase();
          const skipClickTypes = ['checkbox', 'radio', 'file'];
          if (interactiveElement.tagName === 'INPUT' && skipClickTypes.includes(inputType)) {
            return; // Let the change event handle these
          }
          
          const isDirectClick = interactiveElement === clickedElement;
          const targetInfo = buildElementTarget(interactiveElement);
          let clickedElementInfo = null;
          if (!isDirectClick) {
            clickedElementInfo = buildElementTarget(clickedElement);
          }
          const preClickState = {
            url: window.location.href,
            scrollY: window.scrollY,
            scrollX: window.scrollX,
            activeElement: document.activeElement?.tagName,
            openModals: document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal:not([style*="display: none"])').length
          };
          
          if (!shouldRecordAction()) return;
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'click',
            timestamp: Date.now(),
            target: targetInfo,
            position: { x: e.clientX, y: e.clientY },
            metadata: {
              isDirectClick: isDirectClick,
              clickedElement: clickedElementInfo,
              preClickState: preClickState
            }
          }));
        }, true);
        
        // Track focused input elements and their initial values
        let focusedInputs = new Map();
        
        document.addEventListener('focus', (e) => {
          const target = e.target;
          const tagName = target.tagName;
          const inputType = target.type?.toLowerCase();
          
          if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
            const key = target.id || target.name || getSelector(target);
            const immediateTypes = ['range', 'color']; // Removed checkbox/radio/file - handled by change event
            const isImmediate = immediateTypes.includes(inputType);
            
            if (!isImmediate) {
              // Store the initial value when element gets focus
              focusedInputs.set(key, {
                element: target,
                initialValue: target.value,
                hasChanged: false
              });
            }
          }
        }, true);
        
        document.addEventListener('input', (e) => {
          const target = e.target;
          const tagName = target.tagName;
          const inputType = target.type?.toLowerCase();
          if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
            const key = target.id || target.name || getSelector(target);
            const immediateTypes = ['range', 'color']; // Removed checkbox/radio/file - handled by change event
            const isImmediate = immediateTypes.includes(inputType);
            
            if (isImmediate) {
              handleInputAction(target);
            } else {
              // Mark that this focused input has changed
              if (focusedInputs.has(key)) {
                focusedInputs.get(key).hasChanged = true;
              }
            }
          }
        }, true);
        
        // Handle Enter key and form submission triggers
        document.addEventListener('keydown', (e) => {
          const target = e.target;
          const tagName = target.tagName;
          const inputType = target.type?.toLowerCase();
          
          if ((tagName === 'INPUT' || tagName === 'TEXTAREA') && (e.key === 'Enter' || e.key === 'Tab')) {
            const key = target.id || target.name || getSelector(target);
            const immediateTypes = ['range', 'color']; // Removed checkbox/radio/file - handled by change event
            const isImmediate = immediateTypes.includes(inputType);
            
            if (!isImmediate && focusedInputs.has(key)) {
              const inputData = focusedInputs.get(key);
              
              // Record the text input BEFORE the key action if value changed
              if (inputData.hasChanged && inputData.initialValue !== target.value) {
                handleInputAction(target);
                
                // Update the tracking to prevent duplicate recording on blur
                inputData.hasChanged = false;
                inputData.initialValue = target.value;
              }
            }
          }
        }, true);
        
        // Handle form submissions to capture any pending input changes
        document.addEventListener('submit', (e) => {
          const form = e.target;
          if (form.tagName === 'FORM') {
            // Check all focused inputs in this form and record pending changes
            const formInputs = form.querySelectorAll('input, textarea');
            formInputs.forEach(input => {
              const key = input.id || input.name || getSelector(input);
              if (focusedInputs.has(key)) {
                const inputData = focusedInputs.get(key);
                if (inputData.hasChanged && inputData.initialValue !== input.value) {
                  handleInputAction(input);
                  inputData.hasChanged = false;
                  inputData.initialValue = input.value;
                }
              }
            });
          }
        }, true);
        
        document.addEventListener('blur', (e) => {
          const target = e.target;
          const tagName = target.tagName;
          const inputType = target.type?.toLowerCase();
          
          if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
            const key = target.id || target.name || getSelector(target);
            const immediateTypes = ['range', 'color']; // Removed checkbox/radio/file - handled by change event
            const isImmediate = immediateTypes.includes(inputType);
            
            if (!isImmediate && focusedInputs.has(key)) {
              const inputData = focusedInputs.get(key);
              
              // Only record action if the value actually changed
              if (inputData.hasChanged && inputData.initialValue !== target.value) {
                handleInputAction(target);
              }
              
              // Clean up the tracking
              focusedInputs.delete(key);
            }
          }
        }, true);
        document.addEventListener('change', (e) => {
          const target = e.target;
          const tagName = target.tagName;
          const inputType = target.type?.toLowerCase();
          
          if (tagName === 'SELECT') {
            handleSelectAction(target);
          } else if (inputType === 'checkbox') {
            handleCheckboxAction(target);
          } else if (inputType === 'radio') {
            handleRadioAction(target);
          } else if (inputType === 'file') {
            handleFileUploadAction(target);
          }
        }, true);
        function handleInputAction(target) {
          const inputType = target.type?.toLowerCase();
          let actionType = 'input';
          let value = target.value;
          let metadata = {};
          
          // Note: checkbox and radio are now handled only by the 'change' event to avoid duplicates
          if (inputType === 'range') {
            metadata = { min: target.min, max: target.max, step: target.step };
          } else if (inputType === 'color') {
            metadata = { colorValue: target.value };
          }
          
          // Get form context for all input types
          const formContext = getFormContext(target);
          metadata.formContext = formContext;
          
          // Add validation context
          metadata.validation = {
            required: target.required || false,
            pattern: target.pattern || '',
            minLength: target.minLength || 0,
            maxLength: target.maxLength || 0,
            min: target.min || '',
            max: target.max || ''
          };
          
          if (!shouldRecordAction()) return;
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: actionType,
            timestamp: Date.now(),
            target: {
              selector: getSelector(target),
              tagName: target.tagName,
              id: target.id || undefined,
              name: target.name || undefined,
              type: inputType,
              placeholder: target.placeholder || undefined
            },
            value: value,
            metadata: metadata
          }));
        }
        function handleSelectAction(target) {
          const isMultiple = target.multiple;
          let selectedValues = [];
          let selectedTexts = [];
          
          if (isMultiple) {
            const options = Array.from(target.selectedOptions);
            selectedValues = options.map(opt => opt.value);
            selectedTexts = options.map(opt => opt.text);
          } else {
            const selectedOption = target.options[target.selectedIndex];
            selectedValues = [selectedOption?.value];
            selectedTexts = [selectedOption?.text];
          }
          
          // Get all available options for enhanced metadata
          const allOptions = Array.from(target.options).map(function(opt, index) {
            return {
              value: opt.value,
              text: opt.text,
              selected: opt.selected,
              index: index,
              disabled: opt.disabled
            };
          });
          
          if (!shouldRecordAction()) return;
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'select',
            timestamp: Date.now(),
            target: {
              selector: getSelector(target),
              tagName: target.tagName,
              id: target.id || undefined,
              name: target.name || undefined,
              multiple: isMultiple
            },
            value: isMultiple ? selectedValues : selectedValues[0],
            metadata: {
              selectedTexts: selectedTexts,
              optionCount: target.options.length,
              isMultiple: isMultiple,
              // Enhanced metadata: all available options
              allOptions: allOptions,
              selectedIndices: isMultiple ? 
                Array.from(target.selectedOptions).map(function(opt) { return opt.index; }) :
                [target.selectedIndex],
              // Form context
              formContext: getFormContext(target)
            }
          }));
        }
        function handleCheckboxAction(target) {
          if (!shouldRecordAction()) return;
          
          // Find all related checkboxes with the same name (checkbox group)
          let allOptions = [];
          if (target.name) {
            const relatedCheckboxes = document.querySelectorAll('input[type="checkbox"][name="' + target.name + '"]');
            allOptions = Array.from(relatedCheckboxes).map(cb => ({
              value: cb.value || cb.id || 'on',
              label: cb.labels?.[0]?.innerText || cb.getAttribute('aria-label') || cb.nextElementSibling?.textContent?.trim() || cb.value,
              checked: cb.checked,
              id: cb.id,
              selector: getSelector(cb)
            }));
          } else {
            // Single checkbox
            allOptions = [{
              value: target.value || target.id || 'on',
              label: target.labels?.[0]?.innerText || target.getAttribute('aria-label') || target.nextElementSibling?.textContent?.trim() || target.value,
              checked: target.checked,
              id: target.id,
              selector: getSelector(target)
            }];
          }
          
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'checkbox',
            timestamp: Date.now(),
            target: {
              selector: getSelector(target),
              tagName: target.tagName,
              id: target.id || undefined,
              name: target.name || undefined,
              type: 'checkbox'
            },
            value: target.checked,
            metadata: {
              checked: target.checked,
              label: target.labels && target.labels[0] ? target.labels[0].innerText : undefined,
              // Enhanced metadata: all available options
              allOptions: allOptions,
              groupName: target.name,
              totalOptions: allOptions.length,
              selectedCount: allOptions.filter(function(opt) { return opt.checked; }).length,
              // Form context
              formContext: getFormContext(target)
            }
          }));
        }
        function handleRadioAction(target) {
          if (!shouldRecordAction()) return;
          
          // Find all radio buttons in the same group
          let allOptions = [];
          if (target.name) {
            const relatedRadios = document.querySelectorAll('input[type="radio"][name="' + target.name + '"]');
            allOptions = Array.from(relatedRadios).map(function(radio) {
              return {
                value: radio.value || radio.id || '',
                label: radio.labels && radio.labels[0] ? radio.labels[0].innerText : 
                       (radio.getAttribute('aria-label') || 
                        (radio.nextElementSibling && radio.nextElementSibling.textContent ? radio.nextElementSibling.textContent.trim() : '') ||
                        radio.value),
                checked: radio.checked,
                id: radio.id,
                selector: getSelector(radio)
              };
            });
          } else {
            // Single radio (unusual but handle it)
            allOptions = [{
              value: target.value || target.id || '',
              label: target.labels && target.labels[0] ? target.labels[0].innerText : 
                     (target.getAttribute('aria-label') || 
                      (target.nextElementSibling && target.nextElementSibling.textContent ? target.nextElementSibling.textContent.trim() : '') ||
                      target.value),
              checked: target.checked,
              id: target.id,
              selector: getSelector(target)
            }];
          }
          
          // Get group context
          let groupContext = '';
          const parentFieldset = target.closest('fieldset');
          const parentForm = target.closest('form');
          
          if (parentFieldset) {
            const legend = parentFieldset.querySelector('legend');
            groupContext = legend ? (legend.textContent ? legend.textContent.trim() : '') : '';
          } else if (parentForm) {
            groupContext = parentForm.getAttribute('aria-label') || parentForm.title || 'Radio group';
          }
          
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'radio',
            timestamp: Date.now(),
            target: {
              selector: getSelector(target),
              tagName: target.tagName,
              id: target.id || undefined,
              name: target.name || undefined,
              type: 'radio'
            },
            value: target.value,
            metadata: {
              checked: target.checked,
              groupName: target.name,
              label: target.labels && target.labels[0] ? target.labels[0].innerText : undefined,
              // Enhanced metadata: all available options
              allOptions: allOptions,
              groupContext: groupContext,
              totalOptions: allOptions.length,
              selectedOption: allOptions.find(function(opt) { return opt.checked; }) || null,
              // Form context
              formContext: getFormContext(target)
            }
          }));
        }
        function handleFileUploadAction(target) {
          const files = Array.from(target.files || []);
          if (!shouldRecordAction()) return;
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'file-upload',
            timestamp: Date.now(),
            target: {
              selector: getSelector(target),
              tagName: target.tagName,
              id: target.id || undefined,
              name: target.name || undefined,
              type: 'file'
            },
            value: files.map(f => f.name).join(', '),
            metadata: {
              fileCount: files.length,
              fileNames: files.map(f => f.name),
              fileSizes: files.map(f => f.size),
              fileTypes: files.map(f => f.type),
              accept: target.accept || undefined,
              multiple: target.multiple
            }
          }));
        }
        document.addEventListener('submit', (e) => {
          const target = e.target;
          const formData = new FormData(target);
          const formDataObj = {};
          
          for (const [key, value] of formData.entries()) {
            const isSensitive = /password|secret|token|key|ssn|credit/i.test(key);
            formDataObj[key] = isSensitive ? '[REDACTED]' : value;
          }
          const submitTrigger = document.activeElement;
          const triggerInfo = submitTrigger && (
            submitTrigger.tagName === 'BUTTON' || 
            submitTrigger.type === 'submit'
          ) ? {
            selector: getSelector(submitTrigger),
            tagName: submitTrigger.tagName,
            text: submitTrigger.innerText || submitTrigger.value,
            type: submitTrigger.type
          } : null;
          
          if (!shouldRecordAction()) return;
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'submit',
            timestamp: Date.now(),
            target: {
              selector: getSelector(target),
              action: target.action || undefined,
              method: target.method || 'GET',
              fieldCount: formData.entries().length
            },
            metadata: {
              triggeredBy: triggerInfo,
              formData: formDataObj,
              hasFileUpload: Array.from(target.elements).some(el => el.type === 'file')
            }
          }));
        }, true);
        document.addEventListener('keydown', (e) => {
          const importantKeys = [
            'Enter', 'Escape', 'Tab', 'Backspace', 'Delete',
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'Home', 'End', 'PageUp', 'PageDown'
          ];
          const isShortcut = (e.ctrlKey || e.metaKey || e.altKey) && e.key.length === 1;
          const isImportantKey = importantKeys.includes(e.key);
          
          if (isShortcut || isImportantKey) {
            let shortcut = '';
            if (e.ctrlKey) shortcut += 'Ctrl+';
            if (e.metaKey) shortcut += 'Cmd+';
            if (e.altKey) shortcut += 'Alt+';
            if (e.shiftKey) shortcut += 'Shift+';
            shortcut += e.key;
            const focusedElement = document.activeElement;
            const targetInfo = focusedElement ? {
              selector: getSelector(focusedElement),
              tagName: focusedElement.tagName,
              id: focusedElement.id || undefined,
              type: focusedElement.type || undefined
            } : null;
            
            if (!shouldRecordAction()) return;
            console.info('[BROWZER_ACTION]', JSON.stringify({
              type: 'keypress',
              timestamp: Date.now(),
              value: e.key,
              metadata: {
                shortcut: shortcut,
                code: e.code,
                ctrlKey: e.ctrlKey,
                metaKey: e.metaKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                isShortcut: isShortcut,
                focusedElement: targetInfo
              }
            }));
          }
        }, true);
        
        /**
         * Find the actual interactive parent element
         * Traverses up the DOM to find clickable elements like buttons, links, etc.
         */
        function findInteractiveParent(element, maxDepth = 5) {
          let current = element;
          let depth = 0;
          
          while (current && depth < maxDepth) {
            if (isInteractiveElement(current)) {
              return current;
            }
            current = current.parentElement;
            depth++;
          }
          return element;
        }
        
        /**
         * Check if element is interactive (clickable)
         */
        function isInteractiveElement(element) {
          const tagName = element.tagName.toLowerCase();
          const role = element.getAttribute('role');
          const type = element.getAttribute('type');
          const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'label'];
          if (interactiveTags.includes(tagName)) {
            return true;
          }
          const interactiveRoles = [
            'button', 'link', 'menuitem', 'tab', 'checkbox', 'radio',
            'switch', 'option', 'textbox', 'searchbox', 'combobox'
          ];
          if (role && interactiveRoles.includes(role)) {
            return true;
          }
          if (element.onclick || element.hasAttribute('onclick')) {
            return true;
          }
          const style = window.getComputedStyle(element);
          if (style.cursor === 'pointer') {
            return true;
          }
          if (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') {
            return true;
          }
          
          return false;
        }
        
        /**
         * Build comprehensive element target with multiple selector strategies
         */
        function buildElementTarget(element) {
          const rect = element.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(element);
          const selectors = generateSelectorStrategies(element);
          const bestSelector = selectors.reduce((best, current) => 
            current.score > best.score ? current : best
          );
          
          return {
            selector: bestSelector.selector,
            selectors: selectors,
            tagName: element.tagName,
            id: element.id || undefined,
            className: element.className || undefined,
            name: element.name || undefined,
            type: element.type || undefined,
            role: element.getAttribute('role') || undefined,
            ariaLabel: element.getAttribute('aria-label') || undefined,
            ariaDescribedBy: element.getAttribute('aria-describedby') || undefined,
            title: element.title || undefined,
            placeholder: element.placeholder || undefined,
            text: element.innerText?.substring(0, 100) || undefined,
            value: element.value || undefined,
            href: element.href || undefined,
            dataTestId: element.getAttribute('data-testid') || undefined,
            dataCy: element.getAttribute('data-cy') || undefined,
            boundingRect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              left: rect.left
            },
            isVisible: isVisible(element),
            isInteractive: isInteractiveElement(element)
          };
        }
        
        /**
         * Generate multiple selector strategies with confidence scores
         */
        function generateSelectorStrategies(element) {
          const strategies = [];
          if (element.id) {
            strategies.push({
              strategy: 'id',
              selector: '#' + CSS.escape(element.id),
              score: 95,
              description: 'ID selector (most reliable)'
            });
          }
          if (element.hasAttribute('data-testid')) {
            const testId = element.getAttribute('data-testid');
            strategies.push({
              strategy: 'data-testid',
              selector: '[data-testid="' + testId + '"]',
              score: 90,
              description: 'Test ID selector'
            });
          }
          if (element.hasAttribute('data-cy')) {
            const cy = element.getAttribute('data-cy');
            strategies.push({
              strategy: 'data-cy',
              selector: '[data-cy="' + cy + '"]',
              score: 90,
              description: 'Cypress selector'
            });
          }
          if (element.hasAttribute('aria-label')) {
            const ariaLabel = element.getAttribute('aria-label');
            strategies.push({
              strategy: 'aria-label',
              selector: '[aria-label="' + ariaLabel + '"]',
              score: 80,
              description: 'ARIA label selector'
            });
          }
          if (element.hasAttribute('role') && element.hasAttribute('name')) {
            const role = element.getAttribute('role');
            const name = element.getAttribute('name');
            strategies.push({
              strategy: 'role',
              selector: '[role="' + role + '"][name="' + name + '"]',
              score: 75,
              description: 'Role + name selector'
            });
          }
          const text = element.innerText?.trim();
          if (text && text.length > 0 && text.length < 50) {
            const tagName = element.tagName.toLowerCase();
            if (['button', 'a', 'span'].includes(tagName)) {
              strategies.push({
                strategy: 'text',
                selector: tagName + ':contains("' + text.substring(0, 30) + '")',
                score: 70,
                description: 'Text content selector'
              });
            }
          }
          const cssSelector = generateCSSSelector(element);
          strategies.push({
            strategy: 'css',
            selector: cssSelector,
            score: 60,
            description: 'Structural CSS selector'
          });
          const xpath = generateXPath(element);
          strategies.push({
            strategy: 'xpath',
            selector: xpath,
            score: 50,
            description: 'XPath selector'
          });
          
          return strategies;
        }
        
        /**
         * Generate CSS selector (improved version)
         */
        function generateCSSSelector(element) {
          if (element.id) {
            return '#' + CSS.escape(element.id);
          }
          
          let path = [];
          let current = element;
          
          while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 5) {
            let selector = current.nodeName.toLowerCase();
            if (current.hasAttribute('data-testid')) {
              selector += '[data-testid="' + current.getAttribute('data-testid') + '"]';
              path.unshift(selector);
              break;
            }
            if (current.hasAttribute('data-cy')) {
              selector += '[data-cy="' + current.getAttribute('data-cy') + '"]';
              path.unshift(selector);
              break;
            }
            if (current.id) {
              selector += '#' + CSS.escape(current.id);
              path.unshift(selector);
              break;
            }
            if (current.className && typeof current.className === 'string') {
              const classes = current.className.trim().split(/\\s+/)
                .filter(c => c && !c.match(/^(ng-|_)/)) // Filter out framework classes
                .slice(0, 2)
                .map(c => CSS.escape(c))
                .join('.');
              if (classes) {
                selector += '.' + classes;
              }
            }
            const parent = current.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(c => 
                c.nodeName === current.nodeName
              );
              if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += ':nth-child(' + index + ')';
              }
            }
            
            path.unshift(selector);
            current = current.parentElement;
          }
          
          return path.join(' > ');
        }
        
        /**
         * Generate XPath selector
         */
        function generateXPath(element) {
          if (element.id) {
            return '//*[@id="' + element.id + '"]';
          }
          
          const parts = [];
          let current = element;
          
          while (current && current.nodeType === Node.ELEMENT_NODE) {
            let index = 1;
            let sibling = current.previousSibling;
            
            while (sibling) {
              if (sibling.nodeType === Node.ELEMENT_NODE && 
                  sibling.nodeName === current.nodeName) {
                index++;
              }
              sibling = sibling.previousSibling;
            }
            
            const tagName = current.nodeName.toLowerCase();
            const part = tagName + '[' + index + ']';
            parts.unshift(part);
            
            current = current.parentElement;
          }
          
          return '/' + parts.join('/');
        }
        
        /**
         * Check if element is visible
         */
        function isVisible(element) {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && 
                 rect.height > 0 && 
                 style.display !== 'none' && 
                 style.visibility !== 'hidden' &&
                 style.opacity !== '0';
        }
        
        /**
         * Legacy: Simple selector generator (kept for compatibility)
         */
        function getSelector(element) {
          const selectors = generateSelectorStrategies(element);
          const best = selectors.reduce((best, current) => 
            current.score > best.score ? current : best
          );
          return best.selector;
        }
      })();
    `;
  }

  /**
   * Setup CDP event listeners
   */
  private setupEventListeners(): void {
    if (!this.debugger) return;

    // Remove all existing listeners to prevent duplicates
    this.debugger.removeAllListeners('message');
    this.debugger.removeAllListeners('detach');

    // Add fresh listeners
    this.debugger.on('message', async (_event, method, params) => {
      if (!this.isRecording) return;

      try {
        await this.handleCDPEvent(method, params);
      } catch (error) {
        console.error('Error handling CDP event:', error);
      }
    });
    this.debugger.on('detach', (_event, reason) => {
      console.log('Debugger detached:', reason);
      // Don't set isRecording to false here - we might be switching tabs
    });
  }

  /**
   * Handle CDP events and extract semantic actions
   */
  private async handleCDPEvent(method: string, params: any): Promise<void> {
    switch (method) {
      case 'Runtime.consoleAPICalled':
        if (params.type === 'info' && params.args.length >= 2) {
          const firstArg = params.args[0].value;
          if (firstArg === '[BROWZER_ACTION]') {
            try {
              const actionData = JSON.parse(params.args[1].value);
              await this.handlePendingAction(actionData);
              
            } catch (error) {
              console.error('Error parsing action:', error);
            }
          }
        }
        break;
      case 'Network.requestWillBeSent':
        this.recentNetworkRequests.push({
          url: params.request.url,
          method: params.request.method || 'GET',
          type: params.type || 'other',
          timestamp: Date.now(),
          completed: false
        });
        break;

      case 'Network.responseReceived':
      case 'Network.loadingFinished':
        const completedReq = this.recentNetworkRequests.find(
          r => r.url === params.response?.url && !r.completed
        );
        if (completedReq) {
          completedReq.completed = true;
        }
        break;
      case 'Page.lifecycleEvent':
        if (params.name === 'networkIdle') {
          console.log('🌐 Network is idle');
          await this.processPendingActions();
        }
        break;
      case 'Page.frameNavigated':
        if (params.frame.parentId === undefined) {
          const newUrl = params.frame.url;
          
          if (this.isSignificantNavigation(newUrl)) {
            this.recordNavigation(newUrl);
          }
        }
        break;
      
      case 'Page.loadEventFired':
        console.log('📄 Page loaded');
        await this.injectEventTracker();
        break;

      default:
        break;
    }
  }

  /**
   * 🆕 Handle pending action (await verification)
   */
  private async handlePendingAction(actionData: RecordedAction): Promise<void> {
    const actionId = `${actionData.type}-${actionData.timestamp}`;
    
    // Add tab context to action
    const enrichedAction: RecordedAction = {
      ...actionData,
      tabId: this.currentTabId || undefined,
      tabUrl: this.currentTabUrl || undefined,
      tabTitle: this.currentTabTitle || undefined,
      webContentsId: this.currentWebContentsId || undefined
    };
    
    // For keypress and certain actions, verify immediately without waiting
    const immediateVerificationTypes = ['keypress', 'input', 'checkbox', 'radio', 'select'];
    const shouldVerifyImmediately = immediateVerificationTypes.includes(actionData.type);
    
    if (shouldVerifyImmediately) {
      // Verify immediately and record
      enrichedAction.verified = true;
      enrichedAction.verificationTime = 0;
      
      // Capture snapshot asynchronously (non-blocking)
      if (this.view) {
        this.snapshotManager.captureSnapshot(this.view, enrichedAction).then(snapshotPath => {
          if (snapshotPath) {
            enrichedAction.snapshotPath = snapshotPath;
          }
        }).catch(err => console.error('Snapshot capture failed:', err));

        // Capture screenshot for VLM analysis (if enabled)
        this.captureScreenshotForVLM().catch(err => 
          console.error('VLM screenshot capture failed:', err)
        );
      }
      
      this.actions.push(enrichedAction);
      console.log(`✅ Action immediately verified: ${actionData.type}`);
      if (this.onActionCallback) {
        this.onActionCallback(enrichedAction);
      }
      return;
    }
    
    // For other actions (like clicks), use verification with shorter deadline
    const verificationDeadline = Date.now() + 500; // Reduced from 1000ms to 500ms
    
    this.pendingActions.set(actionId, {
      action: enrichedAction,
      timestamp: Date.now(),
      verificationDeadline
    });
    
    console.log('⏳ Action pending verification:', actionData);
    if(actionData.target.selectors){
      console.log("sectors: ", actionData.target.selectors)
    }
    setTimeout(async () => {
      await this.verifyAndFinalizeAction(actionId);
    }, 500);
  }

  /**
   * 🆕 Verify action effects and finalize
   */
  private async verifyAndFinalizeAction(actionId: string): Promise<void> {
    const pending = this.pendingActions.get(actionId);
    if (!pending) return;
    
    const { action, timestamp } = pending;
    const preClickState = action.metadata?.preClickState;
    const effects = await this.detectClickEffects(timestamp, preClickState);
    const verifiedAction: RecordedAction = {
      ...action,
      verified: true,
      verificationTime: Date.now() - timestamp,
      effects
    };
    
    // Capture snapshot asynchronously for verified click actions
    if (this.view) {
      this.snapshotManager.captureSnapshot(this.view, verifiedAction).then(snapshotPath => {
        if (snapshotPath) {
          verifiedAction.snapshotPath = snapshotPath;
        }
      }).catch(err => console.error('Snapshot capture failed:', err));
    }
    
    this.actions.push(verifiedAction);
    console.log('✅ Action verified:', verifiedAction.type);
    console.log('📊 Effects:', effects.summary || 'none');
    if(effects.network){
      console.log('   Network:', effects.network);
    }
    if(effects.navigation){
      console.log('   Navigation:', effects.navigation);
    }
    if (this.onActionCallback) {
      this.onActionCallback(verifiedAction);
    }
    this.pendingActions.delete(actionId);
  }

  /**
   * Detect comprehensive click effects
   */
  private async detectClickEffects(clickTimestamp: number, preClickState?: any): Promise<any> {
    const effects: any = {};
    const effectSummary: string[] = [];
    const allNetworkActivity = this.recentNetworkRequests.filter(
      req => req.timestamp >= clickTimestamp && req.timestamp <= clickTimestamp + 1500
    );
    const significantRequests = allNetworkActivity.filter(req => 
      this.isSignificantNetworkRequest(req.url, req.method, req.type)
    );
    
    if (significantRequests.length > 0) {
      effects.network = {
        requestCount: significantRequests.length,
        requests: significantRequests.map(req => ({
          url: req.url,
          method: req.method,
          type: req.type,
          status: req.status,
          timing: req.timestamp - clickTimestamp
        }))
      };
      effectSummary.push(`${significantRequests.length} network request(s)`);
    }
    try {
      const pageEffects = await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            const effects = {
              modal: null,
              focus: null,
              scroll: null,
              stateChange: null
            };
            const currentState = {
              url: window.location.href,
              scrollY: window.scrollY,
              scrollX: window.scrollX,
              activeElement: document.activeElement?.tagName,
              visibleModals: Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')).filter(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
              }).length
            };
            return {
              currentState: currentState,
              effects: effects
            };
          })();
        `,
        returnByValue: true
      });
      
      if (pageEffects.result?.value) {
        const result = pageEffects.result.value;
        const currentState = result.currentState;
        const focused = currentState.activeElement;
        if (focused && focused !== 'BODY' && focused !== 'HTML') {
          const meaningfulFocusTags = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'];
          if (meaningfulFocusTags.includes(focused)) {
            effects.focus = {
              changed: true,
              newFocusTagName: focused
            };
            effectSummary.push('focus changed to ' + focused.toLowerCase());
          }
        }
        const scrollDistance = Math.max(
          Math.abs(currentState.scrollY),
          Math.abs(currentState.scrollX)
        );
        if (scrollDistance > 200) { // Significant scroll only
          effects.scroll = {
            occurred: true,
            distance: scrollDistance
          };
          effectSummary.push('page scrolled');
        }
      }
    } catch (error) {
      console.error('Error detecting page effects:', error);
    }
    effects.summary = effectSummary.length > 0 
      ? effectSummary.join(', ')
      : 'no significant effects detected';
    
    return effects;
  }

  /**
   * 🆕 Process all pending actions (called on networkIdle)
   */
  private async processPendingActions(): Promise<void> {
    const pending = Array.from(this.pendingActions.keys());
    for (const actionId of pending) {
      await this.verifyAndFinalizeAction(actionId);
    }
  }


  /**
   * Filter: Check if navigation is significant (not analytics/tracking)
   */
  private isSignificantNavigation(url: string): boolean {
    const ignorePatterns = [
      'data:',
      'about:',
      'chrome:',
      'chrome-extension:',
      '/log?',
      '/analytics',
      '/tracking',
    ];

    return !ignorePatterns.some(pattern => url.startsWith(pattern) || url.includes(pattern));
  }

  /**
   * Filter: Check if network request is significant (not analytics/tracking/ping)
   */
  private isSignificantNetworkRequest(url: string, method: string, type: string): boolean {
    if (type === 'Ping' || type === 'ping' || type === 'beacon') {
      return false;
    }
    const ignorePatterns = [
      '/gen_204',           // Google analytics
      '/collect',           // Google Analytics
      '/analytics',
      '/tracking',
      '/track',
      '/beacon',
      '/ping',
      '/log',
      '/telemetry',
      'google-analytics.com',
      'googletagmanager.com',
      'doubleclick.net',
      'facebook.com/tr',
      'mixpanel.com',
      'segment.com',
      'amplitude.com',
      'hotjar.com',
      '/pixel',
      '/impression',
      'clarity.ms',
      'bing.com/api/log'
    ];
    
    if (ignorePatterns.some(pattern => url.includes(pattern))) {
      return false;
    }
    if (type === 'Document') {
      return true;
    }
    if (type === 'XHR' || type === 'Fetch') {
      const apiPatterns = ['/api/', '/v1/', '/v2/', '/graphql', '/rest/', '/data/'];
      const isApiCall = apiPatterns.some(pattern => url.includes(pattern));
      const isStateChanging = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
      
      return isApiCall || isStateChanging;
    }
    
    return false;
  }



  /**
   * Record navigation
   */
  private recordNavigation(url: string, timestamp?: number): void {
    const action: RecordedAction = {
      type: 'navigate',
      timestamp: timestamp || Date.now(),
      url,
      tabId: this.currentTabId || undefined,
      tabUrl: this.currentTabUrl || undefined,
      tabTitle: this.currentTabTitle || undefined,
      webContentsId: this.currentWebContentsId || undefined,
      verified: true, // Navigation is always verified
      verificationTime: 0,
    };

    this.actions.push(action);
    console.log('🧭 Navigation recorded:', action);
    if (this.onActionCallback) {
      this.onActionCallback(action);
    }
  }
}
