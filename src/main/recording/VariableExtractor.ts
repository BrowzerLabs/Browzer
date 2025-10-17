import { RecordedAction, WorkflowVariable } from '@/shared/types';

/**
 * VariableExtractor - Intelligently extracts workflow variables from recorded actions
 * 
 * Identifies form inputs, selections, and interactive elements that should be
 * parameterizable when replaying the workflow with different data.
 */
export class VariableExtractor {
  
  /**
   * Extract variables from a list of recorded actions
   */
  public extractVariables(actions: RecordedAction[]): WorkflowVariable[] {
    const variables: WorkflowVariable[] = [];
    
    actions.forEach((action, index) => {
      const extractedVars = this.extractVariablesFromAction(action, index);
      variables.push(...extractedVars);
    });
    
    // Remove duplicates (same element might be interacted with multiple times)
    return this.deduplicateVariables(variables);
  }
  
  /**
   * Extract variables from a single action
   */
  private extractVariablesFromAction(action: RecordedAction, actionIndex: number): WorkflowVariable[] {
    const variables: WorkflowVariable[] = [];
    
    switch (action.type) {
      case 'input':
        variables.push(this.createInputVariable(action, actionIndex));
        break;
        
      case 'select':
        variables.push(this.createSelectVariable(action, actionIndex));
        break;
        
      case 'checkbox':
        variables.push(this.createCheckboxVariable(action, actionIndex));
        break;
        
      case 'radio':
        variables.push(this.createRadioVariable(action, actionIndex));
        break;
        
      case 'file-upload':
        variables.push(this.createFileVariable(action, actionIndex));
        break;
        
      // Note: We don't extract variables from 'click' actions by default
      // since they're usually navigation/interaction, not data input
      default:
        break;
    }
    
    return variables.filter(v => v !== null);
  }
  
  /**
   * Create variable from input action
   */
  private createInputVariable(action: RecordedAction, actionIndex: number): WorkflowVariable {
    const target = action.target;
    const variableName = this.generateVariableName(target, 'input');
    
    return {
      id: `var_${actionIndex}_${variableName}`,
      actionId: `${action.type}-${action.timestamp}`,
      actionIndex,
      name: variableName,
      type: 'input',
      defaultValue: action.value || '',
      currentValue: action.value || '',
      elementName: target?.name,
      elementId: target?.id,
      placeholder: target?.placeholder,
      label: this.extractLabel(target),
      isRequired: this.isRequiredField(target),
      description: this.generateDescription(target, action.value, 'input'),
      isUserEdited: false,
      isRemoved: false
    };
  }
  
  /**
   * Create variable from select action  
   */
  private createSelectVariable(action: RecordedAction, actionIndex: number): WorkflowVariable {
    const target = action.target;
    const variableName = this.generateVariableName(target, 'select');
    
    return {
      id: `var_${actionIndex}_${variableName}`,
      actionId: `${action.type}-${action.timestamp}`,
      actionIndex,
      name: variableName,
      type: 'select',
      defaultValue: action.value,
      currentValue: action.value,
      elementName: target?.name,
      elementId: target?.id,
      label: this.extractLabel(target),
      isRequired: this.isRequiredField(target),
      description: this.generateDescription(target, action.value, 'select'),
      isUserEdited: false,
      isRemoved: false
    };
  }
  
  /**
   * Create variable from checkbox action
   */
  private createCheckboxVariable(action: RecordedAction, actionIndex: number): WorkflowVariable {
    const target = action.target;
    // Prefer label text or associated text for variable name
    let variableName = '';
    if (target?.ariaLabel && this.isDescriptiveText(target.ariaLabel)) {
      variableName = this.sanitizeVariableName(target.ariaLabel);
    } else if (target?.text && this.isDescriptiveText(target.text)) {
      variableName = this.sanitizeVariableName(target.text);
    } else if (target?.title && this.isDescriptiveText(target.title)) {
      variableName = this.sanitizeVariableName(target.title);
    } else if (target?.placeholder && this.isDescriptiveText(target.placeholder)) {
      variableName = this.sanitizeVariableName(target.placeholder);
    } else if (target?.name && this.isDescriptiveText(target.name)) {
      variableName = this.sanitizeVariableName(target.name);
    } else if (target?.id) {
      const cleanId = this.cleanTechnicalName(target.id);
      variableName = this.sanitizeVariableName(cleanId);
    } else {
      variableName = this.generateFallbackName('checkbox', target);
    }
    return {
      id: `var_${actionIndex}_${variableName}`,
      actionId: `${action.type}-${action.timestamp}`,
      actionIndex,
      name: variableName,
      type: 'checkbox',
      defaultValue: action.value, // boolean (checked/unchecked)
      currentValue: action.value,
      elementName: target?.name,
      elementId: target?.id,
      label: this.extractLabel(target),
      isRequired: false, // Checkboxes are rarely required
      description: this.generateDescription(target, action.value, 'checkbox'),
      isUserEdited: false,
      isRemoved: false
    };
  }
  
