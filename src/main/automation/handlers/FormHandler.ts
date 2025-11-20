import { BaseHandler } from '../core/BaseHandler';
import { ElementFinder } from '../core/ElementFinder';
import type { HandlerContext } from '../core/types';
import type { SelectParams, CheckboxParams, SubmitParams, ToolExecutionResult, FoundElement } from '@/shared/types';

export class FormHandler extends BaseHandler {
  private elementFinder: ElementFinder;

  constructor(context: HandlerContext) {
    super(context);
    this.elementFinder = new ElementFinder(context);
  }

  /**
   * Execute select dropdown operation
   */
  async executeSelect(params: SelectParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {

      const findResult = await this.elementFinder.advancedFind(params);

      if (!findResult.success || !findResult.element) {
        return this.createErrorResult('select', startTime, {
          code: 'ELEMENT_NOT_FOUND',
          message: 'Could not find select element',
          details: {
            lastError: findResult.error,
            suggestions: [
              'Verify the select element attributes',
              'Check if the dropdown is dynamically loaded',
              'Ensure page has finished loading'
            ]
          }
        });
      }

      const foundElement = findResult.element;
      console.log('[FormHandler] ✅ Select found');

      // Select the option
      const selectScript = `
        (function() {
          const select = document.elementFromPoint(
            ${foundElement.boundingBox.x + foundElement.boundingBox.width / 2},
            ${foundElement.boundingBox.y + foundElement.boundingBox.height / 2}
          );
          
          if (!select || select.tagName !== 'SELECT') {
            return { success: false, error: 'Element is not a select' };
          }
          
          let optionSelected = false;
          
          // Try by value
          ${params.value ? `
            for (let i = 0; i < select.options.length; i++) {
              if (select.options[i].value === ${JSON.stringify(params.value)}) {
                select.selectedIndex = i;
                optionSelected = true;
                break;
              }
            }
          ` : ''}
          
          // Try by label
          ${params.label ? `
            if (!optionSelected) {
              for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].text === ${JSON.stringify(params.label)}) {
                  select.selectedIndex = i;
                  optionSelected = true;
                  break;
                }
              }
            }
          ` : ''}
          
          // Try by index
          ${params.index !== undefined ? `
            if (!optionSelected && ${params.index} < select.options.length) {
              select.selectedIndex = ${params.index};
              optionSelected = true;
            }
          ` : ''}
          
          if (optionSelected) {
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dispatchEvent(new Event('input', { bubbles: true }));
            return { 
              success: true, 
              selectedValue: select.value, 
              selectedText: select.options[select.selectedIndex].text 
            };
          }
          
          return { success: false, error: 'No matching option found' };
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(selectScript);

      if (!result.success) {
        return this.createErrorResult('select', startTime, {
          code: 'EXECUTION_ERROR',
          message: result.error || 'Failed to select option',
          details: {
            suggestions: [
              'Verify the value/label/index matches an available option',
              'Check if the dropdown has loaded all options'
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
   * Execute checkbox/radio operation
   */
  async executeCheckbox(params: CheckboxParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    console.log(`[FormHandler] ☑️  Checkbox: ${params.checked ? 'check' : 'uncheck'}`);

    try {
      const findResult = await this.elementFinder.advancedFind(params);

      if (!findResult.success || !findResult.element) {
        return this.createErrorResult('checkbox', startTime, {
          code: 'ELEMENT_NOT_FOUND',
          message: 'Could not find checkbox element',
          details: {
            lastError: findResult.error,
            suggestions: [
              'Verify the checkbox element attributes',
              'Check if the checkbox is visible',
              'Ensure type="checkbox" or type="radio"'
            ]
          }
        });
      }

      const foundElement = findResult.element;
      console.log('[FormHandler] ✅ Checkbox found');

      // Set checkbox state
      const checkboxScript = `
        (function() {
          const checkbox = document.elementFromPoint(
            ${foundElement.boundingBox.x + foundElement.boundingBox.width / 2},
            ${foundElement.boundingBox.y + foundElement.boundingBox.height / 2}
          );
          
          if (!checkbox || (checkbox.type !== 'checkbox' && checkbox.type !== 'radio')) {
            return { success: false, error: 'Element is not a checkbox or radio' };
          }
          
          if (checkbox.checked !== ${params.checked}) {
            checkbox.checked = ${params.checked};
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
          }
          
          return { success: true, checked: checkbox.checked };
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(checkboxScript);

      if (!result.success) {
        return this.createErrorResult('checkbox', startTime, {
          code: 'EXECUTION_ERROR',
          message: result.error || 'Failed to set checkbox state',
          details: {
            suggestions: ['Verify the element is a checkbox or radio button']
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
   * Execute form submit operation
   */
  async executeSubmit(params: SubmitParams, clickHandler: any): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    console.log('[FormHandler] 📤 Submit form');

    try {
      if (params.submitButton) {
        return await clickHandler.execute({
          ...params.submitButton,
          tag: params.submitButton.tag || 'BUTTON'
        });
      }

      let formElement: any = null;

      if (params.form) {
        const findResult = await this.elementFinder.advancedFind({
          ...params.form,
          tag: params.form.tag || 'FORM'
        });

        if (findResult.success && findResult.element) {
          formElement = findResult.element;
        }
      }

      const submitScript = formElement ? `
        (function() {
          const form = document.elementFromPoint(
            ${formElement.boundingBox.x + formElement.boundingBox.width / 2},
            ${formElement.boundingBox.y + formElement.boundingBox.height / 2}
          );
          
          if (!form || form.tagName !== 'FORM') {
            return { success: false, error: 'Element is not a form' };
          }
          
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.submit();
          }
          
          return { success: true };
        })();
      ` : `
        (function() {
          const form = document.querySelector('form');
          if (!form) return { success: false, error: 'No form found' };
          
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.submit();
          }
          
          return { success: true };
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(submitScript);

      if (!result.success) {
        return this.createErrorResult('submit', startTime, {
          code: 'ELEMENT_NOT_FOUND',
          message: result.error || 'Form not found',
          details: {
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
}
