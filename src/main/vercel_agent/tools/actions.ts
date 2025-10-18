import { z } from 'zod';
import { CDPConnection } from './cdp';
import { logger } from '../utils';

interface ElementTarget {
  tagName?: string;
  id?: string;
  text?: string;
  ariaLabel?: string;
  role?: string;
  name?: string;
  selectors?: Array<{
    selector: string;
    strategy: string;
    score: number;
  }>;
}

export type ActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'wait'
  | 'extract'
  | 'scroll'
  | 'analyze'
  | 'select'
  | 'hover'
  | 'focus'
  | 'blur'
  | 'keypress'
  | 'clear'
  | 'wait_for_element'
  | 'wait_for_text'
  | 'screenshot'
  | 'evaluate'
  | 'select_dropdown'
  | 'check'
  | 'uncheck'
  | 'double_click'
  | 'right_click'
  | 'wait_for_dynamic_content'
  | 'get_interactive_elements'
  | 'get_page_text'
  | 'smart_click'
  | 'find_element_by_semantics'
  | 'find_element_by_text'
  | 'locate_element_advanced';


export interface ActionOptions {
  selector?: string;
  text?: string;
  value?: string;
  url?: string;
  key?: string;
  waitTime?: number;
  expression?: string;
}

export async function performCdpAction(
  client: CDPConnection,
  action: ActionType,
  options: ActionOptions = {}
) {
  try {
    switch (action) {
      case 'navigate':
        if (!options.url) throw new Error('Missing URL for navigate action');
        await client.sendCommand('Page.navigate', { url: options.url });
        break;

      case 'click':
        await clickElement(client, options.selector!);
        break;

      case 'double_click':
        await clickElement(client, options.selector!, 2);
        break;

      case 'right_click':
        await clickElement(client, options.selector!, 1, 'right');
        break;

      case 'type':
        if (!options.text) throw new Error('Missing text for type action');
        await client.sendCommand('Input.insertText', { text: options.text });
        break;

      case 'keypress':
        if (!options.key) throw new Error('Missing key for keypress');
        await client.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: options.key,
        });
        await client.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: options.key,
        });
        break;

      case 'focus':
      case 'blur':
        await client.sendCommand('Runtime.evaluate', {
          expression: `
            (function() {
              const el = document.querySelector("${options.selector}");
              if (el) el.${action}();
            })()
          `,
        });
        break;

      case 'scroll':
        await client.sendCommand('Runtime.evaluate', {
          expression: `window.scrollBy(0, ${options.value ?? 100})`,
        });
        break;

      case 'wait':
        await new Promise((res) => setTimeout(res, options.waitTime ?? 1000));
        break;

      case 'extract':
        return await evaluateExpression(client, `document.querySelector("${options.selector}")?.innerText`);

      case 'wait_for_element':
        await waitForElement(client, options.selector!);
        break;

      case 'wait_for_text':
        await waitForText(client, options.text!);
        break;

      case 'evaluate':
        if (!options.expression) throw new Error('Missing expression');
        return await evaluateExpression(client, options.expression);

      case 'screenshot':
        const { data } = await client.sendCommand('Page.captureScreenshot', { format: 'png' });
        return Buffer.from(data, 'base64');

      case 'select_dropdown':
        await client.sendCommand('Runtime.evaluate', {
          expression: `
            (function() {
              const el = document.querySelector("${options.selector}");
              if (el) el.value = "${options.value}";
              el?.dispatchEvent(new Event('change', { bubbles: true }));
            })()
          `,
        });
        break;

      case 'check':
      case 'uncheck':
        const checked = action === 'check';
        await client.sendCommand('Runtime.evaluate', {
          expression: `
            (function() {
              const el = document.querySelector("${options.selector}");
              if (el && el.type === "checkbox") el.checked = ${checked};
              el?.dispatchEvent(new Event('change', { bubbles: true }));
            })()
          `,
        });
        break;

      case 'get_interactive_elements':
        return await getInteractiveElements(client);

      case 'get_page_text':
        return await getPageText(client);

      case 'smart_click':
        if (!options.selector) throw new Error('Missing selector for smart_click');
        // Smart click with multiple fallback strategies
        const target: ElementTarget = {
          tagName: options.selector.includes('button') ? 'button' : undefined,
          text: options.text,
          ariaLabel: options.text, // Use text as aria-label fallback
          selectors: [{
            selector: options.selector,
            strategy: 'css',
            score: 1.0
          }]
        };
        const smartElement = await locateElementAdvanced(client, target);
        if (!smartElement) {
          throw new Error(buildElementNotFoundError(target));
        }
        await performAdvancedClick(client, smartElement, 1, 'left');
        break;

      case 'find_element_by_semantics':
        const semanticTarget: ElementTarget = {
          role: options.selector, // Using selector field for role
          ariaLabel: options.text,
          name: options.value,
          tagName: options.key // Using key field for tagName
        };
        return await findElementBySemantics(client, semanticTarget);

      case 'find_element_by_text':
        const textTarget: ElementTarget = {
          text: options.text,
          tagName: options.selector
        };
        return await findElementBySemantics(client, textTarget);

      case 'locate_element_advanced':
        const advancedTarget: ElementTarget = {
          tagName: options.selector,
          text: options.text,
          ariaLabel: options.value,
          role: options.key,
          selectors: options.selector ? [{
            selector: options.selector,
            strategy: 'css',
            score: 1.0
          }] : undefined
        };
        return await locateElementAdvanced(client, advancedTarget);

      default:
        logger.warn(`Action "${action}" is not implemented yet`);
    }
  } catch (error) {
    logger.error(`Action "${action}" failed`, { error: error.message });
    throw error;
  }
}

