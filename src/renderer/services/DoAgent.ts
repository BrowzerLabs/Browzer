import { TaskParser } from '../utils/taskParser';
import { PromptBuilder, PageState, TaskContext } from './PromptBuilder';
import { ElementDetector } from './ElementDetector';
import { ResponseParser } from './ResponseParser';
import { DoAgentConfigManager } from './DoAgentConfig';

export interface DoTask {
  id: string;
  instruction: string;
  steps: any[];
  status: 'running' | 'completed' | 'failed';
}

export interface DoResult {
  success: boolean;
  steps: any[];
  extractedContent?: any;
  error?: string;
  executionTime: number;
}

export interface DoStep {
  id: string;
  action: string;
  target?: string;
  value?: string;
  selector?: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  timestamp?: number;
  reasoning?: string;
}

export class DoAgent {
  private currentTask: DoTask | null = null;
  private isExecuting = false;
  public webview: any = null;
  private stepCount = 0;
  private progressCallback?: (message: string) => void;
  private config: DoAgentConfigManager;

  constructor(progressCallback?: (message: string) => void, config?: DoAgentConfigManager) {
    this.progressCallback = progressCallback;
    this.config = config || new DoAgentConfigManager();
  }

  async executeTask(instruction: string, webview: any): Promise<DoResult> {
    if (this.isExecuting) {
      throw new Error('DoAgent is already executing a task');
    }

    this.isExecuting = true;
    this.webview = webview;
    this.stepCount = 0;

    try {
      const task: DoTask = {
        id: `task-${Date.now()}`,
        instruction,
        steps: [],
        status: 'running'
      };

      this.currentTask = task;
      
      const result = await this.executeTaskWithSmartEngine(task, instruction);
      
      return result;
    } catch (error) {
      console.error('[DoAgent] Task execution failed:', error);
      return {
        success: false,
        steps: this.currentTask?.steps || [],
        error: (error as Error).message,
        executionTime: 0
      };
    } finally {
      this.cleanup();
    }
  }

  private cleanup(): void {
    this.isExecuting = false;
    this.webview = null;
    this.currentTask = null;
    this.stepCount = 0;
  }

  async analyzePageState(): Promise<PageState> {
    if (!this.webview) {
      throw new Error('No webview available');
    }

    try {
      const script = `
        (function() {
          const INTERACTIVE_TAGS = ['a', 'button', 'input', 'select', 'textarea', 'form', 'label'];
          const CLICKABLE_ROLES = ['button', 'link', 'menuitem', 'tab', 'option'];
          
          function isInteractiveElement(element) {
            const tagName = element.tagName.toLowerCase();
            const role = element.getAttribute('role');
            const onclick = element.getAttribute('onclick');
            const cursor = window.getComputedStyle(element).cursor;

            return (
              INTERACTIVE_TAGS.includes(tagName) ||
              (role && CLICKABLE_ROLES.includes(role)) ||
              onclick !== null ||
              cursor === 'pointer' ||
              element.hasAttribute('data-testid') ||
              element.classList.contains('btn') ||
              element.classList.contains('button') ||
              element.classList.contains('link')
            );
          }
          
          function isElementVisible(element) {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              style.opacity !== '0' &&
              rect.top < window.innerHeight &&
              rect.bottom > 0 &&
              rect.left < window.innerWidth &&
              rect.right > 0
            );
          }
          
          function generateSelector(element) {
            if (element.id) {
              return '#' + element.id;
            }

            const tagName = element.tagName.toLowerCase();
            const className = element.className;
            
            if (className && typeof className === 'string') {
              const classes = className.split(' ').filter(c => c.length > 0);
              if (classes.length > 0) {
                return tagName + '.' + classes[0];
              }
            }

            const parent = element.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children);
              const index = siblings.indexOf(element);
              return generateSelector(parent) + ' > ' + tagName + ':nth-child(' + (index + 1) + ')';
            }

            return tagName;
          }
          
          function detectInteractiveElements() {
            const elements = [];
            const allElements = document.querySelectorAll('*');
            
            for (const element of Array.from(allElements)) {
              if (isInteractiveElement(element) && isElementVisible(element)) {
                const rect = element.getBoundingClientRect();
                elements.push({
                  tag: element.tagName.toLowerCase(),
                  id: element.id || undefined,
                  class: element.className || undefined,
                  text: element.textContent?.trim() || element.getAttribute('aria-label') || element.getAttribute('title') || '',
                  value: element.value || undefined,
                  placeholder: element.placeholder || undefined,
                  href: element.href || undefined,
                  type: element.type || undefined,
                  selector: generateSelector(element),
                  visible: true,
                  interactable: true
                });
              }
            }
            
            return elements.slice(0, 100);
          }
          
          function detectForms() {
            const forms = Array.from(document.querySelectorAll('form'));
            return forms.map(form => ({
              action: form.action,
              method: form.method,
              fields: Array.from(form.querySelectorAll('input, select, textarea')).map(field => ({
                name: field.name,
                type: field.type,
                required: field.hasAttribute('required'),
                placeholder: field.placeholder
              }))
            }));
          }
          
          function detectLinks() {
            const links = Array.from(document.querySelectorAll('a[href]'));
            return links.slice(0, 50).map(link => ({
              href: link.href,
              text: link.textContent?.trim() || '',
              title: link.getAttribute('title') || ''
            }));
          }
          
          function extractVisibleText() {
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode: function(node) {
                  const parent = node.parentElement;
                  if (!parent) return NodeFilter.FILTER_REJECT;
                  
                  const style = window.getComputedStyle(parent);
                  if (style.display === 'none' || style.visibility === 'hidden') {
                    return NodeFilter.FILTER_REJECT;
                  }
                  
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            );

            const textNodes = [];
            let node;
            
            while (node = walker.nextNode()) {
              const text = node.textContent?.trim();
              if (text && text.length > 0) {
                textNodes.push(text);
              }
            }

            return textNodes.join(' ').substring(0, 2000);
          }
          
          const elements = detectInteractiveElements();
          const forms = detectForms();
          const links = detectLinks();
          const text = extractVisibleText();
          
          return {
            url: window.location.href,
            title: document.title,
            elements: elements,
            forms: forms,
            links: links,
            text: text,
            html: document.documentElement.outerHTML.substring(0, 10000)
          };
        })();
      `;

      const result = await this.webview.executeJavaScript(script);
      console.log('[DoAgent] Page state analyzed:', {
        url: result.url,
        title: result.title,
        elementCount: result.elements?.length || 0,
        formCount: result.forms?.length || 0,
        linkCount: result.links?.length || 0
      });
      
      return result;
    } catch (error) {
      console.error('[DoAgent] Failed to analyze page state:', error);
      throw new Error(`Failed to analyze page state: ${(error as Error).message}`);
    }
  }

