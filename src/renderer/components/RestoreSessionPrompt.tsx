import React, { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverAnchor } from '@/renderer/ui/popover';
import { X } from 'lucide-react';

export const RestoreSessionPrompt: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const checkSavedSession = async () => {
      try {
        const hasSaved = await window.browserAPI.hasSavedSession();
        if (hasSaved) {
          setIsOpen(true);
          await window.browserAPI.bringBrowserViewToFront();
        }
      } catch (error) {
        console.error('Failed to check for saved session:', error);
      }
    };
    checkSavedSession();
  }, []);

  const handleRestore = async () => {
    try {
      await window.browserAPI.restoreSession();
    } catch (error) {
      console.error('Failed to restore session:', error);
    }
    setIsOpen(false);
  };

  const handleClose = async () => {
    setIsOpen(false);
    try {
      await window.browserAPI.clearSavedSession();
    } catch (error) {
      console.error('Failed to clear saved session:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverAnchor className="absolute top-2 right-2 w-1 h-1 bg-transparent pointer-events-none" />
      <PopoverContent 
        className="w-80 p-0 shadow-lg border rounded-md bg-white dark:bg-zinc-900" 
        align="end" 
        side="bottom"
        onInteractOutside={handleClose}
      >
        <div className="relative p-4">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            className="absolute top-2 right-2 p-1 rounded-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50"
          >
            <X size={16} />
          </button>
          
          <h3 className="text-sm font-semibold mb-2">Restore pages?</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Browzer didn't shut down correctly.
          </p>
          
          <div className="flex justify-end">
            <button
              onClick={handleRestore}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
            >
              Restore
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
