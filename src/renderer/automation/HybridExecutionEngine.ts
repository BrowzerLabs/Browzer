import { IntelligentDOMExtractor } from './IntelligentDOMExtractor';
import { SPAReadyDetector } from './SPAReadyDetector';
import { ChatOrchestrator } from './ChatOrchestrator';
import { DOMDownsampler } from './DOMDownsampler';
import { ScreenshotCapture } from './ScreenshotCapture';

export interface HybridExecutionContext {
  userGoal: string;
  recordingSession: any;
  chatSessionId: string;
  currentUrl: string;
}

export interface ExecutionPlan {
  steps: PlannedStep[];
  reasoning: string;
  estimatedTime: number;
}

export interface PlannedStep {
  id: string;
  stepNumber: number;
  action: string;
  target: string;
  value?: any;
  reasoning: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  retryCount: number;
  maxRetries: number;
}

export interface ExecutionResult {
  success: boolean;
  stepsExecuted: number;
  stepsSucceeded: number;
  stepsFailed: number;
  adaptiveSwitches: number; // How many times we switched to adaptive mode
  totalCost: {
    planningTokens: number;
    adaptiveTokens: number;
    totalTokens: number;
  };
  executionHistory: any[];
}

export class HybridExecutionEngine {
  private static instance: HybridExecutionEngine;
  private webview: any = null;
  private domExtractor: IntelligentDOMExtractor;
  private spaDetector: SPAReadyDetector;
  private chatOrchestrator: ChatOrchestrator;
  private domDownsampler: DOMDownsampler;
  private screenshotCapture: ScreenshotCapture;
  private feedbackCallbacks: Array<(feedback: any) => void> = [];

  private constructor() {
    this.domExtractor = IntelligentDOMExtractor.getInstance();
    this.spaDetector = SPAReadyDetector.getInstance();
    this.chatOrchestrator = ChatOrchestrator.getInstance();
    this.domDownsampler = DOMDownsampler.getInstance();
    this.screenshotCapture = ScreenshotCapture.getInstance();
  }

  static getInstance(): HybridExecutionEngine {
    if (!HybridExecutionEngine.instance) {
      HybridExecutionEngine.instance = new HybridExecutionEngine();
    }
    return HybridExecutionEngine.instance;
  }

  setWebview(webview: any): void {
    this.webview = webview;
    this.spaDetector.setWebview(webview);
    this.screenshotCapture.setWebview(webview);
  }

  onFeedback(callback: (feedback: any) => void): void {
    this.feedbackCallbacks.push(callback);
  }

  private sendFeedback(feedback: any): void {
    this.feedbackCallbacks.forEach((callback) => {
      try {
        callback(feedback);
      } catch (error) {
        console.error('[HybridExecutionEngine] Feedback callback error:', error);
      }
    });
  }

