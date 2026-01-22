import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/renderer/ui/input-group';

interface CopyableInputProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyableInput({ value, label, className }: CopyableInputProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Copied to clipboard');

      // Reset the check icon after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <div className={className}>
      {label && (
        <label className="text-sm font-medium mb-2 block">{label}</label>
      )}
      <InputGroup>
        <InputGroupInput
          type="text"
          value={value}
          readOnly
          className="font-mono"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-sm"
            onClick={handleCopy}
            aria-label="Copy to clipboard"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
