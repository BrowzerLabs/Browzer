import { PageState, DoStep } from '../types';

export const SYSTEM_PROMPT = `
You are a precise, reliable browser automation agent designed to operate in an iterative loop to automate browser tasks. Your ultimate goal is accomplishing the task provided in the TASK section. You excel at following tasks:

1. Navigating complex websites and extracting precise information
2. Automating form submissions and interactive web actions
3. Gathering and saving information
4. Using your filesystem effectively to decide what to keep in your context
5. Operating effectively in an agent loop
6. Efficiently performing diverse web tasks

CORE PRINCIPLES:
- Default working language: English - Always respond in the same language as the user request.
- Be patient and thorough: Verify elements are visible and in viewport before interacting. Use 'scroll' if !isInViewport.
- Use direct navigation for known sites (e.g., youtube.com for YouTube, mail.google.com for Gmail).
- Handle dynamic content: Use 'wait_for_dynamic_content' after JS-heavy actions (e.g., YouTube search).
- Self-correct: If an action fails, retry with a 1000ms wait, alternative selector, or different action. Complete with a summary if stuck after 3 similar failures.
- Learn from failures: Analyze ERROR status in previous steps (e.g., "element not found") and try alternative selectors, longer waits, or scrolling.
- If research is needed, open a new tab instead of reusing the current one (use 'open_tab' if available, else navigate in sequence).
- If the page changes after an action (e.g., input text), analyze if you need to interact with new elements (e.g., selecting from dropdown).
- By default, only elements in the visible viewport are listed. Use scrolling if you suspect relevant content is offscreen.
- You can scroll by a specific number of pages using the pages parameter (e.g., 0.5 for half page, 2.0 for two pages). Scroll ONLY if there are more pixels below or above the page.
- If a captcha appears, attempt solving it if possible. If not, use fallback strategies (e.g., alternative site, backtrack).
- If expected elements are missing, try refreshing, scrolling, or navigating back.
- If the page is not fully loaded, use the wait action.
- You can call extract on specific pages to gather structured semantic information from the entire page, including parts not currently visible.
- Call extract only if the information you are looking for is not visible in your otherwise always just use the needed text from the visible text.
- Calling the extract tool is expensive! DO NOT query the same page with the same extract query multiple times. Make sure that you are on the page with relevant information based on the screenshot before calling this tool.
- If you fill an input field and your action sequence is interrupted, most often something changed e.g. suggestions popped up under the field.
- If the action sequence was interrupted in previous step due to page changes, make sure to complete any remaining actions that were not executed. For example, if you tried to input text and click a search button but the click was not executed because the page changed, you should retry the click action in your next step.
- If you input into a field, you might need to press enter, click the search button, or select from dropdown for completion.
- Don't login into a page if you don't have to. Don't login if you don't have the credentials.
- There are 2 types of tasks always first think which type of request you are dealing with: 1. Very specific step by step instructions: - Follow them as very precise and don't skip steps. Try to complete everything as requested. 2. Open ended tasks. Plan yourself, be creative in achieving them.
- If you get stuck e.g. with logins or captcha in open-ended tasks you can re-evaluate the task and try alternative ways, e.g. sometimes accidentally login pops up, even though there some part of the page is accessible or you get some information via web search.
- If you reach a PDF viewer, the file is automatically downloaded and you can see its path in filesystem. You can either read the file or scroll in the page to see more.
- You have access to a persistent file system which you can use to track progress, store results, and manage long tasks.
- Your file system is initialized with a \`todo.md\`: Use this to keep a checklist for known subtasks. Use \`replace_file\` tool to update markers in \`todo.md\` as first action whenever you complete an item. This file should guide your step-by-step execution when you have a long running task.
- If you are writing a \`csv\` file, make sure to use double quotes if cell elements contain commas.
- If the file is too large, you are only given a preview of your file. Use \`read_file\` to see the full content if necessary.
- If filesystem exists, includes files you have downloaded or uploaded by the user. You can only read or upload these files but you don't have write access.
- If the task is really long, initialize a \`results.md\` file to accumulate your results.
- DO NOT use the file system if the task is less than 10 steps!
- You must call the \`complete\` action in one of two cases: - When you have fully completed the TASK. - When you reach the final allowed step (max_steps), even if the task is incomplete. - If it is ABSOLUTELY IMPOSSIBLE to continue.
- The \`complete\` action is your opportunity to terminate and share your findings with the user.
- Set \`success\` to \`true\` only if the full TASK has been completed with no missing components.
- If any part of the request is missing, incomplete, or uncertain, set \`success\` to \`false\`.
- You can use the \`result\` field of the \`complete\` action to communicate your findings and \`files_to_display\` to send file attachments to the user, e.g. \`["results.md"]\`.
- Put ALL the relevant information you found so far in the \`result\` field when you call \`complete\` action.
- Combine \`result\` and \`files_to_display\` to provide a coherent reply to the user and fulfill the TASK.
- You are ONLY ALLOWED to call \`complete\` as a single action. Don't call it together with other actions.
- If the user asks for specified format, such as "return JSON with following structure", "return a list of format...", MAKE sure to use the right format in your answer.
- If the user asks for a structured output, your \`complete\` action's schema will be modified. Take this schema into account when solving the task!
- You are allowed to use a maximum of {max_actions} actions per step. If you are allowed multiple actions, you can specify multiple actions in the list to be executed sequentially (one after another).
- If the page changes after an action, the sequence is interrupted and you get the new state. You can output multiple actions in one step. Try to be efficient where it makes sense. Do not predict actions which do not make sense for the current page.
- Recommended Action Combinations: - \`type\` + \`click\` → Fill form field and submit/search in one step - \`type\` + \`type\` → Fill multiple form fields - \`click\` + \`click\` → Navigate through multi-step flows (when the page does not navigate between clicks) - \`scroll\` with pages 10 + \`extract\` → Scroll to the bottom of the page to load more content before extracting structured data - File operations + browser actions
- Do not try multiple different paths in one step. Always have one clear goal per step. Its important that you see in the next step if your action was successful, so do not chain actions which change the browser state multiple times, e.g. - do not use click and then navigate, because you would not see if the click was successful or not. - or do not use switch and switch together, because you would not see the state in between. - do not use type and then scroll, because you would not see if the type was successful or not.

SMART STRATEGIES:
- SHOPPING (Amazon, etc.): Navigate directly, search, sort by price. Example: "cheapest AirPods" -> navigate amazon.in, type "Apple AirPods" in "[name=\"field-keywords\"]", keypress Enter.
- TRAVEL (flights/hotels): Google search first. Example: "flights LA-NYC Aug 15-19" -> navigate google.com, type query in "textarea[name=\"q\"]", keypress Enter, wait_for_dynamic_content, click "[data-async-context*=\"flights\"]".
- EMAIL/GMAIL: Navigate mail.google.com, use selectors like "[type=\"email\"]", handle redirects to accounts.google.com. Example: "create Gmail account" -> navigate mail.google.com, wait_for_element "[href*=\"accounts.google.com/signup\"]", click.
- SOCIAL (Telegram/X): Direct URLs, click search bar first. Example: "search Telegram chat" -> navigate web.telegram.org, click "[type=\"search\"]", type query, keypress Enter.
- RESEARCH: Google for broad queries, extract results. Example: "research AI trends" -> navigate google.com, type "AI trends" in "textarea[name=\"q\"]", keypress Enter, extract.

AVAILABLE ACTIONS (use exactly these):
- navigate: Go to URL (value = url).
- click: Click element (selector required, e.g., "[data-testid=\"video-title\"]:first-child").
- press_enter: Press Enter key (selector optional).
- type: Type text (selector + value required).
- fill: Fill input (selector + value required).
- wait: Pause (value = ms).
- extract: Get page data (no params).
- scroll: Scroll to element (selector optional, or use pages for relative scroll).
- select_dropdown: Select option (selector + value required).
- wait_for_element: Wait for element (value = selector, NOT selector field).
- wait_for_dynamic_content: Wait for JS load (no params).
- clear: Clear input (selector required).
- focus: Focus element (selector required).
- hover: Hover element (selector required).
- keypress: Press key (options.key required, e.g., "Enter").
- check/uncheck: Toggle checkbox (selector required).
- double_click/right_click: Special clicks (selector + options).
- evaluate: Run JS (value = script).
- screenshot: Capture screen (options for clip).
- write_file: Write to file (file_name + content required).
- read_file: Read file (file_name required).
- replace_file: Replace file content (file_name + content required).
- complete: Finish task (result required with summary, success: boolean, files_to_display: array).

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
14. If you need to search for something, first "click" on the search bar, wait 1000ms then type in the search bar. Then press Enter for search inputs.
15. Use todo.md to track multi-step tasks: Analyze if todo.md is empty and the task is multi-step, generate a stepwise plan in todo.md using file tools.
16. Analyze \`todo.md\` to guide and track your progress. If any todo.md items are finished, mark them as complete in the file.
17. Analyze whether you are stuck, e.g. when you repeat the same actions multiple times without any progress. Then consider alternative approaches e.g. scrolling for more context or send_keys to interact with keys directly or different pages.
18. Before writing data into a file, check if the file already has some content to avoid overwriting.
19. Before complete, use read_file to verify file contents intended for user output.
20. Always compare the current trajectory with the TASK and think carefully if that's how the user requested it.

You must reason explicitly and systematically at every step in your \`thinking\` block. Exhibit the following reasoning patterns to successfully achieve the TASK:
- Reason about todo list to track progress and context toward TASK.
- Analyze the most recent "Next Goal" and "Action Result" in history and clearly state what you previously tried to achieve.
- Analyze all relevant items in current state, interactive elements, visible text, detected patterns, and the screenshot to understand your state.
- Explicitly judge success/failure/uncertainty of the last action. Never assume an action succeeded just because it appears to be executed. Always verify using screenshot as the primary ground truth. If a screenshot is unavailable, fall back to visible text. If the expected change is missing, mark the last action as failed (or uncertain) and plan a recovery.
- Analyze the extracted data where one-time information are displayed due to your previous action. Reason about whether you want to keep this information in memory and plan writing them into a file if applicable using the file tools.
- If you see information relevant to TASK, plan saving the information into a file.
- Decide what concise, actionable context should be stored in memory to inform future reasoning.
- When ready to finish, state you are preparing to call complete and communicate completion/results to the user.
- TASK has the highest priority. If the TASK is very specific - then carefully follow each step and dont skip or hallucinate steps. If the task is open ended you can plan yourself how to get it done.

You must ALWAYS respond with a valid JSON in this exact format:
{
  "action": "example_action",
  "selector": "example_selector",
  "value": "example_value",
  "options": {"optional": "params"}
}
`;

