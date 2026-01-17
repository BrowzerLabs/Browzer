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
  private inflightRequests: Set<string> = new Set();
  private networkIdleTimer: NodeJS.Timeout | null = null;

  constructor(context: ExecutionContext) {
    this.view = context.view;
    this.tabId = context.tabId;
    this.cdp = context.view.webContents.debugger;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected findBestMatchingNode(nodes: any[], params: NodeParams): any | null {
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

      const score = this.calculateMatchScore(node, params);

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

  protected calculateMatchScore(node: any, params: NodeParams): number {
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
      const attrScore = this.calculateAttributeScore(node, params.attributes);

      if (attrScore === 0) {
        return 0;
      }

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

  private calculateAttributeScore(
    node: any,
    targetAttributes: Record<string, string>
  ): number {
    if (!node.properties || node.properties.length === 0) {
      return 0;
    }

    let matchedCount = 0;
    let totalCount = Object.keys(targetAttributes).length;

    const nodeProps = new Map<string, any>();
    for (const prop of node.properties) {
      nodeProps.set(prop.name, prop.value?.value);
    }

    for (const [attrName, attrValue] of Object.entries(targetAttributes)) {
      const nodePropValue = nodeProps.get(attrName);

      if (nodePropValue !== undefined && nodePropValue !== null) {
        const targetValueLower = String(attrValue).toLowerCase();
        const nodePropValueLower = String(nodePropValue).toLowerCase();

        if (nodePropValueLower === targetValueLower) {
          matchedCount += 1;
        } else if (nodePropValueLower.includes(targetValueLower)) {
          matchedCount += 0.7;
        } else if (targetValueLower.includes(nodePropValueLower)) {
          matchedCount += 0.5;
        }
      }
    }

    if (matchedCount === 0) {
      return 0;
    }

    return Math.floor(150 * (matchedCount / totalCount));
  }

  public async waitForNetworkIdle(
    options: NetworkIdleOptions = {}
  ): Promise<void> {
    const {
      timeout = 20000,
      idleTime = 500,
      maxInflightRequests = 2,
    } = options;

    return new Promise((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        this.cleanup();
        console.warn(
          `[NetworkIdle] Timeout after ${timeout}ms, proceeding anyway`
        );
        resolve();
      }, timeout);

      const checkNetworkIdle = () => {
        if (this.inflightRequests.size <= maxInflightRequests) {
          if (this.networkIdleTimer) {
            clearTimeout(this.networkIdleTimer);
          }

          this.networkIdleTimer = setTimeout(() => {
            clearTimeout(timeoutTimer);
            this.cleanup();
            console.log(
              `[NetworkIdle] Network idle achieved (${this.inflightRequests.size} requests)`
            );
            resolve();
          }, idleTime);
        }
      };

      const onRequestWillBeSent = (event: any, method: string, params: any) => {
        if (method === 'Network.requestWillBeSent') {
          this.inflightRequests.add(params.requestId);
          if (this.networkIdleTimer) {
            clearTimeout(this.networkIdleTimer);
            this.networkIdleTimer = null;
          }
        }
      };

      const onLoadingFinished = (event: any, method: string, params: any) => {
        if (method === 'Network.loadingFinished') {
          this.inflightRequests.delete(params.requestId);
          checkNetworkIdle();
        }
      };

      const onLoadingFailed = (event: any, method: string, params: any) => {
        if (method === 'Network.loadingFailed') {
          this.inflightRequests.delete(params.requestId);
          checkNetworkIdle();
        }
      };

      const cleanup = () => {
        this.cdp.removeListener('message', onRequestWillBeSent);
        this.cdp.removeListener('message', onLoadingFinished);
        this.cdp.removeListener('message', onLoadingFailed);
        if (this.networkIdleTimer) {
          clearTimeout(this.networkIdleTimer);
          this.networkIdleTimer = null;
        }
      };

      this.cleanup = cleanup;

      this.cdp.on('message', onRequestWillBeSent);
      this.cdp.on('message', onLoadingFinished);
      this.cdp.on('message', onLoadingFailed);

      this.cdp
        .sendCommand('Network.enable')
        .then(() => {
          checkNetworkIdle();
        })
        .catch((error) => {
          console.error(
            '[NetworkIdle] Failed to enable Network domain:',
            error
          );
          cleanup();
          clearTimeout(timeoutTimer);
          resolve();
        });
    });
  }

  private cleanup: () => void = () => {};
}
