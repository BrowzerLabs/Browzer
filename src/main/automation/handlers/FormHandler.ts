import { ClickHandler } from '.';
import { BaseHandler, HandlerContext } from './BaseHandler';
import type { SelectParams, CheckboxParams, SubmitParams, ToolExecutionResult } from '@/shared/types';

export class FormHandler extends BaseHandler {
  constructor(context: HandlerContext) {
    super(context);
  }

  
  async executeSelect(params: SelectParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      console.log('[FormHandler] 📋 Executing select');

      const result = await this.executeFindAndSelect(params);

      if (!result.success) {
        return this.createErrorResult('select', startTime, {
          code: result.error?.includes('not found') ? 'ELEMENT_NOT_FOUND' : 'EXECUTION_ERROR',
          message: result.error || 'Failed to select option',
          details: {
            lastError: result.error,
            suggestions: [
              'Verify the select element attributes',
              'Check if the dropdown is dynamically loaded',
              'Verify the value/label/index matches an available option',
              'Ensure page has finished loading'
            ]
          }
        });
      }

      await this.sleep(300);

      return {
        success: true,
        toolName: 'select',
        value: result.selectedValue,
        url: this.getUrl()
      };

    } catch (error) {
      console.error('[FormHandler] ❌ Select failed:', error);
      return this.createErrorResult('select', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Select failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * UNIFIED: Find select element and select option in ONE script
   */
  private async executeFindAndSelect(params: SelectParams): Promise<{
    success: boolean;
    error?: string;
    selectedValue?: string;
    selectedText?: string;
  }> {
    try {
      const script = `
        (async function() {
          // ============================================================================
          // CONFIGURATION
          // ============================================================================
          const targetTag = ${JSON.stringify(params.tag || 'SELECT')};
          const targetAttrs = ${JSON.stringify(params.attributes || {})};
          const targetBoundingBox = ${JSON.stringify(params.boundingBox || null)};
          const selectValue = ${JSON.stringify(params.value || null)};
          const selectLabel = ${JSON.stringify(params.label || null)};
          const selectIndex = ${JSON.stringify(params.index)};
          
          const DYNAMIC_ATTRIBUTES = [
            'class', 'style', 'aria-expanded', 'aria-selected', 'aria-checked',
            'aria-pressed', 'aria-hidden', 'aria-current', 'tabindex',
            'data-state', 'data-active', 'data-selected', 'data-focus', 'data-hover',
            'value', 'checked', 'selected'
          ];
          
          console.log('[Select] 🔍 Finding select element');
          
          // ============================================================================
          // STEP 1: FIND SELECT ELEMENT
          // ============================================================================
          let candidates = Array.from(document.getElementsByTagName(targetTag));
          
          // Filter by stable attributes
          const stableAttrKeys = Object.keys(targetAttrs).filter(key => 
            !DYNAMIC_ATTRIBUTES.includes(key) && targetAttrs[key]
          );
          
          if (stableAttrKeys.length > 0) {
            candidates = candidates.filter(el => {
              return stableAttrKeys.some(key => el.getAttribute(key) === targetAttrs[key]);
            });
          }
          
          if (candidates.length === 0) {
            return { success: false, error: 'No matching select elements found' };
          }
          
          // Score candidates
          const scored = candidates.map(el => {
            let score = 0;
            
            if (el.tagName.toUpperCase() === 'SELECT') score += 30;
            
            for (const key of stableAttrKeys) {
              if (el.getAttribute(key) === targetAttrs[key]) {
                if (key === 'id') score += 20;
                else if (key === 'name') score += 18;
                else if (key.startsWith('data-')) score += 15;
                else score += 10;
              }
            }
            
            if (targetBoundingBox) {
              const rect = el.getBoundingClientRect();
              const totalDiff = Math.abs(rect.x - targetBoundingBox.x) + Math.abs(rect.y - targetBoundingBox.y);
              if (totalDiff < 50) score += 30;
              else if (totalDiff < 100) score += 15;
            }
            
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (rect.width > 0 && rect.height > 0 && style.display !== 'none') score += 10;
            
            return { element: el, score };
          });
          
          scored.sort((a, b) => b.score - a.score);
          const select = scored[0].element;
          
          if (select.tagName !== 'SELECT') {
            return { success: false, error: 'Element is not a SELECT' };
          }
          
          console.log('[Select] ✅ Select element found');
          
          // ============================================================================
          // STEP 2: SCROLL INTO VIEW
          // ============================================================================
          select.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // ============================================================================
          // STEP 3: SELECT OPTION
          // ============================================================================
          let optionSelected = false;
          
          // Try by value
          if (selectValue) {
            for (let i = 0; i < select.options.length; i++) {
              if (select.options[i].value === selectValue) {
                select.selectedIndex = i;
                optionSelected = true;
                console.log('[Select] ✅ Selected by value:', selectValue);
                break;
              }
            }
          }
          
          // Try by label (text)
          if (!optionSelected && selectLabel) {
            for (let i = 0; i < select.options.length; i++) {
              if (select.options[i].text === selectLabel || 
                  select.options[i].text.includes(selectLabel)) {
                select.selectedIndex = i;
                optionSelected = true;
                console.log('[Select] ✅ Selected by label:', selectLabel);
                break;
              }
            }
          }
          
          // Try by index
          if (!optionSelected && selectIndex !== undefined && selectIndex !== null) {
            if (selectIndex >= 0 && selectIndex < select.options.length) {
              select.selectedIndex = selectIndex;
              optionSelected = true;
              console.log('[Select] ✅ Selected by index:', selectIndex);
            }
          }
          
          if (!optionSelected) {
            return { success: false, error: 'No matching option found' };
          }
          
          // ============================================================================
          // STEP 4: DISPATCH EVENTS
          // ============================================================================
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
          
          console.log('[Select] ✅ Select completed successfully');
          
          return {
            success: true,
            selectedValue: select.value,
            selectedText: select.options[select.selectedIndex].text
          };
          
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(script);
      return result;

    } catch (error) {
      console.error('[FormHandler] ❌  select failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute checkbox/radio operation
   */
  async executeCheckbox(params: CheckboxParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    console.log(`[FormHandler] ☑️  Checkbox: ${params.checked ? 'check' : 'uncheck'}`);

    try {
      const result = await this.executeFindAndToggleCheckbox(params);

      if (!result.success) {
        return this.createErrorResult('checkbox', startTime, {
          code: result.error?.includes('not found') ? 'ELEMENT_NOT_FOUND' : 'EXECUTION_ERROR',
          message: result.error || 'Failed to toggle checkbox',
          details: {
            lastError: result.error,
            suggestions: [
              'Verify the checkbox element attributes',
              'Check if the checkbox is visible',
              'Ensure type="checkbox" or type="radio"'
            ]
          }
        });
      }

      await this.sleep(300);

      return {
        success: true,
        toolName: 'checkbox',
        value: result.checked,
        url: this.getUrl()
      };

    } catch (error) {
      console.error('[FormHandler] ❌ Checkbox failed:', error);
      return this.createErrorResult('checkbox', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Checkbox failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * UNIFIED: Find checkbox and toggle state in ONE script
   */
  private async executeFindAndToggleCheckbox(params: CheckboxParams): Promise<{
    success: boolean;
    error?: string;
    checked?: boolean;
  }> {
    try {
      const script = `
        (async function() {
          // ============================================================================
          // CONFIGURATION
          // ============================================================================
          const targetTag = ${JSON.stringify(params.tag || 'INPUT')};
          const targetAttrs = ${JSON.stringify(params.attributes || {})};
          const targetBoundingBox = ${JSON.stringify(params.boundingBox || null)};
          const targetChecked = ${JSON.stringify(params.checked)};
          
          const DYNAMIC_ATTRIBUTES = [
            'class', 'style', 'aria-expanded', 'aria-selected', 'aria-checked',
            'aria-pressed', 'aria-hidden', 'aria-current', 'tabindex',
            'data-state', 'data-active', 'data-selected', 'data-focus', 'data-hover',
            'value', 'checked', 'selected'
          ];
          
          console.log('[Checkbox] 🔍 Finding checkbox element');
          
          // ============================================================================
          // STEP 1: FIND CHECKBOX ELEMENT
          // ============================================================================
          let candidates = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'));
          
          // Filter by tag if specified
          if (targetTag && targetTag.toUpperCase() !== 'INPUT') {
            candidates = candidates.filter(el => el.tagName.toUpperCase() === targetTag.toUpperCase());
          }
          
          // Filter by stable attributes
          const stableAttrKeys = Object.keys(targetAttrs).filter(key => 
            !DYNAMIC_ATTRIBUTES.includes(key) && targetAttrs[key]
          );
          
          if (stableAttrKeys.length > 0) {
            candidates = candidates.filter(el => {
              return stableAttrKeys.some(key => el.getAttribute(key) === targetAttrs[key]);
            });
          }
          
          if (candidates.length === 0) {
            return { success: false, error: 'No matching checkbox/radio elements found' };
          }
          
          // Score candidates
          const scored = candidates.map(el => {
            let score = 0;
            
            if (el.type === 'checkbox' || el.type === 'radio') score += 30;
            
            for (const key of stableAttrKeys) {
              if (el.getAttribute(key) === targetAttrs[key]) {
                if (key === 'id') score += 20;
                else if (key === 'name') score += 18;
                else if (key.startsWith('data-')) score += 15;
                else score += 10;
              }
            }
            
            if (targetBoundingBox) {
              const rect = el.getBoundingClientRect();
              const totalDiff = Math.abs(rect.x - targetBoundingBox.x) + Math.abs(rect.y - targetBoundingBox.y);
              if (totalDiff < 50) score += 30;
              else if (totalDiff < 100) score += 15;
            }
            
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (rect.width > 0 && rect.height > 0 && style.display !== 'none') score += 10;
            
            return { element: el, score };
          });
          
          scored.sort((a, b) => b.score - a.score);
          const checkbox = scored[0].element;
          
          if (checkbox.type !== 'checkbox' && checkbox.type !== 'radio') {
            return { success: false, error: 'Element is not a checkbox or radio' };
          }
          
          console.log('[Checkbox] ✅ Checkbox element found');
          
          // ============================================================================
          // STEP 2: SCROLL INTO VIEW
          // ============================================================================
          checkbox.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // ============================================================================
          // STEP 3: TOGGLE CHECKBOX STATE
          // ============================================================================
          if (checkbox.checked !== targetChecked) {
            checkbox.checked = targetChecked;
            
            // Dispatch events
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
            
            console.log('[Checkbox] ✅ Checkbox toggled to:', targetChecked);
          } else {
            console.log('[Checkbox] ℹ️ Checkbox already in desired state:', targetChecked);
          }
          
          return {
            success: true,
            checked: checkbox.checked
          };
          
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(script);
      return result;

    } catch (error) {
      console.error('[FormHandler] ❌  checkbox failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute form submit operation
   */
  async executeSubmit(params: SubmitParams, clickHandler: ClickHandler): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    console.log('[FormHandler] 📤 Submit form');

    try {
      // If submitButton is specified, use ClickHandler (already )
      if (params.submitButton) {
        return await clickHandler.execute({
          ...params.submitButton,
          tag: params.submitButton.tag || 'BUTTON'
        });
      }

      // Otherwise, find and submit form
      const result = await this.executeFindAndSubmitForm(params);

      if (!result.success) {
        return this.createErrorResult('submit', startTime, {
          code: 'ELEMENT_NOT_FOUND',
          message: result.error || 'Form not found',
          details: {
            lastError: result.error,
            suggestions: [
              'Verify a form element exists on the page',
              'Try specifying form parameters',
              'Consider using submitButton to click the submit button instead'
            ]
          }
        });
      }

      await this.sleep(500);

      return {
        success: true,
        toolName: 'submit',
        url: this.getUrl()
      };

    } catch (error) {
      console.error('[FormHandler] ❌ Submit failed:', error);
      return this.createErrorResult('submit', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Submit failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * UNIFIED: Find form and submit in ONE script
   */
  private async executeFindAndSubmitForm(params: SubmitParams): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const script = `
        (async function() {
          let form = null;
          
          ${params.form ? `
            // Find form by attributes
            const targetTag = ${JSON.stringify(params.form.tag || 'FORM')};
            const targetAttrs = ${JSON.stringify(params.form.attributes || {})};
            const targetBoundingBox = ${JSON.stringify(params.form.boundingBox || null)};
            
            const DYNAMIC_ATTRIBUTES = [
              'class', 'style', 'aria-expanded', 'aria-selected', 'aria-checked',
              'aria-pressed', 'aria-hidden', 'aria-current', 'tabindex',
              'data-state', 'data-active', 'data-selected', 'data-focus', 'data-hover',
              'value', 'checked', 'selected'
            ];
            
            let candidates = Array.from(document.getElementsByTagName(targetTag));
            
            const stableAttrKeys = Object.keys(targetAttrs).filter(key => 
              !DYNAMIC_ATTRIBUTES.includes(key) && targetAttrs[key]
            );
            
            if (stableAttrKeys.length > 0) {
              candidates = candidates.filter(el => {
                return stableAttrKeys.some(key => el.getAttribute(key) === targetAttrs[key]);
              });
            }
            
            if (candidates.length > 0) {
              // Score and select best
              const scored = candidates.map(el => {
                let score = 0;
                if (el.tagName === 'FORM') score += 30;
                for (const key of stableAttrKeys) {
                  if (el.getAttribute(key) === targetAttrs[key]) {
                    if (key === 'id') score += 20;
                    else if (key === 'name') score += 18;
                    else score += 10;
                  }
                }
                return { element: el, score };
              });
              scored.sort((a, b) => b.score - a.score);
              form = scored[0].element;
            }
          ` : `
            // Find first form on page
            form = document.querySelector('form');
          `}
          
          if (!form) {
            return { success: false, error: 'No form found' };
          }
          
          if (form.tagName !== 'FORM') {
            return { success: false, error: 'Element is not a FORM' };
          }
          
          // Submit form
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.submit();
          }
          
          console.log('[Submit] ✅ Form submitted');
          return { success: true };
          
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(script);
      return result;

    } catch (error) {
      console.error('[FormHandler] ❌  submit failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