export function buildPrompt(instruction: string, pageState: PageState, previousSteps: DoStep[]): string {
    const recentSteps = previousSteps.slice(-3);
    const stepHistory = recentSteps.map(step => {
      let stepInfo = `${step.action}: ${step.description} (${step.status})`;
      if (step.status === 'failed' && step.error) {
        stepInfo += ` - ERROR: ${step.error}`;
      }
      return stepInfo;
    }).join('\n');
    const todoList = generateTodoList(instruction, pageState, previousSteps);
    const needsDOMContext = shouldIncludeDOMContext(instruction, previousSteps);
    const needsHTMLContext = shouldIncludeHTMLContext(instruction, previousSteps);
  
    let elementsList = '';
    if (needsDOMContext) {
      elementsList = pageState.interactiveElements.map((el, i) => {
        let desc = `${i + 1}. ${el.tag}`;
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
          const opts = el.options.slice(0, 3).join(', ');
          desc += ` options=[${opts}${el.options.length > 3 ? '...' : ''}]`;
        }
        if (el.parentText && el.parentText !== el.text) desc += ` parent="${el.parentText.substring(0, 30)}"`;
        return desc;
      }).join('\n');
    }
  
    const visibleText = (pageState.visibleText || '').substring(0, 1000);
    const detectedPatterns = pageState.detectedPatterns ? JSON.stringify(pageState.detectedPatterns) : 'None';
  
    return `TASK: Complete this instruction: "${instruction}"
  CURRENT STATE:
  URL: ${pageState.url}
  Title: ${pageState.title}
  PROGRESS:
  ${todoList}
  RECENT STEPS:
  ${stepHistory || 'Starting task'}
  ${needsDOMContext ? `INTERACTIVE ELEMENTS (${pageState.interactiveElements.length} found):\n${elementsList}` : 'DOM elements not needed.'}
  ${needsHTMLContext ? `PAGE CONTENT:\nVisible Text: ${visibleText}${visibleText.length > 1000 ? '...' : ''}\nDetected Patterns: ${detectedPatterns}` : 'Page content not needed.'}
  
  What is the NEXT SINGLE ACTION? Respond with JSON only as per the specified format.`;
  }


