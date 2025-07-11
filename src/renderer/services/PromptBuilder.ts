export interface TaskContext {
  type: 'shopping' | 'travel' | 'search' | 'navigation' | 'form' | 'generic';
  complexity: 'simple' | 'medium' | 'complex';
  domain?: string;
}

export interface PageState {
  url: string;
  title: string;
  elements: any[];
  forms: any[];
  links: any[];
  text: string;
  html?: string;
}

export interface DoStep {
  action: string;
  target?: string;
  value?: string;
  result?: string;
  error?: string;
  timestamp: number;
}

export class PromptBuilder {
  constructor(
    private instruction: string,
    private pageState: PageState,
    private previousSteps: DoStep[]
  ) {}

  build(): string {
    const taskContext = this.detectTaskContext();
    const basePrompt = this.getBasePrompt();
    const contextualPrompt = this.getContextualPrompt(taskContext);
    const stepHistory = this.formatStepHistory();
    const actionGuidance = this.getActionGuidance(taskContext);
    const pageContext = this.getOptimizedPageContext(taskContext);
    
    return `${basePrompt}\n\n${contextualPrompt}\n\n${pageContext}\n\n${stepHistory}\n\n${actionGuidance}`;
  }

  private detectTaskContext(): TaskContext {
    const instruction = this.instruction.toLowerCase();
    const url = this.pageState.url.toLowerCase();
    
    let type: TaskContext['type'] = 'generic';
    let complexity: TaskContext['complexity'] = 'simple';
    
    if (instruction.includes('buy') || instruction.includes('purchase') || instruction.includes('cart') || 
        url.includes('amazon') || url.includes('shop') || url.includes('store')) {
      type = 'shopping';
    } else if (instruction.includes('book') || instruction.includes('flight') || instruction.includes('hotel') ||
               url.includes('booking') || url.includes('expedia') || url.includes('travel')) {
      type = 'travel';
    } else if (instruction.includes('search') || instruction.includes('find') || instruction.includes('look for')) {
      type = 'search';
    } else if (instruction.includes('fill') || instruction.includes('form') || instruction.includes('submit')) {
      type = 'form';
    } else if (instruction.includes('navigate') || instruction.includes('go to') || instruction.includes('visit')) {
      type = 'navigation';
    }
    
    if (this.previousSteps.length > 5 || instruction.split(' ').length > 15) {
      complexity = 'complex';
    } else if (this.previousSteps.length > 2 || instruction.split(' ').length > 8) {
      complexity = 'medium';
    }
    
    const domain = this.extractDomain(url);
    
    return { type, complexity, domain };
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  private getBasePrompt(): string {
    return `You are an expert browser automation assistant. Your task is to complete: "${this.instruction}"

RESPONSE FORMAT: You must respond with a valid JSON object containing exactly one action:
{
  "action": "click|type|navigate|scroll|wait|extract|complete",
  "target": "CSS selector or description",
  "value": "text to type or other value (if applicable)",
  "reasoning": "brief explanation of why this action"
}`;
  }

  private getContextualPrompt(context: TaskContext): string {
    const prompts = {
      shopping: `SHOPPING CONTEXT: You're helping with an e-commerce task. Focus on:
- Product search and selection
- Adding items to cart
- Checkout process navigation
- Price and availability checking`,
      
      travel: `TRAVEL CONTEXT: You're helping with travel booking. Focus on:
- Date and destination selection
- Comparing options and prices
- Booking form completion
- Confirmation steps`,
      
      search: `SEARCH CONTEXT: You're helping with information discovery. Focus on:
- Query refinement and execution
- Result evaluation and selection
- Following relevant links
- Information extraction`,
      
      form: `FORM CONTEXT: You're helping with form completion. Focus on:
- Field identification and validation
- Accurate data entry
- Required field completion
- Form submission`,
      
      navigation: `NAVIGATION CONTEXT: You're helping with site navigation. Focus on:
- Menu and link identification
- Efficient path finding
- Page loading verification
- Target page confirmation`,
      
      generic: `GENERAL CONTEXT: You're helping with a browser automation task. Focus on:
- Understanding the current page state
- Identifying the next logical step
- Efficient action execution
- Goal achievement`
    };
    
    return prompts[context.type];
  }

  private getOptimizedPageContext(context: TaskContext): string {
    const shouldIncludeFullHTML = context.complexity === 'complex' && this.pageState.elements.length < 50;
    const shouldIncludeElements = this.pageState.elements.length < 100;
    
    let pageContext = `CURRENT PAGE:
URL: ${this.pageState.url}
Title: ${this.pageState.title}`;

    if (shouldIncludeElements) {
      const relevantElements = this.filterRelevantElements(context);
      if (relevantElements.length > 0) {
        pageContext += `\n\nINTERACTIVE ELEMENTS:\n${relevantElements.map(el => 
          `- ${el.tag}${el.id ? `#${el.id}` : ''}${el.class ? `.${el.class.split(' ')[0]}` : ''}: "${el.text || el.value || el.placeholder || 'N/A'}"`
        ).join('\n')}`;
      }
    }

    if (this.pageState.forms.length > 0) {
      pageContext += `\n\nFORMS:\n${this.pageState.forms.map(form => 
        `- Form with ${form.fields?.length || 0} fields`
      ).join('\n')}`;
    }

    if (shouldIncludeFullHTML && this.pageState.html && this.pageState.html.length < 5000) {
      pageContext += `\n\nPAGE HTML:\n${this.pageState.html}`;
    }

    return pageContext;
  }

  private filterRelevantElements(context: TaskContext): any[] {
    const relevantTags = {
      shopping: ['button', 'a', 'input', 'select', 'form'],
      travel: ['input', 'select', 'button', 'a', 'form'],
      search: ['input', 'button', 'a', 'form'],
      form: ['input', 'select', 'textarea', 'button', 'form'],
      navigation: ['a', 'button', 'nav'],
      generic: ['button', 'a', 'input', 'select', 'form']
    };

    const tags = relevantTags[context.type] || relevantTags.generic;
    return this.pageState.elements.filter(el => tags.includes(el.tag?.toLowerCase()));
  }

  private formatStepHistory(): string {
    if (this.previousSteps.length === 0) {
      return 'PREVIOUS STEPS: None';
    }

    const recentSteps = this.previousSteps.slice(-5);
    return `PREVIOUS STEPS:\n${recentSteps.map((step, index) => 
      `${index + 1}. ${step.action.toUpperCase()}${step.target ? ` on "${step.target}"` : ''}${step.value ? ` with "${step.value}"` : ''}${step.error ? ` (FAILED: ${step.error})` : ' (SUCCESS)'}`
    ).join('\n')}`;
  }

  private getActionGuidance(context: TaskContext): string {
    return `ACTION GUIDELINES:
- Choose the most direct action to progress toward the goal
- Prefer specific CSS selectors over generic descriptions
- Use "wait" action if page is loading or elements are not ready
- Use "extract" action to gather information before proceeding
- Use "complete" action only when the task is fully accomplished
- If an element is not visible, try scrolling first
- For forms, fill required fields before submitting`;
  }
}
