import { ToolMatch } from './McpRouter';

export interface WorkflowStep {
  id: string;
  description: string;
  toolType: 'email' | 'file' | 'slack' | 'web' | 'calendar' | 'jira' | 'trello' | 'notion' | 'generic';
  action: string;
  parameters: Record<string, any>;
  dependencies: string[]; // IDs of steps this step depends on
  outputVariable?: string; // What variable this step produces
}

export interface ParsedWorkflow {
  originalQuery: string;
  steps: WorkflowStep[];
  isMultiStep: boolean;
  hasConditionalLogic: boolean;
  estimatedComplexity: 'simple' | 'medium' | 'complex';
}

export interface ConditionalLogic {
  condition: string;
  trueAction: WorkflowStep;
  falseAction?: WorkflowStep;
}

/**
 * Multi-Tool Query Parser
 * Parses complex natural language queries into executable workflow steps
 */
export class McpQueryParser {

  /**
   * Main parsing method - converts natural language to workflow steps
   */
  parseQuery(query: string): ParsedWorkflow {
    console.log('[McpQueryParser] Parsing query:', query);

    const queryLower = query.toLowerCase();
    const originalQuery = query;

    // Step 1: Detect if this is a multi-step query
    const isMultiStep = this.detectMultiStepQuery(queryLower);
    console.log('[McpQueryParser] Multi-step detected:', isMultiStep);

    // Step 2: Check for conditional logic (if/then/else)
    const hasConditionalLogic = this.detectConditionalLogic(queryLower);
    console.log('[McpQueryParser] Conditional logic detected:', hasConditionalLogic);

    // Step 3: Parse into individual steps
    const steps = isMultiStep ?
      this.parseMultiStepQuery(query) :
      this.parseSingleStepQuery(query);

    // Step 4: Analyze dependencies between steps
    this.analyzeDependencies(steps);

    // Step 5: Estimate complexity
    const estimatedComplexity = this.estimateComplexity(steps, hasConditionalLogic);

    const result: ParsedWorkflow = {
      originalQuery,
      steps,
      isMultiStep,
      hasConditionalLogic,
      estimatedComplexity
    };

    console.log('[McpQueryParser] Parsed workflow:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Detect if query requires multiple steps
   */
  private detectMultiStepQuery(queryLower: string): boolean {
    // Keywords that indicate sequential operations
    const sequentialKeywords = [
      'then', 'and then', 'after', 'next', 'afterwards',
      'first.*then', 'step 1.*step 2', '1\\).*2\\)',
      'get.*then.*', 'read.*then.*', 'find.*then.*'
    ];

    for (const keyword of sequentialKeywords) {
      if (new RegExp(keyword).test(queryLower)) {
        console.log('[McpQueryParser] Multi-step keyword found:', keyword);
        return true;
      }
    }

    // Check for multiple action verbs
    const actionVerbs = ['get', 'read', 'send', 'create', 'update', 'delete', 'find', 'search', 'list', 'show'];
    let actionCount = 0;

    for (const verb of actionVerbs) {
      const matches = queryLower.match(new RegExp(`\\b${verb}\\b`, 'g'));
      if (matches) {
        actionCount += matches.length;
      }
    }

    console.log('[McpQueryParser] Action verb count:', actionCount);
    return actionCount >= 2;
  }

  /**
   * Detect conditional logic (if/then/else)
   */
  private detectConditionalLogic(queryLower: string): boolean {
    const conditionalKeywords = [
      'if', 'when', 'unless', 'else', 'otherwise',
      'if.*then', 'when.*then', 'if.*else'
    ];

    for (const keyword of conditionalKeywords) {
      if (new RegExp(keyword).test(queryLower)) {
        console.log('[McpQueryParser] Conditional keyword found:', keyword);
        return true;
      }
    }

    return false;
  }

  /**
   * Parse multi-step queries into individual steps
   */
  private parseMultiStepQuery(query: string): WorkflowStep[] {
    console.log('[McpQueryParser] Parsing multi-step query');

    const steps: WorkflowStep[] = [];

    // Split on common separators
    const separators = [
      /\bthen\b/i,
      /\band then\b/i,
      /\bafter that\b/i,
      /\bnext\b/i,
      /\bstep \d+/i,
      /\d+\)/
    ];

    let parts = [query];

    // Apply separators sequentially
    for (const separator of separators) {
      const newParts = [];
      for (const part of parts) {
        if (separator.test(part)) {
          newParts.push(...part.split(separator));
        } else {
          newParts.push(part);
        }
      }
      parts = newParts.filter(p => p.trim().length > 0);
    }

    console.log('[McpQueryParser] Split into parts:', parts);

    // Convert each part into a workflow step
    parts.forEach((part, index) => {
      const step = this.parseIndividualStep(part.trim(), index);
      if (step) {
        steps.push(step);
      }
    });

    return steps;
  }

  /**
   * Parse single-step query
   */
  private parseSingleStepQuery(query: string): WorkflowStep[] {
    console.log('[McpQueryParser] Parsing single-step query');

    const step = this.parseIndividualStep(query, 0);
    return step ? [step] : [];
  }

  /**
   * Parse individual step from text
   */
  private parseIndividualStep(stepText: string, index: number): WorkflowStep | null {
    const stepLower = stepText.toLowerCase().trim();

    if (stepLower.length < 3) {
      return null; // Too short to be meaningful
    }

    console.log('[McpQueryParser] Parsing step:', stepText);

    // Detect tool type based on keywords
    const toolType = this.detectToolType(stepLower);

    // Extract action and parameters
    const action = this.extractAction(stepLower);
    const parameters = this.extractParameters(stepText, toolType);

    // Generate output variable name if this step produces data
    const outputVariable = this.generateOutputVariable(stepLower, index);

    const step: WorkflowStep = {
      id: `step_${index + 1}`,
      description: stepText,
      toolType,
      action,
      parameters,
      dependencies: [], // Will be filled by analyzeDependencies
      outputVariable
    };

    console.log('[McpQueryParser] Created step:', step);
    return step;
  }

  /**
   * Detect which type of tool this step needs
   */
  private detectToolType(stepLower: string): WorkflowStep['toolType'] {
    // Email-related keywords
    if (stepLower.match(/\b(email|mail|inbox|gmail|outlook|send|reply|message)\b/)) {
      return 'email';
    }

    // File-related keywords
    if (stepLower.match(/\b(file|folder|directory|document|read|write|save|open)\b/)) {
      return 'file';
    }

    // Communication tools
    if (stepLower.match(/\b(slack|teams|discord|chat|channel)\b/)) {
      return 'slack';
    }

    // Web/search related
    if (stepLower.match(/\b(search|web|google|browse|url|website|find)\b/)) {
      return 'web';
    }

    // Calendar related
    if (stepLower.match(/\b(calendar|meeting|schedule|appointment|event|book|gcal)\b/)) {
      return 'calendar';
    }

    // Project management tools
    if (stepLower.match(/\b(jira|ticket|board|issue|project|story|task)\b/)) {
      return 'jira';
    }

    if (stepLower.match(/\b(trello|card|list|board)\b/)) {
      return 'trello';
    }

    if (stepLower.match(/\b(notion|page|database|note)\b/)) {
      return 'notion';
    }

    return 'generic';
  }

  /**
   * Extract the main action from the step
   */
  private extractAction(stepLower: string): string {
    // Common action patterns
    const actionPatterns = [
      { pattern: /\b(get|fetch|retrieve|obtain)\b/, action: 'get' },
      { pattern: /\b(read|view|show|display|list)\b/, action: 'read' },
      { pattern: /\b(send|email|message|notify)\b/, action: 'send' },
      { pattern: /\b(create|make|add|new)\b/, action: 'create' },
      { pattern: /\b(update|edit|modify|change)\b/, action: 'update' },
      { pattern: /\b(delete|remove|clear)\b/, action: 'delete' },
      { pattern: /\b(search|find|lookup|query)\b/, action: 'search' },
      { pattern: /\b(schedule|book|reserve)\b/, action: 'schedule' },
      { pattern: /\b(reply|respond|answer)\b/, action: 'reply' }
    ];

    for (const { pattern, action } of actionPatterns) {
      if (pattern.test(stepLower)) {
        return action;
      }
    }

    return 'execute';
  }

  /**
   * Extract parameters for the step
   */
  private extractParameters(stepText: string, toolType: WorkflowStep['toolType']): Record<string, any> {
    const parameters: Record<string, any> = {};
    const stepLower = stepText.toLowerCase();

    // Extract common parameters

    // Numbers (limits, counts)
    const numberMatch = stepText.match(/\b(\d+)\b/);
    if (numberMatch) {
      parameters.limit = parseInt(numberMatch[1]);
    }

    // From/sender patterns
    const fromMatch = stepText.match(/\bfrom\s+([^\s]+)/i);
    if (fromMatch) {
      parameters.from = fromMatch[1];
    }

    // Subject patterns
    const subjectMatch = stepText.match(/\bsubject[:\s]+([^,\n]+)/i);
    if (subjectMatch) {
      parameters.subject = subjectMatch[1].trim();
    }

    // Tool-specific parameter extraction
    switch (toolType) {
      case 'email':
        if (stepLower.includes('unread')) {
          parameters.filter = 'unread';
        }
        if (stepLower.includes('recent') || stepLower.includes('latest')) {
          parameters.timeframe = 'recent';
        }
        break;

      case 'jira':
        const boardMatch = stepText.match(/\bboard\s+([^\s,]+)/i);
        if (boardMatch) {
          parameters.boardName = boardMatch[1];
        }
        if (stepLower.includes('ticket') || stepLower.includes('issue')) {
          parameters.itemType = 'issues';
        }
        break;

      case 'calendar':
        if (stepLower.includes('today')) {
          parameters.date = 'today';
        }
        if (stepLower.includes('tomorrow')) {
          parameters.date = 'tomorrow';
        }
        const timeMatch = stepText.match(/\bat\s+(\d{1,2}:\d{2})/i);
        if (timeMatch) {
          parameters.time = timeMatch[1];
        }
        break;
    }

    // Generic query parameter
    parameters.query = stepText;

    return parameters;
  }

  /**
   * Generate output variable name for steps that produce data
   */
  private generateOutputVariable(stepLower: string, index: number): string | undefined {
    // Steps that typically produce output
    if (stepLower.match(/\b(get|fetch|retrieve|read|list|find|search)\b/)) {

      if (stepLower.includes('email')) return `emails_${index + 1}`;
      if (stepLower.includes('ticket') || stepLower.includes('issue')) return `tickets_${index + 1}`;
      if (stepLower.includes('board')) return `board_id_${index + 1}`;
      if (stepLower.includes('file')) return `files_${index + 1}`;
      if (stepLower.includes('calendar') || stepLower.includes('event')) return `events_${index + 1}`;

      return `result_${index + 1}`;
    }

    return undefined;
  }

  /**
   * Analyze dependencies between steps
   */
  private analyzeDependencies(steps: WorkflowStep[]): void {
    console.log('[McpQueryParser] Analyzing dependencies between steps');

    for (let i = 1; i < steps.length; i++) {
      const currentStep = steps[i];
      const currentDesc = currentStep.description.toLowerCase();

      // Check if current step references output from previous steps
      for (let j = 0; j < i; j++) {
        const previousStep = steps[j];

        // If previous step produces an output variable
        if (previousStep.outputVariable) {

          // Check if current step might need that data
          if (this.checkDataDependency(previousStep, currentStep)) {
            currentStep.dependencies.push(previousStep.id);
            console.log(`[McpQueryParser] Dependency found: ${currentStep.id} depends on ${previousStep.id}`);
          }
        }
      }
    }
  }

  /**
   * Check if one step depends on data from another
   */
  private checkDataDependency(producerStep: WorkflowStep, consumerStep: WorkflowStep): boolean {
    const producerDesc = producerStep.description.toLowerCase();
    const consumerDesc = consumerStep.description.toLowerCase();

    // JIRA workflow: get board ID → get tickets from board
    if (producerDesc.includes('board') && producerDesc.includes('id') &&
        consumerDesc.includes('ticket') && consumerDesc.includes('board')) {
      return true;
    }

    // Email workflow: read email → create summary/reply
    if (producerDesc.includes('email') && producerDesc.includes('read') &&
        (consumerDesc.includes('summary') || consumerDesc.includes('reply'))) {
      return true;
    }

    // File workflow: search files → edit file
    if (producerDesc.includes('search') && producerDesc.includes('file') &&
        consumerDesc.includes('edit')) {
      return true;
    }

    // Generic: if consumer mentions "from" or "using" and talks about same domain
    if (consumerDesc.includes('from') || consumerDesc.includes('using')) {
      // Check if they're in similar domains
      const domains = ['email', 'file', 'jira', 'calendar', 'slack'];
      for (const domain of domains) {
        if (producerDesc.includes(domain) && consumerDesc.includes(domain)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Estimate workflow complexity
   */
  private estimateComplexity(steps: WorkflowStep[], hasConditionalLogic: boolean): ParsedWorkflow['estimatedComplexity'] {
    if (hasConditionalLogic || steps.length > 3) {
      return 'complex';
    } else if (steps.length > 1) {
      return 'medium';
    } else {
      return 'simple';
    }
  }

  /**
   * Get human-readable summary of the parsed workflow
   */
  getSummary(workflow: ParsedWorkflow): string {
    const { steps, isMultiStep, hasConditionalLogic, estimatedComplexity } = workflow;

    let summary = `Parsed workflow with ${steps.length} step${steps.length > 1 ? 's' : ''}:\n`;

    steps.forEach((step, index) => {
      summary += `  ${index + 1}. [${step.toolType}] ${step.action}: ${step.description}\n`;

      if (step.dependencies.length > 0) {
        summary += `     Dependencies: ${step.dependencies.join(', ')}\n`;
      }

      if (step.outputVariable) {
        summary += `     Output: ${step.outputVariable}\n`;
      }
    });

    summary += `\nComplexity: ${estimatedComplexity}`;
    if (hasConditionalLogic) {
      summary += ` (includes conditional logic)`;
    }

    return summary;
  }
}