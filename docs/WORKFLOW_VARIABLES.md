# Workflow Variables System

## Overview

The workflow variables system in Browzer enables dynamic data extraction and injection during automation, allowing workflows to adapt to changing content and user inputs.

## Variable Types

### 1. Static Variables
Pre-defined values that remain constant throughout workflow execution.

```typescript
interface StaticVariable {
  name: string;
  value: string | number | boolean;
  type: 'static';
  description?: string;
}
```

**Example:**
```typescript
{
  name: 'company_name',
  value: 'Browzer Labs',
  type: 'static',
  description: 'Default company name for forms'
}
```

### 2. Dynamic Variables
Values extracted from page content during workflow execution.

```typescript
interface DynamicVariable {
  name: string;
  selector: string;
  attribute?: string;
  type: 'dynamic';
  extractionMethod: 'text' | 'value' | 'attribute' | 'innerHTML';
  fallback?: string;
}
```

**Example:**
```typescript
{
  name: 'product_price',
  selector: '.price-display',
  type: 'dynamic',
  extractionMethod: 'text',
  fallback: '0.00'
}
```

### 3. User Input Variables
Values provided by the user at automation runtime.

```typescript
interface UserInputVariable {
  name: string;
  type: 'user_input';
  inputType: 'text' | 'number' | 'email' | 'password' | 'select';
  prompt: string;
  required: boolean;
  validation?: RegExp;
  options?: string[];  // For select type
}
```

**Example:**
```typescript
{
  name: 'user_email',
  type: 'user_input',
  inputType: 'email',
  prompt: 'Enter your email address',
  required: true,
  validation: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
}
```

### 4. Generated Variables
Computed values based on other variables or system data.

```typescript
interface GeneratedVariable {
  name: string;
  type: 'generated';
  generator: 'timestamp' | 'uuid' | 'random' | 'computed';
  format?: string;
  computation?: string;  // JavaScript expression
}
```

**Example:**
```typescript
{
  name: 'current_date',
  type: 'generated',
  generator: 'timestamp',
  format: 'YYYY-MM-DD'
}
```

## Variable Usage in Actions

### Form Input Actions
Variables can be used to populate form fields dynamically.

```typescript
interface FormInputAction extends RecordedAction {
  type: 'input';
  selector: string;
  value: string;  // Can include variable references like {{variable_name}}
  variableReference?: string;
}
```

**Example:**
```typescript
{
  type: 'input',
  selector: '#email-field',
  value: '{{user_email}}',
  variableReference: 'user_email'
}
```

### Navigation Actions
Variables can be used in URL construction for dynamic navigation.

```typescript
{
  type: 'navigate',
  url: 'https://example.com/user/{{user_id}}/profile',
  variableReferences: ['user_id']
}
```

### Conditional Actions
Variables enable conditional workflow execution.

```typescript
{
  type: 'conditional',
  condition: '{{product_price}} > 100',
  trueActions: [...],
  falseActions: [...]
}
```

## Variable Extraction

### DOM-Based Extraction
Extract data from page elements during workflow execution.

```typescript
class VariableExtractor {
  extractFromElement(selector: string, method: ExtractionMethod): string {
    const element = document.querySelector(selector);
    
    switch (method) {
      case 'text':
        return element?.textContent?.trim() || '';
      case 'value':
        return (element as HTMLInputElement)?.value || '';
      case 'attribute':
        return element?.getAttribute(attribute) || '';
      case 'innerHTML':
        return element?.innerHTML || '';
    }
  }
}
```

### API Response Extraction
Extract variables from network requests and responses.

```typescript
interface APIExtraction {
  url: RegExp;  // URL pattern to match
  responseKey: string;  // JSON path to extract
  variableName: string;
}
```

### VLM-Assisted Extraction
Use visual understanding to extract variables from complex UI elements.

```typescript
interface VLMExtraction {
  description: string;  // What to extract
  region?: BoundingBox;  // Specific area to analyze
  variableName: string;
  confidence?: number;
}
```

## Variable Context Management

### Workflow Context
Variables are scoped to individual workflow executions.

