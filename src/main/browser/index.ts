/**
 * Browser module - Modular browser management components
 * 
 * This module provides a clean separation of concerns for browser functionality:
 * - TabManager: Tab lifecycle and state management
 * - RecordingManager: Recording orchestration across tabs
 * - AutomationManager: LLM automation session management
 * - NavigationManager: URL normalization and internal page routing
 * - DebuggerManager: CDP debugger lifecycle management
 */

export { TabManager } from './TabManager';
export { RecordingManager } from './RecordingManager';
export { AutomationManager } from './AutomationManager';
export { NavigationManager } from './NavigationManager';
export { DebuggerManager } from './DebuggerManager';
export * from './types';