  /**
   * Create variable from radio action
   */
  private createRadioVariable(action: RecordedAction, actionIndex: number): WorkflowVariable {
    const target = action.target;
    const variableName = this.generateVariableName(target, 'radio');
    
    return {
      id: `var_${actionIndex}_${variableName}`,
      actionId: `${action.type}-${action.timestamp}`,
      actionIndex,
      name: variableName,
      type: 'radio',
      defaultValue: action.value,
      currentValue: action.value,
      elementName: target?.name,
      elementId: target?.id,
      label: this.extractLabel(target),
      isRequired: this.isRequiredField(target),
      description: this.generateDescription(target, action.value, 'radio'),
      isUserEdited: false,
      isRemoved: false
    };
  }
  
  /**
   * Create variable from file upload action
   */
  private createFileVariable(action: RecordedAction, actionIndex: number): WorkflowVariable {
    const target = action.target;
    const variableName = this.generateVariableName(target, 'file');
    
    return {
      id: `var_${actionIndex}_${variableName}`,
      actionId: `${action.type}-${action.timestamp}`,
      actionIndex,
      name: variableName,
      type: 'file',
      defaultValue: action.value, // File names
      currentValue: action.value,
      elementName: target?.name,
      elementId: target?.id,
      label: this.extractLabel(target),
      isRequired: this.isRequiredField(target),
      description: this.generateDescription(target, action.value, 'file'),
      isUserEdited: false,
      isRemoved: false
    };
  }
  
  /**
   * Generate a user-friendly variable name
   */
  private generateVariableName(target: any, type: string): string {
    // Priority order for naming - use most descriptive text available
    
    // 1. Try aria-label first (most semantic)
    if (target?.ariaLabel && this.isDescriptiveText(target.ariaLabel)) {
      return this.sanitizeVariableName(target.ariaLabel);
    }
    
    // 2. Try placeholder text (often contains user-facing description)
    if (target?.placeholder && this.isDescriptiveText(target.placeholder)) {
      return this.sanitizeVariableName(target.placeholder);
    }
    
    // 3. Try title attribute
    if (target?.title && this.isDescriptiveText(target.title)) {
      return this.sanitizeVariableName(target.title);
    }
    
    // 4. Try text content of the element or nearby labels
    if (target?.text && this.isDescriptiveText(target.text)) {
      return this.sanitizeVariableName(target.text);
    }
    
    // 5. Try name attribute (often technical but can be descriptive)
    if (target?.name && this.isDescriptiveText(target.name)) {
      return this.sanitizeVariableName(target.name);
    }
    
    // 6. Try ID but clean it up for better readability
    if (target?.id) {
      const cleanId = this.cleanTechnicalName(target.id);
      if (this.isDescriptiveText(cleanId)) {
        return this.sanitizeVariableName(cleanId);
      }
    }
    
    // 7. Fallback to type + a more descriptive suffix
    return this.generateFallbackName(type, target);
  }
  
  /**
   * Check if text is descriptive enough to use as variable name
   */
  private isDescriptiveText(text: string): boolean {
    if (!text || text.length < 2) return false;
    
    // Reject common non-descriptive patterns
    const nonDescriptivePatterns = [
      /^[a-f0-9-]{10,}$/i,  // UUIDs, random IDs
      /^input\d*$/i,        // Generic "input", "input1", etc.
      /^field\d*$/i,        // Generic "field", "field1", etc.
      /^element\d*$/i,      // Generic "element", etc.
      /^btn\d*$/i,          // Generic "btn", "btn1", etc.
      /^form\d*$/i,         // Generic "form", etc.
    ];
    
    return !nonDescriptivePatterns.some(pattern => pattern.test(text.trim()));
  }
  
  /**
   * Clean technical names to be more readable
   */
  private cleanTechnicalName(technicalName: string): string {
    return technicalName
      .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase to words
      .replace(/[-_]/g, ' ')               // dashes and underscores to spaces
      .replace(/\d+$/, '')                 // remove trailing numbers
      .trim();
  }
  
  /**
   * Generate a fallback name when no descriptive text is found
   */
  private generateFallbackName(type: string, target: any): string {
    // Try to infer purpose from input type or other attributes
    if (type === 'input' && target?.type) {
      const inputType = target.type.toLowerCase();
      const typeNames: Record<string, string> = {
        'email': 'email_address',
        'password': 'password',
        'tel': 'phone_number',
        'url': 'website_url',
        'text': 'text_input',
        'search': 'search_query',
        'number': 'number_value',
        'date': 'date_value',
        'time': 'time_value',
        'file': 'file_upload'
      };
      return typeNames[inputType] || `${inputType}_input`;
    }
    
    // Generic fallbacks
    const fallbacks: Record<string, string> = {
      'input': 'text_input',
      'select': 'dropdown_selection',
      'checkbox': 'checkbox_option',
      'radio': 'radio_choice',
      'file': 'file_upload'
    };
    
    return fallbacks[type] || `${type}_field`;
  }
  
