/**
 * DO Agent Module Exports
 *
 * Autonomous browser automation agent using Claude AI.
 */

export { DOAgentService } from './DOAgentService';
export { DOAgentManager } from './DOAgentManager';
export { AUTOPILOT_TOOLS, TOOL_NAMES } from './ToolDefinitions';
export { AUTOPILOT_SYSTEM_PROMPT, buildUserGoalMessage } from './SystemPrompt';
export type {
  AutopilotConfig,
  AutopilotStatus,
  AgentLoopState,
  DOAgentResult,
  ClickToolInput,
  TypeToolInput,
  ScrollToolInput,
  NavigateToolInput,
  KeyPressToolInput,
  WaitToolInput,
  DoneToolInput,
  AutopilotEventType,
  AutopilotProgressEvent,
} from './types';
export { DEFAULT_AUTOPILOT_CONFIG } from './types';
