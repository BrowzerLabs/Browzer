/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebContentsView } from "electron";
import { RecordedAction, VideoRecordingMetadata } from '../shared/types';
import { VideoRecorder } from './VideoRecorder';

export class ActionRecorder {
  private view: WebContentsView;
  private isRecording = false;
  private actions: RecordedAction[] = [];
  private debugger: Electron.Debugger;
  private onActionCallback?: (action: RecordedAction) => void;
  private videoRecorder: VideoRecorder;
  private recordingId: string | null = null;
  private videoMetadata: VideoRecordingMetadata | null = null;

  private recentNetworkRequests: Array<{
    url: string;
    method: string;
    type: string;
    status?: number;
    timestamp: number;
    completed: boolean;
  }> = [];

  private pendingActions = new Map<string, {
    action: RecordedAction;
    timestamp: number;
    verificationDeadline: number;
  }>();


  constructor(view: WebContentsView) {
    this.view = view;
    this.debugger = view.webContents.debugger;
    this.videoRecorder = new VideoRecorder(view);
  }

  /**
   * Set callback for real-time action notifications
   */
  public setActionCallback(callback: (action: RecordedAction) => void): void {
    this.onActionCallback = callback;
  }

  /**
   * Start recording user actions and screen video
   */
  public async startRecording(recordingId?: string, enableVideo = true): Promise<void> {
    if (this.isRecording) {
      console.warn('Recording already in progress');
      return;
    }

    try {
      this.debugger.attach('1.3');
      console.log('✅ CDP Debugger attached');

      this.actions = [];
      this.isRecording = true;
      this.recordingId = recordingId || `rec-${Date.now()}`;
      this.videoMetadata = null;

      await this.enableCDPDomains();
      this.setupEventListeners();

      // Start video recording if enabled
      if (enableVideo) {
        const videoStarted = await this.videoRecorder.startRecording(this.recordingId);
        if (videoStarted) {
          console.log('🎥 Video recording started');
        } else {
          console.warn('⚠️ Video recording failed to start, continuing with actions only');
        }
      }

      console.log('🎬 Recording started (ID:', this.recordingId, ')');
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.isRecording = false;
      throw error;
    }
  }

  /**
   * Stop recording and return actions with video metadata
   */
  public async stopRecording(): Promise<{ actions: RecordedAction[]; video?: VideoRecordingMetadata }> {
    if (!this.isRecording) {
      console.warn('No recording in progress');
      return { actions: [] };
    }

    try {
      // Stop video recording first
      if (this.videoRecorder.isActive()) {
        console.log('⏹️ Stopping video recording...');
        this.videoMetadata = await this.videoRecorder.stopRecording();
        if (this.videoMetadata) {
          console.log('✅ Video saved:', this.videoMetadata.fileName);
        }
      }

      // Stop CDP debugger
      if (this.debugger.isAttached()) {
        this.debugger.detach();
      }

      this.isRecording = false;
      this.actions.sort((a, b) => a.timestamp - b.timestamp);
      this.onActionCallback = undefined;
      
      console.log(`⏹️ Recording stopped. Captured ${this.actions.length} actions`);
      
      return {
        actions: [...this.actions],
        video: this.videoMetadata || undefined
      };
    } catch (error) {
      console.error('Error stopping recording:', error);
      return {
        actions: [...this.actions],
        video: undefined
      };
    }
  }

  /**
   * Check if currently recording
   */
  public isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get recorded actions
   */
  public getActions(): RecordedAction[] {
    return [...this.actions];
  }

  /**
   * Clear all recorded actions
   */
  public clearActions(): void {
    this.actions = [];
    this.pendingActions.clear();
    this.onActionCallback = undefined;
    console.log('Actions cleared from recorder');
  }

  /**
   * Get video metadata
   */
  public getVideoMetadata(): VideoRecordingMetadata | null {
    return this.videoMetadata;
  }

  /**
   * Get video recorder instance
   */
  public getVideoRecorder(): VideoRecorder {
    return this.videoRecorder;
  }

