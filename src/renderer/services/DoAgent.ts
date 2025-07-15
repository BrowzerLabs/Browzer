export interface DoTask {
  id: string;
  instruction: string;
  steps: DoStep[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface DoStep {
  id: string;
  action: 'navigate' | 'click' | 'type' | 'wait' | 'extract' | 'scroll' | 'analyze' | 
          'select' | 'hover' | 'focus' | 'blur' | 'keypress' | 'clear' | 
          'wait_for_element' | 'wait_for_text' | 'screenshot' | 'evaluate' |
          'select_dropdown' | 'check' | 'uncheck' | 'double_click' | 'right_click' |
          'wait_for_dynamic_content';
  target?: string;
  value?: string;
  selector?: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  reasoning?: string;
  options?: {
    timeout?: number;
    waitAfter?: boolean;
    multiple?: boolean;
    index?: number;
    key?: string;
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
    delay?: number;
    position?: { x: number; y: number };
  };
}

export interface DoResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
}

export interface PageState {
  url: string;
  title: string;
  dom: string;
  screenshot?: string;
  interactiveElements: ElementInfo[];
  rawHTML?: string;
  visibleText?: string;
  detectedPatterns?: {
    prices: string[];
    times: string[];
    hasContent: boolean;
    contentLength: number;
  };
}

export interface ElementInfo {
  tag: string;
  text: string;
  selector: string;
  type?: string;
  placeholder?: string;
  value?: string;
  href?: string;
  visible: boolean;
  clickable: boolean;
  id?: string;
  className?: string;
  name?: string;
  ariaLabel?: string;
  ariaRole?: string;
  dataTestId?: string;
  checked?: boolean;
  selected?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  options?: string[]; // For select elements
  parentText?: string; // Text of parent element for context
  siblingText?: string; // Text of nearby siblings
  position?: { x: number; y: number; width: number; height: number };
  isInViewport?: boolean;
  tabIndex?: number;
  contentEditable?: boolean;
  hasDropdown?: boolean;
  isDateInput?: boolean;
  isSearchInput?: boolean;
}

// Static system prompt - contains all the rules and strategies that don't change
const SYSTEM_PROMPT = `You are an expert browser automation assistant. You execute tasks by taking single atomic actions.

SMART SEARCH STRATEGY - Choose the RIGHT approach for each task:

🛒 SHOPPING TASKS → Go DIRECTLY to retailer websites:
- "cheapest airpods on amazon" → Navigate to amazon.com, search "Apple AirPods", sort by price
- "buy nike shoes" → Navigate to nike.com or amazon.com directly
- "compare phone prices" → Navigate to amazon.com, bestbuy.com, or comparison sites
- DON'T search Google for "airpods on amazon" - go straight to amazon.com!

✈️ TRAVEL TASKS → Use Google search with FULL DETAILS first:
- "flights from LA to NYC august 15-19" → Search Google for "flights from Los Angeles to New York August 15 to 19" (auto-fills everything!)
- "hotels in Paris December 20-25" → Search Google for "hotels in Paris December 20 to 25"
- "car rental Miami airport" → Search Google for "car rental Miami airport"
- ⚠️ AVOID manually filling complex travel forms - let Google do the work!

💼 JOB SEARCHES → Use job platforms directly:
- "data science jobs" → Navigate to linkedin.com/jobs or indeed.com
- "software engineer positions" → Navigate to linkedin.com/jobs
- "remote jobs" → Navigate to remote.com or weworkremotely.com

📱 SOCIAL MEDIA/CONTENT → Go to specific platforms:
- "twitter bookmarks" → Navigate to x.com/i/bookmarks
- "youtube videos about X" → Navigate to youtube.com, search for X
- "linkedin profile" → Navigate to linkedin.com

🔍 RESEARCH/GENERAL INFO → Use Google for broad research:
- "what is machine learning" → Search on Google
- "news about AI" → Search on Google or go to news sites
- "how to cook pasta" → Search on Google
- "compare X vs Y" → Search on Google for comparisons
- "reviews of X" → Search on Google for reviews

🎯 MORE EXAMPLES:
- "pizza delivery near me" → Google Maps or direct to dominos.com/pizzahut.com
- "weather forecast" → Google or weather.com
- "stock price of Apple" → Google Finance or yahoo.com/finance
- "sports scores" → ESPN.com or direct team websites
- "movie showtimes" → fandango.com or Google
- "restaurant reservations" → opentable.com or restaurant direct
- "real estate" → zillow.com or realtor.com
- "cryptocurrency prices" → coinbase.com or coinmarketcap.com

🧠 WHEN TO USE GOOGLE SEARCH VS DIRECT NAVIGATION:

✅ Use Google Search When:
- Complex forms with dropdowns/date pickers (flights, hotels, rentals)
- Need multiple parameters filled automatically
- Want to avoid manual form filling
- Looking for comparisons or reviews
- Research tasks with multiple data points

❌ Use Direct Site Navigation When:
- Simple search on familiar sites (Amazon, LinkedIn)
- Account-specific actions (bookmarks, profiles)
- Site has better search/filter capabilities
- Want to use specific site features (Amazon Prime, LinkedIn filters)

🔄 HYBRID APPROACH Examples:
- "flights LA to NYC august 15-19" → Search Google first, then use the Google Flights result
- "hotels in Paris" → Search Google, then click on Booking.com result
- "data science jobs remote" → Search Google, then use LinkedIn result

CRITICAL RULES:
1. ALWAYS verify elements are in viewport before interacting (check isInViewport flag)
2. For elements not in viewport, first use "scroll" to bring them into view
3. For dropdowns/selects: If it's a native <select>, use "select_dropdown" with the option text as value
4. For date inputs: Use "type" with format "YYYY-MM-DD" for native date inputs
5. For search/autocomplete inputs: Type the value, then "wait" 1000-2000ms for suggestions
6. ALWAYS use "wait" after actions that trigger dynamic changes
7. Use "wait_for_element" when you expect an element to appear after an action
8. Use "wait_for_dynamic_content" for sites with heavy JavaScript (Google Flights, etc.) before extracting
9. For complex forms, fill fields one by one, don't rush
10. Use "extract" periodically to understand current page state
11. Use "complete" ONLY when the task is fully accomplished with a detailed summary
12. If you've done 3+ extractions in a row, consider completing the task

AVAILABLE ACTIONS:
- navigate: Go to a URL
- click: Click an element
- type: Type text into an input
- wait: Wait for milliseconds (value = milliseconds)
- extract: Get comprehensive page data
- complete: Task is done (include detailed result)
- select_dropdown: Select option from dropdown (value = option text)
- wait_for_element: Wait for element to appear (value = selector to wait for)
- wait_for_dynamic_content: Wait for dynamic content to load (for Google Flights, etc.)
- clear: Clear an input field
- focus: Focus an element
- hover: Hover over an element
- keypress: Press a key (options.key = key name)
- check/uncheck: Check or uncheck a checkbox
- double_click: Double click an element
- right_click: Right click an element

OUTPUT FORMAT:
Respond with ONLY a JSON object in this format:
{
  "action": "navigate|click|type|wait|extract|complete|select_dropdown|wait_for_element|clear|focus|hover|keypress|check|uncheck",
  "selector": "exact_css_selector_from_elements_list",
  "value": "text_to_type_or_option_to_select",
  "target": "url_for_navigate",
  "description": "clear_description_of_what_this_action_does",
  "reasoning": "detailed_explanation_of_why_this_specific_action_is_needed_now_and_how_it_advances_the_current_todo_step",
  "result": "final_result_summary_only_if_action_is_complete",
  "options": {
    "timeout": 5000,
    "waitAfter": true,
    "key": "Enter|Tab|Escape|etc_for_keypress",
    "delay": 100
  }
}

BE PATIENT AND THOROUGH. Better to take more steps and succeed than rush and fail.`;

export class DoAgent {
  private currentTask: DoTask | null = null;
  private isExecuting = false;
  private webview: any = null;
  private maxSteps = 20;
  private stepCount = 0;

  constructor(private onProgress?: (task: DoTask, step: DoStep) => void) {}

  async executeTask(instruction: string, webview: any): Promise<DoResult> {
    if (this.isExecuting) {
      throw new Error('DoAgent is already executing a task');
    }

    this.isExecuting = true;
    this.webview = webview;
    this.stepCount = 0;
    const startTime = Date.now();

    try {
      const task: DoTask = {
        id: `task-${Date.now()}`,
        instruction,
        steps: [],
        status: 'running'
      };

      this.currentTask = task;
      console.log('[DoAgent] Starting LLM-powered task execution:', instruction);

      // Start the iterative execution loop
      let isTaskComplete = false;
      let finalResult = null;

      while (!isTaskComplete && this.stepCount < this.maxSteps) {
        this.stepCount++;
        
        // Analyze current page state
        const pageState = await this.analyzePageState();
        
        // Ask LLM for next action
        const nextAction = await this.getNextActionFromLLM(instruction, pageState, task.steps);
        
        if (nextAction.action === 'complete') {
          isTaskComplete = true;
          finalResult = nextAction.result;
          break;
        }

        // Execute the action
        const step: DoStep = {
          id: `step-${this.stepCount}`,
          action: nextAction.action,
          target: nextAction.target,
          value: nextAction.value,
          selector: nextAction.selector,
          description: nextAction.description,
          reasoning: nextAction.reasoning,
          status: 'running'
        };

        task.steps.push(step);

        // Call progress callback
        if (this.onProgress) {
          this.onProgress(task, step);
        }

        try {
          await this.executeStep(step);
          step.status = 'completed';
        } catch (error) {
          step.status = 'failed';
          step.error = (error as Error).message;
          console.error(`[DoAgent] Step failed: ${step.description}`, error);
          
          // If this is a critical error, stop execution
          if (step.action === 'navigate' && this.stepCount <= 2) {
            task.status = 'failed';
            task.error = step.error;
            break;
          }
        }

        // Add a small delay between steps
        await this.wait(1000);
      }

      if (this.stepCount >= this.maxSteps) {
        task.status = 'failed';
        task.error = 'Maximum number of steps reached';
      } else if (!task.error) {
        task.status = 'completed';
        task.result = finalResult;
      }

      const executionTime = Date.now() - startTime;
      
      return {
        success: task.status === 'completed',
        data: task.result,
        error: task.error,
        executionTime
      };

    } catch (error) {
      console.error('[DoAgent] Task execution failed:', error);
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        error: (error as Error).message,
        executionTime
      };
    } finally {
      this.isExecuting = false;
      this.currentTask = null;
      this.webview = null;
      this.stepCount = 0;
    }
  }

  private async analyzePageState(): Promise<PageState> {
    const script = `
      (function() {
        try {
          const url = window.location.href;
          const title = document.title;
          
          // Helper to get unique selector for element
          const getUniqueSelector = (el) => {
            if (el.id) return '#' + el.id;
            
            let path = [];
            while (el && el.nodeType === Node.ELEMENT_NODE) {
              let selector = el.nodeName.toLowerCase();
              
              if (el.className && typeof el.className === 'string' && el.className.trim()) {
                selector += '.' + el.className.trim().split(/\\s+/).join('.');
              }
              
              let sibling = el;
              let nth = 1;
              while (sibling.previousElementSibling) {
                sibling = sibling.previousElementSibling;
                if (sibling.nodeName === el.nodeName) nth++;
              }
              
              if (nth > 1) selector += ':nth-of-type(' + nth + ')';
              
              path.unshift(selector);
              if (el.id || path.length > 4) break;
              
              el = el.parentNode;
            }
            
            return path.join(' > ');
          };
          
          // Helper to check if element is in viewport
          const isInViewport = (el) => {
            const rect = el.getBoundingClientRect();
            return rect.top >= 0 && rect.left >= 0 &&
                   rect.bottom <= window.innerHeight &&
                   rect.right <= window.innerWidth;
          };
          
          // Get all interactive elements with much more detail
          const interactiveElements = [];
          const selectors = [
            'input', 'button', 'a', 'select', 'textarea', 
            '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="option"]',
            '[role="combobox"]', '[role="listbox"]', '[role="textbox"]',
            '[onclick]', '[tabindex]', 'label', '[contenteditable="true"]',
            '[data-testid]', '[aria-controls]', '[aria-haspopup]',
            'div[class*="dropdown"]', 'div[class*="select"]', 'div[class*="picker"]',
            'div[class*="calendar"]', 'div[class*="date"]', 'ul[role="listbox"]',
            'li[role="option"]', '[aria-expanded]'
          ];
          
          // Create a Set to avoid duplicates
          const processedElements = new Set();
          
          selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((el, index) => {
              if (processedElements.has(el)) return;
              processedElements.add(el);
              
              const rect = el.getBoundingClientRect();
              const styles = getComputedStyle(el);
              const isVisible = rect.width > 0 && rect.height > 0 && 
                               styles.visibility !== 'hidden' &&
                               styles.display !== 'none' &&
                               styles.opacity !== '0';
              
              if (isVisible || el.getAttribute('aria-hidden') === 'false') {
                const text = el.textContent?.trim() || '';
                const ariaLabel = el.getAttribute('aria-label') || '';
                const displayText = text.substring(0, 100) || ariaLabel;
                
                // Get parent context
                const parent = el.parentElement;
                const parentText = parent ? parent.textContent?.trim().substring(0, 50) : '';
                
                // Get sibling context
                const prevSibling = el.previousElementSibling;
                const nextSibling = el.nextElementSibling;
                const siblingText = (prevSibling?.textContent?.trim() || '') + ' ' + 
                                  (nextSibling?.textContent?.trim() || '');
                
                // Check for dropdown indicators
                const hasDropdown = el.getAttribute('aria-haspopup') === 'true' ||
                                  el.getAttribute('aria-expanded') !== null ||
                                  el.className?.includes('dropdown') ||
                                  el.className?.includes('select') ||
                                  (el.tagName === 'SELECT');
                
                // Check for date inputs
                const isDateInput = el.type === 'date' || el.type === 'datetime-local' ||
                                  el.className?.includes('date') ||
                                  el.className?.includes('calendar') ||
                                  el.placeholder?.toLowerCase().includes('date') ||
                                  ariaLabel.toLowerCase().includes('date');
                
                // Check for search inputs
                const isSearchInput = el.type === 'search' ||
                                    el.getAttribute('role') === 'searchbox' ||
                                    el.placeholder?.toLowerCase().includes('search') ||
                                    el.name?.toLowerCase().includes('search');
                
                // Get options for select elements
                let options = [];
                if (el.tagName === 'SELECT') {
                  options = Array.from(el.querySelectorAll('option')).map(opt => 
                    opt.textContent?.trim() || opt.value
                  );
                } else if (el.getAttribute('role') === 'combobox' || hasDropdown) {
                  // Try to find associated listbox
                  const listboxId = el.getAttribute('aria-controls');
                  if (listboxId) {
                    const listbox = document.getElementById(listboxId);
                    if (listbox) {
                      options = Array.from(listbox.querySelectorAll('[role="option"]')).map(opt =>
                        opt.textContent?.trim() || ''
                      );
                    }
                  }
                }
                
                const elementInfo = {
                  tag: el.tagName.toLowerCase(),
                  text: displayText,
                  selector: getUniqueSelector(el),
                  type: el.type || '',
                  placeholder: el.placeholder || '',
                  value: el.value || '',
                  href: el.href || '',
                  visible: isVisible,
                  clickable: el.tagName.toLowerCase() === 'button' || 
                           el.tagName.toLowerCase() === 'a' || 
                           el.onclick !== null ||
                           el.getAttribute('role') === 'button' ||
                           el.getAttribute('role') === 'link' ||
                           styles.cursor === 'pointer',
                  id: el.id || '',
                  className: el.className || '',
                  name: el.name || '',
                  ariaLabel: ariaLabel,
                  ariaRole: el.getAttribute('role') || '',
                  dataTestId: el.getAttribute('data-testid') || '',
                  checked: el.checked || false,
                  selected: el.selected || false,
                  disabled: el.disabled || false,
                  readonly: el.readOnly || false,
                  options: options,
                  parentText: parentText,
                  siblingText: siblingText.substring(0, 100),
                  position: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                  },
                  isInViewport: isInViewport(el),
                  tabIndex: el.tabIndex,
                  contentEditable: el.contentEditable === 'true',
                  hasDropdown: hasDropdown,
                  isDateInput: isDateInput,
                  isSearchInput: isSearchInput
                };
                
                interactiveElements.push(elementInfo);
              }
            });
          });
          
          // Get simplified DOM structure for context
          const getSimplifiedDOM = (element, depth = 0) => {
            if (depth > 3) return '';
            
            let result = '';
            if (element.tagName) {
              const tag = element.tagName.toLowerCase();
              const id = element.id ? ' id="' + element.id + '"' : '';
              const className = element.className ? ' class="' + element.className + '"' : '';
              const text = element.childNodes.length === 1 && element.childNodes[0].nodeType === 3 
                         ? element.textContent?.trim().substring(0, 50) : '';
              
              result += '<' + tag + id + className + '>';
              if (text) result += text;
              
              // Process children
              for (let child of element.children) {
                if (depth < 2) {
                  result += getSimplifiedDOM(child, depth + 1);
                }
              }
              result += '</' + tag + '>';
            }
            return result;
          };
          
          const simplifiedDOM = getSimplifiedDOM(document.body);
          
          // ALSO: Get raw HTML content for LLM analysis
          const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
          const contentHTML = mainContent ? mainContent.innerHTML.substring(0, 15000) : '';
          const visibleText = document.body.innerText || '';
          const prices = [...new Set(visibleText.match(/\$[\d,]+/g) || [])];
          const times = [...new Set(visibleText.match(/\d{1,2}:\d{2}\s?(?:AM|PM)/gi) || [])];
          
          return {
            url,
            title,
            dom: simplifiedDOM.substring(0, 5000), // Limit size
            interactiveElements: interactiveElements.slice(0, 20), // Limit to most relevant elements
            rawHTML: contentHTML,
            visibleText: visibleText.substring(0, 5000),
            detectedPatterns: {
              prices: prices,
              times: times,
              hasContent: visibleText.length > 100,
              contentLength: visibleText.length
            }
          };
        } catch (error) {
          return {
            url: window.location.href,
            title: document.title,
            dom: 'Error analyzing DOM: ' + error.message,
            interactiveElements: [],
            rawHTML: '',
            visibleText: document.body ? document.body.innerText.substring(0, 1000) : '',
            detectedPatterns: {
              prices: [],
              times: [],
              hasContent: false,
              contentLength: 0
            }
          };
        }
      })();
    `;

    try {
      const result = await this.webview.executeJavaScript(script);
      console.log('[DoAgent] Page state analyzed:', {
        url: result.url,
        title: result.title,
        elementCount: result.interactiveElements.length
      });
      return result;
    } catch (error) {
      console.error('[DoAgent] Failed to analyze page state:', error);
      return {
        url: this.webview.src || '',
        title: '',
        dom: 'Failed to analyze page',
        interactiveElements: [],
        rawHTML: '',
        visibleText: '',
        detectedPatterns: {
          prices: [],
          times: [],
          hasContent: false,
          contentLength: 0
        }
      };
    }
  }

  private async getNextActionFromLLM(instruction: string, pageState: PageState, previousSteps: DoStep[]): Promise<any> {
    try {
      // Check for infinite extraction loops
      const recentExtracts = previousSteps.filter(step => 
        step.action === 'extract' && step.status === 'completed'
      ).slice(-3); // Check last 3 steps
      
      if (recentExtracts.length >= 10) {
        // Too many extracts in a row, force completion
        return {
          action: 'complete',
          description: 'Task completed - multiple extractions performed',
          reasoning: 'Detected multiple consecutive extractions, completing task to avoid infinite loop',
          result: {
            summary: 'Task completed after multiple content extractions',
            data: pageState,
            warning: 'Multiple extractions were performed - content may be loading dynamically'
          }
        };
      }
      
      // Get API key and provider from the browser
      const provider = this.getSelectedProvider();
      const apiKey = localStorage.getItem(`${provider}_api_key`);
      
      if (!apiKey) {
        throw new Error(`No API key found for ${provider}`);
      }

      const prompt = this.buildPrompt(instruction, pageState, previousSteps);
      
      console.log('[DoAgent] Asking LLM for next action...');
      
      // Log the prompt
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('log-llm-request', {
        provider: provider,
        instruction: instruction,
        prompt: prompt,
        promptLength: prompt.length,
        context: {
          currentUrl: pageState.url,
          stepNumber: this.stepCount,
          previousActions: previousSteps.slice(-3).map(step => step.action)
        }
      });
      
      const startTime = Date.now();
      
      // Call LLM via IPC to main process with system prompt
      const response = await ipcRenderer.invoke('call-llm', {
        provider: provider as 'anthropic' | 'openai',
        apiKey: apiKey,
        systemPrompt: SYSTEM_PROMPT,
        prompt: prompt,
        maxTokens: 1000
      });
      
      const executionTime = Date.now() - startTime;

      // Log the response
      await ipcRenderer.invoke('log-llm-response', {
        provider: provider,
        instruction: instruction,
        promptLength: prompt.length,
        response: response.response || '',
        responseLength: (response.response || '').length,
        success: response.success,
        error: response.error,
        executionTime: executionTime,
        context: {
          currentUrl: pageState.url,
          stepNumber: this.stepCount,
          previousActions: previousSteps.slice(-3).map(step => step.action)
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'LLM call failed');
      }

      console.log('[DoAgent] LLM response received:', response.response);
      return this.parseActionFromResponse(response.response);

    } catch (error) {
      console.error('[DoAgent] Failed to get action from LLM:', error);
      
      // Log the error
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('log-llm-response', {
        provider: this.getSelectedProvider(),
        instruction: instruction,
        promptLength: 0,
        response: '',
        responseLength: 0,
        success: false,
        error: (error as Error).message,
        executionTime: 0,
        context: {
          currentUrl: pageState.url,
          stepNumber: this.stepCount,
          previousActions: previousSteps.slice(-3).map(step => step.action)
        }
      });
      
      // Fallback to a simple action
      return {
        action: 'complete',
        description: 'LLM analysis failed',
        result: { error: (error as Error).message }
      };
    }
  }

  private buildPrompt(instruction: string, pageState: PageState, previousSteps: DoStep[]): string {
    // Generate compact step history (last 3 steps only)
    const recentSteps = previousSteps.slice(-3);
    const stepHistory = recentSteps.map(step => 
      `${step.action}: ${step.description} (${step.status})${step.error ? ' - ERROR: ' + step.error : ''}`
    ).join('\n');

    // Generate dynamic todo list based on instruction and current state
    const todoList = this.generateTodoList(instruction, pageState, previousSteps);

    // SMART CONTEXT INCLUSION - Only include what's needed to save tokens
    const needsDOMContext = this.shouldIncludeDOMContext(instruction, previousSteps);
    const needsHTMLContext = this.shouldIncludeHTMLContext(instruction, previousSteps);

    // Format elements only if needed
    let elementsList = '';
    if (needsDOMContext) {
      elementsList = pageState.interactiveElements.map((el, index) => {
        let desc = `${index + 1}. ${el.tag}`;
        if (el.text) desc += ` "${el.text.substring(0, 50)}"`;
        desc += ` [${el.selector}]`;
        if (el.type) desc += ` type="${el.type}"`;
        if (el.placeholder) desc += ` placeholder="${el.placeholder}"`;
        if (el.value) desc += ` value="${el.value}"`;
        if (el.ariaLabel) desc += ` aria-label="${el.ariaLabel}"`;
        if (el.ariaRole) desc += ` role="${el.ariaRole}"`;
        if (el.hasDropdown) desc += ` HAS_DROPDOWN`;
        if (el.isDateInput) desc += ` DATE_INPUT`;
        if (el.isSearchInput) desc += ` SEARCH_INPUT`;
        if (el.disabled) desc += ` DISABLED`;
        if (el.readonly) desc += ` READONLY`;
        if (!el.isInViewport) desc += ` NOT_IN_VIEWPORT`;
        if (el.options && el.options.length > 0) {
          desc += ` options=[${el.options.slice(0, 3).join(', ')}${el.options.length > 3 ? '...' : ''}]`;
        }
        if (el.parentText && el.parentText !== el.text) {
          desc += ` parent="${el.parentText.substring(0, 30)}"`;
        }
        return desc;
      }).join('\n');
    }

    // Build minimal dynamic prompt - system prompt contains all the static content
    return `TASK: Complete this instruction: "${instruction}"

CURRENT STATE:
URL: ${pageState.url}
Title: ${pageState.title}

PROGRESS:
${todoList}

RECENT STEPS:
${stepHistory || 'Starting task'}

${needsDOMContext ? `INTERACTIVE ELEMENTS (${pageState.interactiveElements.length} found):
${elementsList}` : 'DOM elements not needed for this action.'}

${needsHTMLContext ? `PAGE CONTENT:
Visible Text: ${(pageState.visibleText || '').substring(0, 1000)}${(pageState.visibleText || '').length > 1000 ? '...' : ''}
Detected Patterns: ${pageState.detectedPatterns ? JSON.stringify(pageState.detectedPatterns) : 'None'}` : 'Page content not needed for this action.'}

What is the NEXT SINGLE ACTION? Respond with JSON only.`;
  }

  private parseActionFromResponse(response: string): any {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const action = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!action.action || !action.description) {
        throw new Error('Invalid action format');
      }

      return action;
    } catch (error) {
      console.error('[DoAgent] Failed to parse LLM response:', error);
      return {
        action: 'wait',
        value: '2000',
        description: 'Failed to parse LLM response, waiting',
        reasoning: 'Error in response parsing'
      };
    }
  }

  private getSelectedProvider(): string {
    const modelSelector = document.getElementById('modelSelector') as HTMLSelectElement;
    return modelSelector ? modelSelector.value : 'anthropic';
  }

  private async executeStep(step: DoStep): Promise<void> {
    console.log('[DoAgent] Executing step:', step.description);

    try {
      // Add pre-action wait if specified
      if (step.options?.delay) {
        await this.wait(step.options.delay);
      }

      switch (step.action) {
        case 'navigate':
          await this.navigate(step.target!);
          break;
        case 'type':
          await this.type(step.selector!, step.value!);
          break;
        case 'click':
          await this.click(step.selector!, step.options);
          break;
        case 'wait':
          await this.wait(parseInt(step.value!));
          break;
        case 'extract':
          step.result = await this.extract();
          break;
        case 'scroll':
          await this.scroll(step.value, step.selector);
          break;
        case 'select_dropdown':
          await this.selectDropdown(step.selector!, step.value!);
          break;
        case 'wait_for_element':
          await this.waitForElement(step.value!, step.options?.timeout);
          break;
        case 'wait_for_dynamic_content':
          await this.waitForDynamicContent(step.options?.timeout);
          break;
        case 'clear':
          await this.clearInput(step.selector!);
          break;
        case 'focus':
          await this.focusElement(step.selector!);
          break;
        case 'blur':
          await this.blurElement(step.selector!);
          break;
        case 'hover':
          await this.hoverElement(step.selector!);
          break;
        case 'keypress':
          await this.keypressElement(step.selector || 'body', step.options?.key!);
          break;
        case 'check':
          await this.checkElement(step.selector!, true);
          break;
        case 'uncheck':
          await this.checkElement(step.selector!, false);
          break;
        case 'double_click':
          await this.doubleClick(step.selector!);
          break;
        case 'right_click':
          await this.rightClick(step.selector!);
          break;
        case 'evaluate':
          step.result = await this.evaluateScript(step.value!);
          break;
        case 'screenshot':
          step.result = await this.takeScreenshot();
          break;
        default:
          throw new Error(`Unknown action: ${step.action}`);
      }

      // Add post-action wait if specified
      if (step.options?.waitAfter) {
        await this.wait(1000); // Default 1 second wait after action
      }

      console.log('[DoAgent] Step completed:', step.description);

    } catch (error) {
      console.error('[DoAgent] Step failed:', step.description, error);
      throw error;
    }
  }

  private async navigate(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.webview) {
        reject(new Error('No webview available'));
        return;
      }

      const onFinishLoad = () => {
        this.webview.removeEventListener('did-finish-load', onFinishLoad);
        this.webview.removeEventListener('did-fail-load', onFailLoad);
        resolve();
      };

      const onFailLoad = (event: any) => {
        this.webview.removeEventListener('did-finish-load', onFinishLoad);
        this.webview.removeEventListener('did-fail-load', onFailLoad);
        reject(new Error(`Failed to load ${url}: ${event.errorDescription}`));
      };

      this.webview.addEventListener('did-finish-load', onFinishLoad);
      this.webview.addEventListener('did-fail-load', onFailLoad);

      this.webview.loadURL(url);
    });
  }

  private async type(selector: string, value: string): Promise<void> {
    try {
      // Escape quotes and special characters in the value
      const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      const script = `
        (function() {
          try {
            let element = document.querySelector('${escapedSelector}');
            
            if (!element) {
              throw new Error('Element not found with selector: ${escapedSelector}');
            }
            
            // Clear existing value
            element.value = '';
            
            // Focus the element
            element.focus();
            
            // Set the value
            element.value = '${escapedValue}';
            
            // Trigger events
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            
            return { success: true, value: element.value };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();
      `;

      const result = await this.webview.executeJavaScript(script);
      
      if (result && !result.success) {
        throw new Error(result.error || 'Script execution failed');
      }
      
      console.log('[DoAgent] Type operation completed successfully');
    } catch (error) {
      console.error('[DoAgent] Type operation failed:', error);
      throw new Error(`Failed to type "${value}" into element: ${(error as Error).message}`);
    }
  }

  private async click(selector: string, options?: any): Promise<void> {
    try {
      const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const clickCount = options?.clickCount || 1;
      const button = options?.button || 'left';
      
      const script = `
        (function() {
          try {
            let element = document.querySelector('${escapedSelector}');
            
            if (!element) {
              throw new Error('Element not found with selector: ${escapedSelector}');
            }
            
            // Ensure element is visible and clickable
            const styles = getComputedStyle(element);
            if (styles.display === 'none' || styles.visibility === 'hidden') {
              throw new Error('Element is not visible');
            }
            
            // Scroll element into view if needed
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Wait a bit for scroll to complete
            setTimeout(() => {
              // Create and dispatch mouse event
              const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                button: ${button === 'right' ? 2 : button === 'middle' ? 1 : 0}
              });
              
              for (let i = 0; i < ${clickCount}; i++) {
                element.dispatchEvent(clickEvent);
              }
            }, 100);
            
            return { success: true, clicked: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();
      `;

      const result = await this.webview.executeJavaScript(script);
      
      if (result && !result.success) {
        throw new Error(result.error || 'Script execution failed');
      }
      
      // Wait a bit after click for any animations/transitions
      await this.wait(200);
      
      console.log('[DoAgent] Click operation completed successfully');
    } catch (error) {
      console.error('[DoAgent] Click operation failed:', error);
      throw new Error(`Failed to click element: ${(error as Error).message}`);
    }
  }

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async scroll(direction?: string, targetSelector?: string): Promise<void> {
    const script = targetSelector ? `
      (function() {
        try {
          const element = document.querySelector('${targetSelector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')}');
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            throw new Error('Target element not found for scrolling');
          }
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    ` : `
      (function() {
        try {
          const direction = '${direction || 'down'}';
          const scrollAmount = direction === 'down' ? 500 : -500;
          window.scrollBy(0, scrollAmount);
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    if (result && !result.success) {
      throw new Error(result.error || 'Scroll failed');
    }
  }

  private async extract(): Promise<any> {
    try {
      // Wait for dynamic content to load (especially for Google Flights, etc.)
      await this.wait(2000);
      
      const script = `
        (function() {
          try {
            const currentUrl = window.location.href;
            const title = document.title;
            
            // Wait for dynamic content to load
            let attempts = 0;
            const maxAttempts = 10;
            
            const waitForContent = () => {
              attempts++;
              
              // For Google Flights, wait for flight results to appear
              if (currentUrl.includes('google.com/travel/flights')) {
                const flightResults = document.querySelectorAll('[data-testid*="flight"], [role="listitem"], .gws-flights-results__result-item, .gws-flights-results__itinerary-card');
                const loadingIndicators = document.querySelectorAll('[aria-label*="loading"], [role="progressbar"], .loading');
                
                if (flightResults.length > 0 && loadingIndicators.length === 0) {
                  return true; // Content is loaded
                }
              }
              
              // For other dynamic sites, check for common indicators
              const contentIndicators = document.querySelectorAll('[data-testid], [role="main"], main, article, .content, .results');
              const loadingIndicators = document.querySelectorAll('[aria-label*="loading"], [role="progressbar"], .loading, .spinner');
              
              if (contentIndicators.length > 0 && loadingIndicators.length === 0) {
                return true;
              }
              
              return attempts >= maxAttempts;
            };
            
            // Wait for content to load
            if (!waitForContent()) {
              // Content might still be loading, but proceed anyway
              console.log('Content may still be loading, proceeding with extraction...');
            }
            
            // Generic content extraction - analyze DOM structure automatically
            const extractedContent = {
              url: currentUrl,
              title: title,
              headings: [],
              links: [],
              images: [],
              textContent: [],
              lists: [],
              tables: [],
              forms: [],
              metadata: {},
              pageStructure: {},
              flightResults: [], // Special handling for flights
              loadingStatus: 'content_ready'
            };
            
            // Extract headings (h1-h6)
            const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
            extractedContent.headings = Array.from(headings).map(h => ({
              level: h.tagName.toLowerCase(),
              text: h.textContent?.trim() || '',
              id: h.id || ''
            })).filter(h => h.text && h.text.length > 0);
            
            // Extract links
            const links = document.querySelectorAll('a[href]');
            extractedContent.links = Array.from(links).slice(0, 30).map(link => ({
              text: link.textContent?.trim() || '',
              href: link.href,
              title: link.title || ''
            })).filter(link => link.text && link.text.length > 0);
            
            // Extract images with alt text
            const images = document.querySelectorAll('img[src]');
            extractedContent.images = Array.from(images).slice(0, 15).map(img => ({
              src: img.src,
              alt: img.alt || '',
              title: img.title || ''
            }));
            
            // Extract text content from semantic elements and containers
            const textSelectors = [
              'article', 'main', 'section', 'div[role="main"]', 'div[role="article"]',
              'p', 'span', 'div[class*="content"]', 'div[class*="post"]', 'div[class*="tweet"]',
              'div[class*="entry"]', 'div[class*="message"]', 'div[class*="comment"]',
              '[data-testid]', '[role="listitem"]', '[aria-label]'
            ];
            
            const textElements = document.querySelectorAll(textSelectors.join(', '));
            extractedContent.textContent = Array.from(textElements).slice(0, 50).map(el => {
              const text = el.textContent?.trim() || '';
              return {
                text: text.substring(0, 500),
                tag: el.tagName.toLowerCase(),
                className: el.className || '',
                id: el.id || '',
                dataTestId: el.getAttribute('data-testid') || '',
                ariaLabel: el.getAttribute('aria-label') || '',
                role: el.getAttribute('role') || ''
              };
            }).filter(item => item.text && item.text.length > 15);
            
            // Extract lists
            const lists = document.querySelectorAll('ul, ol');
            extractedContent.lists = Array.from(lists).slice(0, 10).map(list => ({
              type: list.tagName.toLowerCase(),
              items: Array.from(list.querySelectorAll('li')).map(li => li.textContent?.trim() || '').filter(item => item.length > 0)
            })).filter(list => list.items.length > 0);
            
            // Extract tables
            const tables = document.querySelectorAll('table');
            extractedContent.tables = Array.from(tables).slice(0, 5).map(table => {
              const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim() || '');
              const rows = Array.from(table.querySelectorAll('tr')).slice(0, 10).map(row => 
                Array.from(row.querySelectorAll('td')).map(td => td.textContent?.trim() || '')
              ).filter(row => row.length > 0);
              
              return { headers, rows };
            }).filter(table => table.headers.length > 0 || table.rows.length > 0);
            
            // Extract forms
            const forms = document.querySelectorAll('form');
            extractedContent.forms = Array.from(forms).slice(0, 5).map(form => {
              const inputs = Array.from(form.querySelectorAll('input, select, textarea')).map(input => ({
                type: input.type || input.tagName.toLowerCase(),
                name: input.name || '',
                placeholder: input.placeholder || '',
                value: input.value || '',
                id: input.id || ''
              }));
              
              return {
                action: form.action || '',
                method: form.method || '',
                inputs: inputs
              };
            });
            
            // Extract metadata
            const metaTags = document.querySelectorAll('meta[name], meta[property]');
            Array.from(metaTags).forEach(meta => {
              const name = meta.getAttribute('name') || meta.getAttribute('property') || '';
              const content = meta.getAttribute('content') || '';
              if (name && content) {
                extractedContent.metadata[name] = content;
              }
            });
            
            // SIMPLE APPROACH: Just grab relevant HTML for LLM to parse
            // Get main content area HTML - this contains all the visible data
            const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
            const contentHTML = mainContent ? mainContent.innerHTML.substring(0, 15000) : ''; // Limit size
            
            // Also get visible text for quick analysis
            const visibleText = document.body.innerText || '';
            const prices = [...new Set(visibleText.match(/\$[\d,]+/g) || [])];
            const times = [...new Set(visibleText.match(/\d{1,2}:\d{2}\s?(?:AM|PM)/gi) || [])];
            
            // Include HTML content for LLM to analyze directly
            extractedContent.rawHTML = contentHTML;
            extractedContent.visibleText = visibleText.substring(0, 5000);
            extractedContent.detectedPatterns = {
              prices: prices,
              times: times,
              hasContent: visibleText.length > 100,
              contentLength: visibleText.length
            };
            
            // Analyze page structure automatically
            extractedContent.pageStructure = {
              hasSearchBox: document.querySelector('input[type="search"], input[name*="search"], input[placeholder*="search"]') !== null,
              hasLoginForm: document.querySelector('input[type="password"], input[name*="password"], input[name*="login"]') !== null,
              hasNavigation: document.querySelector('nav, [role="navigation"]') !== null,
              hasArticles: document.querySelector('article, [role="article"]') !== null,
              hasList: document.querySelector('ul, ol') !== null,
              hasTable: document.querySelector('table') !== null,
              hasComments: document.querySelector('[class*="comment"], [data-testid*="comment"]') !== null,
              hasPosts: document.querySelector('[class*="post"], [data-testid*="post"], [data-testid*="tweet"]') !== null,
              hasProducts: document.querySelector('[class*="product"], [data-testid*="product"]') !== null,
              hasFlights: document.querySelector('[class*="flight"], [data-testid*="flight"]') !== null,
              hasBookmarks: document.querySelector('[class*="bookmark"], [data-testid*="bookmark"]') !== null,
              domain: window.location.hostname,
              flightResultsCount: extractedContent.flightResults ? extractedContent.flightResults.length : 0
            };
            
            return extractedContent;
          } catch (error) {
            return {
              error: error.message,
              url: window.location.href,
              title: document.title,
              fallbackContent: document.body.innerText.substring(0, 1000)
            };
          }
        })();
      `;

      const result = await this.webview.executeJavaScript(script);
      console.log('[DoAgent] Extract operation completed successfully');
      
      // Store the extracted data in the current task
      if (this.currentTask) {
        this.currentTask.result = result;
      }
      
      return result;
    } catch (error) {
      console.error('[DoAgent] Extract operation failed:', error);
      throw new Error(`Failed to extract content: ${(error as Error).message}`);
    }
  }
  
  getCurrentTask(): DoTask | null {
    return this.currentTask;
  }

  isCurrentlyExecuting(): boolean {
    return this.isExecuting;
  }

  private async selectDropdown(selector: string, optionText: string): Promise<void> {
    try {
      const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const escapedOption = optionText.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      const script = `
        (function() {
          try {
            const element = document.querySelector('${escapedSelector}');
            if (!element) {
              throw new Error('Select element not found');
            }
            
            if (element.tagName === 'SELECT') {
              // Native select element
              const options = Array.from(element.options);
              const optionToSelect = options.find(opt => 
                opt.text.trim() === '${escapedOption}' || 
                opt.value === '${escapedOption}'
              );
              
              if (optionToSelect) {
                element.value = optionToSelect.value;
                element.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true };
              } else {
                throw new Error('Option not found: ${escapedOption}');
              }
            } else {
              // Custom dropdown - try to click it first
              element.click();
              
              // Wait and look for options
              setTimeout(() => {
                const optionSelectors = [
                  '[role="option"]',
                  'li[role="option"]',
                  '.dropdown-item',
                  '.option',
                  'li'
                ];
                
                for (const optSelector of optionSelectors) {
                  const options = document.querySelectorAll(optSelector);
                  for (const opt of options) {
                    if (opt.textContent?.trim() === '${escapedOption}') {
                      opt.click();
                      return { success: true };
                    }
                  }
                }
                
                throw new Error('Option not found in dropdown');
              }, 500);
            }
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();
      `;
      
      const result = await this.webview.executeJavaScript(script);
      if (result && !result.success) {
        throw new Error(result.error || 'Select dropdown failed');
      }
      
      await this.wait(500); // Wait for selection to process
    } catch (error) {
      console.error('[DoAgent] Select dropdown failed:', error);
      throw error;
    }
  }

  private async waitForElement(selector: string, timeout: number = 5000): Promise<void> {
    const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const script = `
        (function() {
          const element = document.querySelector('${escapedSelector}');
          return { exists: !!element, visible: element ? getComputedStyle(element).display !== 'none' : false };
        })();
      `;
      
      const result = await this.webview.executeJavaScript(script);
      if (result && result.exists && result.visible) {
        console.log('[DoAgent] Element found:', selector);
        return;
      }
      
      await this.wait(100);
    }
    
    throw new Error(`Timeout waiting for element: ${selector}`);
  }

  private async waitForDynamicContent(timeout: number = 10000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const script = `
        (function() {
          const currentUrl = window.location.href;
          
          // Check for Google Flights specific content
          if (currentUrl.includes('google.com/travel/flights')) {
            const flightResults = document.querySelectorAll('[data-testid*="flight"], [role="listitem"], .gws-flights-results__result-item');
            const loadingIndicators = document.querySelectorAll('[aria-label*="loading"], [role="progressbar"], .loading');
            
            return {
              hasContent: flightResults.length > 0,
              isLoading: loadingIndicators.length > 0,
              contentCount: flightResults.length
            };
          }
          
          // Generic dynamic content check
          const contentElements = document.querySelectorAll('[data-testid], [role="main"], main, article, .content, .results');
          const loadingElements = document.querySelectorAll('[aria-label*="loading"], [role="progressbar"], .loading, .spinner');
          
          return {
            hasContent: contentElements.length > 0,
            isLoading: loadingElements.length > 0,
            contentCount: contentElements.length
          };
        })();
      `;
      
      const result = await this.webview.executeJavaScript(script);
      if (result && result.hasContent && !result.isLoading) {
        console.log('[DoAgent] Dynamic content loaded:', result.contentCount, 'elements');
        return;
      }
      
      await this.wait(500);
    }
    
    console.log('[DoAgent] Timeout waiting for dynamic content, proceeding anyway');
  }

  private async clearInput(selector: string): Promise<void> {
    try {
      const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      const script = `
        (function() {
          try {
            const element = document.querySelector('${escapedSelector}');
            if (!element) {
              throw new Error('Input element not found');
            }
            
            element.focus();
            element.value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();
      `;
      
      const result = await this.webview.executeJavaScript(script);
      if (result && !result.success) {
        throw new Error(result.error || 'Clear input failed');
      }
    } catch (error) {
      console.error('[DoAgent] Clear input failed:', error);
      throw error;
    }
  }

  private async focusElement(selector: string): Promise<void> {
    try {
      const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      const script = `
        (function() {
          try {
            const element = document.querySelector('${escapedSelector}');
            if (!element) {
              throw new Error('Element not found');
            }
            
            element.focus();
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();
      `;
      
      const result = await this.webview.executeJavaScript(script);
      if (result && !result.success) {
        throw new Error(result.error || 'Focus element failed');
      }
    } catch (error) {
      console.error('[DoAgent] Focus element failed:', error);
      throw error;
    }
  }

  private async blurElement(selector: string): Promise<void> {
    try {
      const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      const script = `
        (function() {
          try {
            const element = document.querySelector('${escapedSelector}');
            if (!element) {
              throw new Error('Element not found');
            }
            
            element.blur();
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();
      `;
      
      const result = await this.webview.executeJavaScript(script);
      if (result && !result.success) {
        throw new Error(result.error || 'Blur element failed');
      }
    } catch (error) {
      console.error('[DoAgent] Blur element failed:', error);
      throw error;
    }
  }

  private async hoverElement(selector: string): Promise<void> {
    try {
      const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      const script = `
        (function() {
          try {
            const element = document.querySelector('${escapedSelector}');
            if (!element) {
              throw new Error('Element not found');
            }
            
            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const mouseEnter = new MouseEvent('mouseenter', {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: centerX,
              clientY: centerY
            });
            
            const mouseOver = new MouseEvent('mouseover', {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: centerX,
              clientY: centerY
            });
            
            element.dispatchEvent(mouseEnter);
            element.dispatchEvent(mouseOver);
            
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();
      `;
      
      const result = await this.webview.executeJavaScript(script);
      if (result && !result.success) {
        throw new Error(result.error || 'Hover element failed');
      }
      
      await this.wait(100); // Small wait for hover effects
    } catch (error) {
      console.error('[DoAgent] Hover element failed:', error);
      throw error;
    }
  }

  private async keypressElement(selector: string, key: string): Promise<void> {
    try {
      const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      const script = `
        (function() {
          try {
            const element = document.querySelector('${escapedSelector}');
            if (!element) {
              throw new Error('Element not found');
            }
            
            element.focus();
            
            const keyEvent = new KeyboardEvent('keydown', {
              key: '${key}',
              code: '${key}',
              bubbles: true,
              cancelable: true
            });
            
            element.dispatchEvent(keyEvent);
            
            // Also dispatch keyup
            const keyUpEvent = new KeyboardEvent('keyup', {
              key: '${key}',
              code: '${key}',
              bubbles: true,
              cancelable: true
            });
            
            element.dispatchEvent(keyUpEvent);
            
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();
      `;
      
      const result = await this.webview.executeJavaScript(script);
      if (result && !result.success) {
        throw new Error(result.error || 'Keypress failed');
      }
    } catch (error) {
      console.error('[DoAgent] Keypress failed:', error);
      throw error;
    }
  }

  private async checkElement(selector: string, checked: boolean): Promise<void> {
    try {
      const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      const script = `
        (function() {
          try {
            const element = document.querySelector('${escapedSelector}');
            if (!element) {
              throw new Error('Checkbox element not found');
            }
            
            if (element.type === 'checkbox' || element.type === 'radio') {
              if (element.checked !== ${checked}) {
                element.click();
              }
              return { success: true };
            } else {
              throw new Error('Element is not a checkbox or radio button');
            }
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();
      `;
      
      const result = await this.webview.executeJavaScript(script);
      if (result && !result.success) {
        throw new Error(result.error || 'Check element failed');
      }
    } catch (error) {
      console.error('[DoAgent] Check element failed:', error);
      throw error;
    }
  }

  private async doubleClick(selector: string): Promise<void> {
    try {
      const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      const script = `
        (function() {
          try {
            const element = document.querySelector('${escapedSelector}');
            if (!element) {
              throw new Error('Element not found');
            }
            
            const dblClickEvent = new MouseEvent('dblclick', {
              view: window,
              bubbles: true,
              cancelable: true
            });
            
            element.dispatchEvent(dblClickEvent);
            
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();
      `;
      
      const result = await this.webview.executeJavaScript(script);
      if (result && !result.success) {
        throw new Error(result.error || 'Double click failed');
      }
    } catch (error) {
      console.error('[DoAgent] Double click failed:', error);
      throw error;
    }
  }

  private async rightClick(selector: string): Promise<void> {
    try {
      const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      const script = `
        (function() {
          try {
            const element = document.querySelector('${escapedSelector}');
            if (!element) {
              throw new Error('Element not found');
            }
            
            const rightClickEvent = new MouseEvent('contextmenu', {
              view: window,
              bubbles: true,
              cancelable: true,
              button: 2
            });
            
            element.dispatchEvent(rightClickEvent);
            
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();
      `;
      
      const result = await this.webview.executeJavaScript(script);
      if (result && !result.success) {
        throw new Error(result.error || 'Right click failed');
      }
    } catch (error) {
      console.error('[DoAgent] Right click failed:', error);
      throw error;
    }
  }

  private async evaluateScript(script: string): Promise<any> {
    try {
      const result = await this.webview.executeJavaScript(script);
      return result;
    } catch (error) {
      console.error('[DoAgent] Evaluate script failed:', error);
      throw error;
    }
  }

  private async takeScreenshot(): Promise<string> {
    try {
      // This would need to be implemented based on Electron's screenshot capabilities
      console.log('[DoAgent] Screenshot functionality not yet implemented');
      return 'screenshot_placeholder';
    } catch (error) {
      console.error('[DoAgent] Screenshot failed:', error);
      throw error;
    }
  }

  private generateTodoList(instruction: string, pageState: PageState, previousSteps: DoStep[]): string {
    const lowerInstruction = instruction.toLowerCase();
    const currentUrl = pageState.url;
    const completedSteps = previousSteps.filter(step => step.status === 'completed').length;
    
    // Determine task type and generate appropriate todos
    let todos: string[] = [];
    
    if (lowerInstruction.includes('airpods') && lowerInstruction.includes('amazon')) {
      todos = [
        `${completedSteps >= 1 ? '✅' : '⭕'} 1. Navigate to amazon.com`,
        `${completedSteps >= 2 ? '✅' : '⭕'} 2. Search for "Apple AirPods"`,
        `${completedSteps >= 3 ? '✅' : '⭕'} 3. Apply filters for lowest price`,
        `${completedSteps >= 4 ? '✅' : '⭕'} 4. Find cheapest genuine Apple AirPods`,
        `${completedSteps >= 5 ? '✅' : '⭕'} 5. Extract product details and prices`
      ];
    } else if (lowerInstruction.includes('flight') && (lowerInstruction.includes('la') || lowerInstruction.includes('nyc'))) {
      todos = [
        `${completedSteps >= 1 ? '✅' : '⭕'} 1. Navigate to google.com`,
        `${completedSteps >= 2 ? '✅' : '⭕'} 2. Search for "flights from Los Angeles to New York [specific dates]"`,
        `${completedSteps >= 3 ? '✅' : '⭕'} 3. Click on Google Flights result (auto-filled!)`,
        `${completedSteps >= 4 ? '✅' : '⭕'} 4. Wait for flight results to load dynamically`,
        `${completedSteps >= 5 ? '✅' : '⭕'} 5. Extract cheapest flight options and details`
      ];
    } else if (lowerInstruction.includes('data science') && lowerInstruction.includes('job')) {
      todos = [
        `${completedSteps >= 1 ? '✅' : '⭕'} 1. Navigate to linkedin.com/jobs or indeed.com`,
        `${completedSteps >= 2 ? '✅' : '⭕'} 2. Search for "data science manager" jobs`,
        `${completedSteps >= 3 ? '✅' : '⭕'} 3. Apply location and experience filters`,
        `${completedSteps >= 4 ? '✅' : '⭕'} 4. Sort by relevance or date`,
        `${completedSteps >= 5 ? '✅' : '⭕'} 5. Extract top job listings with details`
      ];
    } else if (lowerInstruction.includes('bookmark') && (lowerInstruction.includes('twitter') || lowerInstruction.includes('x'))) {
      todos = [
        `${completedSteps >= 1 ? '✅' : '⭕'} 1. Navigate to x.com/i/bookmarks`,
        `${completedSteps >= 2 ? '✅' : '⭕'} 2. Wait for bookmarks to load`,
        `${completedSteps >= 3 ? '✅' : '⭕'} 3. Extract all visible bookmark content`,
        `${completedSteps >= 4 ? '✅' : '⭕'} 4. Summarize bookmark topics and themes`
      ];
          } else {
        // Generic todos based on current state and task type
        if (currentUrl.includes('google.com')) {
          todos = [
            `${completedSteps >= 1 ? '✅' : '⭕'} 1. Analyze search results`,
            `${completedSteps >= 2 ? '✅' : '⭕'} 2. Click on most relevant result`,
            `${completedSteps >= 3 ? '✅' : '⭕'} 3. Extract desired information`,
            `${completedSteps >= 4 ? '✅' : '⭕'} 4. Complete task with summary`
          ];
        } else if (currentUrl.includes('amazon.com')) {
          todos = [
            `${completedSteps >= 1 ? '✅' : '⭕'} 1. Search for desired product`,
            `${completedSteps >= 2 ? '✅' : '⭕'} 2. Apply appropriate filters`,
            `${completedSteps >= 3 ? '✅' : '⭕'} 3. Find best matching product`,
            `${completedSteps >= 4 ? '✅' : '⭕'} 4. Extract product details`
          ];
        } else {
          // Smart default based on task complexity
          if (lowerInstruction.includes('hotel') || lowerInstruction.includes('rental') || lowerInstruction.includes('restaurant') || lowerInstruction.includes('appointment')) {
            todos = [
              `${completedSteps >= 1 ? '✅' : '⭕'} 1. Navigate to google.com`,
              `${completedSteps >= 2 ? '✅' : '⭕'} 2. Search with full details (dates, location, preferences)`,
              `${completedSteps >= 3 ? '✅' : '⭕'} 3. Click on specialized site result (auto-filled)`,
              `${completedSteps >= 4 ? '✅' : '⭕'} 4. Wait for dynamic content to load`,
              `${completedSteps >= 5 ? '✅' : '⭕'} 5. Extract information and complete task`
            ];
          } else {
            // Default task breakdown
            todos = [
              `${completedSteps >= 1 ? '✅' : '⭕'} 1. Navigate to appropriate website`,
              `${completedSteps >= 2 ? '✅' : '⭕'} 2. Locate search or interaction element`,
              `${completedSteps >= 3 ? '✅' : '⭕'} 3. Input search query or interact`,
              `${completedSteps >= 4 ? '✅' : '⭕'} 4. Find and extract relevant information`,
              `${completedSteps >= 5 ? '✅' : '⭕'} 5. Complete task with results`
            ];
          }
        }
      }
    
    // Add current step indicator
    const currentStepNumber = Math.min(completedSteps + 1, todos.length);
    const nextTodos = todos.map((todo, index) => {
      if (index === currentStepNumber - 1) {
        return `👉 ${todo} ← CURRENT STEP`;
      }
      return `   ${todo}`;
    });
    
    return nextTodos.join('\n');
  }

  private shouldIncludeDOMContext(instruction: string, previousSteps: DoStep[]): boolean {
    // Check if we need DOM context (for element interactions)
    const recentActions = previousSteps.slice(-3).map(step => step.action);
    const lastAction = previousSteps[previousSteps.length - 1]?.action;
    
    // Always need DOM context if we're about to interact with elements
    if (instruction.toLowerCase().includes('click') || 
        instruction.toLowerCase().includes('type') || 
        instruction.toLowerCase().includes('select') ||
        instruction.toLowerCase().includes('button') ||
        instruction.toLowerCase().includes('input') ||
        instruction.toLowerCase().includes('form')) {
      return true;
    }
    
    // Need DOM if recent actions involved interactions
    if (recentActions.some(action => 
      ['click', 'type', 'select_dropdown', 'clear', 'focus', 'hover'].includes(action)
    )) {
      return true;
    }
    
    // Need DOM if last action was navigation (to see what's available)
    if (lastAction === 'navigate') {
      return true;
    }
    
    // Don't need DOM for pure content analysis or wait actions
    if (lastAction === 'extract' || lastAction === 'wait' || lastAction === 'wait_for_dynamic_content') {
      return false;
    }
    
    // Default to including DOM for interactive tasks
    return true;
  }

  private shouldIncludeHTMLContext(instruction: string, previousSteps: DoStep[]): boolean {
    // Check if we need HTML context (for content analysis)
    const lastAction = previousSteps[previousSteps.length - 1]?.action;
    
    // Always need HTML if instruction involves finding/analyzing content
    if (instruction.toLowerCase().includes('find') ||
        instruction.toLowerCase().includes('cheapest') ||
        instruction.toLowerCase().includes('best') ||
        instruction.toLowerCase().includes('compare') ||
        instruction.toLowerCase().includes('extract') ||
        instruction.toLowerCase().includes('search for') ||
        instruction.toLowerCase().includes('price') ||
        instruction.toLowerCase().includes('information')) {
      return true;
    }
    
    // Need HTML if last action was extract (likely analyzing content)
    if (lastAction === 'extract') {
      return true;
    }
    
    // Need HTML if we just waited for dynamic content to load
    if (lastAction === 'wait_for_dynamic_content') {
      return true;
    }
    
    // Don't need HTML for simple navigation or form interactions
    if (['navigate', 'click', 'type', 'clear', 'focus', 'wait'].includes(lastAction || '')) {
      return false;
    }
    
    // Default to not including HTML unless specifically needed
    return false;
  }
} 