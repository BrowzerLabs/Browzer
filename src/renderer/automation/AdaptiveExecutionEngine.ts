import { IntelligentDOMExtractor } from './IntelligentDOMExtractor';
import { SPAReadyDetector } from './SPAReadyDetector';
import { ChatOrchestrator } from './ChatOrchestrator';
import { DOMDownsampler } from './DOMDownsampler';
import { ScreenshotCapture } from './ScreenshotCapture';

export interface AdaptiveExecutionContext {
  userGoal: string;
  recordingSession: any;
  chatSessionId: string;
  currentUrl: string;
  executionHistory: ExecutionHistoryEntry[];
}

export interface ExecutionHistoryEntry {
  stepNumber: number;
  action: string;
  target: string;
  value?: any;
  reasoning: string;
  result: 'success' | 'failure' | 'partial';
  actualOutcome: string;
  browserState: {
    url: string;
    title: string;
    visibleElements: string[];
    errors?: string[];
  };
  timestamp: number;
}

export interface NextStepDecision {
  shouldContinue: boolean;
  action: string;
  target: string;
  value?: any;
  reasoning: string;
  adaptationNote?: string; // If approach was changed due to failure
}

export class AdaptiveExecutionEngine {
  private static instance: AdaptiveExecutionEngine;
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

