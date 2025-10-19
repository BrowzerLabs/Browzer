import { CDPPage } from './CDPPage';
import { DoTask, DoStep, DoResult, PageState, MAX_STEPS, ACTION_SCHEMA } from '../../shared';
import { buildPrompt } from '../../shared';
import { cleanSelector, wait } from '../../shared';
import { BrowserView, WebContentsView } from 'electron';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import fs from 'fs';

// Development flag (set via environment variable or config)
const DOAGENT_ENABLED = true;

export class DoAgent {
  private isExecuting = false;
  private currentTask: DoTask | null = null;
  private browserView: BrowserView | WebContentsView | null = null;
  private cdpPage: CDPPage | null = null;
  private stepCount = 0;
  private onProgress?: (task: DoTask, step: DoStep) => void;

  constructor(onProgress?: (task: DoTask, step: DoStep) => void) {
    this.onProgress = onProgress;
  }

  async executeTask(instruction: string, browserView: BrowserView | WebContentsView): Promise<DoResult> {
    if (!DOAGENT_ENABLED) {
      console.log('[DoAgent] DoAgent is disabled');
      return { success: false, error: 'DoAgent is disabled', executionTime: 0 };
    }
    if (this.isExecuting) {
      console.error('[DoAgent] Agent is already executing');
      throw new Error('Agent is already executing');
    }
    this.isExecuting = true;
    this.browserView = browserView;
    const startTime = Date.now();
    this.currentTask = { id: `task-${Date.now()}`, instruction, steps: [], status: 'running' };

    try {
      await this.initializeCDP();
      let isTaskComplete: boolean = false;
      let finalResult: any = null;
      this.stepCount = 0;

      while (!isTaskComplete && this.stepCount < MAX_STEPS) {
        console.log(`[DoAgent] Executing step ${this.stepCount + 1}/${MAX_STEPS}`);
        this.stepCount++;
        const pageState = await this.analyzePageState();
        const nextAction = await this.getNextActionFromLLM(this.currentTask.instruction, pageState, this.currentTask.steps);
        console.log('[DoAgent] Next action:', JSON.stringify(nextAction, null, 2));

        const step: DoStep = {
          id: `step-${this.stepCount}`,
          action: nextAction.action,
          target: nextAction.target,
          value: nextAction.value,
          selector: nextAction.selector,
          description: nextAction.description,
          reasoning: nextAction.reasoning,
          status: 'running',
          options: nextAction.options,
        };

        this.currentTask.steps.push(step);
        if (this.onProgress) {
          console.log(`[DoAgent] Step: ${step.action} - ${step.description}`);
          this.onProgress(this.currentTask, step);
        }

        if (nextAction.action === 'complete') {
          isTaskComplete = true;
          finalResult = nextAction.result;
          step.status = 'completed';
          step.result = nextAction.result;
          console.log('[DoAgent] Task completed with result:', finalResult);
          break;
        }

        const stepSuccess = await this.executeStep(step);
        if (stepSuccess) {
          step.status = 'completed';
          console.log(`[DoAgent] Step completed: ${step.action}`);
        } else {
          step.status = 'failed';
          console.log(`[DoAgent] Step failed: ${step.action} - ${step.error}`);
          console.log(`[DoAgent] Continuing execution despite step failure...`);
        }
        await wait(1000); // Small delay between steps
      }

      if (this.stepCount >= MAX_STEPS) {
        this.currentTask.status = 'failed';
        this.currentTask.error = 'Maximum number of steps reached';
        console.log('[DoAgent] Failed: Maximum steps reached');
      } else if (!this.currentTask.error) {
        this.currentTask.status = 'completed';
        this.currentTask.result = finalResult;
      }

      const executionTime = Date.now() - startTime;
      return {
        success: this.currentTask.status === 'completed',
        data: this.currentTask.result,
        error: this.currentTask.error,
        executionTime,
      };
    } catch (error) {
      console.error('[DoAgent] Task execution failed:', error);
      this.currentTask.status = 'failed';
      this.currentTask.error = error.message;
      const executionTime = Date.now() - startTime;
      return { success: false, error: error.message, executionTime };
    } finally {
      await this.cdpPage?.detach();
      this.isExecuting = false;
      this.currentTask = null;
      this.browserView = null;
      this.stepCount = 0;
      this.cdpPage = null;
      console.log('[DoAgent] Cleaned up resources');
    }
  }

