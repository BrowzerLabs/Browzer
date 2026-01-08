import { WebContentsView } from 'electron';

import { CDPClient } from './cdp/CDPClient';
import { DOMSerializer } from './cdp/DOMSerializer';
import {
  CDPDOMResult,
  CDPContextOptions,
  CDPSnapshot,
  CDPDocumentResponse,
  CDPAXTree,
  CDPLayoutMetrics,
  EnhancedDOMTreeNode,
} from './cdp/types';
import { REQUIRED_COMPUTED_STYLES } from './cdp/constants';

export interface CDPExtractorResult extends CDPDOMResult {
  error?: string;
}

export class CDPExtractor {
  private cdp: CDPClient;
  private devicePixelRatio = 1.0;
  private selectorMap: Map<number, EnhancedDOMTreeNode> = new Map();

  constructor(private view: WebContentsView) {
    this.cdp = new CDPClient(view);
  }

  async extractContext(
    options: CDPContextOptions = {}
  ): Promise<CDPExtractorResult> {
    const { paintOrderFiltering = true, includeAttributes } = options;

    const startTime = Date.now();
    console.log('[CDPExtractor] 🚀 Starting CDP extraction', {
      paintOrderFiltering,
      url: this.cdp.getUrl(),
    });

    try {
      console.log('[CDPExtractor] 📡 Enabling CDP domains...');
      await this.cdp.enableDomains();

      await this.updateDevicePixelRatio();
      console.log(
        '[CDPExtractor] 📐 Device pixel ratio:',
        this.devicePixelRatio
      );

      console.log('[CDPExtractor] 📥 Fetching DOM, Snapshot, and AX tree...');
      const fetchStart = Date.now();
      const [snapshot, domTree, axTree] = await Promise.all([
        this.cdp.send<CDPSnapshot>('DOMSnapshot.captureSnapshot', {
          computedStyles: [...REQUIRED_COMPUTED_STYLES],
          includePaintOrder: true,
          includeDOMRects: true,
          includeBlendedBackgroundColors: false,
          includeTextColorOpacities: false,
        }),
        this.cdp.send<CDPDocumentResponse>('DOM.getDocument', {
          depth: -1,
          pierce: true,
        }),
        this.cdp.send<CDPAXTree>('Accessibility.getFullAXTree'),
      ]);
      console.log(
        '[CDPExtractor] ✅ CDP data fetched in',
        Date.now() - fetchStart,
        'ms'
      );

      console.log('[CDPExtractor] 🌳 Building enhanced DOM tree...');
      const buildStart = Date.now();
      const serializer = new DOMSerializer(
        this.devicePixelRatio,
        paintOrderFiltering,
        includeAttributes ? [...includeAttributes] : undefined
      );

      const builder = serializer.getBuilder();
      builder.buildSnapshotLookup(snapshot);
      builder.buildAXLookup(axTree);

      const enhancedRoot = builder.buildTree(domTree.root);
      console.log(
        '[CDPExtractor] ✅ Tree built in',
        Date.now() - buildStart,
        'ms'
      );

      console.log('[CDPExtractor] 📝 Serializing DOM tree...');
      const serializeStart = Date.now();
      const result = serializer.serialize(
        enhancedRoot,
        this.cdp.getUrl(),
        this.cdp.getTitle()
      );
      console.log(
        '[CDPExtractor] ✅ Serialization complete in',
        Date.now() - serializeStart,
        'ms'
      );

      this.selectorMap = result.selectorMap;

      const totalTime = Date.now() - startTime;
      console.log('[CDPExtractor] 🎉 CDP extraction complete', {
        totalTime: `${totalTime}ms`,
        treeLength: result.serializedTree.length,
        interactiveElements: result.selectorMap.size,
        url: result.url,
        title: result.title,
      });

      console.log('[CDPExtractor] 📄 Serialized DOM tree output:');
      console.log('─'.repeat(80));
      console.log(result.serializedTree);
      console.log('─'.repeat(80));

      console.log(
        '[CDPExtractor] 🔗 Interactive elements (backend_node_id → tag):'
      );
      const elementsList: string[] = [];
      result.selectorMap.forEach((node, backendId) => {
        const attrs = Object.entries(node.attributes)
          .slice(0, 3)
          .map(([k, v]) => `${k}="${v.substring(0, 20)}"`)
          .join(' ');
        elementsList.push(
          `  [${backendId}] <${node.nodeName.toLowerCase()}${attrs ? ' ' + attrs : ''}>`
        );
      });
      console.log(elementsList.join('\n'));

      return result;
    } catch (error) {
      console.error('[CDPExtractor] ❌ Failed to extract context:', error);
      return {
        serializedTree: '',
        selectorMap: new Map(),
        url: this.cdp.getUrl(),
        title: this.cdp.getTitle(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async updateDevicePixelRatio(): Promise<void> {
    try {
      const metrics = await this.cdp.send<CDPLayoutMetrics>(
        'Page.getLayoutMetrics'
      );
      const visual = metrics.visualViewport;
      const cssVisual = metrics.cssVisualViewport;

      const deviceWidth = visual?.clientWidth || 1920;
      const cssWidth = cssVisual?.clientWidth || deviceWidth;

      this.devicePixelRatio = cssWidth > 0 ? deviceWidth / cssWidth : 1.0;
    } catch {
      this.devicePixelRatio = 1.0;
    }
  }

  async resolveNode(
    backendNodeId: number
  ): Promise<{ objectId: string } | null> {
    try {
      const result = await this.cdp.send<{ object: { objectId: string } }>(
        'DOM.resolveNode',
        {
          backendNodeId,
        }
      );
      return { objectId: result.object.objectId };
    } catch (error) {
      console.error('[CDPExtractor] Failed to resolve node:', error);
      return null;
    }
  }

  async getBoxModel(backendNodeId: number): Promise<{
    content: number[];
    padding: number[];
    border: number[];
    margin: number[];
    width: number;
    height: number;
  } | null> {
    try {
      const result = await this.cdp.send<{
        model: {
          content: number[];
          padding: number[];
          border: number[];
          margin: number[];
          width: number;
          height: number;
        };
      }>('DOM.getBoxModel', { backendNodeId });
      return result.model;
    } catch (error) {
      console.error('[CDPExtractor] Failed to get box model:', error);
      return null;
    }
  }

  async scrollIntoView(backendNodeId: number): Promise<boolean> {
    try {
      await this.cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId });
      return true;
    } catch (error) {
      console.error('[CDPExtractor] Failed to scroll into view:', error);
      return false;
    }
  }

  async focus(backendNodeId: number): Promise<boolean> {
    try {
      await this.cdp.send('DOM.focus', { backendNodeId });
      return true;
    } catch (error) {
      console.error('[CDPExtractor] Failed to focus element:', error);
      return false;
    }
  }

  async getElementCenter(
    backendNodeId: number
  ): Promise<{ x: number; y: number } | null> {
    const boxModel = await this.getBoxModel(backendNodeId);
    if (!boxModel) {
      return null;
    }

    const content = boxModel.content;
    if (content.length < 4) {
      return null;
    }

    const x = (content[0] + content[2]) / 2;
    const y = (content[1] + content[5]) / 2;

    return { x, y };
  }

  getSelectorMap(): Map<number, EnhancedDOMTreeNode> {
    return this.selectorMap;
  }

  getNode(backendNodeId: number): EnhancedDOMTreeNode | undefined {
    return this.selectorMap.get(backendNodeId);
  }

  hasNode(backendNodeId: number): boolean {
    return this.selectorMap.has(backendNodeId);
  }

  getCDPClient(): CDPClient {
    return this.cdp;
  }

  detach(): void {
    this.cdp.detach();
  }
}

export type {
  CDPDOMResult,
  CDPContextOptions,
  EnhancedDOMTreeNode,
} from './cdp/types';
