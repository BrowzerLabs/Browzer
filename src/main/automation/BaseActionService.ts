import { Debugger, WebContentsView } from 'electron';

export interface ExecutionContext {
  view: Electron.WebContentsView;
  tabId: string;
}

export interface NodeParams {
  nodeId?: number;
  role?: string;
  name?: string;
  attributes?: Record<string, string>;
}

export interface NetworkIdleOptions {
  timeout?: number;
  idleTime?: number;
  maxInflightRequests?: number;
}

export abstract class BaseActionService {
  protected view: WebContentsView;
  protected tabId: string;
  protected cdp: Debugger;

  constructor(context: ExecutionContext) {
    this.view = context.view;
    this.tabId = context.tabId;
    this.cdp = context.view.webContents.debugger;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async findBestMatchingNode(
    nodes: any[],
    params: NodeParams
  ): Promise<any | null> {
    interface ScoredNode {
      node: any;
      score: number;
    }

    const NOISE_ROLES = new Set([
      'none',
      'generic',
      'inlinetextbox',
      'statictext',
      'linebreak',
      'layouttablecell',
      'layouttablerow',
      'layouttable',
      'paragraph',
      'heading',
      'banner',
      'contentinfo',
      'complementary',
      'article',
      'main',
      'grid',
      'table',
      'toolbar',
      'alertdialog',
      'alert',
      'status',
      'log',
      'marquee',
      'timer',
      'math',
      'note',
      'tooltip',
      'separator',
      'scrollbar',
      'presentation',
    ]);

    const candidates: ScoredNode[] = [];

    for (const node of nodes) {
      if (!node.backendDOMNodeId) continue;
      const nodeRole = node.role?.value?.toLowerCase() || '';
      if (NOISE_ROLES.has(nodeRole)) continue;

      const score = await this.calculateMatchScore(node, params);

      if (score > 0) {
        candidates.push({ node, score });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => b.score - a.score);
    const bestCandidate = candidates[0];
    bestCandidate.node.score = bestCandidate.score;

    return bestCandidate.node;
  }

  protected async calculateMatchScore(
    node: any,
    params: NodeParams
  ): Promise<number> {
    let score = 0;

    const nodeRole = node.role?.value?.toLowerCase() || '';
    const nodeName = node.name?.value || '';

    if (params.role) {
      const targetRole = params.role.toLowerCase();
      if (nodeRole === targetRole) {
        score += 100;
      } else if (
        nodeRole.includes(targetRole) ||
        targetRole.includes(nodeRole)
      ) {
        score += 50;
      }
    }

    if (params.name) {
      const targetText = params.name.toLowerCase();
      const nameMatch = this.getTextMatchScore(
        nodeName.toLowerCase(),
        targetText
      );

      if (nameMatch === 0) {
        return 0;
      }

      score += nameMatch;
    }

    if (params.attributes && Object.keys(params.attributes).length > 0) {
      const attrScore = await this.calculateAttributeScore(
        node,
        params.attributes
      );

      score += attrScore;
    }

    return score;
  }

  private getTextMatchScore(nodeText: string, targetText: string): number {
    if (!nodeText || !targetText) return 0;

    if (nodeText === targetText) {
      return 200;
    }

    if (nodeText.includes(targetText)) {
      return 150;
    }

    if (targetText.includes(nodeText)) {
      return 140;
    }

    const fuzzyScore = this.calculateFuzzyScore(nodeText, targetText);
    if (fuzzyScore > 0.8) {
      return Math.floor(130 * fuzzyScore);
    }

    const words = targetText.split(/\s+/);
    const matchedWords = words.filter((word) => nodeText.includes(word));
    if (matchedWords.length > 0) {
      return Math.floor(100 * (matchedWords.length / words.length));
    }

    return 0;
  }

  private calculateFuzzyScore(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  private async calculateAttributeScore(
    node: any,
    targetAttributes: Record<string, string>
  ): Promise<number> {
    if (!node.backendDOMNodeId) {
      return 0;
    }

    try {
      const domNode = await this.cdp.sendCommand('DOM.resolveNode', {
        backendNodeId: node.backendDOMNodeId,
      });

      if (!domNode || !domNode.object || !domNode.object.objectId) {
        console.log('Failed to resolve DOM node');
        return 0;
      }

      const attributesResult = await this.cdp.sendCommand(
        'Runtime.callFunctionOn',
        {
          objectId: domNode.object.objectId,
          functionDeclaration: `function() {
          const attrs = {};
          if (this.attributes) {
            for (let i = 0; i < this.attributes.length; i++) {
              const attr = this.attributes[i];
              attrs[attr.name] = attr.value;
            }
          }
          return attrs;
        }`,
          returnByValue: true,
        }
      );

      const htmlAttributes = attributesResult.result?.value || {};
      let matchedCount = 0;
      const totalCount = Object.keys(targetAttributes).length;

      for (const [attrName, attrValue] of Object.entries(targetAttributes)) {
        const htmlAttrValue = htmlAttributes[attrName];

        if (htmlAttrValue !== undefined && htmlAttrValue !== null) {
          const targetValueLower = String(attrValue).toLowerCase();
          const htmlAttrValueLower = String(htmlAttrValue).toLowerCase();

          if (htmlAttrValueLower === targetValueLower) {
            matchedCount += 1;
          } else if (htmlAttrValueLower.includes(targetValueLower)) {
            matchedCount += 0.7;
          } else if (targetValueLower.includes(htmlAttrValueLower)) {
            matchedCount += 0.5;
          }
        }
      }

      if (matchedCount === 0) {
        return 0;
      }

      return Math.floor(150 * (matchedCount / totalCount));
    } catch (error) {
      console.error('Error calculating attribute score:', error);
      return 0;
    }
  }

  public async waitForNetworkIdle(
    options: NetworkIdleOptions = {}
  ): Promise<void> {
    const { timeout = 5000, idleTime = 500, maxInflightRequests = 0 } = options;

    let resolvePromise: () => void;
    const idlePromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    let timeoutTimer: NodeJS.Timeout | null = null;
    let networkIdleTimer: NodeJS.Timeout | null = null;
    let isResolved = false;
    const inflightRequests = new Set<string>();

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (networkIdleTimer) clearTimeout(networkIdleTimer);
      this.cdp.removeListener('message', onRequestWillBeSent);
      this.cdp.removeListener('message', onLoadingFinished);
      this.cdp.removeListener('message', onLoadingFailed);
      this.cdp.removeListener('message', onResponseReceived);
    };

    const resolveOnce = (reason: string) => {
      if (isResolved) return;
      isResolved = true;
      console.log(`[NetworkIdle] ${reason}`);
      cleanup();
      resolvePromise();
    };

    timeoutTimer = setTimeout(() => {
      resolveOnce(
        `Timeout after ${timeout}ms (${inflightRequests.size} pending requests)`
      );
    }, timeout);

    const checkNetworkIdle = () => {
      if (isResolved) return;

      if (inflightRequests.size <= maxInflightRequests) {
        if (networkIdleTimer) {
          clearTimeout(networkIdleTimer);
        }

        networkIdleTimer = setTimeout(() => {
          resolveOnce(
            `Network idle achieved (${inflightRequests.size} requests)`
          );
        }, idleTime);
      } else {
        if (networkIdleTimer) {
          clearTimeout(networkIdleTimer);
          networkIdleTimer = null;
        }
      }
    };

    const onRequestWillBeSent = (event: any, method: string, params: any) => {
      if (method === 'Network.requestWillBeSent') {
        const type = params.type;
        if (
          type === 'Document' ||
          type === 'Stylesheet' ||
          type === 'Script' ||
          type === 'XHR' ||
          type === 'Fetch'
        ) {
          inflightRequests.add(params.requestId);
          if (networkIdleTimer) {
            clearTimeout(networkIdleTimer);
            networkIdleTimer = null;
          }
        }
      }
    };

    const onLoadingFinished = (event: any, method: string, params: any) => {
      if (method === 'Network.loadingFinished') {
        inflightRequests.delete(params.requestId);
        checkNetworkIdle();
      }
    };

    const onLoadingFailed = (event: any, method: string, params: any) => {
      if (method === 'Network.loadingFailed') {
        inflightRequests.delete(params.requestId);
        checkNetworkIdle();
      }
    };

    const onResponseReceived = (event: any, method: string, params: any) => {
      if (method === 'Network.responseReceived') {
        if (params.response?.status >= 400) {
          inflightRequests.delete(params.requestId);
        }
      }
    };

    try {
      const readyState = await this.cdp.sendCommand('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      });

      const isLoading = readyState.result?.value === 'loading';

      this.cdp.on('message', onRequestWillBeSent);
      this.cdp.on('message', onLoadingFinished);
      this.cdp.on('message', onLoadingFailed);
      this.cdp.on('message', onResponseReceived);

      await this.cdp.sendCommand('Network.enable').catch(() => {
        // Ignore - Network.enable may fail if already enabled
      });

      if (!isLoading) {
        await this.sleep(100);

        if (inflightRequests.size <= maxInflightRequests) {
          resolveOnce('Page already loaded and idle');
          return idlePromise;
        }
      }

      checkNetworkIdle();
    } catch (error) {
      console.error('[NetworkIdle] Setup error:', error);
      resolveOnce('Setup error, proceeding anyway');
    }

    return idlePromise;
  }
}