async function clickElement(client: CDPConnection, selector: string, clickCount = 1, button: 'left' | 'right' = 'left') {
  logger.info(`🖱️ Attempting to click element: ${selector}`);
  
  const element = await waitForElementWithRetry(client, selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }

  // Verify element is clickable
  await verifyElementClickable(client, element.nodeId);
  
  // Perform the click
  await performAdvancedClick(client, element, clickCount, button);
  logger.info(`✅ Click successful on: ${selector}`);
}

async function waitForElementWithRetry(client: CDPConnection, selector: string, timeout = 10000): Promise<any> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const { root } = await client.sendCommand('DOM.getDocument');
      const { nodeId } = await client.sendCommand('DOM.querySelector', {
        nodeId: root.nodeId,
        selector
      });

      if (nodeId) {
        const { model } = await client.sendCommand('DOM.getBoxModel', { nodeId });
        if (model) {
          return {
            nodeId,
            box: {
              x: model.content[0],
              y: model.content[1],
              width: model.content[4] - model.content[0],
              height: model.content[5] - model.content[1]
            }
          };
        }
      }
    } catch (error) {
      logger.warn('Error waiting for element:', error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return null;
}

async function verifyElementClickable(client: CDPConnection, nodeId: number): Promise<void> {
  try {
    const result = await client.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const node = document.querySelector('[data-node-id="${nodeId}"]');
          if (!node) return { clickable: false, reason: 'Element not found' };
          
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return { clickable: false, reason: 'Element not visible' };
          }
          if (rect.width === 0 || rect.height === 0) {
            return { clickable: false, reason: 'Element has no dimensions' };
          }
          if (node.disabled) {
            return { clickable: false, reason: 'Element is disabled' };
          }
          
          return { clickable: true };
        })();
      `,
      returnByValue: true
    });
    
    if (!result.result?.value?.clickable) {
      logger.warn(`⚠️ Element may not be clickable: ${result.result?.value?.reason}`);
    }
  } catch (error) {
    logger.error('Error verifying element clickable:', error);
  }
}

async function performAdvancedClick(client: CDPConnection, element: any, clickCount: number, button: 'left' | 'right'): Promise<void> {
  const box = element.box;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  
  // Move mouse to element
  await client.sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y
  });

  await new Promise(resolve => setTimeout(resolve, 50));

  // Perform click sequence
  await client.sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button,
    clickCount
  });

  await new Promise(resolve => setTimeout(resolve, 50));

  await client.sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button,
    clickCount
  });
}

async function evaluateExpression(client: CDPConnection, expression: string) {
  const result = await client.sendCommand('Runtime.evaluate', { expression, returnByValue: true });
  return result.result.value;
}

async function waitForElement(client: CDPConnection, selector: string, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const exists = await evaluateExpression(client, `!!document.querySelector("${selector}")`);
    if (exists) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timeout waiting for element: ${selector}`);
}

