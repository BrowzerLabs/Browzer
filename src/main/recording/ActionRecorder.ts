/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebContentsView } from "electron";
import { RecordedAction } from '@/shared/types';
import { MAX_RECORDING_ACTIONS } from '@/shared/constants/limits';
import { SnapshotManager } from './SnapshotManager';

export class ActionRecorder {
  private static readonly MAX_ACTIONS = MAX_RECORDING_ACTIONS;
  private view: WebContentsView | null = null;
  private isRecording = false;
  private actions: RecordedAction[] = [];
  private debugger: Electron.Debugger | null = null;
  public onActionCallback?: (action: RecordedAction) => void;
  public onMaxActionsReached?: () => void; // Callback when max actions reached
  private snapshotManager: SnapshotManager;

  // Tab context for current recording
  private currentTabId: string | null = null;
  private currentTabUrl: string | null = null;
  private currentTabTitle: string | null = null;



  constructor(view?: WebContentsView) {
    if (view) {
      this.view = view;
      this.debugger = view.webContents.debugger;
    }
    this.snapshotManager = new SnapshotManager();
  }

  /**
   * Set callback for real-time action notifications
   */
  public setActionCallback(callback: (action: RecordedAction) => void): void {
    this.onActionCallback = callback;
  }

  /**
   * Set callback for when max actions limit is reached
   */
  public setMaxActionsCallback(callback: () => void): void {
    this.onMaxActionsReached = callback;
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

      // Update to new view
      this.view = newView;
      this.debugger = newView.webContents.debugger;
      this.currentTabId = tabId;
      this.currentTabUrl = tabUrl;
      this.currentTabTitle = tabTitle;

      await this.injectEventTracker();

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
      
      this.actions = [];
      this.isRecording = true;

      // Set initial tab context
      if (tabId && tabUrl && tabTitle) {
        this.currentTabId = tabId;
        this.currentTabUrl = tabUrl;
        this.currentTabTitle = tabTitle;
      }

      // Initialize snapshot manager for this recording
      if (recordingId) {
        await this.snapshotManager.initializeRecording(recordingId);
      }

      await this.injectEventTracker();
      this.setupEventListeners();

      console.log('🎬 Recording started');
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

      this.isRecording = false;
      this.actions.sort((a, b) => a.timestamp - b.timestamp);
      
      // Finalize snapshots
      await this.snapshotManager.finalizeRecording();
      
      console.log(`⏹️ Recording stopped. Captured ${this.actions.length} actions`);
      
      // Reset tab context
      this.currentTabId = null;
      this.currentTabUrl = null;
      this.currentTabTitle = null;
      
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
   * Set the view for recording (used when initializing or switching)
   */
  public setView(view: WebContentsView): void {
    this.view = view;
    this.debugger = view.webContents.debugger;
  }

  /**
   * Update tab title from current page
   */
  private async updateTabTitle(): Promise<void> {
    if (!this.view) return;
    
    try {
      const title = this.view.webContents.getTitle();
      if (title) {
        this.currentTabTitle = title;
      }
    } catch (error) {
      console.error('Failed to update tab title:', error);
    }
  }

  /**
   * Inject event tracking script into the page
   */
  private async injectEventTracker(): Promise<void> {
    if (!this.debugger) return;

    const script = this.generateMonitoringScript();
    await this.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: script,
      runImmediately: true
    });
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
        
        /**
         * Element extraction with multiple selector strategies
         * Generates unique, reliable selectors for precise automation
         */
        function extractElementTarget(element) {
          const rect = element.getBoundingClientRect();
          
          // Collect all attributes
          const attributes = {};
          for (const attr of element.attributes) {
            attributes[attr.name] = attr.value;
          }
          
          // Generate multiple selector strategies
          const selectorStrategies = generateMultipleSelectorStrategies(element);
          
          return {
            selector: selectorStrategies.primary,
            tagName: element.tagName,
            text: (element.innerText || element.textContent || '').substring(0, 200).trim() || undefined,
            value: element.value || undefined,
            boundingBox: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            isDisabled: element.disabled || element.getAttribute('aria-disabled') === 'true' || undefined,
            attributes: attributes,
            // NEW: Position info for precise matching
            elementIndex: getElementIndex(element),
            siblingCount: element.parentElement ? element.parentElement.children.length : 0
          };
        }
        
