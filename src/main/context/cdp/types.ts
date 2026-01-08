export enum NodeType {
  ELEMENT_NODE = 1,
  ATTRIBUTE_NODE = 2,
  TEXT_NODE = 3,
  CDATA_SECTION_NODE = 4,
  ENTITY_REFERENCE_NODE = 5,
  ENTITY_NODE = 6,
  PROCESSING_INSTRUCTION_NODE = 7,
  COMMENT_NODE = 8,
  DOCUMENT_NODE = 9,
  DOCUMENT_TYPE_NODE = 10,
  DOCUMENT_FRAGMENT_NODE = 11,
  NOTATION_NODE = 12,
}

export interface DOMRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface EnhancedSnapshotNode {
  isClickable: boolean | null;
  cursorStyle: string | null;
  bounds: DOMRect | null;
  clientRects: DOMRect | null;
  scrollRects: DOMRect | null;
  computedStyles: Record<string, string> | null;
  paintOrder: number | null;
}

export interface EnhancedAXProperty {
  name: string;
  value: string | boolean | null;
}

export interface EnhancedAXNode {
  axNodeId: string;
  ignored: boolean;
  role: string | null;
  name: string | null;
  description: string | null;
  properties: EnhancedAXProperty[] | null;
  childIds: string[] | null;
}

export interface EnhancedDOMTreeNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: NodeType;
  nodeName: string;
  nodeValue: string | null;
  attributes: Record<string, string>;
  isScrollable: boolean | null;
  isVisible: boolean | null;
  absolutePosition: DOMRect | null;

  // Frame handling
  frameId: string | null;
  contentDocument: EnhancedDOMTreeNode | null;
  shadowRootType: string | null;
  shadowRoots: EnhancedDOMTreeNode[] | null;

  // Tree structure
  parentNode: EnhancedDOMTreeNode | null;
  childrenNodes: EnhancedDOMTreeNode[] | null;

  // Enhanced data
  axNode: EnhancedAXNode | null;
  snapshotNode: EnhancedSnapshotNode | null;
}

export interface SimplifiedNode {
  originalNode: EnhancedDOMTreeNode;
  children: SimplifiedNode[];
  shouldDisplay: boolean;
  isInteractive: boolean;
  isNew: boolean;
  ignoredByPaintOrder: boolean;
  excludedByParent: boolean;
  isShadowHost: boolean;
  isCompoundComponent: boolean;
}

export interface CDPDOMNode {
  nodeId: number;
  parentId?: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  localName?: string;
  nodeValue?: string;
  childNodeCount?: number;
  children?: CDPDOMNode[];
  attributes?: string[];
  documentURL?: string;
  baseURL?: string;
  publicId?: string;
  systemId?: string;
  internalSubset?: string;
  xmlVersion?: string;
  name?: string;
  value?: string;
  pseudoType?: string;
  shadowRootType?: string;
  frameId?: string;
  contentDocument?: CDPDOMNode;
  shadowRoots?: CDPDOMNode[];
  templateContent?: CDPDOMNode;
  pseudoElements?: CDPDOMNode[];
  importedDocument?: CDPDOMNode;
  distributedNodes?: CDPDOMNode[];
  isSVG?: boolean;
  isScrollable?: boolean;
}

export interface CDPSnapshotDocument {
  documentURL: number;
  title: number;
  baseURL: number;
  contentLanguage: number;
  encodingName: number;
  publicId: number;
  systemId: number;
  frameId: number;
  nodes: {
    nodeType: number[];
    nodeName: number[];
    nodeValue: number[];
    textValue?: { index: number[]; value: number[] };
    inputValue?: { index: number[]; value: number[] };
    inputChecked?: { index: number[] };
    optionSelected?: { index: number[] };
    backendNodeId: number[];
    parentIndex: number[];
    attributes?: Array<{ name: number[]; value: number[] }>;
    isClickable?: { index: number[] };
    currentSourceURL?: { index: number[]; value: number[] };
    originURL?: { index: number[]; value: number[] };
  };
  layout: {
    nodeIndex: number[];
    bounds: number[][];
    text?: number[];
    styles: number[][];
    paintOrders?: number[];
    offsetRects?: number[][];
    scrollRects?: number[][];
    clientRects?: number[][];
    stackingContexts?: { index: number[] };
  };
  textBoxes?: {
    layoutIndex: number[];
    bounds: number[][];
    start: number[];
    length: number[];
  };
  scrollOffsetX?: number;
  scrollOffsetY?: number;
}

export interface CDPSnapshot {
  documents: CDPSnapshotDocument[];
  strings: string[];
}

export interface CDPAXNode {
  nodeId: string;
  ignored: boolean;
  ignoredReasons?: Array<{
    name: string;
    value?: { type: string; value: string };
  }>;
  role?: { type: string; value: string };
  name?: { type: string; value: string; sources?: unknown[] };
  description?: { type: string; value: string };
  value?: { type: string; value: string | number | boolean };
  properties?: Array<{
    name: string;
    value: { type: string; value: string | number | boolean };
  }>;
  childIds?: string[];
  backendDOMNodeId?: number;
}

export interface CDPAXTree {
  nodes: CDPAXNode[];
}

export interface CDPDocumentResponse {
  root: CDPDOMNode;
}

export interface CDPLayoutMetrics {
  layoutViewport: {
    pageX: number;
    pageY: number;
    clientWidth: number;
    clientHeight: number;
  };
  visualViewport: {
    offsetX: number;
    offsetY: number;
    pageX: number;
    pageY: number;
    clientWidth: number;
    clientHeight: number;
    scale: number;
    zoom: number;
  };
  cssLayoutViewport: {
    clientWidth: number;
    clientHeight: number;
  };
  cssVisualViewport: {
    offsetX: number;
    offsetY: number;
    pageX: number;
    pageY: number;
    clientWidth: number;
    clientHeight: number;
    scale: number;
    zoom: number;
  };
  contentSize: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface CDPDOMResult {
  serializedTree: string;
  selectorMap: Map<number, EnhancedDOMTreeNode>;
  url: string;
  title: string;
}

export interface CDPContextOptions {
  paintOrderFiltering?: boolean;
  includeAttributes?: string[];
}