  static getInstance(): AdaptiveExecutionEngine {
    if (!AdaptiveExecutionEngine.instance) {
      AdaptiveExecutionEngine.instance = new AdaptiveExecutionEngine();
    }
    return AdaptiveExecutionEngine.instance;
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
        console.error('[AdaptiveExecutionEngine] Feedback callback error:', error);
      }
    });
  }

  /**
   * Execute task adaptively with real-time LLM feedback
   */
  async executeAdaptively(context: AdaptiveExecutionContext): Promise<any> {
    console.log('[AdaptiveExecutionEngine] Starting adaptive execution');
    console.log('[AdaptiveExecutionEngine] User goal:', context.userGoal);

    const maxSteps = 100; // Safety limit
    let stepNumber = 0;
    let goalAchieved = false;

    // Initial message to LLM
    this.chatOrchestrator.addMessage('assistant', 
      `Starting adaptive execution for: "${context.userGoal}"\n\nI will execute one step at a time and verify the results before proceeding.`
    );

    while (stepNumber < maxSteps && !goalAchieved) {
      stepNumber++;

      this.sendFeedback({
        stepId: `adaptive_step_${stepNumber}`,
        status: 'analyzing',
        message: `Analyzing current state and deciding next action...`,
        progress: (stepNumber / maxSteps) * 100,
        timestamp: Date.now(),
      });

      // 1. Get current browser state
      const browserState = await this.captureBrowserState();
      console.log('[AdaptiveExecutionEngine] Browser state:', browserState);
      console.log('[AdaptiveExecutionEngine] Context:', context);
      // 2. Ask LLM what to do next based on current state
      const nextStep = await this.askLLMForNextStep(context, browserState, stepNumber);
      console.log('[AdaptiveExecutionEngine] Next step:', nextStep);
      if (!nextStep.shouldContinue) {
        console.log('[AdaptiveExecutionEngine] LLM decided to stop:', nextStep.reasoning);
        goalAchieved = true;
        break;
      }

      // 3. Execute the step
      this.sendFeedback({
        stepId: `adaptive_step_${stepNumber}`,
        status: 'running',
        message: `Executing: ${nextStep.reasoning}`,
        progress: (stepNumber / maxSteps) * 100,
        timestamp: Date.now(),
      });

      const executionResult = await this.executeStep(nextStep);
      console.log('[AdaptiveExecutionEngine] Execution result:', executionResult);

      // 4. Capture result and browser state after execution
      await this.sleep(1000); // Wait for any async updates
      const afterState = await this.captureBrowserState();
      console.log('[AdaptiveExecutionEngine] After state:', afterState);

      // 5. Record in history
      const historyEntry: ExecutionHistoryEntry = {
        stepNumber,
        action: nextStep.action,
        target: nextStep.target,
        value: nextStep.value,
        reasoning: nextStep.reasoning,
        result: executionResult.success ? 'success' : 'failure',
        actualOutcome: executionResult.message || executionResult.error || 'Unknown',
        browserState: {
          url: afterState.url,
          title: afterState.title,
          visibleElements: afterState.domSnapshot.interactiveElements
            .slice(0, 10)
            .map((el: any) => el.semanticLabel),
          errors: executionResult.success ? undefined : [executionResult.error || 'Unknown error'],
        },
        timestamp: Date.now(),
      };

      context.executionHistory.push(historyEntry);

      // 6. Send feedback
      if (executionResult.success) {
        this.sendFeedback({
          stepId: `adaptive_step_${stepNumber}`,
          status: 'completed',
          message: `✓ ${nextStep.reasoning}`,
          progress: (stepNumber / maxSteps) * 100,
          timestamp: Date.now(),
        });

        this.chatOrchestrator.addMessage('assistant',
          `**Step ${stepNumber}:** ${nextStep.reasoning}\n✓ Success: ${executionResult.message}`
        );
      } else {
        this.sendFeedback({
          stepId: `adaptive_step_${stepNumber}`,
          status: 'failed',
          message: `✗ ${executionResult.error}`,
          progress: (stepNumber / maxSteps) * 100,
          timestamp: Date.now(),
        });

        this.chatOrchestrator.addMessage('assistant',
          `**Step ${stepNumber}:** ${nextStep.reasoning}\n✗ Failed: ${executionResult.error}\n\nAnalyzing failure and adapting approach...`
        );
      }

      // 7. Check if goal is achieved (ask LLM)
      const goalCheck = await this.checkGoalAchievement(context, afterState);
      if (goalCheck.achieved) {
        goalAchieved = true;
        this.chatOrchestrator.addMessage('assistant',
          `🎉 Goal achieved!\n\n${goalCheck.explanation}`
        );
      }

      // Small delay between steps
      await this.sleep(500);
    }

    if (stepNumber >= maxSteps) {
      this.chatOrchestrator.addMessage('assistant',
        `⚠️ Reached maximum step limit (${maxSteps}). Stopping execution.`
      );
    }

    return {
      success: goalAchieved,
      stepsExecuted: stepNumber,
      executionHistory: context.executionHistory,
    };
  }

  /**
   * Capture current browser state with downsampling and screenshot
   */
  private async captureBrowserState(): Promise<any> {
    if (!this.webview) {
      throw new Error('Webview not set');
    }

    const url = this.webview.getURL();
    const title = this.webview.getTitle ? this.webview.getTitle() : '';

    // Wait for page to be ready
    await this.spaDetector.waitForReady({ timeout: 5000 });

    // Extract full DOM
    const domSnapshot = await this.domExtractor.extractFilteredDOM(this.webview);

    // Get ready state
    const readyState = await this.spaDetector.getReadyState();

    // Capture screenshot for visual context
    // let screenshot = null;
    // try {
    //   screenshot = await this.screenshotCapture.captureScreenshot({
    //     maxWidth: 1280,
    //     maxHeight: 1024,
    //     quality: 0.7,
    //   });
    //   console.log(`[AdaptiveExecutionEngine] Screenshot captured: ${screenshot.width}x${screenshot.height}, ${Math.round(screenshot.fileSize / 1024)}KB`);
    // } catch (error) {
    //   console.warn('[AdaptiveExecutionEngine] Failed to capture screenshot:', error);
    // }

    return {
      url,
      title,
      domSnapshot,
      readyState,
      // screenshot,
    };
  }

  /**
   * Ask LLM what to do next based on current state (with multi-modal support)
   */
  private async askLLMForNextStep(
    context: AdaptiveExecutionContext,
    browserState: any,
    stepNumber: number
  ): Promise<NextStepDecision> {
    // Build prompt with downsampling
    const promptData = await this.buildNextStepPrompt(context, browserState, stepNumber);

    // Call LLM
    const apiKey = localStorage.getItem('anthropic_api_key');
    if (!apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    // Build messages with multi-modal content
    const messages: any[] = [];

    // Add system prompt
    const systemPrompt = this.buildAdaptiveSystemPrompt();

    // Add conversation history (last 5 messages to save context)
    const history = this.chatOrchestrator.getConversationHistory().slice(-5);
    history.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });

    // Add current prompt with screenshot
    const currentContent: any[] = [
      {
        type: 'text',
        text: promptData.text,
      },
    ];

    messages.push({
      role: 'user',
      content: currentContent,
    });

    const llmRequest = {
      provider: 'anthropic',
      apiKey,
      systemPrompt,
      messages,
      maxTokens: 2000,
      temperature: 0.1,
    };

    console.log('[AdaptiveExecutionEngine] LLM request:', llmRequest);

    const response = await (window as any).electronAPI.ipcInvoke('call-llm', llmRequest);

    console.log('[AdaptiveExecutionEngine] LLM response:', response);

    if (!response.success) {
      throw new Error(response.error || 'LLM call failed');
    }

    // Parse LLM response
    return this.parseNextStepDecision(response.response);
  }

  /**
   * Build system prompt for adaptive execution
   */
  private buildAdaptiveSystemPrompt(): string {
    return `You are an expert browser automation assistant with real-time execution capabilities.

## Your Role
You execute browser automation tasks ONE STEP AT A TIME, verifying results after each action and adapting your approach based on what actually happens.

## How You Work
1. **Analyze Current State**: You receive the current browser state (URL, visible elements, etc.)
2. **Decide Next Action**: Based on the goal and current state, you decide the next single action
3. **Execute & Verify**: The action is executed, and you see the actual result
4. **Adapt if Needed**: If something fails or is unexpected, you adjust your approach
5. **Repeat**: Continue until the goal is achieved

## Key Principles
- **One Step at a Time**: Never plan multiple steps ahead. Focus on the immediate next action.
- **Verify Everything**: After each action, check if it succeeded as expected
- **Adapt to Reality**: If the page looks different than expected, adapt your selectors/approach
- **Handle Failures**: If an action fails, try alternative approaches (different selectors, different actions)
- **Be Resilient**: UI changes, slow loading, dynamic content - handle them all

## Response Format
You must respond with a JSON object:
\`\`\`json
{
  "shouldContinue": true/false,
  "action": "navigate|click|type|wait|wait_for_element|keypress",
  "target": "selector or URL",
  "value": "optional value for type/keypress actions",
  "reasoning": "Why you're taking this action",
  "adaptationNote": "Optional: If you're adapting due to a failure, explain what you changed"
}
\`\`\`

## Action Types
- **navigate**: Go to a URL
- **click**: Click an element
- **type**: Type text into an input
- **wait**: Wait for milliseconds
- **wait_for_element**: Wait for element to appear
- **keypress**: Press a keyboard key (e.g., "Enter")

## When to Stop
Set \`shouldContinue: false\` when:
- The goal is clearly achieved
- You've verified the expected outcome
- Further actions would be redundant

## Handling Failures
If a previous step failed:
1. Analyze why it failed (element not found? Wrong selector? Page not ready?)
2. Try an alternative approach (different selector, wait first, etc.)
3. Explain your adaptation in \`adaptationNote\`

Remember: You're in direct sync with the browser. You see exactly what's happening in real-time.`;
  }

  /**
   * Build prompt for next step decision with downsampling
   */
  private async buildNextStepPrompt(
    context: AdaptiveExecutionContext,
    browserState: any,
    stepNumber: number
  ): Promise<{ text: string; screenshot?: any }> {
    // Downsample DOM elements
    const downsampledDOM = await this.domDownsampler.downsample(
      browserState.domSnapshot.interactiveElements,
      context.userGoal,
      80 // Max 80 elements
    );

    console.log(`[AdaptiveExecutionEngine] DOM downsampled: ${downsampledDOM.summary.originalCount} → ${downsampledDOM.summary.downsampledCount} elements (${downsampledDOM.summary.compressionRatio}% compression)`);

    // Generate compressed DOM description
    const compressedDOM = this.domDownsampler.generateCompressedPrompt(downsampledDOM);

    let prompt = `## Current Situation

**Step Number:** ${stepNumber}
**User Goal:** ${context.userGoal}
**Current URL:** ${browserState.url}
**Page Title:** ${browserState.title}
**Page Ready:** ${browserState.readyState.isReady ? 'Yes' : 'No'}

${compressedDOM}

`;

    // Add execution history (last 3 steps only)
    if (context.executionHistory.length > 0) {
      prompt += `## Recent Actions\n\n`;
      context.executionHistory.slice(-3).forEach((entry) => {
        const status = entry.result === 'success' ? '✓' : '✗';
        prompt += `**Step ${entry.stepNumber}** ${status}: ${entry.reasoning}\n`;
        prompt += `  Action: ${entry.action} on "${entry.target}"\n`;
        prompt += `  Result: ${entry.actualOutcome}\n`;
        if (entry.browserState.errors) {
          prompt += `  Errors: ${entry.browserState.errors.join(', ')}\n`;
        }
        prompt += `\n`;
      });
    }

    prompt += `## Your Task

Based on the current browser state (see screenshot for visual context) and execution history, decide the NEXT SINGLE ACTION to take.

**Important:**
- Use the element selectors provided in the compressed DOM above
- If previous step failed, try alternative selectors or approaches
- If goal is achieved, set shouldContinue to false

Respond with JSON only.`;

    return {
      text: prompt,
      screenshot: browserState.screenshot,
    };
  }

  /**
   * Parse LLM response into next step decision
   */
  private parseNextStepDecision(llmResponse: string): NextStepDecision {
    try {
      // Extract JSON from response
      let jsonString = llmResponse;

      // Remove markdown code blocks if present
      const codeBlockMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonString = codeBlockMatch[1];
      }

      // Find JSON object
      const objectStart = jsonString.indexOf('{');
      const objectEnd = jsonString.lastIndexOf('}');

      if (objectStart === -1 || objectEnd === -1) {
        throw new Error('No JSON object found in response');
      }

      jsonString = jsonString.substring(objectStart, objectEnd + 1);

      // Parse JSON
      const decision = JSON.parse(jsonString);

      return {
        shouldContinue: decision.shouldContinue !== false,
        action: decision.action || 'wait',
        target: decision.target || '',
        value: decision.value,
        reasoning: decision.reasoning || 'No reasoning provided',
        adaptationNote: decision.adaptationNote,
      };
    } catch (error) {
      console.error('[AdaptiveExecutionEngine] Failed to parse LLM response:', error);
      console.error('[AdaptiveExecutionEngine] Raw response:', llmResponse);
      throw new Error('Failed to parse next step decision from LLM');
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: NextStepDecision): Promise<any> {
    if (!this.webview) {
      throw new Error('Webview not set');
    }

    console.log(`[AdaptiveExecutionEngine] Executing: ${step.action} - ${step.reasoning}`);

    try {
      const action = step.action.toLowerCase();

      switch (action) {
        case 'navigate':
          return await this.executeNavigate(step);
        case 'click':
          return await this.executeClick(step);
        case 'type':
          return await this.executeType(step);
        case 'wait':
          return await this.executeWait(step);
        case 'wait_for_element':
          return await this.executeWaitForElement(step);
        case 'keypress':
          return await this.executeKeypress(step);
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

  private async executeNavigate(step: NextStepDecision): Promise<any> {
    const url = step.target || step.value;
    if (!url) {
      throw new Error('No URL provided for navigation');
    }

    this.webview.src = url;
    const success = await this.spaDetector.waitForNavigation(30000);

    if (!success) {
      throw new Error('Navigation timeout');
    }

    await this.spaDetector.waitForReady();

    return {
      success: true,
      message: `Navigated to ${url}`,
    };
  }

  private async executeClick(step: NextStepDecision): Promise<any> {
    // First, try to find the element with multiple strategies
    const findScript = `
      (function() {
        const selector = '${step.target.replace(/'/g, "\\'")}';
        
        // Strategy 1: Direct querySelector
        let element = document.querySelector(selector);
        
        // Strategy 2: Try finding by text content if selector fails
        if (!element) {
          const allElements = document.querySelectorAll('a, button, [role="button"], [onclick]');
          const searchText = selector.toLowerCase();
          for (const el of allElements) {
            const text = el.textContent?.toLowerCase() || '';
            const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
            if (text.includes(searchText) || ariaLabel.includes(searchText)) {
              element = el;
              break;
            }
          }
        }
        
        // Strategy 3: Try finding by partial attribute match
        if (!element) {
          const allClickable = document.querySelectorAll('a, button, [role="button"]');
          for (const el of allClickable) {
            const href = el.getAttribute('href') || '';
            const id = el.getAttribute('id') || '';
            const className = el.getAttribute('class') || '';
            if (href.includes(selector) || id.includes(selector) || className.includes(selector)) {
              element = el;
              break;
            }
          }
        }
        
        if (!element) {
          // Return available clickable elements for debugging
          const clickable = Array.from(document.querySelectorAll('a, button, [role="button"]'))
            .slice(0, 10)
            .map(el => ({
              tag: el.tagName,
              text: el.textContent?.substring(0, 50),
              href: el.getAttribute('href'),
              id: el.getAttribute('id'),
              class: el.getAttribute('class')
            }));
          return { 
            success: false, 
            error: 'Element not found: ' + selector,
            availableElements: clickable
          };
        }
        
        // Found element, click it
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Wait a bit for scroll
        return new Promise((resolve) => {
          setTimeout(() => {
            element.click();
            resolve({ success: true, message: 'Element clicked successfully' });
          }, 300);
        });
      })();
    `;

    const result = await this.webview.executeJavaScript(findScript);
    
    if (!result.success && result.availableElements) {
      console.log('[AdaptiveExecutionEngine] Available clickable elements:', result.availableElements);
    }
    
    await this.sleep(500);
    await this.spaDetector.waitForReady({ timeout: 5000 });

    return result;
  }

  private async executeType(step: NextStepDecision): Promise<any> {
    const text = step.value as string;
    if (!text) {
      throw new Error('No text provided for type action');
    }

    const script = `
      (function() {
        const selector = '${step.target.replace(/'/g, "\\'")}';
        const text = '${text.replace(/'/g, "\\'")}';
        
        // Try multiple strategies to find input element
        let element = document.querySelector(selector);
        
        // Strategy 2: Find by placeholder or name
        if (!element) {
          const inputs = document.querySelectorAll('input, textarea');
          for (const input of inputs) {
            const placeholder = input.getAttribute('placeholder')?.toLowerCase() || '';
            const name = input.getAttribute('name')?.toLowerCase() || '';
            const id = input.getAttribute('id')?.toLowerCase() || '';
            const searchTerm = selector.toLowerCase();
            
            if (placeholder.includes(searchTerm) || name.includes(searchTerm) || id.includes(searchTerm)) {
              element = input;
              break;
            }
          }
        }
        
        if (!element) {
          const availableInputs = Array.from(document.querySelectorAll('input, textarea'))
            .slice(0, 5)
            .map(el => ({
              tag: el.tagName,
              type: el.getAttribute('type'),
              placeholder: el.getAttribute('placeholder'),
              name: el.getAttribute('name'),
              id: el.getAttribute('id')
            }));
          return { 
            success: false, 
            error: 'Input element not found: ' + selector,
            availableInputs
          };
        }
        
        // Clear existing value first
        element.value = '';
        element.focus();
        
        // Type character by character for better compatibility
        for (let i = 0; i < text.length; i++) {
          element.value += text[i];
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
        
        return { success: true, message: 'Text typed: ' + text };
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    
    if (!result.success && result.availableInputs) {
      console.log('[AdaptiveExecutionEngine] Available input elements:', result.availableInputs);
    }
    
    await this.sleep(300);
    return result;
  }

  private async executeWait(step: NextStepDecision): Promise<any> {
    const ms = parseInt(step.value as string) || 1000;
    await this.sleep(ms);
    return { success: true, message: `Waited ${ms}ms` };
  }

  private async executeWaitForElement(step: NextStepDecision): Promise<any> {
    const timeout = parseInt(step.value as string) || 10000;
    const startTime = Date.now();
    const checkInterval = 200;
    
    while (Date.now() - startTime < timeout) {
      const checkScript = `
        (function() {
          const selector = '${step.target.replace(/'/g, "\\'")}';
          const element = document.querySelector(selector);
          return element !== null;
        })();
      `;
      
      const found = await this.webview.executeJavaScript(checkScript);
      
      if (found) {
        return { success: true, message: `Element appeared: ${step.target}` };
      }
      
      await this.sleep(checkInterval);
    }

    throw new Error(`Element not found within ${timeout}ms: ${step.target}`);
  }

  private async executeKeypress(step: NextStepDecision): Promise<any> {
    const key = step.value as string || 'Enter';

    const script = `
      (function() {
        const key = '${key}';
        const element = document.activeElement || document.body;
        
        element.dispatchEvent(new KeyboardEvent('keydown', {
          key: key,
          bubbles: true,
          cancelable: true
        }));
        
        element.dispatchEvent(new KeyboardEvent('keyup', {
          key: key,
          bubbles: true,
          cancelable: true
        }));
        
        return { success: true, message: 'Key pressed: ' + key };
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    await this.sleep(300);

    return result;
  }

  /**
   * Check if goal is achieved
   */
  private async checkGoalAchievement(
    context: AdaptiveExecutionContext,
    browserState: any
  ): Promise<{ achieved: boolean; explanation: string }> {
    const prompt = `## Goal Achievement Check

**User Goal:** ${context.userGoal}
**Current URL:** ${browserState.url}
**Page Title:** ${browserState.title}
**Steps Executed:** ${context.executionHistory.length}

**Last 3 Actions:**
${context.executionHistory.slice(-3).map(e => 
  `- ${e.reasoning} (${e.result})`
).join('\n')}

**Current Page Elements:**
${browserState.domSnapshot.interactiveElements.slice(0, 10).map((el: any) => 
  `- ${el.semanticLabel}`
).join('\n')}

Based on the above, has the user's goal been achieved?

Respond with JSON:
\`\`\`json
{
  "achieved": true/false,
  "explanation": "Brief explanation of why the goal is/isn't achieved"
}
\`\`\``;

    const apiKey = localStorage.getItem('anthropic_api_key');
    if (!apiKey) {
      return { achieved: false, explanation: 'Cannot verify - API key missing' };
    }

    const llmRequest = {
      provider: 'anthropic',
      apiKey,
      systemPrompt: 'You are a goal achievement verifier. Determine if the user\'s goal has been achieved based on the current browser state.',
      prompt,
      maxTokens: 500,
      temperature: 0.1,
    };

    try {
      const response = await (window as any).electronAPI.ipcInvoke('call-llm', llmRequest);

      if (!response.success) {
        return { achieved: false, explanation: 'Cannot verify - LLM call failed' };
      }

      // Parse response
      const jsonMatch = response.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          achieved: result.achieved === true,
          explanation: result.explanation || 'No explanation provided',
        };
      }

      return { achieved: false, explanation: 'Cannot parse verification response' };
    } catch (error) {
      console.error('[AdaptiveExecutionEngine] Goal check error:', error);
      return { achieved: false, explanation: 'Error checking goal achievement' };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