```typescript
interface WorkflowContext {
  workflowId: string;
  variables: Map<string, VariableValue>;
  executionState: 'running' | 'paused' | 'completed' | 'failed';
  startTime: Date;
  metadata: WorkflowMetadata;
}
```

### Variable Resolution
Variables are resolved at runtime using a hierarchical approach:

1. **Runtime User Input** (highest priority)
2. **Dynamic Extraction** from current page
3. **Generated Values** computed at runtime
4. **Static Defaults** defined in workflow
5. **Fallback Values** as last resort

```typescript
class VariableResolver {
  resolve(variableName: string, context: WorkflowContext): string {
    // Check runtime inputs first
    if (context.userInputs.has(variableName)) {
      return context.userInputs.get(variableName);
    }
    
    // Try dynamic extraction
    const dynamicVar = context.dynamicVariables.get(variableName);
    if (dynamicVar) {
      return this.extractFromPage(dynamicVar);
    }
    
    // Generate if needed
    const generatedVar = context.generatedVariables.get(variableName);
    if (generatedVar) {
      return this.generate(generatedVar);
    }
    
    // Fall back to static
    return context.staticVariables.get(variableName) || '';
  }
}
```

## Variable Validation

### Type Validation
Ensure variables conform to expected types and formats.

```typescript
interface VariableValidation {
  type: 'string' | 'number' | 'email' | 'url' | 'date';
  required: boolean;
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  min?: number;  // For numeric types
  max?: number;
}
```

### Runtime Validation
Variables are validated before use in actions.

```typescript
class VariableValidator {
  validate(value: string, validation: VariableValidation): ValidationResult {
    if (validation.required && !value) {
      return { valid: false, error: 'Required variable is missing' };
    }
    
    if (validation.pattern && !validation.pattern.test(value)) {
      return { valid: false, error: 'Value does not match required pattern' };
    }
    
    return { valid: true };
  }
}
```

## Integration with VLM

### Visual Variable Extraction
VLM can identify and extract variables from visual elements that are difficult to target with traditional selectors.

```typescript
interface VLMVariableExtraction {
  screenshot: string;  // Base64 encoded screenshot
  description: string;  // Natural language description
  expectedType: VariableType;
  confidence: number;
  extractedValue: string;
}
```

### Smart Form Detection
VLM helps identify form fields and their purposes for automatic variable mapping.

```typescript
interface FormFieldMapping {
  selector: string;
  label: string;
  fieldType: 'email' | 'name' | 'phone' | 'address' | 'other';
  suggestedVariable: string;
  confidence: number;
}
```

## Error Handling

### Missing Variables
When variables are not available, the system provides graceful fallbacks:

1. **Prompt User**: Ask for missing user input variables
2. **Use Fallback**: Apply default values where available
3. **Skip Action**: Skip optional actions that depend on missing variables
4. **Abort Workflow**: Stop execution for critical missing variables

### Invalid Variable Values
When variable values fail validation:

1. **Re-prompt User**: Ask user to provide valid input
2. **Apply Transformation**: Attempt to convert to valid format
3. **Use Fallback**: Apply default valid value
4. **Log Warning**: Continue with invalid value but log the issue

## Variable Persistence

### Workflow Storage
Variables are stored with workflow definitions for reuse.

```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  actions: RecordedAction[];
  variables: VariableDefinition[];
  metadata: WorkflowMetadata;
}
```

### Execution History
Variable values from executions are stored for debugging and analysis.

```typescript
interface ExecutionRecord {
  workflowId: string;
  executionId: string;
  variableValues: Map<string, string>;
  executionTime: Date;
  success: boolean;
  errors?: string[];
}
```

## Best Practices

### Variable Naming
- Use descriptive, snake_case names: `user_email`, `product_id`
- Include type hints in names when helpful: `count_number`, `is_visible_flag`
- Avoid reserved keywords and special characters

### Variable Scope
- Keep variables as specific as possible to their use case
- Use user input variables sparingly to minimize user burden
- Provide sensible defaults for optional variables

### Error Resilience
- Always provide fallback values for critical variables
- Validate user inputs before using in actions
- Handle missing or invalid variables gracefully

---

*Last updated: October 2025*