  private async initializeCDP(): Promise<void> {
    if (!this.browserView) throw new Error('Browser view not available');
    this.cdpPage = new CDPPage(this.browserView);
    await this.cdpPage.attach();
    await this.cdpPage.evaluate(`navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';`);
    console.log('[DoAgent] CDP initialized');
  }

  private async analyzePageState(): Promise<PageState> {
    await this.cdpPage!.waitForTimeout(2000); // Initial delay
    await this.cdpPage!.waitForDynamicContent({ timeout: 5000 }); // Dynamic content

    const script = `
      (function() {
        try {
          // Generic selector for all interactive elements
          const selector = 'a, button, input:not([type="hidden"]), select, textarea, [role="button"], [role="textbox"], [role="combobox"], [aria-haspopup="true"], [tabindex]:not([tabindex="-1"])';
          
          // Query all interactive elements
          let allElements = Array.from(document.querySelectorAll(selector));
          
          // Dedupe and limit to 50 elements
          const uniqueElements = allElements.filter((el, index, self) => 
            index === self.findIndex(e => e === el)
          ).slice(0, 50);

          // Add visual border to interactive elements for debugging
          uniqueElements.forEach(el => {
            el.style.border = '2px solid red';
            el.style.boxSizing = 'border-box'; // Prevent layout shift
          });
          
          function generateSelectors(el) {
            const selectors = [];
            if (el.id) selectors.push(\`#\${el.id}\`);
            if (el.className && typeof el.className === 'string') {
              const classes = el.className.split(' ').filter(c => c.trim()).slice(0, 2);
              if (classes.length) selectors.push(\`.\${classes.join('.')}\`);
            }
            if (el.getAttribute('data-testid')) selectors.push(\`[data-testid="\${el.getAttribute('data-testid')}"]\`);
            if (el.getAttribute('aria-label')) selectors.push(\`[aria-label="\${el.getAttribute('aria-label')}"]\`);
            if (el.getAttribute('name')) selectors.push(\`[name="\${el.getAttribute('name')}"]\`);
            if (el.getAttribute('type')) selectors.push(\`\${el.tagName.toLowerCase()}[type="\${el.getAttribute('type')}"]\`);
            
            const text = (el.textContent || el.value || '').trim();
            if (text && text.length < 30) selectors.push(\`\${el.tagName.toLowerCase()}[text*="\${text.substring(0, 20)}"]\`);
            
            const siblings = Array.from(el.parentElement?.children || []).filter(child => child.tagName === el.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(el) + 1;
              selectors.push(\`\${el.tagName.toLowerCase()}:nth-of-type(\${index})\`);
            }
            
            return selectors.length ? selectors : [el.tagName.toLowerCase()];
          }

          const elements = uniqueElements.map((el, index) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const text = (el.textContent || el.value || '').trim().substring(0, 100);
            const ariaLabel = el.getAttribute('aria-label') || '';
            const role = el.getAttribute('role') || '';
            const name = el.getAttribute('name') || '';
            const id = el.id || '';
            const className = el.className || '';
            
            const hasDropdown = el.tagName === 'SELECT' || el.getAttribute('aria-haspopup') === 'true';
            const isDateInput = el.type === 'date' || el.type === 'datetime-local';
            const isSearchInput = el.placeholder?.toLowerCase().includes('search');
            const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth;
            const options = el.tagName === 'SELECT' ? Array.from(el.options).map(opt => (opt.textContent || opt.value || '').trim()) : [];
            const parentText = el.parentElement ? el.parentElement.textContent?.trim().substring(0, 50) : '';

            return {
              index,
              tag: el.tagName.toLowerCase(),
              text,
              selector: generateSelectors(el).join(', '),
              type: el.type || '',
              placeholder: el.placeholder || '',
              value: el.value || '',
              ariaLabel,
              ariaRole: role,
              className,
              name,
              id,
              hasDropdown,
              isDateInput,
              isSearchInput,
              isInViewport,
              options: options.slice(0, 5),
              parentText,
              visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
              enabled: !el.disabled,
              clickable: el.tagName.toLowerCase() === 'button' || el.tagName.toLowerCase() === 'a' || role === 'button' || el.onclick,
            };
          }).filter(el => el.visible);

          // Detect times (e.g., "12:30 PM", "3h 45m")
          const timeRegex = /\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?\\b|\\d+h\\s*\\d+m\\b/g;
          const visibleText = document.body ? document.body.innerText.trim().substring(0, 2000) : '';
          
          return {
            url: window.location.href || 'about:blank',
            title: document.title || '',
            dom: document.documentElement ? document.documentElement.outerHTML.substring(0, 20000) : '',
            visibleText: visibleText,
            interactiveElements: elements,
            detectedPatterns: {
              prices: (document.body.innerText || '').match(/\\$\\d+[,.]?\\d*/g) || [],
              times: visibleText.match(timeRegex) || [],
              hasContent: !!visibleText,
              contentLength: visibleText.length,
            },
          };
        } catch (error) {
          console.error('Element extraction error:', error);
          return {
            url: window.location.href || 'about:blank',
            title: '',
            dom: '',
            rawHTML: '',
            visibleText: '',
            interactiveElements: [],
            detectedPatterns: { prices: [], times: [], hasContent: false, contentLength: 0 },
          };
        }
      })();
    `;

    try {
      const result = await this.cdpPage!.evaluate(script);
      console.log('[DoAgent] Extracted elements:', result.interactiveElements.length);
      return { ...result, screenshot: null };
    } catch (error) {
      console.error('[DoAgent] Page state analysis failed:', error);
      return {
        url: await this.cdpPage!.url() || 'about:blank',
        title: '',
        dom: '',
        rawHTML: '',
        visibleText: '',
        interactiveElements: [],
        screenshot: null,
        detectedPatterns: { prices: [], times: [], hasContent: false, contentLength: 0 },
      };
    }
  }

