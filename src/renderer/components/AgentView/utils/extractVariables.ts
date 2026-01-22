import { RecordingAction } from '@/shared/types';

export interface WorkflowVariable {
  name: string;
  value: string;
  type: 'input' | 'selection';
  actionIndex: number;
}

/**
 * Intelligently extracts variables from recording actions.
 * Variables are user inputs that would typically change between executions.
 */
export function extractWorkflowVariables(
  actions: RecordingAction[]
): WorkflowVariable[] {
  const variables: WorkflowVariable[] = [];
  const seenValues = new Set<string>();

  // Noise words that indicate non-variable fields
  const noisePatterns = [
    /^(continue|next|back|cancel|close|submit|save|create|confirm|ok|yes|no)$/i,
    /^(public|private)$/i, // Common toggles, but we'll handle these specially
  ];

  // Selection roles that indicate user choices
  const selectionRoles = new Set([
    'option',
    'menuitem',
    'menuitemradio',
    'menuitemcheckbox',
    'radio',
    'checkbox',
    'combobox',
  ]);

  actions.forEach((action, index) => {
    // Extract from TYPE actions (text inputs)
    if (action.type === 'type' && action.element?.value) {
      const value = action.element.value.trim();
      const fieldName = action.element.name || 'Input';

      // Skip empty values
      if (!value) return;

      // Skip if we've seen this exact value (deduplication)
      const uniqueKey = `${fieldName}:${value}`;
      if (seenValues.has(uniqueKey)) return;
      seenValues.add(uniqueKey);

      // Skip noise patterns
      if (noisePatterns.some((pattern) => pattern.test(value))) return;

      // Skip very short values (likely not meaningful variables)
      if (value.length < 2) return;

      variables.push({
        name: fieldName,
        value: value,
        type: 'input',
        actionIndex: index,
      });
    }

    // Extract from CLICK actions on selection elements
    if (action.type === 'click' && action.element) {
      const role = action.element.role;
      const name = action.element.name?.trim();

      // Check if this is a selection action
      if (role && selectionRoles.has(role) && name) {
        // Skip noise patterns
        if (noisePatterns.some((pattern) => pattern.test(name))) return;

        // Skip if we've seen this exact selection
        const uniqueKey = `selection:${name}`;
        if (seenValues.has(uniqueKey)) return;
        seenValues.add(uniqueKey);

        // Find context from previous actions to determine the field name
        const contextName = findSelectionContext(actions, index);

        variables.push({
          name: contextName || 'Selection',
          value: name,
          type: 'selection',
          actionIndex: index,
        });
      }
    }
  });

  return variables;
}

/**
 * Attempts to find context for a selection by looking at nearby actions.
 * For example, if user clicks "Add .gitignore" then selects "Android",
 * we want to label it as ".gitignore template" or similar.
 */
function findSelectionContext(
  actions: RecordingAction[],
  currentIndex: number
): string | null {
  // Look at the previous 3 actions for context
  const lookbackRange = 3;
  const startIndex = Math.max(0, currentIndex - lookbackRange);

  for (let i = currentIndex - 1; i >= startIndex; i--) {
    const prevAction = actions[i];

    // If previous action was a click on a button/field, use that as context
    if (
      prevAction.type === 'click' &&
      prevAction.element?.name &&
      prevAction.element.role === 'button'
    ) {
      const buttonName = prevAction.element.name;
      // Clean up button names like "Add .gitignore" -> ".gitignore"
      return buttonName.replace(/^(add|select|choose|pick)\s+/i, '').trim();
    }
  }

  return null;
}

/**
 * Groups variables by their semantic meaning to reduce clutter.
 * For example, multiple related selections can be grouped.
 */
export function groupVariables(
  variables: WorkflowVariable[]
): Map<string, WorkflowVariable[]> {
  const groups = new Map<string, WorkflowVariable[]>();

  variables.forEach((variable) => {
    const groupKey = variable.name;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    const group = groups.get(groupKey);
    if (group) {
      group.push(variable);
    }
  });

  return groups;
}