async function waitForText(client: CDPConnection, text: string, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const exists = await evaluateExpression(client, `document.body.innerText.includes("${text}")`);
    if (exists) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timeout waiting for text: ${text}`);
}

async function getInteractiveElements(client: CDPConnection): Promise<string> {
  try {
    // Directly evaluate in the default execution context
    const selectors = 'button, input, select, textarea, a, [role="button"]';
    const interactiveElements = await client.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const allElements = document.querySelectorAll('${selectors}');
          const elements = [];
          
          function generateSelectors(el) {
            const selectors = [];
            
            if (el.id) selectors.push('#' + el.id);
            if (el.className && typeof el.className === 'string') {
              const classes = el.className.split(' ').filter(c => c.trim());
              if (classes.length > 0) selectors.push('.' + classes.join('.'));
            }
            if (el.getAttribute('data-testid')) selectors.push('[data-testid="' + el.getAttribute('data-testid') + '"]');
            if (el.getAttribute('aria-label')) selectors.push('[aria-label="' + el.getAttribute('aria-label') + '"]');
            if (el.getAttribute('name')) selectors.push('[name="' + el.getAttribute('name') + '"]');
            const text = (el.textContent || el.value || '').trim();
            if (text && text.length < 50) selectors.push(el.tagName.toLowerCase() + ':contains("' + text + '")');
            const siblings = Array.from(el.parentElement?.children || []).filter(child => child.tagName === el.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(el) + 1;
              selectors.push(el.tagName.toLowerCase() + ':nth-of-type(' + index + ')');
            }
            return selectors;
          }
          
          allElements.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            
            if (rect.width > 0 && rect.height > 0 && 
                style.display !== 'none' && 
                style.visibility !== 'hidden' && 
                style.opacity !== '0') {
              
              const text = (el.textContent || el.value || '').trim();
              const ariaLabel = el.getAttribute('aria-label') || '';
              const role = el.getAttribute('role') || '';
              const name = el.getAttribute('name') || '';
              const id = el.id || '';
              
              elements.push({
                index: index,
                tagName: el.tagName.toLowerCase(),
                text: text.substring(0, 100),
                ariaLabel: ariaLabel,
                role: role,
                name: name,
                id: id,
                type: el.type || '',
                placeholder: el.placeholder || '',
                value: el.value || '',
                className: el.className || '',
                selectors: generateSelectors(el),
                rect: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height
                },
                visible: rect.width > 0 && rect.height > 0,
                enabled: !el.disabled,
                clickable: el.tagName.toLowerCase() === 'button' || 
                          el.tagName.toLowerCase() === 'a' || 
                          el.getAttribute('role') === 'button' ||
                          el.onclick !== null
              });
            }
          });
          
          return elements;
        })()
      `,
      returnByValue: true
    });

    const elementsJson = JSON.stringify(interactiveElements.result?.value || []);
    const elements = JSON.parse(elementsJson);
    
    return `Interactive Elements (${elements.length} found):\n${JSON.stringify(elements, null, 2)}`;
  } catch (error: any) {
    logger.error('Error extracting interactive elements:', { error: error.message, stack: error.stack });
    return `Error extracting interactive elements: ${error.message}\nStack: ${error.stack}`;
  }
}

async function getPageText(client: CDPConnection): Promise<string> {
  const { result } = await client.sendCommand('Runtime.evaluate', {
    expression: `document.body.innerText`,
    returnByValue: true,
  });
  return result.value;
}