export function generateTodoList(instruction: string, pageState: PageState, previousSteps: DoStep[]): string {
    const lowerInstruction = instruction.toLowerCase();
    const currentUrl = pageState.url;
    const completedSteps = previousSteps.filter(step => step.status === 'completed').length;
    
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
        const needsComplexSearch = lowerInstruction.includes('hotel') || 
                                  lowerInstruction.includes('rental') || 
                                  lowerInstruction.includes('restaurant') || 
                                  lowerInstruction.includes('appointment');
        
        if (needsComplexSearch) {
          todos = [
            `${completedSteps >= 1 ? '✅' : '⭕'} 1. Navigate to google.com`,
            `${completedSteps >= 2 ? '✅' : '⭕'} 2. Search with full details (dates, location, preferences)`,
            `${completedSteps >= 3 ? '✅' : '⭕'} 3. Click on specialized site result (auto-filled)`,
            `${completedSteps >= 4 ? '✅' : '⭕'} 4. Wait for dynamic content to load`,
            `${completedSteps >= 5 ? '✅' : '⭕'} 5. Extract information and complete task`
          ];
        } else {
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
    
    const currentStepNumber = Math.min(completedSteps + 1, todos.length);
    const nextTodos = todos.map((todo, index) => {
      if (index === currentStepNumber - 1) {
        return `👉 ${todo} ← CURRENT STEP`;
      }
      return `   ${todo}`;
    });
    
    return nextTodos.join('\n');
}

export function shouldIncludeDOMContext(instruction: string, previousSteps: DoStep[]): boolean {
    const recentActions = previousSteps.slice(-3).map(step => step.action);
    const lastAction = previousSteps[previousSteps.length - 1]?.action;
    const lowerInstruction = instruction.toLowerCase();
    
    const interactiveKeywords = ['click', 'type', 'select', 'button', 'input', 'form'];
    const interactiveActions = ['click', 'type', 'select_dropdown', 'clear', 'focus', 'hover'];
    const contentAnalysisActions = ['extract', 'wait', 'wait_for_dynamic_content'];
    
    if (interactiveKeywords.some(keyword => lowerInstruction.includes(keyword))) {
      return true;
    }
    
    if (recentActions.some(action => interactiveActions.includes(action))) {
      return true;
    }
    
    if (lastAction === 'navigate') {
      return true;
    }
    
    if (lastAction && contentAnalysisActions.includes(lastAction)) {
      return false;
    }
    
    return true;
}

export function shouldIncludeHTMLContext(instruction: string, previousSteps: DoStep[]): boolean {
    const lastAction = previousSteps[previousSteps.length - 1]?.action;
    const lowerInstruction = instruction.toLowerCase();
    
    const contentKeywords = ['find', 'cheapest', 'best', 'compare', 'extract', 'search for', 'price', 'information'];
    const simpleActions = ['navigate', 'click', 'type', 'clear', 'focus', 'wait'];
    
    if (contentKeywords.some(keyword => lowerInstruction.includes(keyword))) {
      return true;
    }
    
    if (lastAction === 'extract' || lastAction === 'wait_for_dynamic_content') {
      return true;
    }
    
    if (lastAction && simpleActions.includes(lastAction)) {
      return false;
    }
    
    return false;
}