  async getNextActionFromLLM(instruction: string, pageState: PageState, previousSteps: any[]): Promise<any> {
    const prompt = this.buildPrompt(instruction, pageState, previousSteps);
    
    console.log('[DoAgent] Calling LLM with prompt length:', prompt.length);
    
    try {
      const provider = this.getSelectedProvider();
      const apiKey = provider === 'anthropic' ? 
        process.env.ANTHROPIC_API_KEY || localStorage.getItem('anthropic_api_key') :
        process.env.OPENAI_API_KEY || localStorage.getItem('openai_api_key');

      if (!apiKey) {
        throw new Error(`No API key found for ${provider}`);
      }

      const response = await (window as any).electronAPI.invoke('call-llm', {
        provider,
        apiKey,
        prompt,
        model: provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
        maxTokens: 1000
      });

      if (!response.success) {
        throw new Error(response.error || 'LLM call failed');
      }

      console.log('[DoAgent] LLM Response received');
      return this.parseActionFromResponse(response.response);
    } catch (error) {
      console.error('[DoAgent] LLM call failed:', error);
      throw error;
    }
  }

  buildPrompt(instruction: string, pageState: PageState, previousSteps: any[]): string {
    const promptBuilder = new PromptBuilder(instruction, pageState, previousSteps);
    return promptBuilder.build();
  }

  parseActionFromResponse(response: string): any {
    const parser = new ResponseParser(response);
    return parser.parse();
  }

  getSelectedProvider(): 'anthropic' | 'openai' {
    return 'anthropic';
  }

  async executeStep(action: any): Promise<any> {
    try {
      let result;
      
      switch (action.action) {
        case 'click':
          result = await this.click(action.target);
          break;
        case 'type':
          result = await this.type(action.target, action.value);
          break;
        case 'navigate':
          result = await this.navigate(action.target);
          break;
        case 'scroll':
          result = await this.scroll(action.value || 'down');
          break;
        case 'wait':
          result = await this.wait(parseInt(action.value) || 2000);
          break;
        case 'extract':
          result = await this.extract();
          break;
        default:
          throw new Error(`Unknown action: ${action.action}`);
      }
      
      return result;
    } catch (error) {
      console.error(`[DoAgent] Failed to execute ${action.action}:`, error);
      throw error;
    }
  }

