/**
 * Browser module - Modular browser management components
 * 
 * This module provides a clean separation of concerns for browser functionality:
 * - TabService: Tab lifecycle and state management
 * - RecordingManager: Recording orchestration across tabs
 * - AutomationManager: LLM automation session management
 * - NavigationManager: URL normalization and internal page routing
 * - DebuggerManager: CDP debugger lifecycle management
 */

export { TabService } from './TabService';
export { RecordingManager } from './RecordingManager';
export { AutomationManager } from './AutomationManager';
export { NavigationManager } from './NavigationManager';
export { DebuggerManager } from './DebuggerManager';
export * from './types';
