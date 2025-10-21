import { Switch } from '@/renderer/ui/switch';
import { Button } from '@/renderer/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/renderer/ui/select';
import { Slider } from '@/renderer/ui/slider';
import { RotateCcw, Moon, Sun, Monitor, Type, Bookmark } from 'lucide-react';
import type { AppSettings } from '@/shared/types';
import { useTheme } from '@/renderer/ui/theme-provider';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldContent } from '@/renderer/ui/field';

interface AppearanceSettingsProps {
  settings: AppSettings['appearance'];
  onUpdate: (key: string, value: string | number | boolean) => void;
  onReset: () => void;
}

export function AppearanceSettings({ settings, onUpdate, onReset }: AppearanceSettingsProps) {
  const { setTheme } = useTheme();

  const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
    onUpdate('theme', theme);
    setTheme(theme);
  };

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-xl font-semibold'>Appearance</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Customize the look and feel of your browser
          </p>
        </div>
        <Button variant='outline' size='sm' onClick={onReset}>
          <RotateCcw className='mr-2 h-4 w-4' />
          Reset to defaults
        </Button>
      </div>

      <FieldGroup>
        {/* Theme */}
        <Field>
          <FieldLabel>
            <Monitor className='h-4 w-4' />
            Theme
          </FieldLabel>
          <Select value={settings.theme} onValueChange={handleThemeChange}>
            <SelectTrigger>
              <SelectValue placeholder='Select theme' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='light'>
                <div className='flex items-center gap-2'>
                  <Sun className='h-4 w-4' />
                  Light
                </div>
              </SelectItem>
              <SelectItem value='dark'>
                <div className='flex items-center gap-2'>
                  <Moon className='h-4 w-4' />
                  Dark
                </div>
              </SelectItem>
              <SelectItem value='system'>
                <div className='flex items-center gap-2'>
                  <Monitor className='h-4 w-4' />
                  System
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>
            Choose your preferred color scheme
          </FieldDescription>
        </Field>

        {/* Font Size */}
        <Field>
          <div className='flex items-center justify-between'>
            <FieldLabel>
              <Type className='h-4 w-4' />
              Font Size
            </FieldLabel>
            <span className='text-muted-foreground text-sm font-medium'>{settings.fontSize}px</span>
          </div>
          <Slider
            value={[settings.fontSize]}
            onValueChange={([value]) => onUpdate('fontSize', value)}
            min={12}
            max={24}
            step={1}
            className='w-full'
          />
          <FieldDescription>
            Adjust the default font size for web pages
          </FieldDescription>
        </Field>

        {/* Show Bookmarks Bar */}
        <Field orientation='horizontal'>
          <FieldContent>
            <FieldLabel htmlFor='bookmarksBar'>
              <Bookmark className='h-4 w-4' />
              Show bookmarks bar
            </FieldLabel>
            <FieldDescription>
              Display the bookmarks bar below the address bar
            </FieldDescription>
          </FieldContent>
          <Switch
            id='bookmarksBar'
            checked={settings.showBookmarksBar}
            onCheckedChange={(checked) => onUpdate('showBookmarksBar', checked)}
          />
        </Field>
      </FieldGroup>
    </div>
  );
}