  /**
   * Sanitize name to be a valid variable name
   */
  private sanitizeVariableName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_') // Replace non-alphanumeric with underscore
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .substring(0, 30); // Limit length
  }
  
  /**
   * Extract label text from target element
   */
  private extractLabel(target: any): string | undefined {
    if (target?.ariaLabel) return target.ariaLabel;
    if (target?.title) return target.title;
    if (target?.placeholder) return target.placeholder;
    
    // Check if there's a label in metadata
    if (target?.metadata?.label) return target.metadata.label;
    
    return undefined;
  }
  
  /**
   * Check if field appears to be required
   */
  private isRequiredField(target: any): boolean {
    // Common indicators of required fields
    if (target?.ariaLabel?.includes('*')) return true;
    if (target?.placeholder?.includes('required')) return true;
    if (target?.name?.includes('required')) return true;
    
    // Common required field names
    const requiredFields = ['email', 'password', 'username', 'phone', 'name'];
    const fieldName = target?.name?.toLowerCase() || target?.id?.toLowerCase() || '';
    
    return requiredFields.some(field => fieldName.includes(field));
  }
  
  /**
   * Generate human-readable description
   */
  private generateDescription(target: any, value: any, type: string): string {
    // Use the most descriptive text available for the field name
    const fieldName = this.getBestFieldName(target);
    
    switch (type) {
      case 'input':
        const inputType = target?.type || 'text';
        if (inputType === 'password') {
          return `Password field "${fieldName}"`;
        } else if (inputType === 'email') {
          return `Email field "${fieldName}" (${value})`;
        } else if (inputType === 'tel') {
          return `Phone field "${fieldName}" (${value})`;
        }
        return `Text input "${fieldName}" with value: "${value}"`;
      case 'select':
        return `Dropdown "${fieldName}" with selection: "${value}"`;
      case 'checkbox':
        return `Checkbox "${fieldName}" ${value ? 'checked' : 'unchecked'}`;
      case 'radio':
        return `Radio option "${fieldName}" with value: "${value}"`;
      case 'file':
        return `File upload "${fieldName}" with files: ${value}`;
      default:
        return `${type} field "${fieldName}" with value: "${value}"`;
    }
  }
  
  /**
   * Get the best available field name for display
   */
  private getBestFieldName(target: any): string {
    if (target?.ariaLabel && this.isDescriptiveText(target.ariaLabel)) {
      return target.ariaLabel;
    }
    if (target?.placeholder && this.isDescriptiveText(target.placeholder)) {
      return target.placeholder;
    }
    if (target?.title && this.isDescriptiveText(target.title)) {
      return target.title;
    }
    if (target?.text && this.isDescriptiveText(target.text)) {
      return target.text;
    }
    if (target?.name && this.isDescriptiveText(target.name)) {
      return this.cleanTechnicalName(target.name);
    }
    if (target?.id) {
      return this.cleanTechnicalName(target.id);
    }
    return 'field';
  }
  
  /**
   * Remove duplicate variables (same element interacted with multiple times)
   */
  private deduplicateVariables(variables: WorkflowVariable[]): WorkflowVariable[] {
    const seen = new Set<string>();
    const unique: WorkflowVariable[] = [];
    
    // For checkboxes, allow multiple variables per element (by actionIndex)
    variables.forEach(variable => {
      if (variable.type === 'checkbox') {
        // Use actionIndex to allow multiple distinct checkbox variables
        unique.push(variable);
        return;
      }
      // For other types, deduplicate by element identifier
      const identifier = variable.elementName || variable.elementId || variable.name;
      const key = `${variable.type}_${identifier}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(variable);
      } else {
        // If we see the same element again, update the value to the latest one
        const existing = unique.find(v => {
          const existingId = v.elementName || v.elementId || v.name;
          return `${v.type}_${existingId}` === key;
        });
        if (existing) {
          existing.defaultValue = variable.defaultValue;
          existing.currentValue = variable.currentValue;
          if (variable.actionIndex > existing.actionIndex) {
            existing.actionIndex = variable.actionIndex;
            existing.actionId = variable.actionId;
          }
        }
      }
    });
    return unique;
  }
  
  /**
   * Update variable values in the actions array
   */
  public applyVariablesToActions(
    actions: RecordedAction[], 
    variables: WorkflowVariable[]
  ): RecordedAction[] {
    const updatedActions = [...actions];
    
    variables
      .filter(v => !v.isRemoved) // Only apply non-removed variables
      .forEach(variable => {
        const actionIndex = variable.actionIndex;
        if (actionIndex < updatedActions.length) {
          const action = updatedActions[actionIndex];
          
          // Update the action's value with the current variable value
          if (action.type === variable.type) {
            action.value = variable.currentValue;
          }
        }
      });
    
    return updatedActions;
  }
}