  private async callLLM(prompt: string, schema: z.ZodSchema): Promise<any> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    try {
      const response = await generateObject({
        model: anthropic('claude-sonnet-4-5-20250929'),
        schema,
        prompt,
      });
      return response.object;
    } catch (error) {
      console.error('[DoAgent] LLM call error:');
      throw error;
    }
  }

  private async getNextActionFromLLM(instruction: string, pageState: PageState, previousSteps: DoStep[]): Promise<z.infer<typeof ACTION_SCHEMA>> {
    const prompt = buildPrompt(instruction, pageState, previousSteps);
    fs.writeFileSync('prompt.txt', JSON.stringify({ prompt, pageState }, null, 2));
    try {
      const action = await this.callLLM(prompt, ACTION_SCHEMA);
      if (previousSteps.filter(s => s.action === 'extract').length > 3) {
        console.log('[DoAgent] Detected excessive extract actions, completing task');
        return {
          action: 'complete',
          result: 'Terminated due to excessive extractions',
          description: 'Completing task to avoid loop',
          reasoning: 'Detected repeated extract actions',
        };
      }
      if (previousSteps.filter(s => s.action === 'keypress' && s.options?.key === 'Enter').length > 3) {
        console.log('[DoAgent] Detected excessive Enter keypresses, completing task');
        return {
          action: 'complete',
          result: 'Terminated due to excessive Enter keypresses',
          description: 'Completing task to avoid loop',
          reasoning: 'Detected repeated Enter keypresses',
        };
      }
      return action;
    } catch (error) {
      console.error('[DoAgent] LLM call failed:');
      return {
        action: 'wait',
        description: 'Waiting due to LLM failure',
        reasoning: `LLM call failed: ${error.message}`,
        options: { timeout: 1000 },
      };
    }
  }

  private async executeStep(step: DoStep): Promise<boolean> {
    try {
      if (step.options?.delay) await wait(step.options.delay);

      switch (step.action) {
        case 'navigate':
          if (!step.target) throw new Error('Navigate requires a target URL');
          console.log(`[DoAgent] Navigating to ${step.target}`);
          try {
            await Promise.race([
              this.cdpPage!.goto(step.target),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Navigation timeout')), step.options?.timeout || 30000)),
            ]);
          } catch (error) {
            console.warn(`[DoAgent] Navigation warning: ${error.message}, checking if page loaded`);
            const currentUrl = await this.cdpPage!.url();
            if (currentUrl.includes('mail.google.com') || currentUrl.includes('accounts.google.com')) {
              console.log(`[DoAgent] Navigation succeeded despite timeout, current URL: ${currentUrl}`);
            } else {
              throw error;
            }
          }
          break;
        case 'click':
          await this.cdpPage!.click(cleanSelector(step.selector!), step.options);
          break;
        case 'press_enter':
          await this.cdpPage!.press_enter();
          // Wait for dynamic content to load after pressing enter (e.g., search results)
          await this.cdpPage!.waitForDynamicContent({ timeout: 3000 });
          break;
        case 'fill':
          await this.cdpPage!.fill(cleanSelector(step.selector!), step.value!);
          break;
        case 'type':
          await this.cdpPage!.type(cleanSelector(step.selector!), step.value!, step.options);
          break;
        case 'wait':
          await this.cdpPage!.waitForTimeout(step.value ? parseInt(step.value) : 1000);
          break;
        case 'extract':
          step.result = await this.cdpPage!.getDebugInfo();
          break;
        case 'scroll':
          await this.cdpPage!.scroll(step.selector);
          break;
        case 'select_dropdown':
          await this.cdpPage!.selectOption(cleanSelector(step.selector!), step.value!);
          break;
        case 'wait_for_element':
          await this.cdpPage!.waitForSelector(cleanSelector(step.value!), step.options);
          break;
        case 'wait_for_dynamic_content':
          await this.cdpPage!.waitForDynamicContent(step.options);
          break;
        case 'clear':
          await this.cdpPage!.clear(cleanSelector(step.selector!));
          break;
        case 'focus':
          await this.cdpPage!.focus(cleanSelector(step.selector!));
          break;
        case 'hover':
          await this.cdpPage!.hover(cleanSelector(step.selector!));
          break;
        case 'keypress':
          await this.cdpPage!.keyboard.press(step.options?.key || step.value!);
          break;
        case 'check':
          await this.cdpPage!.check(cleanSelector(step.selector!));
          break;
        case 'uncheck':
          await this.cdpPage!.uncheck(cleanSelector(step.selector!));
          break;
        case 'double_click':
          await this.cdpPage!.doubleClick(cleanSelector(step.selector!), step.options);
          break;
        case 'right_click':
          await this.cdpPage!.rightClick(cleanSelector(step.selector!), step.options);
          break;
        case 'evaluate':
          step.result = await this.cdpPage!.evaluate(step.value!);
          break;
        case 'screenshot':
          step.result = (await this.cdpPage!.screenshot(step.options)).toString('base64');
          break;
        default:
          throw new Error(`Unknown action: ${step.action}`);
      }
      
      if (step.options?.waitAfter) await wait(Number(step.options.waitAfter));
      if (this.onProgress) this.onProgress(this.currentTask!, step);
      
      return true; // Success
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      console.error(`[DoAgent] Step failed: ${step.action} - ${error.message}`);
      
      if (this.onProgress) this.onProgress(this.currentTask!, step);
      
      return false;
    }
  }
}