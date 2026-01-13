/**
 * Variable Extractor
 *
 * Identifies variables in recorded workflows for parameterization.
 * Detects URLs, inputs, and other user-specific data that should
 * be configurable.
 */

import { WorkflowStep, InputVariable } from '../types';

interface ExtractionResult {
  steps: WorkflowStep[];
  variables: InputVariable[];
}

export class VariableExtractor {
  extract(steps: WorkflowStep[]): ExtractionResult {
    const variables: InputVariable[] = [];
    const variableMap: Map<string, string> = new Map();

    const processedSteps = steps.map((step) => {
      return this.processStep(step, variables, variableMap);
    });

    return {
      steps: processedSteps,
      variables,
    };
  }

  private processStep(
    step: WorkflowStep,
    variables: InputVariable[],
    variableMap: Map<string, string>
  ): WorkflowStep {
    const processed = { ...step };

    // Process URL in navigation steps
    if (step.type === 'navigation' && step.url) {
      processed.url = this.extractUrlVariables(
        step.url,
        variables,
        variableMap
      );
    }

    // Process input values
    if (step.type === 'input' && step.value) {
      const varResult = this.extractInputVariable(step, variables, variableMap);
      processed.value = varResult.value;
      if (varResult.defaultValue) {
        processed.default_value = varResult.defaultValue;
      }
    }

    // Process select values
    if (step.type === 'select_change' && step.selectedText) {
      const varResult = this.extractSelectVariable(
        step,
        variables,
        variableMap
      );
      processed.selectedText = varResult.value;
    }

    return processed;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // URL VARIABLE EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════

  private extractUrlVariables(
    url: string,
    variables: InputVariable[],
    variableMap: Map<string, string>
  ): string {
    try {
      const parsed = new URL(url);
      let processedUrl = url;

      // Extract path segments that look like variables
      const pathParts = parsed.pathname.split('/').filter((p) => p);

      pathParts.forEach((part, index) => {
        // Skip common static paths
        if (this.isStaticPath(part)) return;

        // Check if it looks like a variable value
        if (this.looksLikeVariable(part, pathParts, index)) {
          const varName = this.generateVariableName(part, pathParts, index);

          if (!variableMap.has(varName)) {
            variableMap.set(varName, part);
            variables.push({
              name: varName,
              type: 'string',
              required: true,
              default: part,
            });
          }

          processedUrl = processedUrl.replace(part, `{${varName}}`);
        }
      });

      // Extract query parameters as variables
      parsed.searchParams.forEach((value, key) => {
        if (value && !this.isStaticQueryParam(key)) {
          const varName = this.sanitizeVariableName(key);

          if (!variableMap.has(varName)) {
            variableMap.set(varName, value);
            variables.push({
              name: varName,
              type: 'string',
              required: false,
              default: value,
            });
          }

          processedUrl = processedUrl.replace(
            `${key}=${encodeURIComponent(value)}`,
            `${key}={${varName}}`
          );
          processedUrl = processedUrl.replace(
            `${key}=${value}`,
            `${key}={${varName}}`
          );
        }
      });

      return processedUrl;
    } catch {
      return url;
    }
  }

  private isStaticPath(part: string): boolean {
    const staticPaths = [
      'api',
      'v1',
      'v2',
      'v3',
      'search',
      'login',
      'signup',
      'home',
      'dashboard',
      'settings',
      'profile',
      'about',
      'contact',
      'help',
      'docs',
      'blog',
      'news',
      'products',
      'services',
      'pricing',
      'index',
      'main',
      'app',
      'src',
      'assets',
      'static',
      'public',
      'images',
      'css',
      'js',
    ];
    return staticPaths.includes(part.toLowerCase());
  }

  private looksLikeVariable(
    part: string,
    allParts: string[],
    index: number
  ): boolean {
    // GitHub-style: owner/repo pattern
    if (allParts.length >= 2 && index <= 1) {
      return true;
    }

    // Looks like an ID
    if (/^\d+$/.test(part)) return true;
    if (/^[a-f0-9-]{36}$/i.test(part)) return true; // UUID

    // Contains specific patterns
    if (part.includes('@')) return true; // Email-like

    return false;
  }

  private generateVariableName(
    part: string,
    allParts: string[],
    index: number
  ): string {
    // For GitHub-style paths
    if (index === 0 && allParts.length >= 2) return 'owner';
    if (index === 1 && allParts.length >= 2) return 'repo_name';

    // For IDs
    if (/^\d+$/.test(part)) return `id_${index}`;

    // Default: use sanitized part name
    return this.sanitizeVariableName(part);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INPUT VARIABLE EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════

  private extractInputVariable(
    step: WorkflowStep,
    variables: InputVariable[],
    variableMap: Map<string, string>
  ): { value: string; defaultValue?: string } {
    const value = step.value || '';
    const targetText = step.target_text || 'input';

    // Generate variable name from field label
    const varName = this.sanitizeVariableName(targetText);

    // Check if this looks like user-specific data
    if (this.looksLikeUserData(value, targetText)) {
      if (!variableMap.has(varName)) {
        variableMap.set(varName, value);
        variables.push({
          name: varName,
          type: this.inferType(value),
          required: true,
          default: value,
          format: this.inferFormat(targetText, value),
        });
      }

      return {
        value: `{${varName}}`,
        defaultValue: value,
      };
    }

    return { value };
  }

  private looksLikeUserData(value: string, fieldLabel: string): boolean {
    const label = fieldLabel.toLowerCase();

    // Field labels that typically contain user data
    const userDataFields = [
      'name',
      'email',
      'phone',
      'address',
      'username',
      'password',
      'search',
      'query',
      'keyword',
      'term',
      'message',
      'comment',
      'title',
      'description',
      'url',
      'link',
      'date',
      'amount',
    ];

    if (userDataFields.some((f) => label.includes(f))) return true;

    // Value patterns
    if (/@/.test(value)) return true; // Email
    if (/^\d{10,}$/.test(value)) return true; // Phone
    if (/^https?:\/\//.test(value)) return true; // URL

    return false;
  }

  private extractSelectVariable(
    step: WorkflowStep,
    variables: InputVariable[],
    variableMap: Map<string, string>
  ): { value: string } {
    const value = step.selectedText || '';
    const targetText = step.target_text || 'dropdown';
    const varName = this.sanitizeVariableName(targetText);

    if (!variableMap.has(varName)) {
      variableMap.set(varName, value);
      variables.push({
        name: varName,
        type: 'string',
        required: true,
        default: value,
      });
    }

    return { value: `{${varName}}` };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════

  private sanitizeVariableName(text: string): string {
    return (
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 30) || 'variable'
    );
  }

  private inferType(value: string): 'string' | 'number' | 'bool' {
    if (/^\d+$/.test(value)) return 'number';
    if (/^(true|false)$/i.test(value)) return 'bool';
    return 'string';
  }

  private inferFormat(
    label: string,
    value: string
  ): 'email' | 'phone' | 'url' | 'date' | undefined {
    const l = label.toLowerCase();

    if (l.includes('email') || /@/.test(value)) return 'email';
    if (l.includes('phone')) return 'phone';
    if (l.includes('url') || /^https?:\/\//.test(value)) return 'url';
    if (l.includes('date')) return 'date';

    return undefined;
  }

  private isStaticQueryParam(key: string): boolean {
    const staticParams = ['page', 'limit', 'sort', 'order', 'type', 'format'];
    return staticParams.includes(key.toLowerCase());
  }
}
