import { z } from 'zod';

export const ACTION_SCHEMA = z.object({
    action: z.enum([
      'navigate',
      'click',
      'press_enter',
      'type',
      'fill',
      'wait',
      'extract',
      'scroll',
      'select_dropdown',
      'wait_for_element',
      'wait_for_dynamic_content',
      'clear',
      'focus',
      'hover',
      'keypress',
      'check',
      'uncheck',
      'double_click',
      'right_click',
      'evaluate',
      'screenshot',
      'complete',
    ]).describe('The action to perform. Must be one of the specified automation actions.'),
    selector: z.string().optional().describe('CSS selector for the target element (required for actions like click, type, fill, select_dropdown, etc.).'),
    value: z.string().optional().describe('Value to input or select (used for type, fill, select_dropdown, keypress, evaluate).'),
    target: z.string().optional().describe('URL to navigate to (required for navigate action).'),
    description: z.string().describe('Clear description of what this action does in the context of the task.'),
    reasoning: z.string().describe('Detailed explanation of why this action is chosen and how it advances the task.'),
    result: z.any().optional().describe('Result summary, only included when action is "complete".'),
    options: z.object({
      timeout: z.number().optional().describe('Timeout in milliseconds for actions like wait_for_element (default: 5000).'),
      waitAfter: z.number().optional().describe('Time to wait after the action in milliseconds (if needed).'),
      key: z.string().optional().describe('Key to press for keypress action (e.g., Enter, Tab, Escape).'),
      delay: z.number().optional().describe('Delay before performing the action in milliseconds.'),
    }).optional().describe('Optional parameters for the action (timeout, waitAfter, key, delay).'),
  }).strict().describe('Strict schema for browser automation actions, ensuring only specified fields are included.');

export interface DoTask {
    id: string;
    instruction: string;
    steps: DoStep[];
    status: 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
}
  
export interface DoStep {
    id: string;
    action: 'navigate' | 'click' | 'press_enter' | 'type' | 'fill' | 'wait' | 'extract' | 'scroll' | 'analyze' | 
            'select' | 'hover' | 'focus' | 'blur' | 'keypress' | 'clear' | 
            'wait_for_element' | 'wait_for_text' | 'screenshot' | 'evaluate' |
            'select_dropdown' | 'check' | 'uncheck' | 'double_click' | 'right_click' |
            'wait_for_dynamic_content' | 'complete';
    target?: string;
    value?: string;
    selector?: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
    reasoning?: string;
    options?: {
      timeout?: number;
      waitAfter?: number;
      multiple?: boolean;
      index?: number;
      key?: string;
      button?: 'left' | 'right' | 'middle';
      clickCount?: number;
      delay?: number;
      position?: { x: number; y: number };
    };
}

export interface DoResult {
    success: boolean;
    data?: any;
    error?: string;
    executionTime: number;
}

export interface PageState {
    url: string;
    title: string;
    dom: string;
    screenshot?: string;
    interactiveElements: ElementInfo[];
    rawHTML?: string;
    visibleText?: string;
    detectedPatterns?: {
      prices: string[];
      times: string[];
      hasContent: boolean;
      contentLength: number;
    };
}
  
export interface ElementInfo {
    tag: string;
    text: string;
    selector: string;
    type?: string;
    placeholder?: string;
    value?: string;
    href?: string;
    visible: boolean;
    clickable: boolean;
    id?: string;
    className?: string;
    name?: string;
    ariaLabel?: string;
    ariaRole?: string;
    dataTestId?: string;
    checked?: boolean;
    selected?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    options?: string[]; // For select elements
    parentText?: string; // Text of parent element for context
    siblingText?: string; // Text of nearby siblings
    position?: { x: number; y: number; width: number; height: number };
    isInViewport?: boolean;
    tabIndex?: number;
    contentEditable?: boolean;
    hasDropdown?: boolean;
    isDateInput?: boolean;
    isSearchInput?: boolean;
}
  
export interface CDPPage {
    goto: (url: string) => Promise<void>;
    click: (selector: string, options?: any) => Promise<void>;
    fill: (selector: string, value: string) => Promise<void>;
    type: (selector: string, text: string, options?: any) => Promise<void>;
    waitForSelector: (selector: string, options?: any) => Promise<any>;
    waitForTimeout: (timeout: number) => Promise<void>;
    evaluate: (script: string | Function, ...args: any[]) => Promise<any>;
    locator: (selector: string) => any;
    selectOption: (selector: string, values: string | string[]) => Promise<void>;
    screenshot: (options?: any) => Promise<Buffer>;
    content: () => Promise<string>;
    getDebugInfo: () => Promise<any>;
    title: () => Promise<string>;
    url: () => Promise<string>;
    keyboard: {
      press: (key: string) => Promise<void>;
      type: (text: string) => Promise<void>;
    };
    mouse: {
      click: (x: number, y: number, options?: any) => Promise<void>;
    };
}

export const MAX_STEPS = 20;