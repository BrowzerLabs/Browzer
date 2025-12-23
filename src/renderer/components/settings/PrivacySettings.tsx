import {
  RotateCcw,
  Trash2,
  ShieldAlert,
  Cookie,
  ShieldCheck,
} from 'lucide-react';

import { Switch } from '@/renderer/ui/switch';
import { Button } from '@/renderer/ui/button';
import type { AppSettings } from '@/shared/types';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldContent,
} from '@/renderer/ui/field';

interface PrivacySettingsProps {
  settings: AppSettings['privacy'];
  onUpdate: (key: string, value: boolean) => void;
  onReset: () => void;
}

export function PrivacySettings({
  settings,
  onUpdate,
  onReset,
}: PrivacySettingsProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Privacy & Security</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Control your privacy and security preferences
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset to defaults
        </Button>
      </div>

      <FieldGroup>
        {/* Clear Cache on Exit */}
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="clearCache">
              <Trash2 className="h-4 w-4" />
              Clear cache on exit
            </FieldLabel>
            <FieldDescription>
              Automatically clear browsing cache when closing the browser
            </FieldDescription>
          </FieldContent>
          <Switch
            id="clearCache"
            checked={settings.clearCacheOnExit}
            onCheckedChange={(checked) => onUpdate('clearCacheOnExit', checked)}
          />
        </Field>

        {/* Do Not Track */}
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="doNotTrack">
              <ShieldAlert className="h-4 w-4" />
              Send "Do Not Track" request
            </FieldLabel>
            <FieldDescription>
              Tell websites you don't want to be tracked
            </FieldDescription>
          </FieldContent>
          <Switch
            id="doNotTrack"
            checked={settings.doNotTrack}
            onCheckedChange={(checked) => onUpdate('doNotTrack', checked)}
          />
        </Field>

        {/* Block Third-Party Cookies */}
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="blockCookies">
              <Cookie className="h-4 w-4" />
              Block third-party cookies
            </FieldLabel>
            <FieldDescription>
              Prevent third-party sites from setting cookies
            </FieldDescription>
          </FieldContent>
          <Switch
            id="blockCookies"
            checked={settings.blockThirdPartyCookies}
            onCheckedChange={(checked) =>
              onUpdate('blockThirdPartyCookies', checked)
            }
          />
        </Field>

        {/* Enable Ad Blocker */}
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="enableAdBlocker">
              <ShieldCheck className="h-4 w-4" />
              Enable ad blocker
            </FieldLabel>
            <FieldDescription>
              Block ads and trackers for a faster, cleaner browsing experience
            </FieldDescription>
          </FieldContent>
          <Switch
            id="enableAdBlocker"
            checked={settings.enableAdBlocker}
            onCheckedChange={(checked) => onUpdate('enableAdBlocker', checked)}
          />
        </Field>
      </FieldGroup>
    </div>
  );
}
