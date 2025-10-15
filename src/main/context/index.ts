/**
 * Browser Context Module
 * 
 * Exports all context-related functionality for providing
 * real-time browser state to LLM agents.
 */

export { BrowserContextProvider } from './BrowserContextProvider';
export { DOMPruner } from './DOMPruner';
export { AccessibilityTreeExtractor } from './AccessibilityTreeExtractor';

export type {
  BrowserContext,
  ContextExtractionOptions,
  PrunedElement,
  A11yNode,
  ConsoleEntry,
  NetworkEntry,
  PageMetadata,
  VisualContext,
  PruningStrategy
} from './types';

