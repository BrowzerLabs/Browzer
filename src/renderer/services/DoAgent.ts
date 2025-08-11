export interface DoTask {
  id: string;
  instruction: string;
  steps: DoStep[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}
// Development feature flag - set to false to disable DoAgent entirely
const DOAGENT_ENABLED = true;

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

interface PlaywrightPage {
  goto: (url: string) => Promise<void>;
  click: (selector: string, options?: any) => Promise<void>;
  fill: (selector: string, value: string) => Promise<void>;
  type: (selector: string, text: string, options?: any) => Promise<void>;
  waitForSelector: (selector: string, options?: any) => Promise<any>;
  waitForTimeout: (timeout: number) => Promise<void>;
  evaluate: (script: string | Function, ...args: any[]) => Promise<any>;
  locator: (selector: string) => any;
  selectOption: (selector: string, values: string | string[]) => Promise<void>;
  screenshot: (options?: any) => Promise<Buffer>;
  content: () => Promise<string>;
  telegramSendMessage: (messageText: string) => Promise<any>;
  telegramSearch: (searchQuery: string, preferPrivateChat?: boolean) => Promise<any>;
  getDebugInfo: () => Promise<any>;
  title: () => Promise<string>;
  url: () => string;
  keyboard: {
    press: (key: string) => Promise<void>;
    type: (text: string) => Promise<void>;
  };
  mouse: {
    click: (x: number, y: number, options?: any) => Promise<void>;
  };
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

TELEGRAM SEARCHES: EXAMPLE CASES:
- "find my chat with CB Ventures on Telegram" → Navigate to web.telegram.org, FIRST click on the search bar, once the cursor is blinking then type the search query "CB Ventures" and press enter.
- "find my chat with CB Ventures on Telegram and open it" → Navigate to web.telegram.org, FIRST click on the search bar, once the cursor is blinking then type the search query "CB Ventures", press enter and then click on the chat with the name "CB Ventures".

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
- "search for abc jobs at xyz company" → Search Google for "abc jobs at xyz company", then use the xyz company's careers page result and click on it to view positions. NEVER USE Google Jobs tab for job searches.

CRITICAL RULES:
1. ALWAYS verify elements are in viewport before interacting (check isInViewport flag)
2. For elements not in viewport, first use "scroll" to bring them into view
3. For dropdowns/selects: If it's a native <select>, use "select_dropdown" with the option text as value
4. For date inputs: Use "type" with format "YYYY-MM-DD" for native date inputs
5. For search/autocomplete inputs: Type the value, then "wait" 1000-2000ms for suggestions. NOTE: Search inputs automatically press Enter after typing ALWAYS, so you don't need a separate keypress action.
6. ALWAYS use "wait" after actions that trigger dynamic changes
7. Use "wait_for_element" when you expect an element to appear after an action
8. Use "wait_for_dynamic_content" for sites with heavy JavaScript (Google Flights, etc.) before extracting
9. CRITICAL FOR FLIGHT SEARCHES: After typing a flight search query, ALWAYS use "wait_for_dynamic_content" to wait for Google search results to load, then look for Google Flights links to click
10. For complex forms, fill fields one by one, don't rush
11. Use "extract" periodically to understand current page state
12. Use "complete" ONLY when the task is fully accomplished with a detailed summary
13. If you've done 3+ extractions in a row, consider completing the task
14. If you need to search for something, first "click" on the search bar, wait 1000ms then type in the search bar. The system will automatically press Enter for search inputs.

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
  private playwrightPage: PlaywrightPage | null = null;

  constructor(private onProgress?: (task: DoTask, step: DoStep) => void) {}

  async executeTask(instruction: string, webview: any): Promise<DoResult> {
    if (!DOAGENT_ENABLED) {
      return {
        success: false,
        error: 'DoAgent functionality is disabled in this build',
        executionTime: 0
      };
    }
    
    if (this.isExecuting) {
      throw new Error('DoAgent is already executing a task');
    }

    this.isExecuting = true;
    this.webview = webview;
    this.stepCount = 0;
    const startTime = Date.now();

    // Initialize Playwright connection to the webview
    await this.initializePlaywright();

    try {
      const task: DoTask = {
        id: `task-${Date.now()}`,
        instruction,
        steps: [],
        status: 'running'
      };

      this.currentTask = task;
      // console.log('[DoAgent] Starting LLM-powered task execution:', instruction);

      // Start the iterative execution loop
      let isTaskComplete = false;
      let finalResult = null;

      while (!isTaskComplete && this.stepCount < this.maxSteps) {
        this.stepCount++;
        // console.log(`[DoAgent] Starting step ${this.stepCount} of ${this.maxSteps}`);
        
        // Analyze current page state
        // console.log(`[DoAgent] Analyzing page state...`);
        const pageState = await this.analyzePageState();
        // console.log(`[DoAgent] Page state analyzed: ${pageState.url}`);
        
        // Ask LLM for next action
        // console.log(`[DoAgent] Requesting next action from LLM...`);
        // console.log(`[DoAgent] Current webview state:`, {
        //   src: this.webview?.src,
        //   isLoading: this.webview?.isLoading(),
        //   canGoBack: this.webview?.canGoBack(),
        //   canGoForward: this.webview?.canGoForward()
        // });
        
        const nextAction = await this.getNextActionFromLLM(instruction, pageState, task.steps);
        // console.log(`[DoAgent] LLM suggested action: ${nextAction.action} - ${nextAction.description}`);
        
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
          // console.log(`[DoAgent] Executing step ${this.stepCount}: ${step.action} - ${step.description}`);
          await this.executeStep(step);
          step.status = 'completed';
          // console.log(`[DoAgent] Step ${this.stepCount} completed successfully`);
        } catch (error) {
          step.status = 'failed';
          step.error = (error as Error).message;
          console.error(`[DoAgent] Step ${this.stepCount} failed: ${step.description}`, error);
          
          // If this is a critical error, stop execution
          if (step.action === 'navigate' && this.stepCount <= 2) {
            task.status = 'failed';
            task.error = step.error;
            console.error(`[DoAgent] Critical navigation error, stopping execution`);
            break;
          }
        }

        // console.log(`[DoAgent] About to continue to next step. Current step count: ${this.stepCount}/${this.maxSteps}`);
        
        // Add a small delay between steps
        await this.wait(1000);
        
        // console.log(`[DoAgent] Continuing execution loop...`);
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
      this.playwrightPage = null;
    }
  }

  private async initializePlaywright(): Promise<void> {
    try {
      if (!this.webview) {
        throw new Error('Webview not available for Playwright wrapper');
      }
      
      // Configure webview to behave more like a real browser
      try {
        // Set a realistic user agent
        const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        if (this.webview.setUserAgent) {
          this.webview.setUserAgent(userAgent);
        }
        
        // Enable web security (some sites require this)
        if (this.webview.getWebContents) {
          const webContents = this.webview.getWebContents();
          if (webContents) {
            // Set additional headers that might help with rendering
            webContents.session.webRequest.onBeforeSendHeaders((details: any, callback: any) => {
              details.requestHeaders['User-Agent'] = userAgent;
              details.requestHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
              details.requestHeaders['Accept-Language'] = 'en-US,en;q=0.5';
              callback({ requestHeaders: details.requestHeaders });
            });
          }
        }
      } catch (error) {
        console.warn('[DoAgent] Could not configure webview settings:', error);
      }
      
      // Create a Playwright-like API wrapper that uses the webview's executeJavaScript
      // This gives us the clean Playwright API without actually using Playwright
      this.playwrightPage = {
        goto: async (url: string) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              this.webview.removeEventListener('did-finish-load', onLoad);
              this.webview.removeEventListener('did-fail-load', onError);
              reject(new Error(`Navigation timeout for ${url}`));
            }, 30000); // 30 second timeout
            
            const onLoad = () => {
              clearTimeout(timeout);
              this.webview.removeEventListener('did-finish-load', onLoad);
              this.webview.removeEventListener('did-fail-load', onError);
              resolve();
            };
            const onError = (event: any) => {
              clearTimeout(timeout);
              this.webview.removeEventListener('did-finish-load', onLoad);
              this.webview.removeEventListener('did-fail-load', onError);
              reject(new Error(`Navigation failed: ${event.errorDescription || 'Unknown error'}`));
            };
            
            try {
              this.webview.addEventListener('did-finish-load', onLoad);
              this.webview.addEventListener('did-fail-load', onError);
              this.webview.loadURL(url);
            } catch (error) {
              clearTimeout(timeout);
              reject(new Error(`Failed to load URL: ${(error as Error).message}`));
            }
          });
        },

        click: async (selector: string, options?: any) => {
          const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          
          // First, let's check if element exists and get info
          const checkScript = `
            (() => {
              try {
                const element = document.querySelector('${escapedSelector}');
                if (!element) return { success: false, error: 'Element not found: ${selector}' };
                
                const rect = element.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0;
                const computedStyle = getComputedStyle(element);
                const isDisplayed = computedStyle.display !== 'none';
                
                return { 
                  success: true, 
                  visible: isVisible,
                  displayed: isDisplayed,
                  rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                  tag: element.tagName,
                  id: element.id,
                  classes: element.className
                };
              } catch (error) {
                return { success: false, error: error.message };
              }
            })()
          `;
          
          const elementInfo = await this.webview.executeJavaScript(checkScript);
          if (!elementInfo.success) {
            throw new Error(elementInfo.error);
          }
          
          if (!elementInfo.visible || !elementInfo.displayed) {
            throw new Error(`Element is not visible or displayed: ${selector}`);
          }
          
          // console.log('[DoAgent] Element found and visible, proceeding with click:', elementInfo);
          
          // Now perform the click with a simpler synchronous script
          const clickScript = `
            (() => {
              try {
                const element = document.querySelector('${escapedSelector}');
                if (!element) return { success: false, error: 'Element not found during click' };
                
                // Scroll into view first
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Focus if it's an interactive element
                if (element.focus) {
                  element.focus();
                }
                
                // Get center coordinates for mouse events
                const rect = element.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                // Dispatch mouse events
                const mouseDown = new MouseEvent('mousedown', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: centerX,
                    clientY: centerY,
                    button: 0
                  });
                element.dispatchEvent(mouseDown);
                
                const mouseUp = new MouseEvent('mouseup', {
                  view: window,
                  bubbles: true,
                  cancelable: true,
                  clientX: centerX,
                  clientY: centerY,
                  button: 0
                });
                element.dispatchEvent(mouseUp);
                
                const clickEvent = new MouseEvent('click', {
                  view: window,
                  bubbles: true,
                  cancelable: true,
                  clientX: centerX,
                  clientY: centerY,
                  button: 0
                });
                element.dispatchEvent(clickEvent);
                
                // Also call native click
                element.click();
                
                // For form elements, trigger additional events
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                  element.dispatchEvent(new Event('focus', { bubbles: true }));
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                return { success: true, message: 'Click executed successfully' };
              } catch (error) {
                return { success: false, error: error.message };
              }
            })()
          `;
          
          const clickResult = await this.webview.executeJavaScript(clickScript);
          if (!clickResult.success) {
            throw new Error(clickResult.error);
          }
          
          // console.log('[DoAgent] Click executed successfully');
          return clickResult;
        },

        fill: async (selector: string, value: string) => {
          // console.log(`[DoAgent] Fill called with selector: "${selector}", value: "${value}"`);
          // console.log(`[DoAgent] Current URL before fill:`, this.webview.src);
          const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const script = `
            (async () => {
              try {
                // console.log('[DoAgent-WebView] Starting fill operation for selector: ${escapedSelector}');
                const element = document.querySelector('${escapedSelector}');
                if (!element) throw new Error('Element not found: ${selector}');
                
                // console.log('[DoAgent-WebView] Element found:', {
                //   tagName: element.tagName,
                //   type: element.type,
                //   name: element.name,
                //   id: element.id,
                //   placeholder: element.placeholder,
                //   ariaLabel: element.getAttribute('aria-label')
                // });
                
                element.focus();
                element.value = '';
                element.value = '${escapedValue}';
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                
                // console.log('[DoAgent-WebView] Value set to:', element.value);
                
                // Simple auto-Enter for Google search box only
                const isGoogleSearchBox = element.id === 'APjFqb' || element.name === 'q';
                
                if (isGoogleSearchBox) {
                  // Wait a moment for the input to settle
                  await new Promise(resolve => setTimeout(resolve, 500));
                  
                  // Press Enter - simple and direct
                  const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                  });
                  
                  element.dispatchEvent(enterEvent);
                  
                  // Also try form submission as backup
                  const form = element.closest('form');
                  if (form) {
                    setTimeout(() => form.submit(), 100);
                  }
                }
                
                return { success: true, isSearchInput: isGoogleSearchBox, elementInfo: {
                  tagName: element.tagName,
                  type: element.type,
                  name: element.name,
                  id: element.id,
                  value: element.value
                }};
              } catch (error) {
                console.error('[DoAgent-WebView] Fill operation failed:', error);
                return { success: false, error: error.message };
              }
            })();
          `;
          const result = await this.webview.executeJavaScript(script);
          // console.log('[DoAgent] Fill result:', result);
          // console.log(`[DoAgent] Current URL after fill:`, this.webview.src);
          
          if (result && !result.success) {
            throw new Error(result.error);
          }
          
          // If auto-Enter was triggered, wait a moment to see if navigation happens
          if (result && result.isSearchInput) {
            // console.log('[DoAgent] Auto-Enter was triggered, waiting to see if navigation occurs...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            // console.log(`[DoAgent] URL after auto-Enter wait:`, this.webview.src);
          }
          
          return result;
        },

        type: async (selector: string, text: string, options?: any) => {
          const delay = options?.delay || 50;
          const script = `
            (async () => {
              const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
              if (!element) throw new Error('Element not found: ${selector}');
              
              element.focus();
              element.value = '';
              
              const text = '${text.replace(/'/g, "\\'")}';
              for (let i = 0; i < text.length; i++) {
                element.value += text[i];
                element.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, ${delay}));
              }
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            })();
          `;
          return await this.webview.executeJavaScript(script);
        },

        waitForSelector: async (selector: string, options?: any) => {
          const timeout = options?.timeout || 5000;
          const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const script = `
            (async () => {
              try {
                const startTime = Date.now();
                while (Date.now() - startTime < ${timeout}) {
                  const element = document.querySelector('${escapedSelector}');
                  if (element && getComputedStyle(element).display !== 'none') {
                    return { success: true, element: true };
                  }
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
                throw new Error('Timeout waiting for selector: ${selector}');
              } catch (error) {
                return { success: false, error: error.message };
              }
            })();
          `;
          const result = await this.webview.executeJavaScript(script);
          if (result && !result.success) {
            throw new Error(result.error);
          }
          return result;
        },

        waitForTimeout: async (timeout: number) => {
          return new Promise(resolve => setTimeout(resolve, timeout));
        },

        evaluate: async (script: string | Function, ...args: any[]) => {
          if (typeof script === 'function') {
            const scriptStr = `(${script.toString()})(${args.map(arg => JSON.stringify(arg)).join(',')})`;
            return await this.webview.executeJavaScript(scriptStr);
          }
          return await this.webview.executeJavaScript(script);
        },

        locator: (selector: string) => ({
          click: async (options?: any) => {
            return await this.playwrightPage!.click(selector, options);
          },
          fill: async (value: string) => {
            return await this.playwrightPage!.fill(selector, value);
          },
          type: async (text: string, options?: any) => {
            return await this.playwrightPage!.type(selector, text, options);
          },
          waitFor: async (options?: any) => {
            return await this.playwrightPage!.waitForSelector(selector, options);
          },
          count: async () => {
            const script = `document.querySelectorAll('${selector.replace(/'/g, "\\'")}').length`;
            return await this.webview.executeJavaScript(script);
          }
        }),

        selectOption: async (selector: string, values: string | string[]) => {
          const value = Array.isArray(values) ? values[0] : values;
          const script = `
            (async () => {
              const select = document.querySelector('${selector.replace(/'/g, "\\'")}');
              if (!select) throw new Error('Select element not found: ${selector}');
              
              if (select.tagName === 'SELECT') {
                select.value = '${value.replace(/'/g, "\\'")}';
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
              throw new Error('Element is not a select');
            })();
          `;
          return await this.webview.executeJavaScript(script);
        },

        screenshot: async (options?: any) => {
          // Simple screenshot placeholder - would need proper implementation
          // console.log('[DoAgent] Screenshot requested but not implemented');
          return Buffer.from('screenshot-placeholder');
        },

        content: async () => {
          return await this.webview.executeJavaScript('document.documentElement.outerHTML');
        },

        // Specialized method for Telegram messaging
        telegramSendMessage: async (messageText: string) => {
          const script = `
            (async () => {
              try {
                // Find the message input area - try multiple selectors
                const messageInputSelectors = [
                  'div[contenteditable="true"]',
                  '.input-message-input',
                  '.message-input-field',
                  '[data-testid="message-input"]',
                  '.input-field-input',
                  '.composer-input',
                  '.message-compose-input',
                  'div[role="textbox"]',
                  '.input-message-container div[contenteditable]',
                  '.input-wrapper div[contenteditable]'
                ];
                
                let messageInput = null;
                for (const selector of messageInputSelectors) {
                  const elements = document.querySelectorAll(selector);
                  for (const el of elements) {
                    // Check if this is actually a message input (not search or other input)
                    const rect = el.getBoundingClientRect();
                    const isVisible = rect.width > 0 && rect.height > 0;
                    const isInMessageArea = el.closest('.input-message') || 
                                          el.closest('.message-input') || 
                                          el.closest('.composer') ||
                                          el.closest('.chat-input');
                    
                    if (isVisible && isInMessageArea) {
                      messageInput = el;
                      break;
                    }
                  }
                  if (messageInput) break;
                }
                
                if (!messageInput) {
                  throw new Error('Message input not found');
                }
                
                // Make sure we're not clicking on voice recording button
                const voiceButton = document.querySelector('.btn-send-voice') || 
                                  document.querySelector('[data-testid="voice-button"]') ||
                                  document.querySelector('.record-button') ||
                                  document.querySelector('.voice-record-button');
                
                if (voiceButton) {
                  const voiceRect = voiceButton.getBoundingClientRect();
                  const inputRect = messageInput.getBoundingClientRect();
                  
                  // If voice button overlaps with input, we need to be more careful
                  if (Math.abs(voiceRect.x - inputRect.x) < 50) {
                    // console.log('Voice button detected near input, being careful with click positioning');
                  }
                }
                
                // Step 1: Focus the message input (click on the text area, not buttons)
                const inputRect = messageInput.getBoundingClientRect();
                
                // Make sure the input is visible and in viewport
                if (inputRect.width === 0 || inputRect.height === 0) {
                  throw new Error('Message input is not visible');
                }
                
                // Scroll the input into view if needed
                messageInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Get updated rect after scrolling
                const updatedRect = messageInput.getBoundingClientRect();
                const safeClickX = updatedRect.left + updatedRect.width * 0.3; // Click on left 30% of input
                const safeClickY = updatedRect.top + updatedRect.height * 0.5; // Click in middle vertically
                
                // Multiple focus attempts for better reliability
                // 1. Direct focus
                messageInput.focus();
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // 2. Click event
                const clickEvent = new MouseEvent('click', {
                  view: window,
                  bubbles: true,
                  cancelable: true,
                  clientX: safeClickX,
                  clientY: safeClickY
                });
                messageInput.dispatchEvent(clickEvent);
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // 3. Mouse down/up sequence
                const mouseDownEvent = new MouseEvent('mousedown', {
                  view: window,
                  bubbles: true,
                  cancelable: true,
                  clientX: safeClickX,
                  clientY: safeClickY
                });
                messageInput.dispatchEvent(mouseDownEvent);
                
                const mouseUpEvent = new MouseEvent('mouseup', {
                  view: window,
                  bubbles: true,
                  cancelable: true,
                  clientX: safeClickX,
                  clientY: safeClickY
                });
                messageInput.dispatchEvent(mouseUpEvent);
                
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // Step 2: Clear existing content
                messageInput.textContent = '';
                messageInput.innerHTML = '';
                
                // Step 3: Insert the message text
                messageInput.textContent = '${messageText.replace(/'/g, "\\'")}';
                messageInput.innerHTML = '${messageText.replace(/'/g, "\\'")}';
                
                // Step 4: Trigger input events
                const inputEvent = new Event('input', { bubbles: true });
                messageInput.dispatchEvent(inputEvent);
                
                const changeEvent = new Event('change', { bubbles: true });
                messageInput.dispatchEvent(changeEvent);
                
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // Step 5: Find and click the send button (NOT voice button)
                const sendButtonSelectors = [
                  '.btn-send:not(.btn-send-voice)',
                  '.send-button:not(.voice-button)',
                  '[data-testid="send-button"]',
                  '.message-send-button',
                  '.btn-circle.btn-send',
                  'button[title*="Send"]',
                  '.tgico-send'
                ];
                
                let sendButton = null;
                for (const selector of sendButtonSelectors) {
                  sendButton = document.querySelector(selector);
                  if (sendButton) {
                    // Make sure it's not a voice button
                    const isVoiceButton = sendButton.classList.contains('btn-send-voice') ||
                                        sendButton.classList.contains('voice-button') ||
                                        sendButton.getAttribute('data-testid') === 'voice-button';
                    
                    if (!isVoiceButton) break;
                  }
                }
                
                if (!sendButton) {
                  // Try Enter key as fallback
                  const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true
                  });
                  messageInput.dispatchEvent(enterEvent);
                } else {
                  // Click the send button
                  sendButton.click();
                }
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
                return {
                  success: true,
                  messageText: '${messageText}',
                  inputFound: true,
                  sendButtonFound: !!sendButton,
                  inputSelector: messageInput.tagName + (messageInput.id ? '#' + messageInput.id : '') + (messageInput.className ? '.' + messageInput.className.split(' ').join('.') : '')
                };
              } catch (error) {
                return { success: false, error: error.message };
              }
            })();
          `;
          return await this.webview.executeJavaScript(script);
        },

        // Enhanced Telegram search with chat type detection
        telegramSearch: async (searchQuery: string, preferPrivateChat: boolean = true) => {
          const script = `
            (async () => {
              try {
                // First, find the search input - try multiple selectors
                const searchSelectors = [
                  'input[type="search"]',
                  'input[placeholder*="Search"]',
                  'input[placeholder*="search"]',
                  '.search-input',
                  '.SearchField input',
                  '[data-testid="search-input"]',
                  '#search-input',
                  '.tgico-search ~ input',
                  '.search-wrapper input'
                ];
                
                let searchInput = null;
                for (const selector of searchSelectors) {
                  searchInput = document.querySelector(selector);
                  if (searchInput) break;
                }
                
                if (!searchInput) {
                  // Try to find by looking for search-related elements
                  const searchElements = document.querySelectorAll('*[class*="search"], *[placeholder*="search"], *[placeholder*="Search"]');
                  for (const el of searchElements) {
                    if (el.tagName === 'INPUT') {
                      searchInput = el;
                      break;
                    }
                  }
                }
                
                if (!searchInput) {
                  throw new Error('Search input not found');
                }
                
                // Get the search container/wrapper
                const searchContainer = searchInput.closest('.search-wrapper') || 
                                      searchInput.closest('.search-container') ||
                                      searchInput.closest('[class*="search"]') ||
                                      searchInput.parentElement;
                
                // Step 1: Activate the search area
                if (searchContainer) {
                  searchContainer.click();
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
                
                // Step 2: Focus the search input
                searchInput.focus();
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // Step 3: Clear existing content
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Step 4: Type the search query
                searchInput.value = '${searchQuery.replace(/'/g, "\\'")}';
                
                // Step 5: Trigger all necessary events
                const events = ['input', 'change', 'keyup'];
                for (const eventType of events) {
                  const event = new Event(eventType, { bubbles: true });
                  searchInput.dispatchEvent(event);
                  await new Promise(resolve => setTimeout(resolve, 50));
                }
                
                // Wait for search results to appear
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Step 6: Find and analyze search results
                const searchResults = [];
                const resultSelectors = [
                  '.chatlist-chat',
                  '.search-result',
                  '.dialog-container',
                  '.chat-list-item',
                  '[data-testid="chat-item"]'
                ];
                
                for (const selector of resultSelectors) {
                  const results = document.querySelectorAll(selector);
                  results.forEach((result, index) => {
                    const nameElement = result.querySelector('.chat-title, .dialog-title, .name, h3, .user-name');
                    const subtitleElement = result.querySelector('.chat-subtitle, .dialog-subtitle, .last-message, .subtitle');
                    
                    if (nameElement) {
                      const name = nameElement.textContent?.trim() || '';
                      const subtitle = subtitleElement?.textContent?.trim() || '';
                      
                      // Determine if this is a private chat or group
                      const isGroup = subtitle.includes('member') || 
                                    subtitle.includes('participant') || 
                                    result.classList.contains('group') ||
                                    result.querySelector('.group-icon') ||
                                    name.includes('x') || // "Tommy x Anna x Rahul" format
                                    subtitle.match(/\\d+\\s+(member|participant)/);
                      
                      const isPrivate = !isGroup && !subtitle.includes('@');
                      
                      searchResults.push({
                        element: result,
                        name: name,
                        subtitle: subtitle,
                        isGroup: isGroup,
                        isPrivate: isPrivate,
                        index: index,
                        selector: selector
                      });
                    }
                  });
                }
                
                // Step 7: Select the best match based on preference
                let selectedResult = null;
                const queryLower = '${searchQuery.toLowerCase()}';
                
                // First, try to find exact name match with preference
                const exactMatches = searchResults.filter(result => 
                  result.name.toLowerCase().includes(queryLower)
                );
                
                if (exactMatches.length > 0) {
                  if (${preferPrivateChat}) {
                    // Prefer private chats
                    selectedResult = exactMatches.find(r => r.isPrivate) || exactMatches[0];
                  } else {
                    // Take first match
                    selectedResult = exactMatches[0];
                  }
                } else if (searchResults.length > 0) {
                  selectedResult = searchResults[0];
                }
                
                if (selectedResult) {
                  // Click on the selected result
                  selectedResult.element.click();
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  
                  return {
                    success: true,
                    searchQuery: '${searchQuery}',
                    selectedChat: {
                      name: selectedResult.name,
                      subtitle: selectedResult.subtitle,
                      isGroup: selectedResult.isGroup,
                      isPrivate: selectedResult.isPrivate
                    },
                    totalResults: searchResults.length,
                    allResults: searchResults.map(r => ({
                      name: r.name,
                      subtitle: r.subtitle,
                      isGroup: r.isGroup,
                      isPrivate: r.isPrivate
                    }))
                  };
                } else {
                  throw new Error('No search results found');
                }
              } catch (error) {
                return { success: false, error: error.message };
              }
            })();
          `;
          return await this.webview.executeJavaScript(script);
        },

        // Debug method to get detailed DOM info
        getDebugInfo: async () => {
          const script = `
            (function() {
              return {
                url: window.location.href,
                title: document.title,
                userAgent: navigator.userAgent,
                bodyHTML: document.body ? document.body.outerHTML.substring(0, 10000) : 'No body',
                headHTML: document.head ? document.head.outerHTML.substring(0, 5000) : 'No head',
                allElements: document.querySelectorAll('*').length,
                visibleElements: Array.from(document.querySelectorAll('*')).filter(el => {
                  const style = getComputedStyle(el);
                  return style.display !== 'none' && style.visibility !== 'hidden';
                }).length,
                scripts: Array.from(document.querySelectorAll('script')).map(s => s.src || 'inline').slice(0, 10),
                stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href).slice(0, 10),
                readyState: document.readyState,
                hasJavaScript: !!window.jQuery || !!window.React || !!window.Vue || !!window.angular,
                viewport: {
                  width: window.innerWidth,
                  height: window.innerHeight,
                  scrollX: window.scrollX,
                  scrollY: window.scrollY
                }
              };
            })();
          `;
          return await this.webview.executeJavaScript(script);
        },

        title: async () => {
          return await this.webview.executeJavaScript('document.title');
        },

        url: () => {
          return this.webview.src || '';
        },

        keyboard: {
          press: async (key: string) => {
            const script = `
              document.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true }));
              document.dispatchEvent(new KeyboardEvent('keyup', { key: '${key}', bubbles: true }));
            `;
            return await this.webview.executeJavaScript(script);
          },
          type: async (text: string) => {
            const script = `
              const activeElement = document.activeElement;
              if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                activeElement.value += '${text.replace(/'/g, "\\'")}';
                activeElement.dispatchEvent(new Event('input', { bubbles: true }));
              }
            `;
            return await this.webview.executeJavaScript(script);
          }
        },

        mouse: {
          click: async (x: number, y: number, options?: any) => {
            const script = `
              const element = document.elementFromPoint(${x}, ${y});
              if (element) {
                element.click();
              }
            `;
            return await this.webview.executeJavaScript(script);
          }
        }
      };

      // console.log('[DoAgent] Playwright-like wrapper initialized successfully');
    } catch (error) {
      console.error('[DoAgent] Failed to initialize Playwright wrapper:', error);
      throw new Error(`Playwright wrapper initialization failed: ${(error as Error).message}`);
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
      // console.log('[DoAgent] Page state analyzed:', {
      //   url: result.url,
      //   title: result.title,
      //   elementCount: result.interactiveElements.length
      // });
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
      
      // Check for infinite keypress loops (like the flight search issue)
      const recentKeypresses = previousSteps.filter(step => 
        step.action === 'keypress' && step.options?.key === 'Enter'
      ).slice(-5); // Check last 5 steps
      
      if (recentKeypresses.length >= 3) {
        console.warn('[DoAgent] Detected repeated Enter key presses, suggesting alternative approach');
        return {
          action: 'navigate',
          target: 'https://www.google.com/travel/flights',
          description: 'Navigate directly to Google Flights to avoid search loop',
          reasoning: 'Detected repeated Enter key failures on search, switching to direct navigation approach'
        };
      }
      
      // Check for repeated typing in the same element (another sign of loops)
      const recentTypes = previousSteps.filter(step => 
        step.action === 'type' && step.selector === (previousSteps[previousSteps.length - 1]?.selector)
      ).slice(-3);
      
      if (recentTypes.length >= 2) {
        console.warn('[DoAgent] Detected repeated typing in same element, may be stuck in loop');
      }
      
      // Get API key and provider from the browser
      const provider = this.getSelectedProvider();
      const apiKey = localStorage.getItem(`${provider}_api_key`);
      
      if (!apiKey) {
        throw new Error(`No API key found for ${provider}`);
      }

      const prompt = this.buildPrompt(instruction, pageState, previousSteps);
      
      // console.log('[DoAgent] Asking LLM for next action...');
      
      // Log the prompt using window.electronAPI (context isolation compatible)
      try {
        await window.electronAPI.ipcInvoke('log-llm-request', {
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
      } catch (error) {
        console.warn('[DoAgent] Failed to log LLM request:', error);
      }
      
      const startTime = Date.now();
      
      // Call LLM via IPC to main process with system prompt
      // console.log('[DoAgent] Making IPC call to main process...');
      const response = await window.electronAPI.ipcInvoke('call-llm', {
        provider: provider as 'anthropic' | 'openai',
        apiKey: apiKey,
        systemPrompt: SYSTEM_PROMPT,
        prompt: prompt,
        maxTokens: 1000
      });
      // console.log('[DoAgent] IPC call completed, response success:', response?.success);
      
      const executionTime = Date.now() - startTime;

      // Log the response using window.electronAPI
      try {
        await window.electronAPI.ipcInvoke('log-llm-response', {
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
      } catch (error) {
        console.warn('[DoAgent] Failed to log LLM response:', error);
      }

      if (!response.success) {
        throw new Error(response.error || 'LLM call failed');
      }

      // console.log('[DoAgent] LLM response received:', response.response);
      return this.parseActionFromResponse(response.response);

    } catch (error) {
      console.error('[DoAgent] Failed to get action from LLM:', error);
      
      // Log the error using window.electronAPI
      try {
        await window.electronAPI.ipcInvoke('log-llm-response', {
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
      } catch (logError) {
        console.warn('[DoAgent] Failed to log LLM error:', logError);
      }
      
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
    // console.log('[DoAgent] Executing step:', step.description);

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
          const typeResult = await this.type(step.selector!, step.value!, step.options);
          // console.log('[DoAgent] Type result:', typeResult);
          
          // Check if auto-Enter was triggered and wait for navigation
          if (typeResult && typeResult.isSearchInput) {
            // console.log('[DoAgent] Auto-Enter detected, waiting for navigation to complete...');
            // console.log('[DoAgent] Current URL before wait:', this.webview?.src);
            await this.wait(3000); // Wait 3 seconds for Google search results to load
            // console.log('[DoAgent] Navigation wait completed after auto-Enter');
            // console.log('[DoAgent] Current URL after wait:', this.webview?.src);
          } else {
            // console.log('[DoAgent] No auto-Enter detected, type result was:', typeResult);
          }
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

      // console.log('[DoAgent] Step completed:', step.description);

    } catch (error) {
      console.error('[DoAgent] Step failed:', step.description, error);
      throw error;
    }
  }

  private async navigate(url: string): Promise<void> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    // console.log('[DoAgent] Navigating to:', url);
    await this.playwrightPage.goto(url);
    
    // Wait a bit for the page to settle
    await this.playwrightPage.waitForTimeout(1000);
  }

  private async type(selector: string, value: string, options?: any): Promise<any> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    // console.log('[DoAgent] Typing into:', selector);
    
    // Wait for element to be available
    await this.playwrightPage.waitForSelector(selector, { timeout: 5000 });
    
    // Use Playwright's fill method for more reliable input
    const result = await this.playwrightPage.fill(selector, value);
    
    // console.log('[DoAgent] Type operation completed successfully');
    return result;
  }

  private cleanSelector(selector: string): string {
    // Fix common invalid selector patterns
    let cleaned = selector;
    
    // Fix [#id] pattern to #id
    cleaned = cleaned.replace(/\[#([a-zA-Z][\w-]*)\]/g, '#$1');
    
    // Fix [.class] pattern to .class
    cleaned = cleaned.replace(/\[\.([a-zA-Z][\w-]*)\]/g, '.$1');
    
    // console.log(`[DoAgent] Cleaned selector: "${selector}" -> "${cleaned}"`);
    return cleaned;
  }

  private parseSelector(selector: string): any {
    // First clean the selector
    const cleanedSelector = this.cleanSelector(selector);
    
    const result: any = {
      element: '',
      id: '',
      classes: [] as string[],
      dataTestId: '',
      text: '',
      attributes: {} as Record<string, string>,
      originalSelector: selector,
      cleanedSelector: cleanedSelector
    };

    // Extract element type from cleaned selector
    const elementMatch = cleanedSelector.match(/^([a-zA-Z]+)/);
    if (elementMatch) {
      result.element = elementMatch[1];
    }

    // Extract ID from cleaned selector
    const idMatch = cleanedSelector.match(/\[id[*^$~|]?=['"]([^'"]+)['"]\]|#([a-zA-Z][\w-]*)/);
    if (idMatch) {
      result.id = idMatch[1] || idMatch[2];
    }

    // Extract data-testid
    const testIdMatch = selector.match(/\[data-testid[*^$~|]?=['"]([^'"]+)['"]\]/);
    if (testIdMatch) {
      result.dataTestId = testIdMatch[1];
    }

    // Extract classes
    const classMatches = selector.match(/\.([a-zA-Z][\w-]*)/g);
    if (classMatches) {
      result.classes = classMatches.map(cls => cls.substring(1));
    }

    // Extract text from :has-text() or similar
    const textMatch = selector.match(/:has-text\(['"]([^'"]+)['"]\)|:contains\(['"]([^'"]+)['"]\)/);
    if (textMatch) {
      result.text = textMatch[1] || textMatch[2];
    }

    // Extract attributes with values
    const attrWithValueMatches = selector.matchAll(/\[([a-zA-Z-]+)([*^$~|]?)=['"]([^'"]+)['"]\]/g);
    for (const match of attrWithValueMatches) {
      if (match[1] !== 'id' && match[1] !== 'data-testid') {
        result.attributes[match[1]] = match[3];
      }
    }

    // Extract attributes without values (like [aria-controls], [disabled], etc.)
    const attrWithoutValueMatches = selector.matchAll(/\[([a-zA-Z-]+)\]/g);
    for (const match of attrWithoutValueMatches) {
      if (match[1] !== 'id' && match[1] !== 'data-testid' && !result.attributes[match[1]]) {
        result.attributes[match[1]] = ''; // Empty string indicates presence check
      }
    }

    return result;
  }

  private async click(selector: string, options?: any): Promise<void> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    // console.log('[DoAgent] Attempting to click on:', selector);
    
    // Clean the selector first
    const cleanedSelectorString = this.cleanSelector(selector);
    let actualSelector = cleanedSelectorString;
    
    try {
      // First, try to wait for the cleaned selector with a shorter timeout
      await this.playwrightPage.waitForSelector(cleanedSelectorString, { timeout: 2000 });
      // console.log('[DoAgent] Cleaned selector found:', cleanedSelectorString);
    } catch (timeoutError) {
      console.warn('[DoAgent] Cleaned selector not found, trying intelligent element discovery:', cleanedSelectorString);
      
      // Parse the selector to understand what we're looking for
      const originalSelector = selector;
      const cleanedSelector = this.parseSelector(selector);
      
      const smartDiscoveryScript = `
        (() => {
          const originalSelector = '${originalSelector}';
          const targetInfo = ${JSON.stringify(cleanedSelector)};
          
          // Multiple search strategies
          const strategies = [];
          
                     // Strategy 1: Exact match attempts with variations
           if (targetInfo.id) {
             strategies.push({ type: 'id', selector: '#' + targetInfo.id, reason: 'exact ID match' });
             strategies.push({ type: 'id-partial', selector: '[id*="' + targetInfo.id + '"]', reason: 'partial ID match' });
           }
           
           if (targetInfo.dataTestId) {
             strategies.push({ type: 'data-testid', selector: '[data-testid="' + targetInfo.dataTestId + '"]', reason: 'exact data-testid' });
             strategies.push({ type: 'data-testid-partial', selector: '[data-testid*="' + targetInfo.dataTestId + '"]', reason: 'partial data-testid' });
           }
           
           if (targetInfo.classes && targetInfo.classes.length > 0) {
             strategies.push({ type: 'class', selector: '.' + targetInfo.classes.join('.'), reason: 'exact classes' });
             targetInfo.classes.forEach(cls => {
               strategies.push({ type: 'class-single', selector: '.' + cls, reason: 'single class: ' + cls });
             });
           }
           
           // Handle attributes (with and without values)
           Object.keys(targetInfo.attributes || {}).forEach(attrName => {
             const attrValue = targetInfo.attributes[attrName];
             if (attrValue === '') {
               // Attribute without value (presence check)
               strategies.push({ type: 'attr-presence', selector: '[' + attrName + ']', reason: 'attribute presence: ' + attrName });
             } else {
               // Attribute with value
               strategies.push({ type: 'attr-exact', selector: '[' + attrName + '="' + attrValue + '"]', reason: 'exact attribute: ' + attrName });
               strategies.push({ type: 'attr-partial', selector: '[' + attrName + '*="' + attrValue + '"]', reason: 'partial attribute: ' + attrName });
             }
           });
          
          // Strategy 2: Function-based discovery
          const functionMap = {
            'textarea': ['textarea', '[contenteditable]', '[role="textbox"]', 'input[type="text"]'],
            'tweetTextarea': ['textarea', '[contenteditable]', '[data-testid*="tweet"]', '[placeholder*="tweet"]', '[placeholder*="post"]'],
            'button': ['button', '[role="button"]', 'a[href]', '[onclick]', '.btn', '.button'],
            'accordion': ['[id*="accordion"]', '[class*="accordion"]', '[aria-expanded]', 'summary', 'details'],
            'department': ['[id*="department"]', '[class*="department"]', '[data-department]'],
            'dropdown': ['select', '[role="combobox"]', '[aria-haspopup]', '.dropdown', '[class*="dropdown"]'],
            'input': ['input', 'textarea', '[contenteditable]', '[role="textbox"]'],
            'clickable': ['button', 'a', '[onclick]', '[role="button"]', '[tabindex="0"]']
          };
          
          // Determine likely function from selector
          const probableFunctions = [];
          if (targetInfo.element === 'textarea' || targetInfo.dataTestId?.includes('textarea')) probableFunctions.push('textarea', 'tweetTextarea');
          if (targetInfo.element === 'button' || targetInfo.text?.toLowerCase().includes('click')) probableFunctions.push('button');
          if (targetInfo.id?.includes('accordion') || targetInfo.text?.toLowerCase().includes('expand')) probableFunctions.push('accordion');
          if (targetInfo.id?.includes('department') || targetInfo.text?.toLowerCase().includes('department')) probableFunctions.push('department');
          if (originalSelector.includes('dropdown') || targetInfo.text?.toLowerCase().includes('dropdown')) probableFunctions.push('dropdown');
          
          probableFunctions.forEach(func => {
            if (functionMap[func]) {
              functionMap[func].forEach(sel => {
                strategies.push({ type: 'function', selector: sel, reason: 'function-based: ' + func });
              });
            }
          });
          
          // Strategy 3: Text content matching
          if (targetInfo.text) {
            const searchText = targetInfo.text.toLowerCase();
            strategies.push({ type: 'text-exact', selector: \`*:contains("\${targetInfo.text}")\`, reason: 'exact text match' });
            // Add variations without :contains() since it's not standard CSS
            ['button', 'a', 'div', 'span', 'input', 'textarea'].forEach(tag => {
              strategies.push({ type: 'text-tag', selector: tag, reason: 'text in ' + tag, textSearch: targetInfo.text });
            });
          }
          
          // Strategy 4: Semantic discovery
          if (targetInfo.dataTestId?.includes('tweet') || originalSelector.includes('tweet')) {
            strategies.push(
              { type: 'semantic', selector: '[contenteditable="true"]', reason: 'Twitter-like compose area' },
              { type: 'semantic', selector: '[role="textbox"]', reason: 'textbox role' },
              { type: 'semantic', selector: 'textarea', reason: 'standard textarea' },
              { type: 'semantic', selector: '[placeholder*="What"]', reason: 'compose placeholder' }
            );
          }
          
          // Execute strategies and find elements
          const results = [];
          strategies.forEach((strategy, index) => {
            try {
              let elements = [];
              
              if (strategy.textSearch) {
                // Special handling for text-based searches
                const allElements = document.querySelectorAll(strategy.selector);
                elements = Array.from(allElements).filter(el => 
                  el.textContent?.toLowerCase().includes(strategy.textSearch.toLowerCase())
                );
              } else if (strategy.selector.includes(':contains(')) {
                // Skip :contains() selectors as they're not standard CSS
                return;
              } else {
                elements = Array.from(document.querySelectorAll(strategy.selector));
              }
              
              elements.forEach(el => {
                const rect = el.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0 && 
                                 window.getComputedStyle(el).visibility !== 'hidden' &&
                                 window.getComputedStyle(el).display !== 'none';
                
                if (isVisible || strategy.type === 'semantic') {
                  let bestSelector = strategy.selector;
                  if (el.id) bestSelector = '#' + el.id;
                  else if (el.getAttribute('data-testid')) bestSelector = '[data-testid="' + el.getAttribute('data-testid') + '"]';
                  else if (el.className && el.className.split) {
                    const classes = el.className.split(' ').filter(c => c.length > 0);
                    if (classes.length > 0) bestSelector = '.' + classes[0];
                  }
                  
                  results.push({
                    element: el.tagName.toLowerCase(),
                    selector: bestSelector,
                    strategy: strategy.type,
                    reason: strategy.reason,
                    id: el.id || '',
                    classes: el.className || '',
                    text: el.textContent?.trim().substring(0, 100) || '',
                    dataTestId: el.getAttribute('data-testid') || '',
                    visible: isVisible,
                    clickable: el.tagName === 'BUTTON' || el.tagName === 'A' || el.onclick || el.getAttribute('role') === 'button',
                    interactive: el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.contentEditable === 'true',
                    score: this.calculateElementScore(el, targetInfo, strategy)
                  });
                }
              });
            } catch (e) {
              // Strategy failed, continue with next
            }
          });
          
          // Score and sort results
          results.sort((a, b) => b.score - a.score);
          
          return {
            originalSelector,
            targetInfo,
            totalStrategies: strategies.length,
            totalResults: results.length,
            bestMatches: results.slice(0, 10) // Top 10 matches
          };
          
          function calculateElementScore(el, target, strategy) {
            let score = 0;
            
                         // Base scores by strategy type
             const strategyScores = {
               'id': 100, 'data-testid': 90, 'attr-exact': 85, 'attr-presence': 80,
               'class': 70, 'function': 60, 'semantic': 50, 'text-exact': 80, 
               'text-tag': 40, 'attr-partial': 45, 'id-partial': 75, 'data-testid-partial': 70,
               'class-single': 60
             };
             score += strategyScores[strategy.type] || 30;
            
            // Bonus for visibility
            if (el.getBoundingClientRect().width > 0) score += 20;
            
            // Bonus for interactivity match
            if (target.element === 'textarea' || target.dataTestId?.includes('textarea')) {
              if (el.tagName === 'TEXTAREA' || el.contentEditable === 'true') score += 50;
            }
            if (target.element === 'button') {
              if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') score += 50;
            }
            
            // Text similarity bonus
            if (target.text && el.textContent) {
              const similarity = this.calculateTextSimilarity(target.text.toLowerCase(), el.textContent.toLowerCase());
              score += similarity * 30;
            }
            
            return score;
          }
          
          function calculateTextSimilarity(text1, text2) {
            const words1 = text1.split(/\\s+/);
            const words2 = text2.split(/\\s+/);
            const commonWords = words1.filter(word => words2.some(w => w.includes(word) || word.includes(w)));
            return commonWords.length / Math.max(words1.length, words2.length, 1);
          }
        })()
      `;
      
             let discoveryResult: any;
       try {
         discoveryResult = await this.playwrightPage.evaluate(smartDiscoveryScript);
       } catch (scriptError) {
         console.warn('[DoAgent] Smart discovery script failed, using basic element search:', scriptError);
         
         // Fallback to basic element detection if script fails
         discoveryResult = {
           originalSelector: originalSelector,
           targetInfo: cleanedSelector,
           totalStrategies: 0,
           totalResults: 0,
           bestMatches: []
         };
         
         // Try basic element search as fallback
         const basicElement = cleanedSelector.element || 'button';
         try {
           const basicCount = await this.playwrightPage.locator(basicElement).count();
           if (basicCount > 0) {
             discoveryResult.bestMatches = [{
               selector: basicElement,
               reason: 'basic element fallback after script failure',
               score: 40,
               strategy: 'basic-fallback'
             }];
             discoveryResult.totalResults = 1;
           }
         } catch (basicError) {
           console.warn('[DoAgent] Even basic element search failed:', basicError);
         }
       }
       // console.log('[DoAgent] Smart discovery results:', {
       //   originalSelector: discoveryResult.originalSelector,
       //   targetInfo: discoveryResult.targetInfo,
       //   totalStrategies: discoveryResult.totalStrategies,
       //   totalResults: discoveryResult.totalResults,
       //   topMatches: discoveryResult.bestMatches?.slice(0, 3)
       // });
       // console.log('[DoAgent] All discovery details:', discoveryResult);
      
             // Try the best matches in order
       if (discoveryResult.bestMatches && discoveryResult.bestMatches.length > 0) {
         for (const match of discoveryResult.bestMatches) {
           try {
             // console.log(`[DoAgent] Trying match: ${match.selector} (${match.reason}, score: ${match.score})`);
              await this.playwrightPage.waitForSelector(match.selector, { timeout: 1000 });
              actualSelector = match.selector;
             // console.log(`[DoAgent] SUCCESS! Using selector: ${match.selector}`);
             break;
           } catch (matchError) {
             // console.log(`[DoAgent] Match failed: ${match.selector}`);
             continue;
           }
         }
         
         // If no matches worked, try simple fallback strategies
         if (selector === originalSelector) {
           // console.log('[DoAgent] All smart strategies failed, trying simple fallbacks...');
           const simpleFallbacks = [
             cleanedSelector.element || 'div', // Just the element type
             'button', // Common clickable elements
             'a',
             '[role="button"]',
             '[onclick]',
             'input',
             'textarea'
           ].filter(Boolean);
           
           for (const fallback of simpleFallbacks) {
             try {
               // console.log(`[DoAgent] Trying simple fallback: ${fallback}`);
                               const elements = await this.playwrightPage.locator(fallback).count();
               if (elements > 0) {
                                 await this.playwrightPage.waitForSelector(fallback, { timeout: 500 });
                actualSelector = fallback;
                 // console.log(`[DoAgent] Simple fallback SUCCESS: ${fallback}`);
                 break;
               }
             } catch (fallbackError) {
               // console.log(`[DoAgent] Simple fallback failed: ${fallback}`);
               continue;
             }
           }
         }
         
         // If still no matches worked, throw comprehensive error
         if (selector === originalSelector) {
           const matchDetails = discoveryResult.bestMatches.slice(0, 5).map((m: any) => 
             `  ${m.selector} (${m.reason}, score: ${m.score})`
           ).join('\n');
           throw new Error(`Cannot find element: ${originalSelector}\n\nTried ${discoveryResult.totalResults} alternatives:\n${matchDetails}\n\nPage may have changed or element may not exist.`);
         }
       } else {
         // If discovery system completely failed, try basic element-type fallback
         // console.log('[DoAgent] Discovery system found no elements, trying basic fallback...');
         const basicElement = cleanedSelector.element || 'button';
         try {
                     await this.playwrightPage.waitForSelector(basicElement, { timeout: 2000 });
          actualSelector = basicElement;
           // console.log(`[DoAgent] Basic fallback SUCCESS: ${basicElement}`);
         } catch (basicError) {
           throw new Error(`Cannot find element: ${originalSelector}. No similar elements found after trying ${discoveryResult.totalStrategies} search strategies. Even basic fallback failed.`);
         }
       }
    }
    
    // Use Playwright's click method with options
    const clickOptions: any = {};
    if (options?.button) clickOptions.button = options.button;
    if (options?.clickCount) clickOptions.clickCount = options.clickCount;
    if (options?.delay) clickOptions.delay = options.delay;
    
    try {
    await this.playwrightPage.click(actualSelector, clickOptions);
      // console.log('[DoAgent] Click operation completed successfully on:', actualSelector);
    } catch (clickError) {
      // If click fails, try using our JavaScript-based click as fallback
      console.warn('[DoAgent] Playwright click failed, trying JavaScript click:', clickError);
      
      const jsClickScript = `
        (() => {
          const element = document.querySelector('${selector}');
          if (!element) return { success: false, error: 'Element not found for JS click' };
          
          // Scroll into view and click
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.click();
          
          return { success: true };
        })()
      `;
      
      const jsResult = await this.playwrightPage.evaluate(jsClickScript);
      if (!jsResult.success) {
        throw new Error(`Both Playwright and JavaScript click failed: ${jsResult.error}`);
      }
      
      // console.log('[DoAgent] JavaScript click succeeded as fallback');
    }
    
    // Small wait after click for any animations/transitions
    await this.playwrightPage.waitForTimeout(500);
  }

  private async wait(ms: number): Promise<void> {
    if (this.playwrightPage) {
      await this.playwrightPage.waitForTimeout(ms);
    } else {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  private async scroll(direction?: string, targetSelector?: string): Promise<void> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    if (targetSelector) {
      // console.log('[DoAgent] Scrolling to element:', targetSelector);
      
      // Wait for element and scroll it into view
      await this.playwrightPage.waitForSelector(targetSelector, { timeout: 5000 });
      await this.playwrightPage.evaluate((sel: string) => {
        const element = document.querySelector(sel);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, targetSelector);
    } else {
      // console.log('[DoAgent] Scrolling page:', direction || 'down');
      
      // Scroll the page
      await this.playwrightPage.evaluate((dir: string) => {
        const scrollAmount = dir === 'down' ? 500 : -500;
        window.scrollBy(0, scrollAmount);
      }, direction || 'down');
    }
    
    // Wait for scroll to complete
    await this.playwrightPage.waitForTimeout(300);
  }

  private async extract(): Promise<any> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    try {
      // Wait for dynamic content to load
      await this.playwrightPage.waitForTimeout(2000);
      
      const extractedData = await this.playwrightPage.evaluate(() => {
        try {
          const currentUrl = window.location.href;
          const title = document.title;
          
          // Extract comprehensive page data
          const extractedContent: any = {
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
            loadingStatus: 'content_ready'
          };
          
          // Extract headings
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
            href: (link as HTMLAnchorElement).href,
            title: (link as HTMLAnchorElement).title || ''
          })).filter(link => link.text && link.text.length > 0);
          
          // Extract visible text content
          const textElements = document.querySelectorAll('p, span, div[class*="content"], [data-testid], [role="listitem"]');
          extractedContent.textContent = Array.from(textElements).slice(0, 50).map(el => {
            const text = el.textContent?.trim() || '';
            return {
              text: text.substring(0, 500),
              tag: el.tagName.toLowerCase(),
              className: el.className || '',
              id: el.id || ''
            };
          }).filter(item => item.text && item.text.length > 15);
          
          // Get raw HTML and visible text
          const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
          const contentHTML = mainContent ? mainContent.innerHTML.substring(0, 15000) : '';
          const visibleText = document.body.innerText || '';
          const prices = [...new Set(visibleText.match(/\$[\d,]+/g) || [])];
          const times = [...new Set(visibleText.match(/\d{1,2}:\d{2}\s?(?:AM|PM)/gi) || [])];
          
          extractedContent.rawHTML = contentHTML;
          extractedContent.visibleText = visibleText.substring(0, 5000);
          extractedContent.detectedPatterns = {
            prices: prices,
            times: times,
            hasContent: visibleText.length > 100,
            contentLength: visibleText.length
          };
          
          // Analyze page structure
          extractedContent.pageStructure = {
            hasSearchBox: document.querySelector('input[type="search"], input[name*="search"]') !== null,
            hasLoginForm: document.querySelector('input[type="password"]') !== null,
            hasNavigation: document.querySelector('nav, [role="navigation"]') !== null,
            hasProducts: document.querySelector('[class*="product"], [data-testid*="product"]') !== null,
            hasFlights: document.querySelector('[class*="flight"], [data-testid*="flight"]') !== null,
            domain: window.location.hostname
          };
          
          return extractedContent;
                } catch (error) {
          return {
            error: (error as Error).message,
            url: window.location.href,
            title: document.title,
            fallbackContent: document.body.innerText.substring(0, 1000)
          };
        }
       });
      
      // console.log('[DoAgent] Extract operation completed successfully');
      
      // Store the extracted data in the current task
      if (this.currentTask) {
        this.currentTask.result = extractedData;
      }
      
      return extractedData;
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

  // Complete Telegram workflow: search for user and send message
  async telegramSendMessageToUser(userName: string, messageText: string, preferPrivateChat: boolean = true): Promise<any> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    try {
      // console.log(`[DoAgent] Starting Telegram workflow: Send "${messageText}" to "${userName}"`);
      
      // Step 1: Search for the user
      const searchResult = await this.playwrightPage.telegramSearch(userName, preferPrivateChat);
      // console.log('[DoAgent] Search result:', searchResult);
      
      if (!searchResult.success) {
        throw new Error(`Failed to search for user: ${searchResult.error}`);
      }
      
      // Step 2: Wait for chat to load
      await this.playwrightPage.waitForTimeout(1500);
      
      // Step 3: Send the message
      const messageResult = await this.playwrightPage.telegramSendMessage(messageText);
      // console.log('[DoAgent] Message result:', messageResult);
      
      if (!messageResult.success) {
        throw new Error(`Failed to send message: ${messageResult.error}`);
      }
      
      return {
        success: true,
        userName: userName,
        messageText: messageText,
        chatSelected: searchResult.selectedChat,
        messageSent: messageResult.success,
        workflow: 'completed'
      };
      
    } catch (error) {
      console.error('[DoAgent] Telegram workflow failed:', error);
      return {
        success: false,
        error: (error as Error).message,
        userName: userName,
        messageText: messageText,
        workflow: 'failed'
      };
    }
  }

  // Debug method for Telegram messaging interface
  async debugTelegramMessaging(): Promise<any> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    try {
      const messagingInfo = await this.playwrightPage.evaluate(() => {
        const findMessageElements = () => {
          const messageElements: any[] = [];
          
          // Find message input elements
          const inputSelectors = [
            'div[contenteditable="true"]',
            '.input-message-input',
            '.message-input-field',
            '[data-testid="message-input"]',
            '.input-field-input',
            'div[role="textbox"]'
          ];
          
          inputSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((el, index) => {
              const rect = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              messageElements.push({
                type: 'input',
                selector: selector,
                index: index,
                tag: el.tagName,
                id: el.id,
                className: el.className,
                contentEditable: (el as HTMLElement).contentEditable,
                visible: rect.width > 0 && rect.height > 0,
                displayed: style.display !== 'none',
                position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                text: el.textContent?.trim() || '',
                focused: document.activeElement === el
              });
            });
          });
          
          // Find send/voice buttons
          const buttonSelectors = [
            '.btn-send',
            '.btn-send-voice',
            '.send-button',
            '.voice-button',
            '[data-testid="send-button"]',
            '[data-testid="voice-button"]',
            '.record-button',
            '.tgico-send',
            '.tgico-microphone'
          ];
          
          buttonSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((el, index) => {
              const rect = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              messageElements.push({
                type: 'button',
                selector: selector,
                index: index,
                tag: el.tagName,
                id: el.id,
                className: el.className,
                title: (el as HTMLElement).title,
                visible: rect.width > 0 && rect.height > 0,
                displayed: style.display !== 'none',
                position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                text: el.textContent?.trim() || '',
                isVoiceButton: el.classList.contains('btn-send-voice') || 
                              el.classList.contains('voice-button') ||
                              el.getAttribute('data-testid') === 'voice-button' ||
                              el.classList.contains('record-button')
              });
            });
          });
          
          return messageElements;
        };
        
        return {
          url: window.location.href,
          title: document.title,
          messageElements: findMessageElements(),
          activeElement: document.activeElement ? {
            tag: document.activeElement.tagName,
            id: document.activeElement.id,
            className: document.activeElement.className,
            contentEditable: (document.activeElement as HTMLElement).contentEditable
          } : null,
          isTelegram: window.location.href.includes('telegram'),
          timestamp: new Date().toISOString()
        };
      });
      
      // console.log('[DoAgent] Telegram Messaging Debug:', messagingInfo);
      return messagingInfo;
    } catch (error) {
      console.error('[DoAgent] Telegram messaging debug failed:', error);
      return {
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Specialized method for Telegram debugging
  async debugTelegramSidebar(): Promise<any> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    try {
      const telegramInfo = await this.playwrightPage.evaluate(() => {
        const findSearchElements = () => {
          const searchElements: any[] = [];
          
          // Try different search selectors
          const selectors = [
            'input[type="search"]',
            'input[placeholder*="Search"]',
            'input[placeholder*="search"]',
            '.search-input',
            '.SearchField input',
            '[data-testid="search-input"]',
            '#search-input',
            '.tgico-search',
            '.search-wrapper',
            '*[class*="search"]'
          ];
          
          selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((el, index) => {
              const rect = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              searchElements.push({
                selector: selector,
                index: index,
                tag: el.tagName,
                id: el.id,
                className: el.className,
                placeholder: (el as HTMLInputElement).placeholder || '',
                type: (el as HTMLInputElement).type || '',
                visible: rect.width > 0 && rect.height > 0,
                displayed: style.display !== 'none',
                opacity: style.opacity,
                pointerEvents: style.pointerEvents,
                position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                text: el.textContent?.trim() || '',
                focused: document.activeElement === el
              });
            });
          });
          
          return searchElements;
        };
        
        const getSidebarInfo = () => {
          const sidebar = document.querySelector('.sidebar-left') || 
                          document.querySelector('.left-column') ||
                          document.querySelector('[class*="sidebar"]') ||
                          document.querySelector('[class*="left"]');
          
          if (!sidebar) return null;
          
          const rect = sidebar.getBoundingClientRect();
          const style = getComputedStyle(sidebar);
          
          return {
            found: true,
            className: sidebar.className,
            id: sidebar.id,
            visible: rect.width > 0 && rect.height > 0,
            displayed: style.display !== 'none',
            position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            childrenCount: sidebar.children.length
          };
        };
        
        return {
          url: window.location.href,
          title: document.title,
          searchElements: findSearchElements(),
          sidebarInfo: getSidebarInfo(),
          activeElement: document.activeElement ? {
            tag: document.activeElement.tagName,
            id: document.activeElement.id,
            className: document.activeElement.className
          } : null,
          isTelegram: window.location.href.includes('telegram'),
          timestamp: new Date().toISOString()
        };
      });
      
      // console.log('[DoAgent] Telegram Sidebar Debug:', telegramInfo);
      return telegramInfo;
    } catch (error) {
      console.error('[DoAgent] Telegram debug failed:', error);
      return {
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Debug method to help diagnose DOM issues
  async debugPageContent(): Promise<any> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    try {
      const debugInfo = await this.playwrightPage.getDebugInfo();
      // console.log('[DoAgent] Page Debug Info:', debugInfo);
      
      // Also check if page is fully loaded
      const isLoaded = await this.playwrightPage.evaluate(() => {
        return {
          readyState: document.readyState,
          hasBody: !!document.body,
          bodyChildren: document.body ? document.body.children.length : 0,
          totalElements: document.querySelectorAll('*').length,
          visibleElements: Array.from(document.querySelectorAll('*')).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }).length,
          // Check for common dynamic content indicators
          hasReact: !!(window as any).React,
          hasJQuery: !!(window as any).jQuery,
          hasVue: !!(window as any).Vue,
          hasAngular: !!(window as any).angular,
          // Check for loading indicators
          loadingElements: document.querySelectorAll('[class*="loading"], [class*="spinner"], [aria-label*="loading"]').length,
          // Check for error messages
          errorElements: document.querySelectorAll('[class*="error"], [class*="404"], [class*="not-found"]').length
        };
      });
      
      return {
        debugInfo,
        loadingStatus: isLoaded,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[DoAgent] Debug failed:', error);
      return {
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      };
    }
  }

  private async selectDropdown(selector: string, optionText: string): Promise<void> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    // console.log('[DoAgent] Selecting option:', optionText, 'from:', selector);
    
    // Wait for element to be available
    await this.playwrightPage.waitForSelector(selector, { timeout: 5000 });
    
    try {
      // Try using Playwright's selectOption for native selects
      await this.playwrightPage.selectOption(selector, optionText);
    } catch (error) {
      // If that fails, try clicking the dropdown and then the option
      // console.log('[DoAgent] Native select failed, trying custom dropdown');
      
      // Click the dropdown to open it
      await this.playwrightPage.click(selector);
      await this.playwrightPage.waitForTimeout(500);
      
      // Try to find and click the option using JavaScript
      const optionClicked = await this.playwrightPage.evaluate((text: string) => {
        const optionSelectors = [
          '[role="option"]',
          'li[role="option"]',
          '.dropdown-item',
          '.option',
          'li'
        ];
        
        for (const selector of optionSelectors) {
          const options = document.querySelectorAll(selector);
          for (let i = 0; i < options.length; i++) {
            const option = options[i];
            if (option.textContent?.trim() === text) {
              (option as HTMLElement).click();
              return true;
            }
          }
        }
        return false;
      }, optionText);
      
      if (!optionClicked) {
        throw new Error(`Could not find option "${optionText}" in dropdown`);
      }
    }
    
    await this.playwrightPage.waitForTimeout(500); // Wait for selection to process
    // console.log('[DoAgent] Select dropdown completed successfully');
  }

  private async waitForElement(selector: string, timeout: number = 5000): Promise<void> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    // console.log('[DoAgent] Waiting for element:', selector);
    await this.playwrightPage.waitForSelector(selector, { timeout });
    // console.log('[DoAgent] Element found:', selector);
  }

  private async waitForDynamicContent(timeout: number = 10000): Promise<void> {
    // console.log('[DoAgent] Waiting for dynamic content to load...');
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const script = `
        (function() {
          const currentUrl = window.location.href;
          // console.log('[DoAgent-WebView] Checking dynamic content for URL:', currentUrl);
          
          // Check for Google Search Results (flight searches)
          if (currentUrl.includes('google.com/search') && currentUrl.includes('flight')) {
            const searchResults = document.querySelectorAll('#search .g, [data-testid], .MjjYud');
            const flightLinks = document.querySelectorAll('a[href*="google.com/travel/flights"], a[href*="flights"]');
            const loadingIndicators = document.querySelectorAll('[aria-label*="loading"], [role="progressbar"], .loading');
            
            // console.log('[DoAgent-WebView] Google flight search results:', {
            //   searchResults: searchResults.length,
            //   flightLinks: flightLinks.length,
            //   isLoading: loadingIndicators.length > 0
            // });
            
            return {
              hasContent: searchResults.length > 0,
              isLoading: loadingIndicators.length > 0,
              contentCount: searchResults.length,
              pageType: 'google_search_flights'
            };
          }
          
          // Check for Google Flights specific content
          if (currentUrl.includes('google.com/travel/flights')) {
            const flightResults = document.querySelectorAll('[data-testid*="flight"], [role="listitem"], .gws-flights-results__result-item');
            const loadingIndicators = document.querySelectorAll('[aria-label*="loading"], [role="progressbar"], .loading');
            
            // console.log('[DoAgent-WebView] Google Flights page content:', {
            //   flightResults: flightResults.length,
            //   isLoading: loadingIndicators.length > 0
            // });
            
            return {
              hasContent: flightResults.length > 0,
              isLoading: loadingIndicators.length > 0,
              contentCount: flightResults.length,
              pageType: 'google_flights'
            };
          }
          
          // Generic dynamic content check
          const contentElements = document.querySelectorAll('[data-testid], [role="main"], main, article, .content, .results');
          const loadingElements = document.querySelectorAll('[aria-label*="loading"], [role="progressbar"], .loading, .spinner');
          
          // console.log('[DoAgent-WebView] Generic content check:', {
          //   contentElements: contentElements.length,
          //   isLoading: loadingElements.length > 0
          // });
          
          return {
            hasContent: contentElements.length > 0,
            isLoading: loadingElements.length > 0,
            contentCount: contentElements.length,
            pageType: 'generic'
          };
        })();
      `;
      
      const result = await this.webview.executeJavaScript(script);
      // console.log('[DoAgent] Dynamic content check result:', result);
      
      if (result && result.hasContent && !result.isLoading) {
        // console.log(`[DoAgent] Dynamic content loaded for ${result.pageType}: ${result.contentCount} elements`);
        return;
      }
      
      await this.wait(500);
    }
    
    // console.log('[DoAgent] Timeout waiting for dynamic content, proceeding anyway');
  }

  private async clearInput(selector: string): Promise<void> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    // console.log('[DoAgent] Clearing input:', selector);
    
    // Wait for element to be available
    await this.playwrightPage.waitForSelector(selector, { timeout: 5000 });
    
    // Clear the input using Playwright's fill with empty string
    await this.playwrightPage.fill(selector, '');
    
    // console.log('[DoAgent] Clear input completed successfully');
  }

  private async focusElement(selector: string): Promise<void> {
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    // console.log('[DoAgent] Focusing element:', selector);
    
    // Wait for element and focus it
    await this.playwrightPage.waitForSelector(selector, { timeout: 5000 });
    await this.playwrightPage.evaluate((sel: string) => {
      const element = document.querySelector(sel);
      if (element) {
        (element as HTMLElement).focus();
      }
    }, selector);
    
    // console.log('[DoAgent] Focus element completed successfully');
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
    if (!this.playwrightPage) {
      throw new Error('Playwright page not initialized');
    }
    
    // console.log('[DoAgent] Pressing key:', key, 'on element:', selector);
    
    // If selector is 'body', use page-level keyboard
    if (selector === 'body') {
      await this.playwrightPage.keyboard.press(key);
    } else {
      // Wait for element and focus it
      await this.playwrightPage.waitForSelector(selector, { timeout: 5000 });
      await this.playwrightPage.click(selector);
      await this.playwrightPage.waitForTimeout(100);
      
      // For Enter key, use multiple approaches for better reliability
      if (key === 'Enter') {
        const script = `
          (async function() {
            try {
              const selector = ${JSON.stringify(selector)};
              const element = document.querySelector(selector);
              if (!element) throw new Error('Element not found');
              
              // Focus the element
              element.focus();
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Try multiple event types for Enter
              const events = [
                new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
                new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
                new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
              ];
              
              for (const event of events) {
                element.dispatchEvent(event);
                await new Promise(resolve => setTimeout(resolve, 50));
              }
              
              // Also try form submission if element is in a form
              const form = element.closest('form');
              if (form) {
                form.submit();
              }
              
              return { success: true };
            } catch (error) {
              return { success: false, error: error.message };
            }
          })();
        `;
        
        const result = await this.webview.executeJavaScript(script);
        if (result && !result.success) {
          console.warn('[DoAgent] Enhanced Enter key failed:', result.error);
        }
      } else {
        // For other keys, use the standard approach
        await this.playwrightPage.keyboard.press(key);
      }
    }
    
    // console.log('[DoAgent] Keypress completed successfully');
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
      // console.log('[DoAgent] Screenshot functionality not yet implemented');
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
        `${completedSteps >= 4 ? '✅' : '⭕'} 4. Summarize bookmark topics and themes`      ];
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