        /**
         * Generate multiple selector strategies for maximum reliability
         * Returns primary selectors using different approaches
         */
        function generateMultipleSelectorStrategies(element) {
          const strategies = [];
          
          // Strategy 1: ID selector (most reliable if available)
          if (element.id && !element.id.match(/^:r[0-9a-z]+:/)) {
            strategies.push('#' + CSS.escape(element.id));
          }
          
          // Strategy 2: data-testid or data-* attributes
          if (element.hasAttribute('data-testid')) {
            strategies.push('[data-testid="' + element.getAttribute('data-testid') + '"]');
          }
          for (const attr of element.attributes) {
            if (attr.name.startsWith('data-') && attr.name !== 'data-testid' && attr.value) {
              strategies.push('[' + attr.name + '="' + CSS.escape(attr.value) + '"]');
              if (strategies.length >= 6) break;
            }
          }
          
          // Strategy 3: ARIA attributes (accessible and stable)
          if (element.hasAttribute('aria-label')) {
            const ariaLabel = element.getAttribute('aria-label');
            strategies.push('[aria-label="' + CSS.escape(ariaLabel) + '"]');
            strategies.push(element.tagName.toLowerCase() + '[aria-label="' + CSS.escape(ariaLabel) + '"]');
          }
          if (element.hasAttribute('role')) {
            const role = element.getAttribute('role');
            strategies.push('[role="' + role + '"]');
          }
          
          // Strategy 4: Name attribute (for form elements)
          if (element.name) {
            strategies.push(element.tagName.toLowerCase() + '[name="' + CSS.escape(element.name) + '"]');
          }
          
          // Strategy 5: Type + other attributes combination
          if (element.type) {
            strategies.push(element.tagName.toLowerCase() + '[type="' + element.type + '"]');
          }
          
          // Strategy 6: Unique class-based selector with nth-child
          const uniqueClassSelector = getUniqueClassSelector(element);
          if (uniqueClassSelector) {
            strategies.push(uniqueClassSelector);
          }
          
          // Strategy 7: Full path selector (hierarchical)
          const pathSelector = getPathSelector(element);
          if (pathSelector) {
            strategies.push(pathSelector);
          }
          
          // Strategy 8: nth-child based selector (position-based)
          const nthChildSelector = getNthChildSelector(element);
          if (nthChildSelector) {
            strategies.push(nthChildSelector);
          }
          
          // Deduplicate and validate
          const uniqueStrategies = [...new Set(strategies)].filter(s => s && s.length > 0);
          
          return {
            primary: uniqueStrategies[0] || element.tagName.toLowerCase(),
          };
        }
        
