// Main Orchestrator
export { AutomationOrchestrator } from './AutomationOrchestrator';
export type { AutomationRequest, AutomationResponse, BrowserContext } from './AutomationOrchestrator';

// Chat Management
export { ChatOrchestrator } from './ChatOrchestrator';
export type { ChatMessage, ChatSession, ExecutionContext } from './ChatOrchestrator';

// DOM Extraction
export { IntelligentDOMExtractor } from './IntelligentDOMExtractor';
export type {
  ExtractedElement,
  ElementContext,
  FilteredDOM,
  FormInfo,
  NavigationInfo,
} from './IntelligentDOMExtractor';

// SPA Detection
export { SPAReadyDetector } from './SPAReadyDetector';
export type { ReadyState, WaitOptions } from './SPAReadyDetector';

// Adaptive Execution (Cursor-like real-time execution)
export { AdaptiveExecutionEngine } from './AdaptiveExecutionEngine';
export type {
  AdaptiveExecutionContext,
  ExecutionHistoryEntry,
  NextStepDecision,
} from './AdaptiveExecutionEngine';