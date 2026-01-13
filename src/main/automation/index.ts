/**
 * Automation Module
 *
 * Exports all automation-related components for workflow execution and playback.
 */

// Core engine
export { AutomationEngine } from './AutomationEngine';

// Execution components
export {
  WorkflowExecutor,
  ElementNotFoundError,
  AssertionError,
} from './WorkflowExecutor';
export { ElementFinder } from './ElementFinder';
export { ActionExecutor } from './ActionExecutor';
export { VariableResolver } from './VariableResolver';

// AI-powered components
export { GeneralizationService } from './GeneralizationService';
export { IntentParser } from './IntentParser';

// Types
export type {
  ExecutionContext,
  ExecutionStatus,
  ExecutionError,
  ExecutionOptions,
  StepExecutionResult,
  WorkflowDefinition,
  WorkflowStep,
  InputVariable,
  ElementLocator,
  SelectorStrategy,
  SelectorType,
  FoundElement,
  BoundingBox,
  GeneralizationRequest,
  GeneralizationResult,
  WorkflowModification,
  PageContext,
  VisibleElement,
  ParsedIntent,
  IntentType,
  ContextInsights,
  HealingStrategy,
  HealingResult,
  AutomationEvents,
} from './types';
