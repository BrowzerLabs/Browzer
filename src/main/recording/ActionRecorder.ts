import { WebContentsView } from "electron";
import { RecordedAction } from '@/shared/types';
import { MAX_RECORDING_ACTIONS } from '@/shared/constants/limits';
import { SnapshotManager } from './SnapshotManager';
import { EventEmitter } from 'events';

export class ActionRecorder extends EventEmitter {
  private static readonly MAX_ACTIONS = MAX_RECORDING_ACTIONS;
  
  private view: WebContentsView | null = null;
  private debugger: Electron.Debugger | null = null;
  private isRecording = false;
  private actions: RecordedAction[] = [];
  private snapshotManager: SnapshotManager;

  private currentTabId: string | null = null;
  private currentTabUrl: string | null = null;
  private currentTabTitle: string | null = null;

  constructor(view?: WebContentsView) {
    super();
    if (view) {
      this.view = view;
      this.debugger = view.webContents.debugger;
    }
    this.snapshotManager = new SnapshotManager();
  }

  public setView(view: WebContentsView): void {
    this.view = view;
    this.debugger = view.webContents.debugger;
  }

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

      if (tabId && tabUrl && tabTitle) {
        this.currentTabId = tabId;
        this.currentTabUrl = tabUrl;
        this.currentTabTitle = tabTitle;
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

  public async stopRecording(): Promise<RecordedAction[]> {
    if (!this.isRecording) {
      console.warn('No recording in progress');
      return [];
    }

    try {
      this.isRecording = false;
      this.actions.sort((a, b) => a.timestamp - b.timestamp);
      
      await this.snapshotManager.finalizeRecording();
      console.log(`⏹️ Recording stopped. Captured ${this.actions.length} actions`);
      
      this.currentTabId = null;
      this.currentTabUrl = null;
      this.currentTabTitle = null;
      
      return [...this.actions];
    } catch (error) {
      console.error('Error stopping recording:', error);
      return [...this.actions];
    }
  }

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

      const previousDebugger = this.debugger;
      this.view = newView;
      this.debugger = newView.webContents.debugger;

      if (previousDebugger && previousDebugger !== this.debugger) {
        previousDebugger.removeAllListeners('message');
        previousDebugger.removeAllListeners('detach');
      }
      this.currentTabId = tabId;
      this.currentTabUrl = tabUrl;
      this.currentTabTitle = tabTitle;

      await this.injectEventTracker();
      this.setupEventListeners();

      console.log(`✅ Recording switched to tab: ${tabId}`);
      return true;
    } catch (error) {
      console.error('Failed to switch WebContents:', error);
      return false;
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
    }
  }

  private async recordAction(actionData: RecordedAction): Promise<void> {
    if (this.actions.length >= ActionRecorder.MAX_ACTIONS) {
      console.warn(`⚠️ Max actions limit (${ActionRecorder.MAX_ACTIONS}) reached, stopping recording`);
      this.emit('maxActionsReached');
      return;
    }

    const enrichedAction: RecordedAction = {
      ...actionData,
      tabId: this.currentTabId || undefined,
      tabUrl: this.currentTabUrl || undefined,
      tabTitle: this.currentTabTitle || undefined,
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
    this.emit('action', enrichedAction);
  }

  private recordNavigation(url: string, timestamp?: number): void {
    if (this.actions.length >= ActionRecorder.MAX_ACTIONS) {
      console.warn(`⚠️ Max actions limit (${ActionRecorder.MAX_ACTIONS}) reached, skipping navigation`);
      this.emit('maxActionsReached');
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
    this.emit('action', action);
  }

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
  function extractElementTarget(element) {
    const rect = element.getBoundingClientRect();
    
    const attributes = {};
    for (const attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }
    
    return {
      selector: getSelector(element),
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
      elementIndex: getElementIndex(element),
      siblingCount: element.parentElement ? element.parentElement.children.length : 0
    };
  }
  
  function getSelector(element) {
    if (element.id && !element.id.match(/^:r[0-9a-z]+:/)) {
      return '#' + CSS.escape(element.id);
    }
    
    if (element.hasAttribute('data-testid')) {
      return '[data-testid="' + element.getAttribute('data-testid') + '"]';
    }
    if (element.hasAttribute('data-test-id')) {
      return '[data-test-id="' + element.getAttribute('data-test-id') + '"]';
    }
    
    if (element.hasAttribute('aria-label')) {
      return element.tagName.toLowerCase() + '[aria-label="' + CSS.escape(element.getAttribute('aria-label')) + '"]';
    }
    
    if (element.name) {
      return element.tagName.toLowerCase() + '[name="' + CSS.escape(element.name) + '"]';
    }
    
    return buildPathSelector(element);
  }
  
  function buildPathSelector(element) {
    const path = [];
    let current = element;
    let depth = 0;
    const maxDepth = 4;
    
    while (current && current.nodeType === Node.ELEMENT_NODE && depth < maxDepth) {
      let selector = current.nodeName.toLowerCase();
      
      if (current.id && !current.id.match(/^:r[0-9a-z]+:/)) {
        selector = '#' + CSS.escape(current.id);
        path.unshift(selector);
        break;
      }
      
      if (current.hasAttribute('data-testid')) {
        selector = '[data-testid="' + current.getAttribute('data-testid') + '"]';
        path.unshift(selector);
        break;
      }
      
      if (current.className && typeof current.className === 'string') {
        const stableClasses = current.className.trim().split(/\\s+/)
          .filter(c => c && !c.match(/^(ng-|_|css-|active|focus|hover|selected|open|visible|hidden)/))
          .slice(0, 2)
          .map(c => CSS.escape(c));
        
        if (stableClasses.length > 0) {
          selector += '.' + stableClasses.join('.');
        }
      }
      
      path.unshift(selector);
      current = current.parentElement;
      depth++;
    }
    
    return path.join(' > ');
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
    
    // Contenteditable elements (Google Docs, Notion, etc.)
    if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') return true;
    
    if (element.onclick || element.hasAttribute('onclick')) return true;
    
    const style = window.getComputedStyle(element);
    if (style.cursor === 'pointer') return true;
    
    if (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') return true;
    
    return false;
  }
  
  function isEditableElement(element) {
    if (!element) return null;
    
    const tagName = element.tagName;
    const role = element.getAttribute('role');
    const isContentEditable = element.isContentEditable || element.getAttribute('contenteditable') === 'true';
    const isTraditionalInput = tagName === 'INPUT' || tagName === 'TEXTAREA';
    const isRichTextEditor = isContentEditable || role === 'textbox' || role === 'searchbox' || role === 'combobox';
    
    if (isTraditionalInput || isRichTextEditor) {
      return { element, isTraditionalInput, isRichTextEditor };
    }
    
    // Check parent elements for contenteditable
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
  
  // Input handling with debounce
  const inputDebounce = {};
  const lastRecordedValue = {};
  const activeInputElements = new Set();
  
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
    
    const { element: target, isRichTextEditor } = editableInfo;
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
      value = (target.innerText || target.textContent || '').trim().substring(0, 5000);
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
      selectedValues = Array.from(target.selectedOptions).map(opt => opt.value);
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
  
  // Form submit handler
  document.addEventListener('submit', (e) => {
    console.info('[BROWZER_ACTION]', JSON.stringify({
      type: 'submit',
      timestamp: Date.now(),
      target: extractElementTarget(e.target)
    }));
  }, true);
  
  // Keyboard handler (important keys and shortcuts only)
  document.addEventListener('keydown', (e) => {
    const importantKeys = [
      'Enter', 'Escape', 'Tab',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Home', 'End', 'PageUp', 'PageDown'
    ];
    const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
    const isShortcut = hasModifier && e.key.length === 1;
    const isImportantKey = importantKeys.includes(e.key);
    
    if (isShortcut || isImportantKey) {
      const focusedElement = document.activeElement;
      
      const modifiers = [];
      if (e.metaKey) modifiers.push('Cmd');
      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');
      
      const keyValue = modifiers.length > 0 
        ? modifiers.join('+') + '+' + e.key 
        : e.key;
      
      console.info('[BROWZER_ACTION]', JSON.stringify({
        type: 'keypress',
        timestamp: Date.now(),
        value: keyValue,
        metadata: {
          key: e.key,
          code: e.code,
          metaKey: e.metaKey || undefined,
          ctrlKey: e.ctrlKey || undefined,
          altKey: e.altKey || undefined,
          shiftKey: e.shiftKey || undefined
        },
        target: focusedElement ? extractElementTarget(focusedElement) : undefined
      }));
    }
  }, true);
})();
`;
  }
}