  /**
   * Main execution method - Hybrid approach
   */
  async executeHybrid(context: HybridExecutionContext): Promise<ExecutionResult> {
    console.log('[HybridExecutionEngine] Starting hybrid execution');
    console.log('[HybridExecutionEngine] User goal:', context.userGoal);

    const result: ExecutionResult = {
      success: false,
      stepsExecuted: 0,
      stepsSucceeded: 0,
      stepsFailed: 0,
      adaptiveSwitches: 0,
      totalCost: {
        planningTokens: 0,
        adaptiveTokens: 0,
        totalTokens: 0,
      },
      executionHistory: [],
    };

    try {
      // PHASE 1: Generate complete execution plan (ONE LLM call)
      this.sendFeedback({
        phase: 'planning',
        message: '🧠 Generating execution plan...',
        progress: 5,
      });

      const plan = await this.generateExecutionPlan(context);
      result.totalCost.planningTokens = 3000; // Estimate

      this.chatOrchestrator.addMessage(
        'assistant',
        `📋 **Execution Plan Generated**\n\n${plan.steps.length} steps planned. Starting execution...`
      );

      // PHASE 2: Execute steps blindly (fast, no LLM calls)
      const maxAdaptiveSwitches = 3; // Limit adaptive switches to prevent infinite loops
      
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        result.stepsExecuted++;

        this.sendFeedback({
          phase: 'executing',
          stepNumber: step.stepNumber,
          message: `⚡ ${step.reasoning}`,
          progress: 10 + (i / plan.steps.length) * 70,
        });

        // Execute step
        const stepResult = await this.executeAction(step);

        if (stepResult.success) {
          // SUCCESS: Continue to next step
          step.status = 'success';
          result.stepsSucceeded++;
          result.executionHistory.push({
            step: step.stepNumber,
            action: step.action,
            status: 'success',
            message: stepResult.message,
          });

          this.sendFeedback({
            phase: 'executing',
            stepNumber: step.stepNumber,
            message: `✓ ${step.reasoning}`,
            progress: 10 + ((i + 1) / plan.steps.length) * 70,
          });
        } else {
          // FAILURE: Switch to adaptive mode (if not exceeded limit)
          step.status = 'failed';
          result.stepsFailed++;

          if (result.adaptiveSwitches >= maxAdaptiveSwitches) {
            this.chatOrchestrator.addMessage(
              'assistant',
              `❌ **Maximum recovery attempts reached (${maxAdaptiveSwitches}).** Aborting execution.`
            );
            break;
          }

          result.adaptiveSwitches++;

          this.sendFeedback({
            phase: 'adaptive',
            stepNumber: step.stepNumber,
            message: `✗ Failed: ${stepResult.error}. Switching to adaptive mode (${result.adaptiveSwitches}/${maxAdaptiveSwitches})...`,
            progress: 10 + ((i + 1) / plan.steps.length) * 70,
          });

          this.chatOrchestrator.addMessage(
            'assistant',
            `⚠️ **Step ${step.stepNumber} failed:** ${stepResult.error}\n\n🤖 Switching to adaptive mode for recovery (attempt ${result.adaptiveSwitches}/${maxAdaptiveSwitches})...`
          );

          // PHASE 3: Adaptive recovery (LLM gets full control)
          const recoveryResult = await this.adaptiveRecovery(
            context,
            plan,
            i, // Failed step index
            stepResult.error
          );

          result.totalCost.adaptiveTokens += recoveryResult.tokensUsed;

          if (recoveryResult.recovered) {
            // Recovery successful, continue with remaining steps
            this.chatOrchestrator.addMessage(
              'assistant',
              `✅ **Recovery successful!** Resuming normal execution...`
            );

            // Update plan with any changes from recovery
            if (recoveryResult.updatedSteps) {
              // Replace remaining steps with updated ones
              plan.steps = [
                ...plan.steps.slice(0, i + 1),
                ...recoveryResult.updatedSteps,
              ];
            }
          } else {
            // Recovery failed, abort execution
            this.chatOrchestrator.addMessage(
              'assistant',
              `❌ **Recovery failed.** Unable to continue execution.`
            );
            break;
          }
        }

        // Small delay between steps
        await this.sleep(300);
      }

      // Check if goal achieved
      const allSucceeded = result.stepsFailed === 0 || result.stepsSucceeded > 0;
      result.success = allSucceeded;
      result.totalCost.totalTokens =
        result.totalCost.planningTokens + result.totalCost.adaptiveTokens;

      this.sendFeedback({
        phase: 'complete',
        message: result.success ? '✅ Execution completed!' : '❌ Execution failed',
        progress: 100,
      });

      return result;
    } catch (error) {
      console.error('[HybridExecutionEngine] Execution error:', error);
      result.success = false;
      return result;
    }
  }

  /**
   * Generate complete execution plan (ONE LLM call)
   */
  private async generateExecutionPlan(context: HybridExecutionContext): Promise<ExecutionPlan> {
    console.log('[HybridExecutionEngine] Generating execution plan...');

    // Get initial browser state (lightweight, no screenshot)
    const browserState = await this.getBasicBrowserState();

    // Build planning prompt
    const systemPrompt = `You are an expert browser automation planner.

Generate a COMPLETE execution plan to accomplish the user's goal.

## Important Guidelines:
1. Generate ALL steps needed from start to finish
2. Be specific with selectors (use IDs, classes, or stable attributes)
3. Include wait steps after navigation
4. Plan for common scenarios (page loads, dynamic content)
5. Keep steps atomic and focused
6. The plan will execute WITHOUT your supervision, so be thorough

## Response Format:
Return a JSON array of steps:
\`\`\`json
[
  {
    "action": "navigate|click|type|wait|wait_for_element|keypress",
    "target": "selector or URL",
    "value": "optional value",
    "reasoning": "why this step is needed"
  }
]
\`\`\`

## Available Actions:
- **navigate**: Go to URL
- **click**: Click element (button, link, etc.)
- **type**: Type text into input
- **wait**: Wait milliseconds
- **wait_for_element**: Wait for element to appear
- **keypress**: Press keyboard key (Enter, Tab, etc.)`;

    const userPrompt = `## Task
${context.userGoal}

## Current Browser State
**URL:** ${browserState.url}
**Title:** ${browserState.title}

## Recording Session Context
${this.formatRecordingSession(context.recordingSession)}

Generate a complete execution plan to accomplish this task.`;

    // Call LLM
    const apiKey = localStorage.getItem('anthropic_api_key');
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const llmRequest = {
      provider: 'anthropic',
      apiKey,
      systemPrompt,
      prompt: userPrompt,
      maxTokens: 3000,
      temperature: 0.1,
    };

    const response = await (window as any).electronAPI.ipcInvoke('call-llm', llmRequest);

    if (!response.success) {
      throw new Error(response.error || 'Failed to generate plan');
    }

    // Parse steps from response
    const steps = this.parseStepsFromLLM(response.response);

    return {
      steps,
      reasoning: 'Generated from recording session and user goal',
      estimatedTime: steps.length * 2, // 2 seconds per step estimate
    };
  }

  /**
   * Parse steps from LLM response
   */
  private parseStepsFromLLM(llmResponse: string): PlannedStep[] {
    try {
      // Extract JSON array
      let jsonString = llmResponse;

      const codeBlockMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonString = codeBlockMatch[1];
      }

      const arrayStart = jsonString.indexOf('[');
      const arrayEnd = jsonString.lastIndexOf(']');

      if (arrayStart === -1 || arrayEnd === -1) {
        throw new Error('No JSON array found');
      }

      jsonString = jsonString.substring(arrayStart, arrayEnd + 1);
      const parsedSteps = JSON.parse(jsonString);

      if (!Array.isArray(parsedSteps)) {
        throw new Error('Response is not an array');
      }

      return parsedSteps.map((step: any, index: number) => ({
        id: `step_${index + 1}`,
        stepNumber: index + 1,
        action: step.action,
        target: step.target || '',
        value: step.value,
        reasoning: step.reasoning || '',
        status: 'pending' as const,
        retryCount: 0,
        maxRetries: 2,
      }));
    } catch (error) {
      console.error('[HybridExecutionEngine] Failed to parse steps:', error);
      throw new Error('Failed to parse execution plan');
    }
  }

  /**
   * Execute a single step (fast, no LLM)
   */
  private async executeAction(step: PlannedStep): Promise<any> {
    if (!this.webview) {
      throw new Error('Webview not set');
    }

    console.log(`[HybridExecutionEngine] Executing step ${step.stepNumber}: ${step.action}`);

    try {
      const action = step.action.toLowerCase();

      switch (action) {
        case 'navigate':
        case 'navigation':
          return await this.executeNavigate(step);
        case 'click':
          return await this.executeClick(step);
        case 'type':
        case 'text':
        case 'type_text': // Handle LLM variations
          return await this.executeType(step);
        case 'wait':
          return await this.executeWait(step);
        case 'wait_for_element':
          return await this.executeWaitForElement(step);
        case 'keypress':
        case 'key':
          return await this.executeKeypress(step);
        case 'submit':
          return await this.executeSubmit(step);
        default:
          throw new Error(`Unsupported action: ${step.action}`);
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Adaptive recovery when step fails
   * LLM gets FULL control with complete context
   */
  private async adaptiveRecovery(
    context: HybridExecutionContext,
    plan: ExecutionPlan,
    failedStepIndex: number,
    error: string
  ): Promise<{
    recovered: boolean;
    tokensUsed: number;
    updatedSteps?: PlannedStep[];
  }> {
    console.log('[HybridExecutionEngine] Starting adaptive recovery...');

    const maxRecoveryAttempts = 2; // Reduced from 3 to 2
    let tokensUsed = 0;

    for (let attempt = 1; attempt <= maxRecoveryAttempts; attempt++) {
      this.sendFeedback({
        phase: 'recovery',
        attempt,
        message: `🔄 Recovery attempt ${attempt}/${maxRecoveryAttempts}...`,
      });

      // Get FULL browser context (with screenshot)
      const fullContext = await this.getFullBrowserContext();
      tokensUsed += 4000; // Estimate for full context

      // Build recovery prompt
      const recoveryPrompt = await this.buildRecoveryPrompt(
        context,
        plan,
        failedStepIndex,
        error,
        fullContext,
        attempt
      );

      // Call LLM with full context
      const apiKey = localStorage.getItem('anthropic_api_key');
      if (!apiKey) {
        return { recovered: false, tokensUsed };
      }

      const messages: any[] = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: recoveryPrompt.text,
            },
            // {
            //   type: 'image',
            //   image: {
            //     base64: fullContext.screenshot.base64,
            //     mimeType: fullContext.screenshot.mimeType,
            //   },
            // },
          ],
        },
      ];

      const llmRequest = {
        provider: 'anthropic',
        apiKey,
        systemPrompt: this.buildRecoverySystemPrompt(),
        messages,
        maxTokens: 2000,
        temperature: 0.1,
      };

      const response = await (window as any).electronAPI.ipcInvoke('call-llm', llmRequest);

      if (!response.success) {
        console.error('[HybridExecutionEngine] Recovery LLM call failed:', response.error);
        continue;
      }

      // Parse recovery decision
      const decision = this.parseRecoveryDecision(response.response);

      if (decision.action === 'retry') {
        // Retry the failed step with updated parameters
        const updatedStep = {
          ...plan.steps[failedStepIndex],
          target: decision.updatedTarget || plan.steps[failedStepIndex].target,
          value: decision.updatedValue || plan.steps[failedStepIndex].value,
          retryCount: plan.steps[failedStepIndex].retryCount + 1,
        };

        const retryResult = await this.executeAction(updatedStep);

        if (retryResult.success) {
          return {
            recovered: true,
            tokensUsed,
          };
        }
      } else if (decision.action === 'refactor') {
        // Generate new steps to replace remaining plan
        return {
          recovered: true,
          tokensUsed,
          updatedSteps: decision.newSteps,
        };
      } else if (decision.action === 'reload') {
        // Reload page and restart from beginning
        await this.webview.reload();
        await this.spaDetector.waitForReady();

        return {
          recovered: true,
          tokensUsed,
          updatedSteps: plan.steps, // Restart with original plan
        };
      } else if (decision.action === 'abort') {
        // Cannot recover
        return {
          recovered: false,
          tokensUsed,
        };
      }
    }

    return {
      recovered: false,
      tokensUsed,
    };
  }

  /**
   * Get basic browser state (lightweight, no screenshot)
   */
  private async getBasicBrowserState(): Promise<any> {
    const url = this.webview.getURL();
    const title = this.webview.getTitle ? this.webview.getTitle() : '';

    await this.spaDetector.waitForReady({ timeout: 5000 });

    return {
      url,
      title,
    };
  }

  /**
   * Get full browser context (with screenshot and downsampled DOM)
   */
  private async getFullBrowserContext(): Promise<any> {
    const url = this.webview.getURL();
    const title = this.webview.getTitle ? this.webview.getTitle() : '';

    await this.spaDetector.waitForReady({ timeout: 5000 });

    // Extract and downsample DOM
    const domSnapshot = await this.domExtractor.extractFilteredDOM(this.webview);
    const downsampledDOM = await this.domDownsampler.downsample(
      domSnapshot.interactiveElements,
      'recovery',
      60
    );

    // // Capture screenshot
    // const screenshot = await this.screenshotCapture.captureScreenshot({
    //   maxWidth: 1280,
    //   maxHeight: 1024,
    //   quality: 0.7,
    // });

    return {
      url,
      title,
      downsampledDOM,
      // screenshot,
    };
  }

  /**
   * Build recovery prompt
   */
  private async buildRecoveryPrompt(
    context: HybridExecutionContext,
    plan: ExecutionPlan,
    failedStepIndex: number,
    error: string,
    fullContext: any,
    attempt: number
  ): Promise<{ text: string }> {
    const failedStep = plan.steps[failedStepIndex];
    const compressedDOM = this.domDownsampler.generateCompressedPrompt(
      fullContext.downsampledDOM
    );

    const prompt = `## RECOVERY MODE - Attempt ${attempt}

**Original Goal:** ${context.userGoal}

**Failed Step:** Step ${failedStep.stepNumber}
**Action:** ${failedStep.action}
**Target:** ${failedStep.target}
**Error:** ${error}

**Current Browser State:**
**URL:** ${fullContext.url}
**Title:** ${fullContext.title}

${compressedDOM}

**Execution History:**
${plan.steps
  .slice(0, failedStepIndex + 1)
  .map((s) => `Step ${s.stepNumber}: ${s.reasoning} [${s.status}]`)
  .join('\n')}

**Remaining Steps:**
${plan.steps
  .slice(failedStepIndex + 1)
  .map((s) => `Step ${s.stepNumber}: ${s.reasoning}`)
  .join('\n')}

## Your Task

Analyze the failure and decide how to recover. You have FULL CONTROL.

**Options:**
1. **retry**: Retry the same step with updated selector/value
2. **refactor**: Generate new steps to replace remaining plan
3. **reload**: Reload page and restart from beginning
4. **abort**: Cannot recover, abort execution

**Response Format:**
\`\`\`json
{
  "action": "retry|refactor|reload|abort",
  "reasoning": "why you chose this action",
  "updatedTarget": "new selector if retry",
  "updatedValue": "new value if retry",
  "newSteps": [array of new steps if refactor]
}
\`\`\`

See the screenshot for visual context. Decide wisely.`;

    return { text: prompt };
  }

  /**
   * Build recovery system prompt
   */
  private buildRecoverySystemPrompt(): string {
    return `You are an expert browser automation recovery specialist.

When execution fails, you analyze the error, examine the current browser state, and decide how to recover.

You have FULL CONTROL and can:
- Retry with different selectors
- Refactor the entire approach
- Reload the page and start over
- Abort if recovery is impossible

Be intelligent and adaptive. Your goal is to complete the user's task successfully.`;
  }

  /**
   * Parse recovery decision from LLM
   */
  private parseRecoveryDecision(llmResponse: string): any {
    try {
      let jsonString = llmResponse;

      const codeBlockMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonString = codeBlockMatch[1];
      }

      const objectStart = jsonString.indexOf('{');
      const objectEnd = jsonString.lastIndexOf('}');

      if (objectStart !== -1 && objectEnd !== -1) {
        jsonString = jsonString.substring(objectStart, objectEnd + 1);
      }

      return JSON.parse(jsonString);
    } catch (error) {
      console.error('[HybridExecutionEngine] Failed to parse recovery decision:', error);
      return { action: 'abort', reasoning: 'Failed to parse recovery decision' };
    }
  }

  /**
   * Format recording session for prompt
   */
  private formatRecordingSession(session: any): string {
    if (!session || !session.actions) {
      return 'No recording session available';
    }

    return `**Recorded Actions:** ${session.actions.length}
**Task Goal:** ${session.taskGoal || 'Not specified'}

Sample actions:
${session.actions
  .slice(0, 5)
  .map((a: any, i: number) => `${i + 1}. ${a.type}: ${a.description || ''}`)
  .join('\n')}`;
  }

  // Action execution methods (same as AdaptiveExecutionEngine)
  private async executeNavigate(step: PlannedStep): Promise<any> {
    let url = step.target || step.value as string;
    
    if (!url) {
      throw new Error('No URL provided for navigation');
    }

    // Handle relative URLs (SPA navigation)
    if (url.startsWith('/')) {
      return await this.handleSpaNavigation(url);
    }

    // Add https:// if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.')) {
        url = `https://${url}`;
      } else {
        return await this.handleSpaNavigation(`/${url}`);
      }
    }

    console.log(`[HybridExecutionEngine] Navigating to: ${url}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Navigation timeout'));
      }, 30000);

      const cleanup = () => {
        clearTimeout(timeout);
        this.webview.removeEventListener('did-finish-load', onLoad);
        this.webview.removeEventListener('did-fail-load', onError);
      };

      const onLoad = () => {
        cleanup();
        resolve({ success: true, message: `Navigated to ${url}` });
      };

      const onError = (event: any) => {
        cleanup();
        reject(new Error(`Navigation failed: ${event.errorDescription || 'Unknown error'}`));
      };

      this.webview.addEventListener('did-finish-load', onLoad);
      this.webview.addEventListener('did-fail-load', onError);

      this.webview.src = url;
    });
  }

  private async handleSpaNavigation(path: string): Promise<any> {
    console.log(`[HybridExecutionEngine] SPA navigation to: ${path}`);
    
    const script = `
      (async function() {
        try {
          if (window.history && window.history.pushState) {
            window.history.pushState({}, '', '${path}');
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
          }
          
          // Try clicking matching link
          const links = Array.from(document.querySelectorAll('a[href]'));
          const matchingLink = links.find(link => link.getAttribute('href') === '${path}');
          if (matchingLink) {
            matchingLink.click();
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          return { success: true, message: 'SPA navigation completed' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    if (!result.success) {
      throw new Error(result.error);
    }
    
    await this.sleep(1000);
    return result;
  }

  private async executeClick(step: PlannedStep): Promise<any> {
    const script = `
      (async function() {
        try {
          const selector = '${step.target.replace(/'/g, "\\'")}';
          let element = null;
          
          // Strategy 1: Direct querySelector
          try {
            element = document.querySelector(selector);
          } catch (e) {
            console.warn('[Click] Direct selector failed:', e);
          }
          
          // Strategy 2: Find by text content
          if (!element) {
            const searchText = selector.toLowerCase();
            const clickableElements = document.querySelectorAll('a, button, [role="button"], [onclick], input[type="button"], input[type="submit"]');
            
            for (const el of clickableElements) {
              const text = (el.textContent || '').toLowerCase().trim();
              const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
              const value = (el.value || '').toLowerCase();
              
              if (text.includes(searchText) || ariaLabel.includes(searchText) || value.includes(searchText)) {
                element = el;
                break;
              }
            }
          }
          
          // Strategy 3: Find by partial ID/class match
          if (!element) {
            const allClickable = document.querySelectorAll('a, button, [role="button"]');
            for (const el of allClickable) {
              const id = (el.id || '').toLowerCase();
              const className = (el.className || '').toLowerCase();
              const href = (el.getAttribute('href') || '').toLowerCase();
              
              if (id.includes(selector.toLowerCase()) || 
                  className.includes(selector.toLowerCase()) ||
                  href.includes(selector.toLowerCase())) {
                element = el;
                break;
              }
            }
          }
          
          if (!element) {
            return { success: false, error: 'Element not found: ' + selector };
          }
          
          // Check visibility
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          
          if (rect.width === 0 || rect.height === 0 || 
              style.display === 'none' || style.visibility === 'hidden') {
            return { success: false, error: 'Element is not visible' };
          }
          
          // Scroll into view
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Highlight element
          const originalOutline = element.style.outline;
          element.style.outline = '2px solid blue';
          
          // Try clicking
          let clicked = false;
          try {
            element.click();
            clicked = true;
          } catch (e) {
            console.warn('[Click] Native click failed, trying events:', e);
            element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            clicked = true;
          }
          
          setTimeout(() => {
            element.style.outline = originalOutline;
          }, 1000);
          
          return {
            success: clicked,
            message: 'Element clicked successfully',
            elementInfo: {
              tagName: element.tagName,
              id: element.id,
              text: element.textContent?.substring(0, 50)
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    
    if (!result.success) {
      throw new Error(`Click failed: ${result.error}`);
    }
    
    await this.sleep(1000);
    await this.spaDetector.waitForReady({ timeout: 5000 });
    return result;
  }

  private async executeType(step: PlannedStep): Promise<any> {
    const text = step.value as string;
    if (!text) throw new Error('No text provided');

    const script = `
      (async function() {
        try {
          const selector = '${step.target.replace(/'/g, "\\'")}';
          const textValue = '${text.replace(/'/g, "\\'")}';
          let element = null;
          
          // Strategy 1: Direct querySelector
          try {
            element = document.querySelector(selector);
          } catch (e) {
            console.warn('[Type] Direct selector failed:', e);
          }
          
          // Strategy 2: Find by placeholder, name, or id
          if (!element) {
            const inputs = document.querySelectorAll('input, textarea');
            const searchTerm = selector.toLowerCase();
            
            for (const input of inputs) {
              const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
              const name = (input.getAttribute('name') || '').toLowerCase();
              const id = (input.id || '').toLowerCase();
              const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
              
              if (placeholder.includes(searchTerm) || 
                  name.includes(searchTerm) || 
                  id.includes(searchTerm) ||
                  ariaLabel.includes(searchTerm)) {
                element = input;
                break;
              }
            }
          }
          
          if (!element) {
            return { success: false, error: 'Input element not found: ' + selector };
          }
          
          // Scroll into view
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Focus element
          element.focus();
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Highlight
          const originalOutline = element.style.outline;
          element.style.outline = '2px solid green';
          
          // Clear existing value
          element.value = '';
          element.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Type character by character
          for (let i = 0; i < textValue.length; i++) {
            element.value += textValue[i];
            element.dispatchEvent(new Event('input', { bubbles: true }));
            if (i < textValue.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          
          // Ensure final value is set
          element.value = textValue;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 100));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Blur
          element.dispatchEvent(new Event('blur', { bubbles: true }));
          
          setTimeout(() => {
            element.style.outline = originalOutline;
          }, 1000);
          
          const finalValue = element.value || '';
          const isValueSet = finalValue === textValue;
          
          return {
            success: true,
            message: 'Text typed successfully',
            valueSet: isValueSet,
            finalValue: finalValue
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    
    if (!result.success) {
      throw new Error(`Type failed: ${result.error}`);
    }
    
    await this.sleep(500);
    return result;
  }

  private async executeSubmit(step: PlannedStep): Promise<any> {
    const script = `
      (async function() {
        try {
          const submitSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button.btn-primary',
            'button.submit'
          ];
          
          let submitButton = null;
          
          // Try selectors
          for (const selector of submitSelectors) {
            submitButton = document.querySelector(selector);
            if (submitButton) break;
          }
          
          // Try finding by text
          if (!submitButton) {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
              const text = (btn.textContent || '').toLowerCase();
              if (text.includes('submit') || text.includes('create') || 
                  text.includes('save') || text.includes('send')) {
                submitButton = btn;
                break;
              }
            }
          }
          
          if (!submitButton) {
            return { success: false, error: 'Submit button not found' };
          }
          
          submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const originalOutline = submitButton.style.outline;
          submitButton.style.outline = '3px solid green';
          
          submitButton.click();
          
          setTimeout(() => {
            submitButton.style.outline = originalOutline;
          }, 1000);
          
          return { success: true, message: 'Form submitted' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    
    if (!result.success) {
      throw new Error(`Submit failed: ${result.error}`);
    }
    
    await this.sleep(2000);
    return result;
  }

  private async executeWait(step: PlannedStep): Promise<any> {
    const ms = parseInt(step.value as string) || 1000;
    await this.sleep(ms);
    return { success: true, message: `Waited ${ms}ms` };
  }

  private async executeWaitForElement(step: PlannedStep): Promise<any> {
    const timeout = parseInt(step.value as string) || 10000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const found = await this.webview.executeJavaScript(`
        document.querySelector('${step.target.replace(/'/g, "\\'")}') !== null
      `);

      if (found) {
        return { success: true, message: 'Element found' };
      }

      await this.sleep(200);
    }

    throw new Error(`Element not found: ${step.target}`);
  }

  private async executeKeypress(step: PlannedStep): Promise<any> {
    const key = step.value as string || 'Enter';

    const script = `
      (function() {
        const element = document.activeElement || document.body;
        element.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { key: '${key}', bubbles: true }));
        return { success: true, message: 'Key pressed' };
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    await this.sleep(300);
    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
