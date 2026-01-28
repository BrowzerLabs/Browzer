import { RecordingAction } from '@/shared/types';

export interface WorkflowVariable {
  name: string;
  value: string;
  type: 'input' | 'selection';
  actionIndex: number;
}

export function extractWorkflowVariables(
  actions: RecordingAction[]
): WorkflowVariable[] {
  const variables: WorkflowVariable[] = [];
  const seenValues = new Set<string>();

  const noisePatterns = [
    /^(continue|next|back|cancel|close|submit|save|create|confirm|ok|yes|no)$/i,
    /^(public|private)$/i,
  ];

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
    if (action.type === 'type' && action.element?.value) {
      const value = action.element.value.trim();
      const fieldName = action.element.name || 'Input';

      if (!value) return;

      const uniqueKey = `${fieldName}:${value}`;
      if (seenValues.has(uniqueKey)) return;
      seenValues.add(uniqueKey);

      if (noisePatterns.some((pattern) => pattern.test(value))) return;

      if (value.length < 2) return;

      variables.push({
        name: fieldName,
        value: value,
        type: 'input',
        actionIndex: index,
      });
    }

    if (action.type === 'click' && action.element) {
      const role = action.element.role;
      const name = action.element.name?.trim();

      if (role && selectionRoles.has(role) && name) {
        if (noisePatterns.some((pattern) => pattern.test(name))) return;

        const uniqueKey = `selection:${name}`;
        if (seenValues.has(uniqueKey)) return;
        seenValues.add(uniqueKey);

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

function findSelectionContext(
  actions: RecordingAction[],
  currentIndex: number
): string | null {
  const lookbackRange = 3;
  const startIndex = Math.max(0, currentIndex - lookbackRange);

  for (let i = currentIndex - 1; i >= startIndex; i--) {
    const prevAction = actions[i];

    if (
      prevAction.type === 'click' &&
      prevAction.element?.name &&
      prevAction.element.role === 'button'
    ) {
      const buttonName = prevAction.element.name;
      return buttonName.replace(/^(add|select|choose|pick)\s+/i, '').trim();
    }
  }

  return null;
}

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
