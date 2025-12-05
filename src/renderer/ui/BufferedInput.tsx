import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/renderer/ui/input';

const AUTO_SAVE_INTERVAL = 5000;

interface BufferedInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
  value: string;
  onSave: (value: string) => void;
}

export function BufferedInput({ value, onSave, ...props }: BufferedInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const lastSavedValue = useRef(value);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value);
      lastSavedValue.current = value;
    }
  }, [value, isFocused]);

  const saveIfChanged = useCallback(() => {
    if (localValue !== lastSavedValue.current) {
      onSave(localValue);
      lastSavedValue.current = localValue;
    }
  }, [localValue, onSave]);

  useEffect(() => {
    if (isFocused) {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
      
      autoSaveTimerRef.current = setInterval(() => {
        saveIfChanged();
      }, AUTO_SAVE_INTERVAL);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [isFocused, saveIfChanged]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    props.onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    saveIfChanged();
    props.onBlur?.(e);
  };

  return (
    <Input
      {...props}
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
