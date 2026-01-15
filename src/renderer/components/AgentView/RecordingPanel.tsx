import { useState } from 'react';
import {
  Circle,
  Square,
  Save,
  Trash2,
  Clock,
  MousePointer,
  Type,
  Navigation,
  KeyRound,
  Loader2,
  CheckSquare,
  CircleDot,
} from 'lucide-react';

import { useRecordingStore } from '@/renderer/store/useRecordingStore';
import { cn } from '@/renderer/lib/utils';
import type { RecordedAction } from '@/preload/types/recording.types';

export function RecordingPanel() {
  const {
    status,
    actions,
    isLoading,
    error,
    startRecording,
    stopRecording,
    discardRecording,
    generateWorkflow,
    setError,
  } = useRecordingStore();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');

  const handleSave = async () => {
    if (!workflowName.trim()) {
      setError('Please enter a workflow name');
      return;
    }

    const success = await generateWorkflow(workflowName, workflowDescription);
    if (success) {
      setShowSaveDialog(false);
      setWorkflowName('');
      setWorkflowDescription('');
    }
  };

  const handleDiscard = async () => {
    await discardRecording();
    setShowSaveDialog(false);
    setWorkflowName('');
    setWorkflowDescription('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status Bar */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                status === 'recording'
                  ? 'bg-red-500 animate-pulse'
                  : status === 'stopped'
                    ? 'bg-yellow-500'
                    : 'bg-gray-400'
              )}
            />
            <span className="text-sm font-medium capitalize">
              {status === 'idle' ? 'Ready' : status}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {actions.length} action{actions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-800 dark:text-red-300 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {status === 'idle' && actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="p-4 rounded-full bg-blue-50 dark:bg-blue-950 mb-4">
              <Circle className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Start Recording</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-4">
              Click the record button in the toolbar to start capturing your
              browser actions.
            </p>
            <button
              onClick={startRecording}
              disabled={isLoading}
              className={cn(
                'px-4 py-2 rounded-lg font-medium transition-colors',
                'bg-red-500 text-white hover:bg-red-600',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center gap-2'
              )}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Circle className="w-4 h-4 fill-current" />
              )}
              Start Recording
            </button>
          </div>
        ) : (
          <ActionList actions={actions} />
        )}
      </div>

      {/* Controls */}
      {(status === 'recording' || status === 'stopped') && (
        <div className="px-4 py-3 border-t bg-background">
          {status === 'recording' ? (
            <button
              onClick={stopRecording}
              disabled={isLoading}
              className={cn(
                'w-full px-4 py-2 rounded-lg font-medium transition-colors',
                'bg-red-500 text-white hover:bg-red-600',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-2'
              )}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4 fill-current" />
              )}
              Stop Recording
            </button>
          ) : showSaveDialog ? (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Workflow name"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                className={cn(
                  'w-full px-3 py-2 rounded-lg border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-primary'
                )}
              />
              <textarea
                placeholder="Description (optional)"
                value={workflowDescription}
                onChange={(e) => setWorkflowDescription(e.target.value)}
                rows={2}
                className={cn(
                  'w-full px-3 py-2 rounded-lg border bg-background resize-none',
                  'focus:outline-none focus:ring-2 focus:ring-primary'
                )}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={isLoading}
                  className={cn(
                    'flex-1 px-4 py-2 rounded-lg font-medium transition-colors',
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'flex items-center justify-center gap-2'
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save
                </button>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className={cn(
                    'px-4 py-2 rounded-lg font-medium transition-colors',
                    'border hover:bg-muted'
                  )}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowSaveDialog(true)}
                className={cn(
                  'flex-1 px-4 py-2 rounded-lg font-medium transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'flex items-center justify-center gap-2'
                )}
              >
                <Save className="w-4 h-4" />
                Save Workflow
              </button>
              <button
                onClick={handleDiscard}
                className={cn(
                  'px-4 py-2 rounded-lg font-medium transition-colors',
                  'border text-red-500 hover:bg-red-50 dark:hover:bg-red-950'
                )}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionList({ actions }: { actions: RecordedAction[] }) {
  return (
    <div className="divide-y">
      {actions.map((action, index) => (
        <ActionItem key={action.id} action={action} index={index} />
      ))}
    </div>
  );
}

function ActionItem({
  action,
  index,
}: {
  action: RecordedAction;
  index: number;
}) {
  const getActionIcon = (type: string) => {
    switch (type) {
      case 'click':
        return <MousePointer className="w-4 h-4" />;
      case 'input':
        return <Type className="w-4 h-4" />;
      case 'navigation':
        return <Navigation className="w-4 h-4" />;
      case 'keypress':
        return <KeyRound className="w-4 h-4" />;
      case 'checkbox_change':
        return <CheckSquare className="w-4 h-4" />;
      case 'radio_change':
        return <CircleDot className="w-4 h-4" />;
      default:
        return <Circle className="w-4 h-4" />;
    }
  };

  const getActionDescription = (action: RecordedAction) => {
    switch (action.type) {
      case 'click':
        return `Click on "${truncate(action.element?.innerText || 'element', 30)}"`;
      case 'input':
        return `Type "${truncate(action.value || '', 20)}" into "${truncate(action.element?.innerText || action.element?.placeholder || 'field', 20)}"`;
      case 'navigation':
        return `Navigate to ${truncate(action.pageUrl, 40)}`;
      case 'keypress': {
        // Format keyboard shortcut display
        const modifiers = action.modifiers || [];
        if (modifiers.length > 0) {
          const modifierSymbols = modifiers.map((m) => {
            switch (m) {
              case 'cmd':
                return '⌘';
              case 'ctrl':
                return '⌃';
              case 'alt':
                return '⌥';
              case 'shift':
                return '⇧';
              default:
                return m;
            }
          });
          return `Press ${modifierSymbols.join('')}+${action.key}`;
        }
        return `Press ${action.key}`;
      }
      case 'select_change':
        return `Select "${truncate(action.selectedText || '', 30)}"`;
      case 'checkbox_change': {
        const label = action.label || action.element?.innerText || 'checkbox';
        const state = action.checked ? 'Check' : 'Uncheck';
        return `${state} "${truncate(label, 30)}"`;
      }
      case 'radio_change': {
        const label =
          action.label || action.element?.innerText || action.value || 'option';
        return `Select radio "${truncate(label, 30)}"`;
      }
      case 'scroll':
        return `Scroll to (${action.scrollX}, ${action.scrollY})`;
      default:
        return action.type;
    }
  };

  const timestamp = new Date(action.timestamp).toLocaleTimeString();

  return (
    <div className="px-4 py-3 hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground">
          {getActionIcon(action.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">#{index + 1}</span>
            <span className="text-xs font-medium uppercase text-muted-foreground">
              {action.type}
            </span>
          </div>
          <p className="text-sm truncate">{getActionDescription(action)}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <Clock className="w-3 h-3" />
            {timestamp}
          </div>
        </div>
      </div>
    </div>
  );
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}