  /**
   * Enable required CDP domains
   */
  private async enableCDPDomains(): Promise<void> {
    try {
      await this.debugger.sendCommand('DOM.enable');
      console.log('✓ DOM domain enabled');
      await this.debugger.sendCommand('Page.enable');
      console.log('✓ Page domain enabled');
      await this.debugger.sendCommand('Runtime.enable');
      console.log('✓ Runtime domain enabled');
      await this.debugger.sendCommand('Network.enable');
      console.log('✓ Network domain enabled');
      await this.debugger.sendCommand('Log.enable');
      console.log('✓ Log domain enabled');
      await this.debugger.sendCommand('DOM.getDocument', { depth: -1 });
      console.log('✓ DOM document loaded');

      await this.debugger.sendCommand('Page.setLifecycleEventsEnabled', { 
        enabled: true 
      });
      await this.injectEventTracker();
      console.log('✓ Event tracker injected');

    } catch (error) {
      console.error('Error enabling CDP domains:', error);
      throw error;
    }
  }

  /**
   * Inject event tracking script into the page
   */
  private async injectEventTracker(): Promise<void> {
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
        document.addEventListener('click', (e) => {
          const clickedElement = e.target;
          const interactiveElement = findInteractiveParent(clickedElement);
          const isDirectClick = interactiveElement === clickedElement;
          const targetInfo = buildElementTarget(interactiveElement);
          let clickedElementInfo = null;
          if (!isDirectClick) {
            clickedElementInfo = buildElementTarget(clickedElement);
          }
          const preClickState = {
            url: window.location.href,
            scrollY: window.scrollY,
            scrollX: window.scrollX,
            activeElement: document.activeElement?.tagName,
            openModals: document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal:not([style*="display: none"])').length
          };
          
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'click',
            timestamp: Date.now(),
            target: targetInfo,
            position: { x: e.clientX, y: e.clientY },
            metadata: {
              isDirectClick: isDirectClick,
              clickedElement: clickedElementInfo,
              preClickState: preClickState
            }
          }));
        }, true);
        let inputDebounce = {};
        document.addEventListener('input', (e) => {
          const target = e.target;
          const tagName = target.tagName;
          const inputType = target.type?.toLowerCase();
          if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
            const key = target.id || target.name || getSelector(target);
            const immediateTypes = ['checkbox', 'radio', 'file', 'range', 'color'];
            const isImmediate = immediateTypes.includes(inputType);
            
            if (isImmediate) {
              handleInputAction(target);
            } else {
              clearTimeout(inputDebounce[key]);
              inputDebounce[key] = setTimeout(() => {
                handleInputAction(target);
              }, 500);
            }
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
        function handleInputAction(target) {
          const inputType = target.type?.toLowerCase();
          let actionType = 'input';
          let value = target.value;
          let metadata = {};
          if (inputType === 'checkbox') {
            actionType = 'checkbox';
            value = target.checked;
            metadata = { checked: target.checked };
          } else if (inputType === 'radio') {
            actionType = 'radio';
            value = target.value;
            metadata = { checked: target.checked, name: target.name };
          } else if (inputType === 'range') {
            metadata = { min: target.min, max: target.max, step: target.step };
          } else if (inputType === 'color') {
            metadata = { colorValue: target.value };
          }
          
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: actionType,
            timestamp: Date.now(),
            target: {
              selector: getSelector(target),
              tagName: target.tagName,
              id: target.id || undefined,
              name: target.name || undefined,
              type: inputType,
              placeholder: target.placeholder || undefined
            },
            value: value,
            metadata: metadata
          }));
        }
        function handleSelectAction(target) {
          const isMultiple = target.multiple;
          let selectedValues = [];
          let selectedTexts = [];
          
          if (isMultiple) {
            const options = Array.from(target.selectedOptions);
            selectedValues = options.map(opt => opt.value);
            selectedTexts = options.map(opt => opt.text);
          } else {
            const selectedOption = target.options[target.selectedIndex];
            selectedValues = [selectedOption?.value];
            selectedTexts = [selectedOption?.text];
          }
          
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'select',
            timestamp: Date.now(),
            target: {
              selector: getSelector(target),
              tagName: target.tagName,
              id: target.id || undefined,
              name: target.name || undefined,
              multiple: isMultiple
            },
            value: isMultiple ? selectedValues : selectedValues[0],
            metadata: {
              selectedTexts: selectedTexts,
              optionCount: target.options.length,
              isMultiple: isMultiple
            }
          }));
        }
        function handleCheckboxAction(target) {
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'checkbox',
            timestamp: Date.now(),
            target: {
              selector: getSelector(target),
              tagName: target.tagName,
              id: target.id || undefined,
              name: target.name || undefined,
              type: 'checkbox'
            },
            value: target.checked,
            metadata: {
              checked: target.checked,
              label: target.labels?.[0]?.innerText || undefined
            }
          }));
        }
        function handleRadioAction(target) {
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'radio',
            timestamp: Date.now(),
            target: {
              selector: getSelector(target),
              tagName: target.tagName,
              id: target.id || undefined,
              name: target.name || undefined,
              type: 'radio'
            },
            value: target.value,
            metadata: {
              checked: target.checked,
              groupName: target.name,
              label: target.labels?.[0]?.innerText || undefined
            }
          }));
        }
        function handleFileUploadAction(target) {
          const files = Array.from(target.files || []);
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'file-upload',
            timestamp: Date.now(),
            target: {
              selector: getSelector(target),
              tagName: target.tagName,
              id: target.id || undefined,
              name: target.name || undefined,
              type: 'file'
            },
            value: files.map(f => f.name).join(', '),
            metadata: {
              fileCount: files.length,
              fileNames: files.map(f => f.name),
              fileSizes: files.map(f => f.size),
              fileTypes: files.map(f => f.type),
              accept: target.accept || undefined,
              multiple: target.multiple
            }
          }));
        }
        document.addEventListener('submit', (e) => {
          const target = e.target;
          const formData = new FormData(target);
          const formDataObj = {};
          
          for (const [key, value] of formData.entries()) {
            const isSensitive = /password|secret|token|key|ssn|credit/i.test(key);
            formDataObj[key] = isSensitive ? '[REDACTED]' : value;
          }
          const submitTrigger = document.activeElement;
          const triggerInfo = submitTrigger && (
            submitTrigger.tagName === 'BUTTON' || 
            submitTrigger.type === 'submit'
          ) ? {
            selector: getSelector(submitTrigger),
            tagName: submitTrigger.tagName,
            text: submitTrigger.innerText || submitTrigger.value,
            type: submitTrigger.type
          } : null;
          
          console.info('[BROWZER_ACTION]', JSON.stringify({
            type: 'submit',
            timestamp: Date.now(),
            target: {
              selector: getSelector(target),
              action: target.action || undefined,
              method: target.method || 'GET',
              fieldCount: formData.entries().length
            },
            metadata: {
              triggeredBy: triggerInfo,
              formData: formDataObj,
              hasFileUpload: Array.from(target.elements).some(el => el.type === 'file')
            }
          }));
        }, true);
        document.addEventListener('keydown', (e) => {
          const importantKeys = [
            'Enter', 'Escape', 'Tab', 'Backspace', 'Delete',
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'Home', 'End', 'PageUp', 'PageDown'
          ];
          const isShortcut = (e.ctrlKey || e.metaKey || e.altKey) && e.key.length === 1;
          const isImportantKey = importantKeys.includes(e.key);
          
          if (isShortcut || isImportantKey) {
            let shortcut = '';
            if (e.ctrlKey) shortcut += 'Ctrl+';
            if (e.metaKey) shortcut += 'Cmd+';
            if (e.altKey) shortcut += 'Alt+';
            if (e.shiftKey) shortcut += 'Shift+';
            shortcut += e.key;
            const focusedElement = document.activeElement;
            const targetInfo = focusedElement ? {
              selector: getSelector(focusedElement),
              tagName: focusedElement.tagName,
              id: focusedElement.id || undefined,
              type: focusedElement.type || undefined
            } : null;
            
            console.info('[BROWZER_ACTION]', JSON.stringify({
              type: 'keypress',
              timestamp: Date.now(),
              value: e.key,
              metadata: {
                shortcut: shortcut,
                code: e.code,
                ctrlKey: e.ctrlKey,
                metaKey: e.metaKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                isShortcut: isShortcut,
                focusedElement: targetInfo
              }
            }));
          }
        }, true);
        
        /**
         * Find the actual interactive parent element
         * Traverses up the DOM to find clickable elements like buttons, links, etc.
         */
        function findInteractiveParent(element, maxDepth = 5) {
          let current = element;
          let depth = 0;
          
          while (current && depth < maxDepth) {
            if (isInteractiveElement(current)) {
              return current;
            }
            current = current.parentElement;
            depth++;
          }
          return element;
        }
        
        /**
         * Check if element is interactive (clickable)
         */
        function isInteractiveElement(element) {
          const tagName = element.tagName.toLowerCase();
          const role = element.getAttribute('role');
          const type = element.getAttribute('type');
          const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'label'];
          if (interactiveTags.includes(tagName)) {
            return true;
          }
          const interactiveRoles = [
            'button', 'link', 'menuitem', 'tab', 'checkbox', 'radio',
            'switch', 'option', 'textbox', 'searchbox', 'combobox'
          ];
          if (role && interactiveRoles.includes(role)) {
            return true;
          }
          if (element.onclick || element.hasAttribute('onclick')) {
            return true;
          }
          const style = window.getComputedStyle(element);
          if (style.cursor === 'pointer') {
            return true;
          }
          if (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') {
            return true;
          }
          
          return false;
        }
        
        /**
         * Build comprehensive element target with multiple selector strategies
         */
        function buildElementTarget(element) {
          const rect = element.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(element);
          const selectors = generateSelectorStrategies(element);
          const bestSelector = selectors.reduce((best, current) => 
            current.score > best.score ? current : best
          );
          
          return {
            selector: bestSelector.selector,
            selectors: selectors,
            tagName: element.tagName,
            id: element.id || undefined,
            className: element.className || undefined,
            name: element.name || undefined,
            type: element.type || undefined,
            role: element.getAttribute('role') || undefined,
            ariaLabel: element.getAttribute('aria-label') || undefined,
            ariaDescribedBy: element.getAttribute('aria-describedby') || undefined,
            title: element.title || undefined,
            placeholder: element.placeholder || undefined,
            text: element.innerText?.substring(0, 100) || undefined,
            value: element.value || undefined,
            href: element.href || undefined,
            dataTestId: element.getAttribute('data-testid') || undefined,
            dataCy: element.getAttribute('data-cy') || undefined,
            boundingRect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              left: rect.left
            },
            isVisible: isVisible(element),
            isInteractive: isInteractiveElement(element)
          };
        }
        
        /**
         * Generate multiple selector strategies with confidence scores
         */
        function generateSelectorStrategies(element) {
          const strategies = [];
          if (element.id) {
            strategies.push({
              strategy: 'id',
              selector: '#' + CSS.escape(element.id),
              score: 95,
              description: 'ID selector (most reliable)'
            });
          }
          if (element.hasAttribute('data-testid')) {
            const testId = element.getAttribute('data-testid');
            strategies.push({
              strategy: 'data-testid',
              selector: '[data-testid="' + testId + '"]',
              score: 90,
              description: 'Test ID selector'
            });
          }
          if (element.hasAttribute('data-cy')) {
            const cy = element.getAttribute('data-cy');
            strategies.push({
              strategy: 'data-cy',
              selector: '[data-cy="' + cy + '"]',
              score: 90,
              description: 'Cypress selector'
            });
          }
          if (element.hasAttribute('aria-label')) {
            const ariaLabel = element.getAttribute('aria-label');
            strategies.push({
              strategy: 'aria-label',
              selector: '[aria-label="' + ariaLabel + '"]',
              score: 80,
              description: 'ARIA label selector'
            });
          }
          if (element.hasAttribute('role') && element.hasAttribute('name')) {
            const role = element.getAttribute('role');
            const name = element.getAttribute('name');
            strategies.push({
              strategy: 'role',
              selector: '[role="' + role + '"][name="' + name + '"]',
              score: 75,
              description: 'Role + name selector'
            });
          }
          const text = element.innerText?.trim();
          if (text && text.length > 0 && text.length < 50) {
            const tagName = element.tagName.toLowerCase();
            if (['button', 'a', 'span'].includes(tagName)) {
              strategies.push({
                strategy: 'text',
                selector: tagName + ':contains("' + text.substring(0, 30) + '")',
                score: 70,
                description: 'Text content selector'
              });
            }
          }
          const cssSelector = generateCSSSelector(element);
          strategies.push({
            strategy: 'css',
            selector: cssSelector,
            score: 60,
            description: 'Structural CSS selector'
          });
          const xpath = generateXPath(element);
          strategies.push({
            strategy: 'xpath',
            selector: xpath,
            score: 50,
            description: 'XPath selector'
          });
          
          return strategies;
        }
        
        /**
         * Generate CSS selector (improved version)
         */
        function generateCSSSelector(element) {
          if (element.id) {
            return '#' + CSS.escape(element.id);
          }
          
          let path = [];
          let current = element;
          
          while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 5) {
            let selector = current.nodeName.toLowerCase();
            if (current.hasAttribute('data-testid')) {
              selector += '[data-testid="' + current.getAttribute('data-testid') + '"]';
              path.unshift(selector);
              break;
            }
            if (current.hasAttribute('data-cy')) {
              selector += '[data-cy="' + current.getAttribute('data-cy') + '"]';
              path.unshift(selector);
              break;
            }
            if (current.id) {
              selector += '#' + CSS.escape(current.id);
              path.unshift(selector);
              break;
            }
            if (current.className && typeof current.className === 'string') {
              const classes = current.className.trim().split(/\\s+/)
                .filter(c => c && !c.match(/^(ng-|_)/)) // Filter out framework classes
                .slice(0, 2)
                .map(c => CSS.escape(c))
                .join('.');
              if (classes) {
                selector += '.' + classes;
              }
            }
            const parent = current.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(c => 
                c.nodeName === current.nodeName
              );
              if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += ':nth-child(' + index + ')';
              }
            }
            
            path.unshift(selector);
            current = current.parentElement;
          }
          
          return path.join(' > ');
        }
        
        /**
         * Generate XPath selector
         */
        function generateXPath(element) {
          if (element.id) {
            return '//*[@id="' + element.id + '"]';
          }
          
          const parts = [];
          let current = element;
          
          while (current && current.nodeType === Node.ELEMENT_NODE) {
            let index = 1;
            let sibling = current.previousSibling;
            
            while (sibling) {
              if (sibling.nodeType === Node.ELEMENT_NODE && 
                  sibling.nodeName === current.nodeName) {
                index++;
              }
              sibling = sibling.previousSibling;
            }
            
            const tagName = current.nodeName.toLowerCase();
            const part = tagName + '[' + index + ']';
            parts.unshift(part);
            
            current = current.parentElement;
          }
          
          return '/' + parts.join('/');
        }
        
        /**
         * Check if element is visible
         */
        function isVisible(element) {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && 
                 rect.height > 0 && 
                 style.display !== 'none' && 
                 style.visibility !== 'hidden' &&
                 style.opacity !== '0';
        }
        
        /**
         * Legacy: Simple selector generator (kept for compatibility)
         */
        function getSelector(element) {
          const selectors = generateSelectorStrategies(element);
          const best = selectors.reduce((best, current) => 
            current.score > best.score ? current : best
          );
          return best.selector;
        }
      })();
    `;
  }

  /**
   * Setup CDP event listeners
   */
  private setupEventListeners(): void {
    // Remove any existing listeners first to prevent duplicates
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
      this.isRecording = false;
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
              console.log("params: ", params)
              await this.handlePendingAction(actionData);
              
            } catch (error) {
              console.error('Error parsing action:', error);
            }
          }
        }
        break;
      case 'Network.requestWillBeSent':
        this.recentNetworkRequests.push({
          url: params.request.url,
          method: params.request.method || 'GET',
          type: params.type || 'other',
          timestamp: Date.now(),
          completed: false
        });
        break;

      case 'Network.responseReceived':
      case 'Network.loadingFinished':
        const completedReq = this.recentNetworkRequests.find(
          r => r.url === params.response?.url && !r.completed
        );
        if (completedReq) {
          completedReq.completed = true;
        }
        break;
      case 'Page.lifecycleEvent':
        if (params.name === 'networkIdle') {
          console.log('🌐 Network is idle');
          await this.processPendingActions();
        }
        break;
      case 'Page.frameNavigated':
        if (params.frame.parentId === undefined) {
          const newUrl = params.frame.url;
          
          if (this.isSignificantNavigation(newUrl)) {
            this.recordNavigation(newUrl);
          }
        }
        break;
      
      case 'Page.loadEventFired':
        console.log('📄 Page loaded');
        await this.injectEventTracker();
        break;

      default:
        break;
    }
  }

  /**
   * 🆕 Handle pending action (await verification)
   */
  private async handlePendingAction(actionData: RecordedAction): Promise<void> {
    const actionId = `${actionData.type}-${actionData.timestamp}`;
    const verificationDeadline = Date.now() + 1000; // 1 second to verify
    
    this.pendingActions.set(actionId, {
      action: actionData,
      timestamp: Date.now(),
      verificationDeadline
    });
    
    console.log('⏳ Action pending verification:', actionData);
    if(actionData.target.selectors){
      console.log("sectors: ", actionData.target.selectors)
    }
    setTimeout(async () => {
      await this.verifyAndFinalizeAction(actionId);
    }, 500);
  }

  /**
   * 🆕 Verify action effects and finalize
   */
  private async verifyAndFinalizeAction(actionId: string): Promise<void> {
    const pending = this.pendingActions.get(actionId);
    if (!pending) return;
    
    const { action, timestamp } = pending;
    const preClickState = action.metadata?.preClickState;
    const effects = await this.detectClickEffects(timestamp, preClickState);
    const verifiedAction: RecordedAction = {
      ...action,
      verified: true,
      verificationTime: Date.now() - timestamp,
      effects
    };
    this.actions.push(verifiedAction);
    console.log('✅ Action verified:', verifiedAction.type);
    console.log('📊 Effects:', effects.summary || 'none');
    if(effects.network){
      console.log('   Network:', effects.network);
    }
    if(effects.navigation){
      console.log('   Navigation:', effects.navigation);
    }
    if (this.onActionCallback) {
      this.onActionCallback(verifiedAction);
    }
    this.pendingActions.delete(actionId);
  }

  /**
   * Detect comprehensive click effects
   */
  private async detectClickEffects(clickTimestamp: number, preClickState?: any): Promise<any> {
    const effects: any = {};
    const effectSummary: string[] = [];
    const allNetworkActivity = this.recentNetworkRequests.filter(
      req => req.timestamp >= clickTimestamp && req.timestamp <= clickTimestamp + 1500
    );
    const significantRequests = allNetworkActivity.filter(req => 
      this.isSignificantNetworkRequest(req.url, req.method, req.type)
    );
    
    if (significantRequests.length > 0) {
      effects.network = {
        requestCount: significantRequests.length,
        requests: significantRequests.map(req => ({
          url: req.url,
          method: req.method,
          type: req.type,
          status: req.status,
          timing: req.timestamp - clickTimestamp
        }))
      };
      effectSummary.push(`${significantRequests.length} network request(s)`);
    }
    try {
      const pageEffects = await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            const effects = {
              modal: null,
              focus: null,
              scroll: null,
              stateChange: null
            };
            const currentState = {
              url: window.location.href,
              scrollY: window.scrollY,
              scrollX: window.scrollX,
              activeElement: document.activeElement?.tagName,
              visibleModals: Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')).filter(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
              }).length
            };
            return {
              currentState: currentState,
              effects: effects
            };
          })();
        `,
        returnByValue: true
      });
      
      if (pageEffects.result?.value) {
        const result = pageEffects.result.value;
        const currentState = result.currentState;
        const focused = currentState.activeElement;
        if (focused && focused !== 'BODY' && focused !== 'HTML') {
          const meaningfulFocusTags = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'];
          if (meaningfulFocusTags.includes(focused)) {
            effects.focus = {
              changed: true,
              newFocusTagName: focused
            };
            effectSummary.push('focus changed to ' + focused.toLowerCase());
          }
        }
        const scrollDistance = Math.max(
          Math.abs(currentState.scrollY),
          Math.abs(currentState.scrollX)
        );
        if (scrollDistance > 200) { // Significant scroll only
          effects.scroll = {
            occurred: true,
            distance: scrollDistance
          };
          effectSummary.push('page scrolled');
        }
      }
    } catch (error) {
      console.error('Error detecting page effects:', error);
    }
    effects.summary = effectSummary.length > 0 
      ? effectSummary.join(', ')
      : 'no significant effects detected';
    
    return effects;
  }

  /**
   * 🆕 Process all pending actions (called on networkIdle)
   */
  private async processPendingActions(): Promise<void> {
    const pending = Array.from(this.pendingActions.keys());
    for (const actionId of pending) {
      await this.verifyAndFinalizeAction(actionId);
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
      '/log?',
      '/analytics',
      '/tracking',
    ];

    return !ignorePatterns.some(pattern => url.startsWith(pattern) || url.includes(pattern));
  }

  /**
   * Filter: Check if network request is significant (not analytics/tracking/ping)
   */
  private isSignificantNetworkRequest(url: string, method: string, type: string): boolean {
    if (type === 'Ping' || type === 'ping' || type === 'beacon') {
      return false;
    }
    const ignorePatterns = [
      '/gen_204',           // Google analytics
      '/collect',           // Google Analytics
      '/analytics',
      '/tracking',
      '/track',
      '/beacon',
      '/ping',
      '/log',
      '/telemetry',
      'google-analytics.com',
      'googletagmanager.com',
      'doubleclick.net',
      'facebook.com/tr',
      'mixpanel.com',
      'segment.com',
      'amplitude.com',
      'hotjar.com',
      '/pixel',
      '/impression',
      'clarity.ms',
      'bing.com/api/log'
    ];
    
    if (ignorePatterns.some(pattern => url.includes(pattern))) {
      return false;
    }
    if (type === 'Document') {
      return true;
    }
    if (type === 'XHR' || type === 'Fetch') {
      const apiPatterns = ['/api/', '/v1/', '/v2/', '/graphql', '/rest/', '/data/'];
      const isApiCall = apiPatterns.some(pattern => url.includes(pattern));
      const isStateChanging = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
      
      return isApiCall || isStateChanging;
    }
    
    return false;
  }



  /**
   * Record navigation
   */
  private recordNavigation(url: string, timestamp?: number): void {
    const action: RecordedAction = {
      type: 'navigate',
      timestamp: timestamp || Date.now(),
      url,
      verified: true, // Navigation is always verified
      verificationTime: 0,
    };

    this.actions.push(action);
    console.log('🧭 Navigation recorded:', action);
    if (this.onActionCallback) {
      this.onActionCallback(action);
    }
  }
}