        /**
         * Generate optimized CSS selector (legacy function, still used for parent)
         */
        function getSelector(element) {
          if (element.id && !element.id.match(/^:r[0-9a-z]+:/)) {
            return '#' + CSS.escape(element.id);
          }
          if (element.hasAttribute('data-testid')) {
            return '[data-testid="' + element.getAttribute('data-testid') + '"]';
          }
          
          let path = [];
          let current = element;
          while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 4) {
            let selector = current.nodeName.toLowerCase();
            if (current.id && !current.id.match(/^:r[0-9a-z]+:/)) {
              selector += '#' + CSS.escape(current.id);
              path.unshift(selector);
              break;
            }
            if (current.hasAttribute('data-testid')) {
              selector += '[data-testid="' + current.getAttribute('data-testid') + '"]';
              path.unshift(selector);
              break;
            }
            if (current.className && typeof current.className === 'string') {
              const classes = current.className.trim().split(/\\s+/)
                .filter(c => c && !c.match(/^(ng-|_|css-)/))
                .slice(0, 3)
                .map(c => CSS.escape(c))
                .join('.');
              if (classes) selector += '.' + classes;
            }
            path.unshift(selector);
            current = current.parentElement;
          }
          return path.join(' > ');
        }
        
        /**
         * Get unique class-based selector
         */
        function getUniqueClassSelector(element) {
          if (!element.className || typeof element.className !== 'string') return null;
          
          const classes = element.className.trim().split(/\\s+/)
            .filter(c => c && !c.match(/^(ng-|_|css-|active|focus|hover)/));
          
          if (classes.length === 0) return null;
          
          const tagName = element.tagName.toLowerCase();
          const classSelector = tagName + '.' + classes.slice(0, 3).map(c => CSS.escape(c)).join('.');
          
          // Check if this selector is unique
          const matches = document.querySelectorAll(classSelector);
          if (matches.length === 1) {
            return classSelector;
          }
          
          // If not unique, add nth-of-type
          const siblings = Array.from(element.parentElement?.children || [])
            .filter(el => el.tagName === element.tagName);
          const index = siblings.indexOf(element);
          if (index >= 0) {
            return classSelector + ':nth-of-type(' + (index + 1) + ')';
          }
          
          return classSelector;
        }
        
        /**
         * Get full path selector with smart truncation
         */
        function getPathSelector(element) {
          let path = [];
          let current = element;
          let depth = 0;
          
          while (current && current.nodeType === Node.ELEMENT_NODE && depth < 5) {
            let selector = current.nodeName.toLowerCase();
            
            // Stop at elements with stable IDs
            if (current.id && !current.id.match(/^:r[0-9a-z]+:/)) {
              selector += '#' + CSS.escape(current.id);
              path.unshift(selector);
              break;
            }
            
            // Add classes (up to 3)
            if (current.className && typeof current.className === 'string') {
              const classes = current.className.trim().split(/\\s+/)
                .filter(c => c && !c.match(/^(ng-|_|css-|active|focus|hover)/))
                .slice(0, 2)
                .map(c => CSS.escape(c))
                .join('.');
              if (classes) selector += '.' + classes;
            }
            
            path.unshift(selector);
            current = current.parentElement;
            depth++;
          }
          
          return path.join(' > ');
        }
        
        /**
         * Get nth-child based selector for position-based matching
         */
        function getNthChildSelector(element) {
          if (!element.parentElement) return null;
          
          const parent = element.parentElement;
          const siblings = Array.from(parent.children);
          const index = siblings.indexOf(element);
          
          if (index < 0) return null;
          
          const tagName = element.tagName.toLowerCase();
          
          return tagName + ':nth-child(' + (index + 1) + ')';
        }
        
        /**
         * Get element index among all siblings
         */
        function getElementIndex(element) {
          if (!element.parentElement) return 0;
          return Array.from(element.parentElement.children).indexOf(element);
        }
        
        /**
         * Find interactive parent element
         */
        function findInteractiveParent(element, maxDepth = 5) {
          let current = element;
          let depth = 0;
          while (current && depth < maxDepth) {
            if (isInteractiveElement(current)) return current;
            current = current.parentElement;
            depth++;
          }
          return element;
        }
        
        /**
         * Check if element is interactive
         */
        function isInteractiveElement(element) {
          const tagName = element.tagName.toLowerCase();
          const role = element.getAttribute('role');
          const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'label'];
          if (interactiveTags.includes(tagName)) return true;
          const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'option', 'textbox', 'searchbox', 'combobox'];
          if (role && interactiveRoles.includes(role)) return true;
          // Check for contenteditable elements (Google Docs, Notion, etc.)
          if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') return true;
          if (element.onclick || element.hasAttribute('onclick')) return true;
          const style = window.getComputedStyle(element);
          if (style.cursor === 'pointer') return true;
          if (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') return true;
          return false;
        }
        
        document.addEventListener('click', (e) => {
          const clickedElement = e.target;
          const interactiveElement = findInteractiveParent(clickedElement);
          const targetInfo = extractElementTarget(interactiveElement);
          
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'click',
            timestamp: Date.now(),
            target: targetInfo,
            position: { x: e.clientX, y: e.clientY }
          }));
        }, true);
        
        // Smart input recording state
        let inputDebounce = {};
        let lastRecordedValue = {}; // Track last recorded value to avoid duplicates
        let activeInputElements = new Set(); // Track elements currently being edited
        
        /**
         * Check if element or its parents are contenteditable (for Google Docs)
         */
        function isEditableElement(element) {
          if (!element) return false;
          
          // Check the element itself
          const tagName = element.tagName;
          const role = element.getAttribute('role');
          const isContentEditable = element.isContentEditable || element.getAttribute('contenteditable') === 'true';
          const isTraditionalInput = tagName === 'INPUT' || tagName === 'TEXTAREA';
          const isRichTextEditor = isContentEditable || 
                                   role === 'textbox' || 
                                   role === 'searchbox' || 
                                   role === 'combobox';
          
          if (isTraditionalInput || isRichTextEditor) {
            return { element, isTraditionalInput, isRichTextEditor };
          }
          
          // Check parent elements (up to 3 levels) for contenteditable
          // This fixes Google Docs where input events come from nested spans
          let current = element.parentElement;
          let depth = 0;
          while (current && depth < 3) {
            if (current.isContentEditable || current.getAttribute('contenteditable') === 'true') {
              return { element: current, isTraditionalInput: false, isRichTextEditor: true };
            }
            current = current.parentElement;
            depth++;
          }
          
          return null;
        }
        
        /**
         * Record input action with deduplication
         */
        function recordInputIfChanged(target, isRichTextEditor) {
          const key = target.id || target.name || getSelector(target);
          const currentValue = isRichTextEditor 
            ? (target.innerText || target.textContent || '').trim()
            : target.value;
          
          // Only record if value actually changed
          if (lastRecordedValue[key] !== currentValue) {
            lastRecordedValue[key] = currentValue;
            handleInputAction(target, isRichTextEditor);
          }
        }
        
        // Input event: Track changes but use longer debounce (3 seconds)
        // This is a fallback for very long typing sessions
        document.addEventListener('input', (e) => {
          const editableInfo = isEditableElement(e.target);
          if (!editableInfo) return;
          
          const { element: target, isTraditionalInput, isRichTextEditor } = editableInfo;
          const key = target.id || target.name || getSelector(target);
          const inputType = target.type?.toLowerCase();
          const immediateTypes = ['checkbox', 'radio', 'file', 'range', 'color'];
          const isImmediate = immediateTypes.includes(inputType);
          
          // Track that this element is being edited
          activeInputElements.add(key);
          
          if (isImmediate) {
            // Record immediately for checkboxes, radios, etc.
            handleInputAction(target);
          } else {
            // For text input: Use 3-second debounce as fallback
            // Primary recording happens on blur event
            clearTimeout(inputDebounce[key]);
            inputDebounce[key] = setTimeout(() => {
              recordInputIfChanged(target, isRichTextEditor);
            }, 3000); // 3 seconds - only fires if user types continuously
          }
        }, true);
        
        // Blur event: Record when user leaves the input field (PRIMARY METHOD)
        // This is the main way we capture completed input
        document.addEventListener('blur', (e) => {
          const editableInfo = isEditableElement(e.target);
          if (!editableInfo) return;
          
          const { element: target, isRichTextEditor } = editableInfo;
          const key = target.id || target.name || getSelector(target);
          const inputType = target.type?.toLowerCase();
          const immediateTypes = ['checkbox', 'radio', 'file', 'range', 'color'];
          
          // Skip immediate types (already recorded on input)
          if (immediateTypes.includes(inputType)) return;
          
          // Clear any pending debounce
          clearTimeout(inputDebounce[key]);
          
          // Record the final value when user leaves the field
          if (activeInputElements.has(key)) {
            recordInputIfChanged(target, isRichTextEditor);
            activeInputElements.delete(key);
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
        function handleInputAction(target, isRichTextEditor = false) {
          const inputType = target.type?.toLowerCase();
          let actionType = 'input';
          let value;
          
          if (inputType === 'checkbox') {
            actionType = 'checkbox';
            value = target.checked;
          } else if (inputType === 'radio') {
            actionType = 'radio';
            value = target.value;
          } else if (isRichTextEditor) {
            // For contenteditable and ARIA textbox elements, extract text content
            // Use innerText for better formatting (respects line breaks, ignores hidden elements)
            value = target.innerText || target.textContent || '';
            // Trim and limit length to avoid huge payloads
            value = value.trim().substring(0, 5000);
          } else {
            // Traditional input/textarea
            value = target.value;
          }
          
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: actionType,
            timestamp: Date.now(),
            target: extractElementTarget(target),
            value: value
          }));
        }
        function handleSelectAction(target) {
          const isMultiple = target.multiple;
          let selectedValues = [];
          
          if (isMultiple) {
            const options = Array.from(target.selectedOptions);
            selectedValues = options.map(opt => opt.value);
          } else {
            const selectedOption = target.options[target.selectedIndex];
            selectedValues = [selectedOption?.value];
          }
          
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'select',
            timestamp: Date.now(),
            target: extractElementTarget(target),
            value: isMultiple ? selectedValues : selectedValues[0]
          }));
        }
        function handleCheckboxAction(target) {
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'checkbox',
            timestamp: Date.now(),
            target: extractElementTarget(target),
            value: target.checked
          }));
        }
        function handleRadioAction(target) {
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'radio',
            timestamp: Date.now(),
            target: extractElementTarget(target),
            value: target.value
          }));
        }
        function handleFileUploadAction(target) {
          const files = Array.from(target.files || []);
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'file-upload',
            timestamp: Date.now(),
            target: extractElementTarget(target),
            value: files.map(f => f.name).join(', ')
          }));
        }
        document.addEventListener('submit', (e) => {
          const target = e.target;
          
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'submit',
            timestamp: Date.now(),
            target: extractElementTarget(target)
          }));
        }, true);
        document.addEventListener('keydown', (e) => {
          const importantKeys = [
            'Enter', 'Escape', 'Tab',
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'Home', 'End', 'PageUp', 'PageDown'
          ];
          const isShortcut = (e.ctrlKey || e.metaKey || e.altKey) && e.key.length === 1;
          const isImportantKey = importantKeys.includes(e.key);
          
          if (isShortcut || isImportantKey) {
            const focusedElement = document.activeElement;
            
            console.info('[BROWZER_ACTION]', JSON.stringify({
              type: 'keypress',
              timestamp: Date.now(),
              value: e.key,
              target: focusedElement ? extractElementTarget(focusedElement) : undefined
            }));
          }
        }, true);
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
              await this.recordAction(actionData);
            } catch (error) {
              console.error('Error parsing action:', error);
            }
          }
        }
        break;

      case 'Page.frameNavigated':
        if (params.frame.parentId === undefined) {
          const newUrl = params.frame.url;
          
          // Update current tab URL to reflect navigation
          this.currentTabUrl = newUrl;
          
          if (this.isSignificantNavigation(newUrl)) {
            this.recordNavigation(newUrl);
          }
        }
        break;
      
      case 'Page.loadEventFired':
        console.log('📄 Page loaded');
        await this.injectEventTracker();
        // Update tab title after page load
        await this.updateTabTitle();
        break;

      default:
        break;
    }
  }

  /**
   * Record action immediately as it occurs
   */
  private async recordAction(actionData: RecordedAction): Promise<void> {
    // Check max actions limit first
    if (this.actions.length >= ActionRecorder.MAX_ACTIONS) {
      console.warn(`⚠️ Max actions limit (${ActionRecorder.MAX_ACTIONS}) reached, stopping recording`);
      if (this.onMaxActionsReached) {
        this.onMaxActionsReached();
      }
      return;
    }

    // Enrich action with tab context
    const enrichedAction: RecordedAction = {
      ...actionData,
      tabId: this.currentTabId || undefined,
      tabUrl: this.currentTabUrl || undefined,
      tabTitle: this.currentTabTitle || undefined,
    };
    
    // Capture snapshot asynchronously (non-blocking)
    if (this.view) {
      this.snapshotManager.captureSnapshot(this.view, enrichedAction)
        .then(snapshotPath => {
          if (snapshotPath) {
            enrichedAction.snapshotPath = snapshotPath;
          }
        })
        .catch(err => console.error('Snapshot capture failed:', err));
    }
    
    // Record action immediately
    this.actions.push(enrichedAction);
    console.log(`✅ Action recorded: ${actionData.type} (${this.actions.length}/${ActionRecorder.MAX_ACTIONS})`);
    
    // Notify callback
    if (this.onActionCallback) {
      this.onActionCallback(enrichedAction);
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
      '/log',
      '/analytics',
      '/tracking',
    ];

    return !ignorePatterns.some(pattern => url.startsWith(pattern) || url.includes(pattern));
  }


  /**
   * Record navigation
   */
  private recordNavigation(url: string, timestamp?: number): void {
    // Check if max actions limit reached
    if (this.actions.length >= ActionRecorder.MAX_ACTIONS) {
      console.warn(`⚠️ Max actions limit (${ActionRecorder.MAX_ACTIONS}) reached, skipping navigation`);
      if (this.onMaxActionsReached) {
        this.onMaxActionsReached();
      }
      return;
    }
    
    const action: RecordedAction = {
      type: 'navigate',
      timestamp: timestamp || Date.now(),
      url,
      tabId: this.currentTabId || undefined,
      tabUrl: this.currentTabUrl || undefined,
      tabTitle: this.currentTabTitle || undefined,
    };

    this.actions.push(action);
    if (this.onActionCallback) {
      this.onActionCallback(action);
    }
  }
}
