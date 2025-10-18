import { z } from 'zod';
import { tool } from 'ai';
import { CDPConnection } from './tools/cdp';
import { performCdpAction } from './tools/actions';
import { logger } from './utils';

function isSafeExpression(expr: string): boolean {
  const safePatterns = [/^document\.querySelector/, /^window\.location/, /^document\.body\.innerText/];
  return safePatterns.some(pattern => pattern.test(expr));
}

export function buildTools(cdp: CDPConnection, customTools: Record<string, any> = {}): Record<string, any> {
  const defaultTools = {
    navigate: tool({
      description: 'Navigate to a URL',
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        try {
          await performCdpAction(cdp, 'navigate', { url });
          return { ok: true, message: `Successfully navigated to ${url}` };
        } catch (error) {
          logger.error('Tool navigate failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    click: tool({
      description: 'Click an element by selector',
      inputSchema: z.object({ selector: z.string() }),
      execute: async ({ selector }) => {
        try {
          const element = await performCdpAction(cdp, 'evaluate', {
            expression: `document.querySelector('${selector}') !== null`
          });
          if (!element) throw new Error(`Element with selector "${selector}" not found`);
          await performCdpAction(cdp, 'click', { selector });
          return { ok: true, message: `Successfully clicked element with selector "${selector}"` };
        } catch (error) {
          logger.error('Tool click failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    double_click: tool({
      description: 'Double-click an element by selector',
      inputSchema: z.object({ selector: z.string() }),
      execute: async ({ selector }) => {
        try {
          const element = await performCdpAction(cdp, 'evaluate', {
            expression: `document.querySelector('${selector}') !== null`
          });
          if (!element) throw new Error(`Element with selector "${selector}" not found`);
          await performCdpAction(cdp, 'double_click', { selector });
          return { ok: true, message: `Successfully double-clicked element with selector "${selector}"` };
        } catch (error) {
          logger.error('Tool double_click failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    right_click: tool({
      description: 'Right-click an element by selector',
      inputSchema: z.object({ selector: z.string() }),
      execute: async ({ selector }) => {
        try {
          const element = await performCdpAction(cdp, 'evaluate', {
            expression: `document.querySelector('${selector}') !== null`
          });
          if (!element) throw new Error(`Element with selector "${selector}" not found`);
          await performCdpAction(cdp, 'right_click', { selector });
          return { ok: true, message: `Successfully right-clicked element with selector "${selector}"` };
        } catch (error) {
          logger.error('Tool right_click failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    type: tool({
      description: 'Type text into focused element',
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => {
        try {
          await performCdpAction(cdp, 'type', { text });
          return { ok: true, message: `Successfully typed "${text}"` };
        } catch (error) {
          logger.error('Tool type failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    keypress: tool({
      description: 'Press a keyboard key',
      inputSchema: z.object({ key: z.string() }),
      execute: async ({ key }) => {
        try {
          await performCdpAction(cdp, 'keypress', { key });
          return { ok: true, message: `Successfully pressed key "${key}"` };
        } catch (error) {
          logger.error('Tool keypress failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    press_enter: tool({
      description: 'Press the Enter key',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          await performCdpAction(cdp, 'keypress', { key: 'Enter' });
          return { ok: true, message: 'Successfully pressed Enter' };
        } catch (error) {
          logger.error('Tool press_enter failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    focus: tool({
      description: 'Focus an element',
      inputSchema: z.object({ selector: z.string() }),
      execute: async ({ selector }) => {
        try {
          await performCdpAction(cdp, 'focus', { selector });
          return { ok: true, message: `Successfully focused element with selector "${selector}"` };
        } catch (error) {
          logger.error('Tool focus failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    blur: tool({
      description: 'Blur an element',
      inputSchema: z.object({ selector: z.string() }),
      execute: async ({ selector }) => {
        try {
          await performCdpAction(cdp, 'blur', { selector });
          return { ok: true, message: `Successfully blurred element with selector "${selector}"` };
        } catch (error) {
          logger.error('Tool blur failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    scroll: tool({
      description: 'Scroll vertically by pixels',
      inputSchema: z.object({ value: z.number().optional() }),
      execute: async ({ value }) => {
        try {
          await performCdpAction(cdp, 'scroll', { value: value?.toString() });
          return { ok: true, message: `Successfully scrolled by ${value || 100} pixels` };
        } catch (error) {
          logger.error('Tool scroll failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    wait: tool({
      description: 'Wait for milliseconds',
      inputSchema: z.object({ ms: z.number() }),
      execute: async ({ ms }) => {
        try {
          await performCdpAction(cdp, 'wait', { waitTime: ms });
          return { ok: true, message: `Successfully waited for ${ms}ms` };
        } catch (error) {
          logger.error('Tool wait failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    extract: tool({
      description: 'Extract innerText of a selector',
      inputSchema: z.object({ selector: z.string() }),
      execute: async ({ selector }) => {
        try {
          const r = await performCdpAction(cdp, 'extract', { selector });
          return { ok: true, text: r, message: `Successfully extracted text from selector "${selector}"` };
        } catch (error) {
          logger.error('Tool extract failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    wait_for_element: tool({
      description: 'Wait for element to appear',
      inputSchema: z.object({ selector: z.string() }),
      execute: async ({ selector }) => {
        try {
          await performCdpAction(cdp, 'wait_for_element', { selector });
          return { ok: true, message: `Element with selector "${selector}" found` };
        } catch (error) {
          logger.error('Tool wait_for_element failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    wait_for_text: tool({
      description: 'Wait for text to appear on page',
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => {
        try {
          await performCdpAction(cdp, 'wait_for_text', { text });
          return { ok: true, message: `Text "${text}" found on page` };
        } catch (error) {
          logger.error('Tool wait_for_text failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    evaluate: tool({
      description: 'Evaluate a safe JS expression in page',
      inputSchema: z.object({ expression: z.string().refine(expr => isSafeExpression(expr), { message: 'Unsafe JavaScript expression' }) }),
      execute: async ({ expression }) => {
        try {
          const r = await performCdpAction(cdp, 'evaluate', { expression });
          return { ok: true, value: r, message: `Successfully evaluated expression "${expression}"` };
        } catch (error) {
          logger.error('Tool evaluate failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    screenshot: tool({
      description: 'Capture a PNG screenshot',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const r = await performCdpAction(cdp, 'screenshot', {});
          return { ok: true, pngBase64: (r as Buffer).toString('base64'), message: 'Successfully captured screenshot' };
        } catch (error) {
          logger.error('Tool screenshot failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    select_dropdown: tool({
      description: 'Select value in a dropdown',
      inputSchema: z.object({ selector: z.string(), value: z.string() }),
      execute: async ({ selector, value }) => {
        try {
          await performCdpAction(cdp, 'select_dropdown', { selector, value });
          return { ok: true, message: `Successfully selected value "${value}" in dropdown "${selector}"` };
        } catch (error) {
          logger.error('Tool select_dropdown failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    check: tool({
      description: 'Check a checkbox',
      inputSchema: z.object({ selector: z.string() }),
      execute: async ({ selector }) => {
        try {
          await performCdpAction(cdp, 'check', { selector });
          return { ok: true, message: `Successfully checked checkbox "${selector}"` };
        } catch (error) {
          logger.error('Tool check failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    uncheck: tool({
      description: 'Uncheck a checkbox',
      inputSchema: z.object({ selector: z.string() }),
      execute: async ({ selector }) => {
        try {
          await performCdpAction(cdp, 'uncheck', { selector });
          return { ok: true, message: `Successfully unchecked checkbox "${selector}"` };
        } catch (error) {
          logger.error('Tool uncheck failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    get_interactive_elements: tool({
      description: 'Get interactive DOM elements and text content',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const r = await performCdpAction(cdp, 'get_interactive_elements', {});
          return { ok: true, context: r, message: 'Successfully retrieved DOM elements and text content' };
        } catch (error) {
          logger.error('Tool get_interactive_elements failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    get_page_text: tool({
      description: 'Get page text content',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const r = await performCdpAction(cdp, 'get_page_text', {});
          return { ok: true, text: r, message: 'Successfully retrieved page text content' };
        } catch (error) {
          logger.error('Tool get_page_text failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    smart_click: tool({
      description: 'Smart click with multiple fallback strategies for reliable element interaction',
      inputSchema: z.object({ 
        selector: z.string(),
        text: z.string().optional(),
        ariaLabel: z.string().optional()
      }),
      execute: async ({ selector, text, ariaLabel }) => {
        try {
          await performCdpAction(cdp, 'smart_click', { 
            selector, 
            text: text || ariaLabel,
            value: ariaLabel 
          });
          return { ok: true, message: `Successfully smart-clicked element "${selector}"` };
        } catch (error) {
          logger.error('Tool smart_click failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    find_element_by_semantics: tool({
      description: 'Find element using semantic attributes (role, aria-label, name)',
      inputSchema: z.object({ 
        role: z.string().optional(),
        ariaLabel: z.string().optional(),
        name: z.string().optional(),
        tagName: z.string().optional()
      }),
      execute: async ({ role, ariaLabel, name, tagName }) => {
        try {
          const result = await performCdpAction(cdp, 'find_element_by_semantics', { 
            selector: role,
            text: ariaLabel,
            value: name,
            key: tagName
          });
          return { ok: true, element: result, message: 'Successfully found element by semantics' };
        } catch (error) {
          logger.error('Tool find_element_by_semantics failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    find_element_by_text: tool({
      description: 'Find element by text content',
      inputSchema: z.object({ 
        text: z.string(),
        tagName: z.string().optional()
      }),
      execute: async ({ text, tagName }) => {
        try {
          const result = await performCdpAction(cdp, 'find_element_by_text', { 
            text,
            selector: tagName
          });
          return { ok: true, element: result, message: 'Successfully found element by text' };
        } catch (error) {
          logger.error('Tool find_element_by_text failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
    locate_element_advanced: tool({
      description: 'Advanced element location with multiple strategies and fallbacks',
      inputSchema: z.object({ 
        selector: z.string().optional(),
        text: z.string().optional(),
        ariaLabel: z.string().optional(),
        role: z.string().optional(),
        tagName: z.string().optional()
      }),
      execute: async ({ selector, text, ariaLabel, role, tagName }) => {
        try {
          const result = await performCdpAction(cdp, 'locate_element_advanced', { 
            selector,
            text,
            value: ariaLabel,
            key: role
          });
          return { ok: true, element: result, message: 'Successfully located element with advanced strategies' };
        } catch (error) {
          logger.error('Tool locate_element_advanced failed', { error: error.message });
          return { ok: false, error: error.message };
        }
      },
    }),
  };
  return { ...defaultTools, ...customTools };
}