import { X } from 'lucide-react';

import { Button } from '@/renderer/ui/button';

interface RestoreSessionPopupProps {
  onRestore: () => void;
  onClose: () => void;
}

export function RestoreSessionPopup({
  onRestore,
  onClose,
}: RestoreSessionPopupProps) {
  return (
    <div className="absolute top-24 right-4 z-50 w-80 bg-background border rounded-lg shadow-lg p-4 animate-in fade-in slide-in-from-top-2">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-foreground">Restore pages?</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-sm hover:bg-accent"
        >
          <X size={16} />
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Browzer didn't shut down correctly.
      </p>
      <div className="flex justify-end">
        <Button
          onClick={onRestore}
          size="sm"
          variant="default"
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          Restore
        </Button>
      </div>
    </div>
  );
}
