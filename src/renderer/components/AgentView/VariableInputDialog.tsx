import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

import { WorkflowVariable } from './utils/extractVariables';

import { Button } from '@/renderer/ui/button';
import { Input } from '@/renderer/ui/input';
import { Label } from '@/renderer/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/renderer/ui/dialog';
import { useBrowserViewLayerStore } from '@/renderer/stores/browserViewLayerStore';

export interface VariableValue {
  name: string;
  originalValue: string;
  newValue: string;
  type: 'input' | 'selection';
}

interface VariableInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variables: WorkflowVariable[];
  onConfirm: (variableValues: VariableValue[]) => void;
  userGoal: string;
}

const OVERLAY_ID = 'variable-input-dialog';

export function VariableInputDialog({
  open,
  onOpenChange,
  variables,
  onConfirm,
  userGoal,
}: VariableInputDialogProps) {
  const [variableValues, setVariableValues] = useState<VariableValue[]>([]);
  const { registerOverlay, unregisterOverlay } = useBrowserViewLayerStore();

  useEffect(() => {
    if (open) {
      registerOverlay(OVERLAY_ID);
    } else {
      unregisterOverlay(OVERLAY_ID);
    }

    return () => {
      unregisterOverlay(OVERLAY_ID);
    };
  }, [open, registerOverlay, unregisterOverlay]);

  useEffect(() => {
    if (open && variables.length > 0) {
      const initialValues = variables.map((v) => ({
        name: v.name,
        originalValue: v.value,
        newValue: v.value,
        type: v.type,
      }));
      setVariableValues(initialValues);
    }
  }, [open, variables]);

  const handleValueChange = useCallback((index: number, newValue: string) => {
    setVariableValues((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], newValue };
      return updated;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(variableValues);
    onOpenChange(false);
  }, [variableValues, onConfirm, onOpenChange]);

  if (variables.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md z-[100]">
        <DialogHeader>
          <DialogTitle>Customize Workflow Variables</DialogTitle>
          <DialogDescription>
            This workflow has input fields. You can customize the values below
            or use the defaults from the recording.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
          {variableValues.map((variable, index) => (
            <div key={`${variable.name}-${index}`} className="space-y-2">
              <Label
                htmlFor={`var-${index}`}
                className="text-sm font-medium flex items-center gap-2"
              >
                {variable.name}
                <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                  {variable.type}
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`var-${index}`}
                  value={variable.newValue}
                  onChange={(e) => handleValueChange(index, e.target.value)}
                  placeholder={variable.originalValue}
                  className="flex-1"
                />
                {variable.newValue !== variable.originalValue && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      handleValueChange(index, variable.originalValue)
                    }
                    title="Reset to original"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
              {variable.newValue !== variable.originalValue && (
                <p className="text-xs text-muted-foreground">
                  Original: {variable.originalValue}
                </p>
              )}
            </div>
          ))}
        </div>

        {userGoal && (
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
            <strong>Your goal:</strong> {userGoal}
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleConfirm}>Start Automation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
