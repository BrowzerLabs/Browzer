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
  public onMaxActionsReached?: () => void;
  private snapshotManager: SnapshotManager;

  // Tab context for current recording
  private currentTabId: string | null = null;
  private currentTabUrl: string | null = null;
  private currentTabTitle: string | null = null;
  private currentWebContentsId: number | null = null;

  // File upload tracking
  private pendingFileUploads: Map<string, {
    elementSelector: string;
    timestamp: number;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(view?: WebContentsView) {
    if (view) {
      this.view = view;
      this.debugger = view.webContents.debugger;
    }
    this.snapshotManager = new SnapshotManager();
  }


  public handleFileDialogResult(
    elementSelector: string,
    filePaths: string[],
    timestamp: number
  ): void {
    if (!this.isRecording) return;

    // Check if max actions limit reached
    if (this.actions.length >= ActionRecorder.MAX_ACTIONS) {
      console.warn(`⚠️ Max actions limit (${ActionRecorder.MAX_ACTIONS}) reached`);
      if (this.onMaxActionsReached) {
        this.onMaxActionsReached();
      }
      return;
    }

    // Create a properly structured file upload action
    const action: RecordedAction = {
      type: 'file-upload',
      timestamp: timestamp,
      target: {
        selector: elementSelector,
        tagName: 'INPUT',
        attributes: { type: 'file' },
      },
      value: filePaths.length === 1 ? filePaths[0] : filePaths,
      metadata: {
        fileCount: filePaths.length,
        filenames: filePaths.map(p => {
          const parts = p.split(/[/\\]/);
          return parts[parts.length - 1];
        }),
        absolutePaths: filePaths,
      },
      tabId: this.currentTabId || undefined,
      tabUrl: this.currentTabUrl || undefined,
      tabTitle: this.currentTabTitle || undefined,
      webContentsId: this.currentWebContentsId || undefined,
    };

    this.actions.push(action);
    console.log(`✅ File upload recorded: ${filePaths.length} file(s)`);

    if (this.onActionCallback) {
      this.onActionCallback(action);
    }

    // Clean up pending upload tracking
    const key = `${elementSelector}-${timestamp}`;
    const pending = this.pendingFileUploads.get(key);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingFileUploads.delete(key);
    }
  }

  private trackFileInputInteraction(elementSelector: string, timestamp: number): void {
    const key = `${elementSelector}-${timestamp}`;
    
    // Clear any existing timeout
    const existing = this.pendingFileUploads.get(key);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    // Set a timeout to clean up if no file dialog result comes
    const timeout = setTimeout(() => {
      this.pendingFileUploads.delete(key);
    }, 30000); // 30 second timeout

    this.pendingFileUploads.set(key, {
      elementSelector,
      timestamp,
      timeout,
    });
  }

  public setActionCallback(callback: (action: RecordedAction) => void): void {
    this.onActionCallback = callback;
  }

  public setMaxActionsCallback(callback: () => void): void {
    this.onMaxActionsReached = callback;
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

      this.view = newView;
      this.debugger = newView.webContents.debugger;
      this.currentTabId = tabId;
      this.currentTabUrl = tabUrl;
      this.currentTabTitle = tabTitle;
      this.currentWebContentsId = newView.webContents.id;

      await this.injectEventTracker();
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
      
      this.actions = [];
      this.isRecording = true;
      this.pendingFileUploads.clear();

      if (tabId && tabUrl && tabTitle) {
        this.currentTabId = tabId;
        this.currentTabUrl = tabUrl;
        this.currentTabTitle = tabTitle;
        this.currentWebContentsId = webContentsId || this.view.webContents.id;
      }

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
      
      // Clear all pending file uploads
      this.pendingFileUploads.forEach(pending => clearTimeout(pending.timeout));
      this.pendingFileUploads.clear();
      
      await this.snapshotManager.finalizeRecording();
      
      console.log(`ℹ️ Recording stopped. Captured ${this.actions.length} actions`);
      
      this.currentTabId = null;
      this.currentTabUrl = null;
      this.currentTabTitle = null;
      this.currentWebContentsId = null;
      
      return [...this.actions];
    } catch (error) {
      console.error('Error stopping recording:', error);
      return [...this.actions];
    }
  }

  public isActive(): boolean {
    return this.isRecording;
  }

  public getActions(): RecordedAction[] {
    return [...this.actions];
  }

  public addAction(action: RecordedAction): void {
    this.actions.push(action);
  }

  public async getSnapshotStats() {
    return await this.snapshotManager.getSnapshotStats();
  }

  public getSnapshotsDirectory(recordingId: string): string {
    return this.snapshotManager.getSnapshotsDirectory(recordingId);
  }

  public getCurrentTabContext(): { 
    tabId: string | null; 
    tabUrl: string | null; 
    tabTitle: string | null; 
    webContentsId: number | null 
  } {
    return {
      tabId: this.currentTabId,
      tabUrl: this.currentTabUrl,
      tabTitle: this.currentTabTitle,
      webContentsId: this.currentWebContentsId
    };
  }

  public setView(view: WebContentsView): void {
    this.view = view;
    this.debugger = view.webContents.debugger;
  }

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
   * Inject event tracking script with enhanced file upload detection
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
    console.log('✅ Event tracker injected with file upload support');
  }

  private generateMonitoringScript(): string {
    return `
      (function() {
        if (window.__browzerRecorderInstalled) return;
        window.__browzerRecorderInstalled = true;
        
        // Track file input clicks for better file upload detection
        const fileInputInteractions = new Map();
        
        /**
         * Element extraction with multiple selector strategies
         */
        function extractElementTarget(element) {
          const rect = element.getBoundingClientRect();
          
          const attributes = {};
          for (const attr of element.attributes) {
            attributes[attr.name] = attr.value;
          }
          
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
            parentSelector: element.parentElement ? getSelector(element.parentElement) : undefined,
            isDisabled: element.disabled || element.getAttribute('aria-disabled') === 'true' || undefined,
            attributes: attributes,
            elementIndex: getElementIndex(element),
            siblingCount: element.parentElement ? element.parentElement.children.length : 0
          };
        }
        
        function generateMultipleSelectorStrategies(element) {
          const strategies = [];
          
          if (element.id && !element.id.match(/^:r[0-9a-z]+:/)) {
            strategies.push('#' + CSS.escape(element.id));
          }
          
          if (element.hasAttribute('data-testid')) {
            strategies.push('[data-testid="' + element.getAttribute('data-testid') + '"]');
          }
          
          for (const attr of element.attributes) {
            if (attr.name.startsWith('data-') && attr.name !== 'data-testid' && attr.value) {
              strategies.push('[' + attr.name + '="' + CSS.escape(attr.value) + '"]');
              if (strategies.length >= 6) break;
            }
          }
          
          if (element.hasAttribute('aria-label')) {
            const ariaLabel = element.getAttribute('aria-label');
            strategies.push('[aria-label="' + CSS.escape(ariaLabel) + '"]');
            strategies.push(element.tagName.toLowerCase() + '[aria-label="' + CSS.escape(ariaLabel) + '"]');
          }
          
          if (element.hasAttribute('role')) {
            const role = element.getAttribute('role');
            strategies.push('[role="' + role + '"]');
          }
          
          if (element.name) {
            strategies.push(element.tagName.toLowerCase() + '[name="' + CSS.escape(element.name) + '"]');
          }
          
          if (element.type) {
            strategies.push(element.tagName.toLowerCase() + '[type="' + element.type + '"]');
          }
          
          const uniqueClassSelector = getUniqueClassSelector(element);
          if (uniqueClassSelector) {
            strategies.push(uniqueClassSelector);
          }
          
          const pathSelector = getPathSelector(element);
          if (pathSelector) {
            strategies.push(pathSelector);
          }
          
          const nthChildSelector = getNthChildSelector(element);
          if (nthChildSelector) {
            strategies.push(nthChildSelector);
          }
          
          const uniqueStrategies = [...new Set(strategies)].filter(s => s && s.length > 0);
          
          return {
            primary: uniqueStrategies[0] || element.tagName.toLowerCase(),
          };
        }
        
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
        
        function getUniqueClassSelector(element) {
          if (!element.className || typeof element.className !== 'string') return null;
          
          const classes = element.className.trim().split(/\\s+/)
            .filter(c => c && !c.match(/^(ng-|_|css-|active|focus|hover)/));
          
          if (classes.length === 0) return null;
          
          const tagName = element.tagName.toLowerCase();
          const classSelector = tagName + '.' + classes.slice(0, 3).map(c => CSS.escape(c)).join('.');
          
          const matches = document.querySelectorAll(classSelector);
          if (matches.length === 1) {
            return classSelector;
          }
          
          const siblings = Array.from(element.parentElement?.children || [])
            .filter(el => el.tagName === element.tagName);
          const index = siblings.indexOf(element);
          if (index >= 0) {
            return classSelector + ':nth-of-type(' + (index + 1) + ')';
          }
          
          return classSelector;
        }
        
        function getPathSelector(element) {
          let path = [];
          let current = element;
          let depth = 0;
          
          while (current && current.nodeType === Node.ELEMENT_NODE && depth < 5) {
            let selector = current.nodeName.toLowerCase();
            
            if (current.id && !current.id.match(/^:r[0-9a-z]+:/)) {
              selector += '#' + CSS.escape(current.id);
              path.unshift(selector);
              break;
            }
            
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
        
        function getNthChildSelector(element) {
          if (!element.parentElement) return null;
          
          const parent = element.parentElement;
          const siblings = Array.from(parent.children);
          const index = siblings.indexOf(element);
          
          if (index < 0) return null;
          
          const tagName = element.tagName.toLowerCase();
          const parentSelector = getSelector(parent);
          
          return parentSelector + ' > ' + tagName + ':nth-child(' + (index + 1) + ')';
        }
        
        function getElementIndex(element) {
          if (!element.parentElement) return 0;
          return Array.from(element.parentElement.children).indexOf(element);
        }
        
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
        
        function isInteractiveElement(element) {
          const tagName = element.tagName.toLowerCase();
          const role = element.getAttribute('role');
          const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'label'];
          if (interactiveTags.includes(tagName)) return true;
          const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'option', 'textbox', 'searchbox', 'combobox'];
          if (role && interactiveRoles.includes(role)) return true;
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
          
          if (interactiveElement.tagName === 'INPUT' && interactiveElement.type === 'file') {
            // Prevent default file dialog from opening
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            const selector = extractElementTarget(interactiveElement).selector;
            const timestamp = Date.now();
            
            // Track this interaction for correlation with file dialog
            fileInputInteractions.set(selector, timestamp);
            
            // Signal to main process that a file input was clicked
            console.info('[BROWZER_FILE_INPUT_CLICK]', JSON.stringify({
              selector: selector,
              timestamp: timestamp,
              target: extractElementTarget(interactiveElement)
            }));
            
            // Don't record the click itself, wait for the actual file selection
            return;
          }
          
          const targetInfo = extractElementTarget(interactiveElement);
          
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'click',
            timestamp: Date.now(),
            target: targetInfo,
            position: { x: e.clientX, y: e.clientY }
          }));
        }, true);
        
        let inputDebounce = {};
        let lastRecordedValue = {};
        let activeInputElements = new Set();
        
        function isEditableElement(element) {
          if (!element) return false;
          
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
        
        function recordInputIfChanged(target, isRichTextEditor) {
          const key = target.id || target.name || getSelector(target);
          const currentValue = isRichTextEditor 
            ? (target.innerText || target.textContent || '').trim()
            : target.value;
          
          if (lastRecordedValue[key] !== currentValue) {
            lastRecordedValue[key] = currentValue;
            handleInputAction(target, isRichTextEditor);
          }
        }
        
        document.addEventListener('input', (e) => {
          const editableInfo = isEditableElement(e.target);
          if (!editableInfo) return;
          
          const { element: target, isTraditionalInput, isRichTextEditor } = editableInfo;
          const key = target.id || target.name || getSelector(target);
          const inputType = target.type?.toLowerCase();
          const immediateTypes = ['checkbox', 'radio', 'file', 'range', 'color'];
          const isImmediate = immediateTypes.includes(inputType);
          
          activeInputElements.add(key);
          
          if (isImmediate) {
            handleInputAction(target);
          } else {
            clearTimeout(inputDebounce[key]);
            inputDebounce[key] = setTimeout(() => {
              recordInputIfChanged(target, isRichTextEditor);
            }, 3000);
          }
        }, true);
        
        document.addEventListener('blur', (e) => {
          const editableInfo = isEditableElement(e.target);
          if (!editableInfo) return;
          
          const { element: target, isRichTextEditor } = editableInfo;
          const key = target.id || target.name || getSelector(target);
          const inputType = target.type?.toLowerCase();
          const immediateTypes = ['checkbox', 'radio', 'file', 'range', 'color'];
          
          if (immediateTypes.includes(inputType)) return;
          
          clearTimeout(inputDebounce[key]);
          
          if (activeInputElements.has(key)) {
            recordInputIfChanged(target, isRichTextEditor);
            activeInputElements.delete(key);
          }
        }, true);
        
        // Enhanced change event - file uploads are handled by main process interception
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
            // File uploads are handled entirely by main process interception
            // Don't record anything here - the main process will handle it
            return;
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
          } else if (inputType === 'file') {
            // Skip - handled by change event
            return;
          } else if (isRichTextEditor) {
            value = target.innerText || target.textContent || '';
            value = value.trim().substring(0, 5000);
          } else {
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

  private setupEventListeners(): void {
    if (!this.debugger) return;

    this.debugger.removeAllListeners('message');
    this.debugger.removeAllListeners('detach');

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
    });
  }

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
          
          else if (firstArg === '[BROWZER_FILE_INPUT_CLICK]') {
            try {
              const data = JSON.parse(params.args[1].value);
              this.trackFileInputInteraction(data.selector, data.timestamp);
              console.log('📂 File input click detected, waiting for main process interception');
            } catch (error) {
              console.error('Error parsing file input click:', error);
            }
          }
        }
        break;

      case 'Page.frameNavigated':
        if (params.frame.parentId === undefined) {
          const newUrl = params.frame.url;
          this.currentTabUrl = newUrl;
          
          if (this.isSignificantNavigation(newUrl)) {
            this.recordNavigation(newUrl);
          }
        }
        break;
      
      case 'Page.loadEventFired':
        console.log('📄 Page loaded');
        await this.injectEventTracker();
        await this.updateTabTitle();
        break;

      default:
        break;
    }
  }

  private async recordAction(actionData: RecordedAction): Promise<void> {
    if (this.actions.length >= ActionRecorder.MAX_ACTIONS) {
      console.warn(`⚠️ Max actions limit (${ActionRecorder.MAX_ACTIONS}) reached, stopping recording`);
      if (this.onMaxActionsReached) {
        this.onMaxActionsReached();
      }
      return;
    }

    const enrichedAction: RecordedAction = {
      ...actionData,
      tabId: this.currentTabId || undefined,
      tabUrl: this.currentTabUrl || undefined,
      tabTitle: this.currentTabTitle || undefined,
      webContentsId: this.currentWebContentsId || undefined,
    };
    
    if (this.view) {
      this.snapshotManager.captureSnapshot(this.view, enrichedAction)
        .then(snapshotPath => {
          if (snapshotPath) {
            enrichedAction.snapshotPath = snapshotPath;
          }
        })
        .catch(err => console.error('Snapshot capture failed:', err));
    }
    
    this.actions.push(enrichedAction);
    console.log(`✅ Action recorded: ${actionData.type} (${this.actions.length}/${ActionRecorder.MAX_ACTIONS})`);
    
    if (this.onActionCallback) {
      this.onActionCallback(enrichedAction);
    }
  }

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

  private recordNavigation(url: string, timestamp?: number): void {
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
      webContentsId: this.currentWebContentsId || undefined,
    };

    this.actions.push(action);
    if (this.onActionCallback) {
      this.onActionCallback(action);
    }
  }
}