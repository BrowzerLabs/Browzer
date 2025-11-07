import { Input } from '@/renderer/ui/input';
import { Button } from '@/renderer/ui/button';
import { RotateCcw, Globe, Home, Plus } from 'lucide-react';
import type { AppSettings } from '@/shared/types';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/renderer/ui/field';

interface GeneralSettingsProps {
  settings: AppSettings['general'];
  onUpdate: (key: string, value: string) => void;
  onReset: () => void;
}

export function GeneralSettings({ settings, onUpdate, onReset }: GeneralSettingsProps) {
  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-xl font-semibold'>General</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Configure your default browser behavior
          </p>
        </div>
        <Button variant='outline' size='sm' onClick={onReset}>
          <RotateCcw className='mr-2 h-4 w-4' />
          Reset to defaults
        </Button>
      </div>

      <FieldGroup>
        {/* Default Search Engine */}
        <Field>
          <FieldLabel htmlFor='searchEngine'>
            <Globe className='h-4 w-4' />
            Default Search Engine
          </FieldLabel>
          <Input
            id='searchEngine'
            type='url'
            value={settings.defaultSearchEngine}
            onChange={(e) => onUpdate('defaultSearchEngine', e.target.value)}
            placeholder='https://www.google.com/search?q='
          />
          <FieldDescription>
            URL template for search queries. Use %s as placeholder for the search term.
          </FieldDescription>
        </Field>

        {/* Homepage */}
        <Field>
          <FieldLabel htmlFor='homepage'>
            <Home className='h-4 w-4' />
            Homepage
          </FieldLabel>
          <Input
            id='homepage'
            type='url'
            value={settings.homepage}
            onChange={(e) => onUpdate('homepage', e.target.value)}
            placeholder='https://www.google.com'
          />
          <FieldDescription>
            The page that opens when you start the browser
          </FieldDescription>
        </Field>

        {/* New Tab Page */}
        <Field>
          <FieldLabel htmlFor='newTabPage'>
            <Plus className='h-4 w-4' />
            New Tab Page
          </FieldLabel>
          <Input
            id='newTabPage'
            type='url'
            value={settings.newTabPage}
            onChange={(e) => onUpdate('newTabPage', e.target.value)}
            placeholder='https://www.google.com'
          />
          <FieldDescription>
            The page that opens when you create a new tab
          </FieldDescription>
        </Field>
      </FieldGroup>
    </div>
  );
}