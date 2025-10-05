/**
 * Intelligent DOM Extractor
 * Extracts and filters DOM elements with semantic understanding
 * Provides stable selectors and LLM-friendly element descriptions
 */

export interface ExtractedElement {
  id: string;
  tagName: string;
  type?: string;
  role: string;
  semanticLabel: string;
  stableSelectors: string[];
  xpath: string;
  text?: string;
  value?: string;
  placeholder?: string;
  isVisible: boolean;
  isInteractive: boolean;
  isEnabled: boolean;
  context: ElementContext;
  attributes: Record<string, string>;
  position: { x: number; y: number; width: number; height: number };
}

export interface ElementContext {
  parentTag?: string;
  parentRole?: string;
  parentText?: string;
  siblingCount?: number;
  formContext?: {
    formId?: string;
    formAction?: string;
    fieldName?: string;
  };
  ariaContext?: {
    labelledBy?: string;
    describedBy?: string;
    controls?: string;
  };
}

export interface FilteredDOM {
  interactiveElements: ExtractedElement[];
  forms: FormInfo[];
  navigation: NavigationInfo[];
  summary: {
    totalElements: number;
    interactiveCount: number;
    formCount: number;
    timestamp: number;
  };
}

export interface FormInfo {
  id: string;
  action?: string;
  method?: string;
  fields: ExtractedElement[];
  submitButton?: ExtractedElement;
}

export interface NavigationInfo {
  type: 'link' | 'button' | 'menu';
  label: string;
  href?: string;
  element: ExtractedElement;
}

export class IntelligentDOMExtractor {
  private static instance: IntelligentDOMExtractor;

  private constructor() {}

  static getInstance(): IntelligentDOMExtractor {
    if (!IntelligentDOMExtractor.instance) {
      IntelligentDOMExtractor.instance = new IntelligentDOMExtractor();
    }
    return IntelligentDOMExtractor.instance;
  }