// Advanced semantic element search
async function findElementBySemantics(client: CDPConnection, target: ElementTarget, timeout = 10000): Promise<any> {
  if (!target.role && !target.ariaLabel && !target.name && !target.text) return null;
  
  try {
    const result = await client.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const role = ${JSON.stringify(target.role)};
          const ariaLabel = ${JSON.stringify(target.ariaLabel)};
          const name = ${JSON.stringify(target.name)};
          const text = ${JSON.stringify(target.text)};
          const tagName = ${JSON.stringify(target.tagName)};
          
          let candidates = [];
          
          // Search by role
          if (role) {
            candidates = Array.from(document.querySelectorAll('[role="' + role + '"]'));
          }
          
          // Search by aria-label
          if (ariaLabel && candidates.length > 0) {
            candidates = candidates.filter(el => el.getAttribute('aria-label') === ariaLabel);
          } else if (ariaLabel) {
            candidates = Array.from(document.querySelectorAll('[aria-label="' + ariaLabel + '"]'));
          }
          
          // Search by name attribute
          if (name && candidates.length > 0) {
            candidates = candidates.filter(el => el.getAttribute('name') === name);
          } else if (name) {
            candidates = Array.from(document.querySelectorAll('[name="' + name + '"]'));
          }
          
          // Search by text content
          if (text && candidates.length > 0) {
            candidates = candidates.filter(el => {
              const elText = el.innerText || el.textContent || '';
              return elText.trim().includes(text.trim());
            });
          } else if (text) {
            candidates = Array.from(document.querySelectorAll('*')).filter(el => {
              const elText = el.innerText || el.textContent || '';
              return elText.trim().includes(text.trim());
            });
          }
          
          // Filter by tag name
          if (tagName && candidates.length > 0) {
            candidates = candidates.filter(el => el.tagName.toLowerCase() === tagName.toLowerCase());
          }
          
          // Return the first visible, enabled candidate
          for (const el of candidates) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            
            if (rect.width > 0 && rect.height > 0 && 
                style.display !== 'none' && 
                style.visibility !== 'hidden' && 
                !el.disabled) {
              
              return {
                found: true,
                selector: el.id ? '#' + el.id : 
                        el.className ? '.' + el.className.split(' ').join('.') :
                        el.tagName.toLowerCase(),
                rect: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height
                },
                text: el.innerText || el.textContent || '',
                ariaLabel: el.getAttribute('aria-label') || '',
                role: el.getAttribute('role') || '',
                tagName: el.tagName.toLowerCase()
              };
            }
          }
          
          return { found: false };
        })();
      `,
      returnByValue: true
    });
    
    if (result.result?.value?.found) {
      return result.result.value;
    }
  } catch (error) {
    logger.error('Semantic search error:', error);
  }
  
  return null;
}

// Multi-strategy element location with fallbacks
async function locateElementAdvanced(client: CDPConnection, target: ElementTarget, timeout = 10000): Promise<any> {
  const startTime = Date.now();
  
  // Strategy 1: Try provided selectors
  if (target.selectors && target.selectors.length > 0) {
    const sortedSelectors = [...target.selectors].sort((a, b) => b.score - a.score);
    
    for (const strategy of sortedSelectors) {
      if (Date.now() - startTime > timeout) break;
      
      try {
        const element = await waitForElementWithRetry(client, strategy.selector, Math.min(2000, timeout / sortedSelectors.length));
        if (element) {
          logger.info(`✓ Found via ${strategy.strategy}: ${strategy.selector}`);
          return element;
        }
      } catch (e) {
        logger.warn('Error with selector strategy:', e);
      }
    }
  }
  
  // Strategy 2: Semantic search
  if (Date.now() - startTime < timeout) {
    const semanticElement = await findElementBySemantics(client, target, timeout - (Date.now() - startTime));
    if (semanticElement) {
      logger.info('✓ Found via semantic search');
      return semanticElement;
    }
  }
  
  // Strategy 3: Text-based search
  if (target.text && Date.now() - startTime < timeout) {
    try {
      const result = await client.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            const searchText = ${JSON.stringify(target.text)};
            const tag = ${JSON.stringify(target.tagName)};
            
            const elements = tag ? 
              Array.from(document.querySelectorAll(tag)) : 
              Array.from(document.querySelectorAll('*'));
              
            const match = elements.find(el => {
              const elText = el.innerText || el.textContent || '';
              return elText.trim().includes(searchText.trim());
            });
            
            if (match) {
              const rect = match.getBoundingClientRect();
              return {
                found: true,
                selector: match.id ? '#' + match.id : 
                        match.className ? '.' + match.className.split(' ').join('.') :
                        match.tagName.toLowerCase(),
                rect: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height
                }
              };
            }
            
            return { found: false };
          })();
        `,
        returnByValue: true
      });
      
      if (result.result?.value?.found) {
        logger.info('✓ Found via text content search');
        return result.result.value;
      }
    } catch (error) {
      logger.error('Text search error:', error);
    }
  }
  
  return null;
}

// Enhanced error reporting
function buildElementNotFoundError(target: ElementTarget): string {
  const parts = [
    `❌ Element not found after exhaustive search:`,
    `   Tag: ${target.tagName || 'any'}`,
  ];
  
  if (target.id) parts.push(`   ID: #${target.id}`);
  if (target.text) parts.push(`   Text: "${target.text.substring(0, 50)}"`);
  if (target.ariaLabel) parts.push(`   Aria-Label: "${target.ariaLabel}"`);
  if (target.role) parts.push(`   Role: ${target.role}`);
  if (target.name) parts.push(`   Name: ${target.name}`);
  
  parts.push(`   Tried ${target.selectors?.length || 0} selector strategies`);
  parts.push(`   Suggestion: Element may have changed, page not fully loaded, or selector needs updating`);
  
  return parts.join('\n');
}
