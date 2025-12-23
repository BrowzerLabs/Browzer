import { RotateCcw, Plus, Globe } from 'lucide-react';

import { Button } from '@/renderer/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/ui/select';
import type { AppSettings } from '@/shared/types';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/renderer/ui/field';
import { BufferedInput } from '@/renderer/ui/BufferedInput';
import { SEARCH_ENGINES } from '@/shared/searchEngines';

interface GeneralSettingsProps {
  settings: AppSettings['general'];
  onUpdate: (key: string, value: string) => void;
  onReset: () => void;
}

export function GeneralSettings({
  settings,
  onUpdate,
  onReset,
}: GeneralSettingsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">General</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Configure your default browser behavior
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset to defaults
        </Button>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="searchEngine">
            <Globe className="h-4 w-4" />
            Default Search Engine
          </FieldLabel>
          <Select
            value={settings.searchEngineId}
            onValueChange={(value) => onUpdate('searchEngineId', value)}
          >
            <SelectTrigger id="searchEngine">
              <SelectValue placeholder="Select a search engine" />
            </SelectTrigger>
            <SelectContent>
              {SEARCH_ENGINES.map((engine) => (
                <SelectItem key={engine.id} value={engine.id}>
                  {engine.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            The search engine used when you type a search query in the address
            bar
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="newTabUrl">
            <Plus className="h-4 w-4" />
            New Tab Page
          </FieldLabel>
          <BufferedInput
            id="newTabUrl"
            type="url"
            value={settings.newTabUrl}
            onSave={(value) => onUpdate('newTabUrl', value)}
            placeholder="browzer://home"
          />
          <FieldDescription>
            The page that opens when you create a new tab
          </FieldDescription>
        </Field>
      </FieldGroup>
    </div>
  );
}