  /**
   * Extract filtered DOM with semantic understanding
   */
  async extractFilteredDOM(webview: any): Promise<FilteredDOM> {
    const script = `
      (function() {
        const result = {
          interactiveElements: [],
          forms: [],
          navigation: [],
          summary: {
            totalElements: 0,
            interactiveCount: 0,
            formCount: 0,
            timestamp: Date.now()
          }
        };

        // Helper: Check if element is visible
        function isVisible(el) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && 
                 rect.height > 0 && 
                 style.display !== 'none' && 
                 style.visibility !== 'hidden' &&
                 parseFloat(style.opacity) > 0;
        }

        // Helper: Generate stable selectors
        function generateStableSelectors(el) {
          const selectors = [];
          
          // Priority 1: Test/automation attributes
          const testAttrs = ['data-testid', 'data-test-id', 'data-cy', 'data-qa', 'data-test'];
          for (const attr of testAttrs) {
            const value = el.getAttribute(attr);
            if (value) {
              selectors.push(\`[\${attr}="\${value}"]\`);
              break; // Only use the first test attribute found
            }
          }
          
          // Priority 2: ID
          if (el.id) {
            selectors.push(\`#\${el.id}\`);
          }
          
          // Priority 3: Name attribute
          if (el.name) {
            selectors.push(\`\${el.tagName.toLowerCase()}[name="\${el.name}"]\`);
          }
          
          // Priority 4: ARIA label
          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) {
            selectors.push(\`[aria-label="\${ariaLabel}"]\`);
          }
          
          // Priority 5: Role + accessible name
          const role = el.getAttribute('role');
          if (role) {
            selectors.push(\`[role="\${role}"]\`);
          }
          
          // Priority 6: Semantic content (for buttons/links)
          const tagName = el.tagName.toLowerCase();
          if (['button', 'a'].includes(tagName)) {
            const text = el.textContent?.trim();
            if (text && text.length < 50) {
              selectors.push(\`\${tagName}:has-text("\${text}")\`);
            }
          }
          
          // Priority 7: Class-based (use most specific class)
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
              // Prefer classes with semantic meaning
              const semanticClass = classes.find(c => 
                c.includes('btn') || c.includes('button') || 
                c.includes('input') || c.includes('form') ||
                c.includes('submit') || c.includes('search')
              );
              const classToUse = semanticClass || classes[0];
              selectors.push(\`\${tagName}.\${classToUse}\`);
            }
          }
          
          return selectors;
        }

        // Helper: Generate semantic label
        function generateSemanticLabel(el) {
          const tagName = el.tagName.toLowerCase();
          
          // Check for explicit labels
          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) return ariaLabel;
          
          const ariaLabelledBy = el.getAttribute('aria-labelledby');
          if (ariaLabelledBy) {
            const labelEl = document.getElementById(ariaLabelledBy);
            if (labelEl) return labelEl.textContent?.trim() || '';
          }
          
          // For inputs, check associated label
          if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
            if (el.id) {
              const label = document.querySelector(\`label[for="\${el.id}"]\`);
              if (label) return label.textContent?.trim() || '';
            }
            
            // Check parent label
            const parentLabel = el.closest('label');
            if (parentLabel) {
              return parentLabel.textContent?.trim().replace(el.textContent?.trim() || '', '').trim() || '';
            }
            
            // Use placeholder
            if (el.placeholder) return el.placeholder;
            
            // Use name attribute
            if (el.name) return el.name.replace(/_/g, ' ').replace(/-/g, ' ');
          }
          
          // For buttons and links, use text content
          if (tagName === 'button' || tagName === 'a') {
            const text = el.textContent?.trim();
            if (text) return text;
          }
          
          // Use title attribute
          if (el.title) return el.title;
          
          // Fallback to role or tag name
          const role = el.getAttribute('role');
          return role || tagName;
        }

        // Helper: Get element context
        function getElementContext(el) {
          const context = {};
          
          // Parent context
          const parent = el.parentElement;
          if (parent) {
            context.parentTag = parent.tagName.toLowerCase();
            context.parentRole = parent.getAttribute('role');
            context.parentText = parent.textContent?.trim().substring(0, 50);
            context.siblingCount = parent.children.length;
          }
          
          // Form context
          const form = el.closest('form');
          if (form) {
            context.formContext = {
              formId: form.id,
              formAction: form.action,
              fieldName: el.name
            };
          }
          
          // ARIA context
          const ariaLabelledBy = el.getAttribute('aria-labelledby');
          const ariaDescribedBy = el.getAttribute('aria-describedby');
          const ariaControls = el.getAttribute('aria-controls');
          if (ariaLabelledBy || ariaDescribedBy || ariaControls) {
            context.ariaContext = {
              labelledBy: ariaLabelledBy,
              describedBy: ariaDescribedBy,
              controls: ariaControls
            };
          }
          
          return context;
        }

        // Helper: Generate XPath
        function getXPath(el) {
          if (el.id) return \`//*[@id="\${el.id}"]\`;
          if (el === document.body) return '/html/body';
          
          let path = '';
          let current = el;
          
          while (current && current !== document.body) {
            let index = 1;
            let sibling = current.previousElementSibling;
            
            while (sibling) {
              if (sibling.tagName === current.tagName) index++;
              sibling = sibling.previousElementSibling;
            }
            
            const tagName = current.tagName.toLowerCase();
            path = \`/\${tagName}[\${index}]\${path}\`;
            current = current.parentElement;
          }
          
          return \`/html/body\${path}\`;
        }

        // Helper: Check if element is interactive
        function isInteractive(el) {
          const tagName = el.tagName.toLowerCase();
          const interactiveTags = ['button', 'a', 'input', 'select', 'textarea', 'details', 'summary'];
          
          if (interactiveTags.includes(tagName)) return true;
          
          const role = el.getAttribute('role');
          const interactiveRoles = ['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'tab', 'menuitem'];
          if (role && interactiveRoles.includes(role)) return true;
          
          if (el.onclick) return true;
          
          const style = window.getComputedStyle(el);
          if (style.cursor === 'pointer') return true;
          
          return false;
        }

        // Extract all interactive elements
        const allElements = document.querySelectorAll('*');
        result.summary.totalElements = allElements.length;
        
        for (const el of allElements) {
          if (!isInteractive(el)) continue;
          if (!isVisible(el)) continue;
          
          const tagName = el.tagName.toLowerCase();
          const rect = el.getBoundingClientRect();
          
          // Collect attributes
          const attributes = {};
          for (const attr of el.attributes) {
            attributes[attr.name] = attr.value;
          }
          
          const element = {
            id: el.id || \`elem_\${result.interactiveElements.length}\`,
            tagName,
            type: el.type,
            role: el.getAttribute('role') || tagName,
            semanticLabel: generateSemanticLabel(el),
            stableSelectors: generateStableSelectors(el),
            xpath: getXPath(el),
            text: el.textContent?.trim().substring(0, 200),
            value: el.value,
            placeholder: el.placeholder,
            isVisible: true,
            isInteractive: true,
            isEnabled: !el.disabled && !el.readOnly,
            context: getElementContext(el),
            attributes,
            position: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            }
          };
          
          result.interactiveElements.push(element);
          result.summary.interactiveCount++;
        }

        // Extract forms
        const forms = document.querySelectorAll('form');
        for (const form of forms) {
          if (!isVisible(form)) continue;
          
          const fields = [];
          const inputs = form.querySelectorAll('input, select, textarea');
          
          for (const input of inputs) {
            if (!isVisible(input)) continue;
            
            const rect = input.getBoundingClientRect();
            const attributes = {};
            for (const attr of input.attributes) {
              attributes[attr.name] = attr.value;
            }
            
            fields.push({
              id: input.id || \`field_\${fields.length}\`,
              tagName: input.tagName.toLowerCase(),
              type: input.type,
              role: input.getAttribute('role') || input.tagName.toLowerCase(),
              semanticLabel: generateSemanticLabel(input),
              stableSelectors: generateStableSelectors(input),
              xpath: getXPath(input),
              text: input.textContent?.trim(),
              value: input.value,
              placeholder: input.placeholder,
              isVisible: true,
              isInteractive: true,
              isEnabled: !input.disabled && !input.readOnly,
              context: getElementContext(input),
              attributes,
              position: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            });
          }
          
          // Find submit button
          let submitButton = null;
          const submitElements = form.querySelectorAll('button[type="submit"], input[type="submit"]');
          for (const btn of submitElements) {
            if (isVisible(btn)) {
              const rect = btn.getBoundingClientRect();
              const attributes = {};
              for (const attr of btn.attributes) {
                attributes[attr.name] = attr.value;
              }
              
              submitButton = {
                id: btn.id || 'submit_btn',
                tagName: btn.tagName.toLowerCase(),
                type: btn.type,
                role: 'button',
                semanticLabel: generateSemanticLabel(btn),
                stableSelectors: generateStableSelectors(btn),
                xpath: getXPath(btn),
                text: btn.textContent?.trim(),
                value: btn.value,
                isVisible: true,
                isInteractive: true,
                isEnabled: !btn.disabled,
                context: getElementContext(btn),
                attributes,
                position: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height
                }
              };
              break;
            }
          }
          
          result.forms.push({
            id: form.id || \`form_\${result.forms.length}\`,
            action: form.action,
            method: form.method,
            fields,
            submitButton
          });
          
          result.summary.formCount++;
        }

        // Extract navigation elements
        const navElements = document.querySelectorAll('nav a, [role="navigation"] a, header a, .nav a, .menu a');
        for (const el of navElements) {
          if (!isVisible(el)) continue;
          
          const rect = el.getBoundingClientRect();
          const attributes = {};
          for (const attr of el.attributes) {
            attributes[attr.name] = attr.value;
          }
          
          result.navigation.push({
            type: 'link',
            label: generateSemanticLabel(el),
            href: el.href,
            element: {
              id: el.id || \`nav_\${result.navigation.length}\`,
              tagName: 'a',
              role: 'link',
              semanticLabel: generateSemanticLabel(el),
              stableSelectors: generateStableSelectors(el),
              xpath: getXPath(el),
              text: el.textContent?.trim(),
              isVisible: true,
              isInteractive: true,
              isEnabled: true,
              context: getElementContext(el),
              attributes,
              position: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            }
          });
        }

        return result;
      })();
    `;

    try {
      const result = await webview.executeJavaScript(script);
      return result as FilteredDOM;
    } catch (error) {
      console.error('[IntelligentDOMExtractor] Failed to extract DOM:', error);
      throw error;
    }
  }

