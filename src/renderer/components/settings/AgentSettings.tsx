import { useState, useEffect } from 'react';
import { RotateCcw, Bot, Lightbulb } from 'lucide-react';

import { Button } from '@/renderer/ui/button';
import { Textarea } from '@/renderer/ui/textarea';
import { Alert, AlertDescription } from '@/renderer/ui/alert';
import type { AppSettings } from '@/shared/types';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/renderer/ui/field';

interface AgentSettingsProps {
  settings: AppSettings['agent'];
  onUpdate: (key: string, value: string) => void;
  onReset: () => void;
}

const MAX_INSTRUCTIONS_LENGTH = 1000;

export function AgentSettings({
  settings,
  onUpdate,
  onReset,
}: AgentSettingsProps) {
  const [localValue, setLocalValue] = useState(settings.globalInstructions);

  useEffect(() => {
    setLocalValue(settings.globalInstructions);
  }, [settings.globalInstructions]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_INSTRUCTIONS_LENGTH) {
      setLocalValue(value);
    }
  };

  const handleBlur = () => {
    if (localValue !== settings.globalInstructions) {
      onUpdate('globalInstructions', localValue);
    }
  };

  const charactersRemaining = MAX_INSTRUCTIONS_LENGTH - localValue.length;
  const isNearLimit = charactersRemaining <= 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Agent</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Customize how the AI assistant works for you
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset to defaults
        </Button>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="globalInstructions">
            <Bot className="h-4 w-4" />
            Global Instructions
          </FieldLabel>
          <div className="relative">
            <Textarea
              id="globalInstructions"
              value={localValue}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Example:&#10;I'm a software engineer at Acme Corp.&#10;&#10;Preferences:&#10;- Use conventional commits (feat:, fix:, etc.)&#10;- Create draft PRs first&#10;- Our Jira project key is ACME"
              className="min-h-[200px] font-mono text-sm"
              maxLength={MAX_INSTRUCTIONS_LENGTH}
            />
            <div
              className={`absolute bottom-2 right-2 text-xs ${
                isNearLimit ? 'text-orange-500' : 'text-muted-foreground'
              }`}
            >
              {localValue.length}/{MAX_INSTRUCTIONS_LENGTH}
            </div>
          </div>
          <FieldDescription>
            These instructions are included in every autopilot session. Use this
            to provide context about yourself, your work, or preferences.
          </FieldDescription>
        </Field>

        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertDescription>
            <strong>Tips for effective instructions:</strong>
            <ul className="mt-2 list-disc pl-4 space-y-1">
              <li>Mention your role and company for context</li>
              <li>Specify naming conventions you follow</li>
              <li>Include project keys (Jira, Linear, etc.)</li>
              <li>List tools and workflows you use regularly</li>
            </ul>
          </AlertDescription>
        </Alert>
      </FieldGroup>
    </div>
  );
}