  async navigate(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Navigation timeout'));
      }, 10000);

      const onFinishLoad = () => {
        clearTimeout(timeout);
        this.webview.removeEventListener('did-finish-load', onFinishLoad);
        this.webview.removeEventListener('did-fail-load', onFailLoad);
        resolve({ success: true, url: this.webview.getURL() });
      };

      const onFailLoad = (event: any) => {
        clearTimeout(timeout);
        this.webview.removeEventListener('did-finish-load', onFinishLoad);
        this.webview.removeEventListener('did-fail-load', onFailLoad);
        reject(new Error(`Failed to load: ${event.errorDescription}`));
      };

      this.webview.addEventListener('did-finish-load', onFinishLoad);
      this.webview.addEventListener('did-fail-load', onFailLoad);
      this.webview.loadURL(url);
    });
  }

  async type(selector: string, text: string): Promise<any> {
    const script = `
      (function() {
        const element = document.querySelector('${selector}');
        if (!element) {
          throw new Error('Element not found: ${selector}');
        }
        
        element.focus();
        element.value = '${text}';
        
        const inputEvent = new Event('input', { bubbles: true });
        const changeEvent = new Event('change', { bubbles: true });
        element.dispatchEvent(inputEvent);
        element.dispatchEvent(changeEvent);
        
        return { success: true, selector: '${selector}', text: '${text}' };
      })();
    `;

    try {
      const result = await this.webview.executeJavaScript(script);
      console.log('[DoAgent] Type action completed:', result);
      return result;
    } catch (error) {
      console.error('[DoAgent] Type action failed:', error);
      throw error;
    }
  }

  async click(selector: string): Promise<any> {
    const script = `
      (function() {
        const element = document.querySelector('${selector}');
        if (!element) {
          throw new Error('Element not found: ${selector}');
        }
        
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        setTimeout(() => {
          element.click();
        }, 100);
        
        return { success: true, selector: '${selector}' };
      })();
    `;

    try {
      const result = await this.webview.executeJavaScript(script);
      console.log('[DoAgent] Click action completed:', result);
      return result;
    } catch (error) {
      console.error('[DoAgent] Click action failed:', error);
      throw error;
    }
  }

  async wait(ms: number): Promise<any> {
    return new Promise(resolve => setTimeout(() => resolve({ success: true, waited: ms }), ms));
  }

  async scroll(direction: string): Promise<any> {
    const script = `
      (function() {
        const scrollAmount = ${direction === 'up' ? -500 : 500};
        window.scrollBy(0, scrollAmount);
        return { 
          success: true, 
          direction: '${direction}',
          scrollY: window.scrollY,
          scrollHeight: document.body.scrollHeight
        };
      })();
    `;

    try {
      const result = await this.webview.executeJavaScript(script);
      console.log('[DoAgent] Scroll action completed:', result);
      return result;
    } catch (error) {
      console.error('[DoAgent] Scroll action failed:', error);
      throw error;
    }
  }

  async extract(): Promise<any> {
    const script = `
      (function() {
        const data = {
          url: window.location.href,
          title: document.title,
          text: document.body.innerText.substring(0, 5000),
          links: Array.from(document.querySelectorAll('a[href]')).slice(0, 20).map(a => ({
            text: a.textContent?.trim() || '',
            href: a.href
          })),
          forms: Array.from(document.querySelectorAll('form')).map(form => ({
            action: form.action,
            method: form.method,
            fields: Array.from(form.querySelectorAll('input, select, textarea')).map(field => ({
              name: field.name,
              type: field.type,
              value: field.value
            }))
          })),
          images: Array.from(document.querySelectorAll('img[src]')).slice(0, 10).map(img => ({
            src: img.src,
            alt: img.alt
          }))
        };
        
        return data;
      })();
    `;

    try {
      const result = await this.webview.executeJavaScript(script);
      console.log('[DoAgent] Extract action completed');
      return result;
    } catch (error) {
      console.error('[DoAgent] Extract action failed:', error);
      throw error;
    }
  }

  private async executeTaskWithSmartEngine(task: DoTask, instruction: string): Promise<DoResult> {
    const startTime = Date.now();
    const steps: any[] = [];
    let extractedContent: any = null;

    try {
      for (let stepCount = 0; stepCount < this.config.getMaxSteps(); stepCount++) {
        const pageState = await this.analyzePageState();
        
        const action = await this.getNextActionFromLLM(instruction, pageState, steps);
        if (!action || !action.action) {
          throw new Error('Failed to get valid action from LLM');
        }
        
        if (action.action === 'complete') {
          task.status = 'completed';
          break;
        }

        const stepResult = await this.executeStepWithRetry(action, stepCount);
        steps.push(stepResult);

        if (stepResult.action === 'extract' && stepResult.result) {
          extractedContent = stepResult.result;
        }

        if (stepResult.error && this.isCriticalError(stepResult.error)) {
          throw new Error(`Critical error in step ${stepCount + 1}: ${stepResult.error}`);
        }

        await this.adaptiveWait(stepCount, stepResult);
      }

      if (task.status !== 'completed') {
        task.status = 'failed';
        throw new Error('Task did not complete within maximum steps');
      }

      return {
        success: true,
        steps,
        extractedContent,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      task.status = 'failed';
      
      return {
        success: false,
        steps,
        extractedContent,
        error: (error as Error).message,
        executionTime: Date.now() - startTime
      };
    }
  }

  private async executeStepWithRetry(action: any, stepIndex: number): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.getRetryAttempts(); attempt++) {
      try {
        const stepResult = await this.executeStepWithTimeout(action, stepIndex, attempt);
        return stepResult;
      } catch (error) {
        lastError = error as Error;
        console.warn(`[DoAgent] Step ${stepIndex + 1}, attempt ${attempt} failed:`, error);
        
        if (attempt < this.config.getRetryAttempts()) {
          await this.retryBackoff(attempt);
          
          if (action.action === 'click' || action.action === 'type') {
            await this.tryAlternativeStrategies(action);
          }
        }
      }
    }

    return {
      action: action.action,
      target: action.target,
      value: action.value,
      error: lastError?.message || 'Unknown error',
      timestamp: Date.now()
    };
  }

  private async executeStepWithTimeout(action: any, stepIndex: number, attempt: number): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Step execution timeout after ${this.config.getStepTimeout()}ms`));
      }, this.config.getStepTimeout());

      try {
        const result = await this.executeStep(action);
        clearTimeout(timeout);
        resolve({
          action: action.action,
          target: action.target,
          value: action.value,
          result: result,
          timestamp: Date.now(),
          attempt
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private async tryAlternativeStrategies(action: any): Promise<void> {
    if (!action.target) return;

    const strategies = [
      () => this.scrollElementIntoView(action.target),
      () => this.waitForElementToBeReady(action.target),
      () => this.tryFuzzyElementMatching(action.target)
    ];

    for (const strategy of strategies) {
      try {
        await strategy();
        break;
      } catch (error) {
        console.warn('Alternative strategy failed:', error);
      }
    }
  }

  private async scrollElementIntoView(selector: string): Promise<void> {
    await this.webview.executeJavaScript(`
      (function() {
        const element = document.querySelector('${selector}');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return true;
        }
        return false;
      })();
    `);
  }

  private async waitForElementToBeReady(selector: string): Promise<void> {
    await this.webview.executeJavaScript(`
      (function() {
        return new Promise((resolve) => {
          const checkElement = () => {
            const element = document.querySelector('${selector}');
            if (element && element.offsetParent !== null) {
              resolve(true);
            } else {
              setTimeout(checkElement, 100);
            }
          };
          checkElement();
        });
      })();
    `);
  }

  private async tryFuzzyElementMatching(selector: string): Promise<void> {
    await this.webview.executeJavaScript(`
      (function() {
        const originalSelector = '${selector}';
        const elements = document.querySelectorAll('*');
        
        for (const element of elements) {
          if (element.textContent && element.textContent.includes(originalSelector)) {
            element.setAttribute('data-fuzzy-match', 'true');
            return true;
          }
        }
        return false;
      })();
    `);
  }

  private async retryBackoff(attempt: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async adaptiveWait(stepIndex: number, stepResult: any): Promise<void> {
    let waitTime = 1000;

    if (stepResult.action === 'navigate') {
      waitTime = 3000;
    } else if (stepResult.action === 'click' && stepResult.target?.includes('submit')) {
      waitTime = 2000;
    } else if (stepResult.error) {
      waitTime = 2000;
    }

    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  private isCriticalError(error: string): boolean {
    const criticalPatterns = [
      'page not found',
      'network error',
      'timeout',
      'access denied',
      'authentication required'
    ];

    return criticalPatterns.some(pattern => 
      error.toLowerCase().includes(pattern)
    );
  }

  getCurrentTask(): DoTask | null {
    return this.currentTask;
  }

  isCurrentlyExecuting(): boolean {
    return this.isExecuting;
  }
}       