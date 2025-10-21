import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/renderer/ui/tabs';
import { ScrollArea } from '@/renderer/ui/scroll-area';
import { GeneralSettings } from '@/renderer/components/settings/GeneralSettings';
import { PrivacySettings } from '@/renderer/components/settings/PrivacySettings';
import { AppearanceSettings } from '@/renderer/components/settings/AppearanceSettings';
import { AutomationSettings } from '@/renderer/components/settings/AutomationSettings';
import { AppSettings } from '@/shared/types';
import { Settings as SettingsIcon, Shield, Palette, Sparkles, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';

export function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const allSettings = await window.browserAPI.getAllSettings();
      setSettings(allSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleUpdateSetting = async (
    category: keyof AppSettings,
    key: string,
    value: string | number | boolean
  ) => {
    try {
      await window.browserAPI.updateSetting(category, key, value);
      // Update local state
      setSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [category]: {
            ...prev[category],
            [key]: value,
          },
        };
      });
      // Show success toast
      toast.success('Setting updated successfully');
    } catch (error) {
      console.error('Failed to update setting:', error);
      toast.error('Failed to update setting', {
        description: 'Please try again or check your connection.',
      });
    }
  };

  const handleResetCategory = async (category: keyof AppSettings) => {
    try {
      await window.browserAPI.resetSettingsCategory(category);
      await loadSettings();
      toast.success('Settings reset successfully');
    } catch (error) {
      console.error('Failed to reset category:', error);
      toast.error('Failed to reset settings', {
        description: 'Please try again.',
      });
    }
  };

  if (!settings) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Loader2Icon className='animate-spin size-4' />
      </div>
    );
  }

  return (
    <section className='flex h-full flex-col bg-background'>
      {/* Header */}
      <div className='border-b px-8 py-2'>
        <h1 className='text-xl font-semibold'>Settings</h1>
        <p className='text-muted-foreground mt-1 text-sm'>
          Manage your browser preferences and configuration
        </p>
      </div>

      {/* Settings Content */}
      <div className='flex flex-1 overflow-hidden'>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          orientation='vertical'
          className='flex h-full w-full flex-row gap-0'
        >
           <ScrollArea className='h-full w-64'>
              <TabsList className='flex h-auto w-full flex-col items-stretch justify-start gap-1 rounded-none bg-transparent p-4'>
                <TabsTrigger
                  value='general'
                  className='justify-start gap-3 rounded-md px-4 py-2.5 data-[state=active]:bg-accent data-[state=active]:shadow-none'
                >
                  <SettingsIcon className='h-4 w-4' />
                  <span>General</span>
                </TabsTrigger>
                <TabsTrigger
                  value='privacy'
                  className='justify-start gap-3 rounded-md px-4 py-2.5 data-[state=active]:bg-accent data-[state=active]:shadow-none'
                >
                  <Shield className='h-4 w-4' />
                  <span>Privacy & Security</span>
                </TabsTrigger>
                <TabsTrigger
                  value='appearance'
                  className='justify-start gap-3 rounded-md px-4 py-2.5 data-[state=active]:bg-accent data-[state=active]:shadow-none'
                >
                  <Palette className='h-4 w-4' />
                  <span>Appearance</span>
                </TabsTrigger>
                <TabsTrigger
                  value='automation'
                  className='justify-start gap-3 rounded-md px-4 py-2.5 data-[state=active]:bg-accent data-[state=active]:shadow-none'
                >
                  <Sparkles className='h-4 w-4' />
                  <span>Automation</span>
                </TabsTrigger>
              </TabsList>
            </ScrollArea>

          {/* Content Area */}
          <div className='flex-1 overflow-hidden'>
            <ScrollArea className='h-full'>
              <div className='mx-auto max-w-4xl p-8'>
                <TabsContent value='general'>
                  <GeneralSettings
                    settings={settings.general}
                    onUpdate={(key, value) => handleUpdateSetting('general', key, value)}
                    onReset={() => handleResetCategory('general')}
                  />
                </TabsContent>

                <TabsContent value='privacy'>
                  <PrivacySettings
                    settings={settings.privacy}
                    onUpdate={(key, value) => handleUpdateSetting('privacy', key, value)}
                    onReset={() => handleResetCategory('privacy')}
                  />
                </TabsContent>

                <TabsContent value='appearance'>
                  <AppearanceSettings
                    settings={settings.appearance}
                    onUpdate={(key, value) => handleUpdateSetting('appearance', key, value)}
                    onReset={() => handleResetCategory('appearance')}
                  />
                </TabsContent>

                <TabsContent value='automation'>
                  <AutomationSettings
                    settings={settings.automation}
                    onUpdate={(key, value) => handleUpdateSetting('automation', key, value)}
                    onReset={() => handleResetCategory('automation')}
                  />
                </TabsContent>
              </div>
            </ScrollArea>
          </div>
        </Tabs>
      </div>
    </section>
  );
}