  /**
   * Generate LLM-friendly DOM description
   */
  generateLLMDescription(filteredDOM: FilteredDOM): string {
    let description = `# Current Page Structure\n\n`;
    description += `**Summary:** ${filteredDOM.summary.interactiveCount} interactive elements, ${filteredDOM.summary.formCount} forms\n\n`;

    // Forms
    if (filteredDOM.forms.length > 0) {
      description += `## Forms (${filteredDOM.forms.length})\n\n`;
      filteredDOM.forms.forEach((form, index) => {
        description += `### Form ${index + 1}\n`;
        if (form.action) description += `- Action: ${form.action}\n`;
        if (form.method) description += `- Method: ${form.method}\n`;
        description += `- Fields (${form.fields.length}):\n`;
        
        form.fields.forEach((field) => {
          description += `  - **${field.semanticLabel}** (${field.tagName}`;
          if (field.type) description += ` type="${field.type}"`;
          description += `)`;
          if (field.stableSelectors.length > 0) {
            description += ` → Selector: \`${field.stableSelectors[0]}\``;
          }
          description += `\n`;
        });
        
        if (form.submitButton) {
          description += `- Submit: **${form.submitButton.semanticLabel}** → \`${form.submitButton.stableSelectors[0]}\`\n`;
        }
        description += `\n`;
      });
    }

    // Interactive Elements (limit to most relevant)
    const relevantElements = filteredDOM.interactiveElements
      .filter(el => !['input', 'select', 'textarea'].includes(el.tagName)) // Exclude form fields
      .slice(0, 20); // Limit to 20 most relevant

    if (relevantElements.length > 0) {
      description += `## Interactive Elements (showing ${relevantElements.length} of ${filteredDOM.interactiveElements.length})\n\n`;
      relevantElements.forEach((el) => {
        description += `- **${el.semanticLabel}** (${el.role})`;
        if (el.stableSelectors.length > 0) {
          description += ` → \`${el.stableSelectors[0]}\``;
        }
        description += `\n`;
      });
    }

    // Navigation
    if (filteredDOM.navigation.length > 0) {
      description += `\n## Navigation (${filteredDOM.navigation.length} links)\n\n`;
      filteredDOM.navigation.slice(0, 10).forEach((nav) => {
        description += `- ${nav.label}`;
        if (nav.href) description += ` → ${nav.href}`;
        description += `\n`;
      });
    }

    return description;
  }

  /**
   * Find element by semantic description
   */
  findElementByDescription(
    filteredDOM: FilteredDOM,
    description: string
  ): ExtractedElement | null {
    const lowerDesc = description.toLowerCase();

    // Try exact semantic label match
    let found = filteredDOM.interactiveElements.find(
      (el) => el.semanticLabel.toLowerCase() === lowerDesc
    );
    if (found) return found;

    // Try partial semantic label match
    found = filteredDOM.interactiveElements.find((el) =>
      el.semanticLabel.toLowerCase().includes(lowerDesc)
    );
    if (found) return found;

    // Try text content match
    found = filteredDOM.interactiveElements.find(
      (el) => el.text && el.text.toLowerCase().includes(lowerDesc)
    );
    if (found) return found;

    // Try role match
    found = filteredDOM.interactiveElements.find((el) => el.role === lowerDesc);
    if (found) return found;

    return null;
  }
}
