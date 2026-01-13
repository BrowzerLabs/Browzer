import { useState } from 'react';
import {
  FileText,
  Search,
  Trash2,
  Play,
  ChevronRight,
  Clock,
  Hash,
  Loader2,
  ArrowLeft,
  Edit2,
  Check,
  X,
  Sparkles,
} from 'lucide-react';

import { useRecordingStore } from '@/renderer/store/useRecordingStore';
import { cn } from '@/renderer/lib/utils';
import type {
  StoredWorkflowMetadata,
  WorkflowDefinition,
} from '@/preload/types/recording.types';

export function WorkflowsPanel() {
  const {
    workflows,
    workflowsLoading,
    selectedWorkflow,
    isLoading,
    loadWorkflow,
    deleteWorkflow,
    searchWorkflows,
    loadWorkflows,
    clearSelectedWorkflow,
    updateWorkflow,
    enhanceWorkflow,
  } = useRecordingStore();

  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      await searchWorkflows(query);
    } else {
      await loadWorkflows();
    }
  };

  if (selectedWorkflow) {
    return (
      <WorkflowDetail
        workflow={selectedWorkflow}
        isLoading={isLoading}
        onBack={clearSelectedWorkflow}
        onDelete={async () => {
          await deleteWorkflow(selectedWorkflow.id);
          clearSelectedWorkflow();
        }}
        onUpdate={updateWorkflow}
        onEnhance={() => enhanceWorkflow(selectedWorkflow.id)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="px-4 py-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className={cn(
              'w-full pl-9 pr-4 py-2 rounded-lg border bg-background',
              'focus:outline-none focus:ring-2 focus:ring-primary',
              'text-sm'
            )}
          />
        </div>
      </div>

      {/* Workflows List */}
      <div className="flex-1 overflow-y-auto">
        {workflowsLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="p-4 rounded-full bg-muted mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Workflows</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {searchQuery
                ? 'No workflows match your search'
                : 'Record your first workflow to see it here'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {workflows.map((workflow) => (
              <WorkflowItem
                key={workflow.id}
                workflow={workflow}
                onClick={() => loadWorkflow(workflow.id)}
                onDelete={() => deleteWorkflow(workflow.id)}
                isLoading={isLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowItem({
  workflow,
  onClick,
  onDelete,
  isLoading,
}: {
  workflow: StoredWorkflowMetadata;
  onClick: () => void;
  onDelete: () => void;
  isLoading: boolean;
}) {
  const createdDate = new Date(workflow.created_at).toLocaleDateString();

  return (
    <div
      onClick={onClick}
      className={cn(
        'px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer',
        'flex items-center gap-3'
      )}
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
        <FileText className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-medium truncate">{workflow.name}</h4>
        <p className="text-xs text-muted-foreground truncate">
          {workflow.description || 'No description'}
        </p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Hash className="w-3 h-3" />
            {workflow.step_count} steps
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {createdDate}
          </span>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={isLoading}
        className={cn(
          'p-2 rounded-lg text-muted-foreground',
          'hover:bg-red-100 hover:text-red-500',
          'dark:hover:bg-red-900/30 dark:hover:text-red-400',
          'transition-colors'
        )}
      >
        <Trash2 className="w-4 h-4" />
      </button>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </div>
  );
}

function WorkflowDetail({
  workflow,
  isLoading,
  onBack,
  onDelete,
  onUpdate,
  onEnhance,
}: {
  workflow: WorkflowDefinition;
  isLoading: boolean;
  onBack: () => void;
  onDelete: () => void;
  onUpdate: (
    id: string,
    updates: { name?: string; description?: string }
  ) => Promise<boolean>;
  onEnhance: () => Promise<boolean>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(workflow.name);
  const [editDescription, setEditDescription] = useState(workflow.description);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);

  const handleEnhance = async () => {
    setIsEnhancing(true);
    await onEnhance();
    setIsEnhancing(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const success = await onUpdate(workflow.id, {
      name: editName,
      description: editDescription,
    });
    setIsSaving(false);
    if (success) {
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditName(workflow.name);
    setEditDescription(workflow.description);
    setIsEditing(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={cn(
                'flex-1 px-2 py-1 rounded border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-primary',
                'text-lg font-semibold'
              )}
            />
          ) : (
            <h2 className="flex-1 text-lg font-semibold truncate">
              {workflow.name}
            </h2>
          )}
          {isEditing ? (
            <div className="flex gap-1">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 transition-colors"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={handleCancel}
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={onDelete}
                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        {isEditing ? (
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Description..."
            rows={2}
            className={cn(
              'w-full mt-2 px-2 py-1 rounded border bg-background resize-none',
              'focus:outline-none focus:ring-2 focus:ring-primary',
              'text-sm text-muted-foreground'
            )}
          />
        ) : (
          <p className="text-sm text-muted-foreground mt-1">
            {workflow.description || 'No description'}
          </p>
        )}
      </div>

      {/* Metadata & Actions */}
      <div className="px-4 py-2 bg-muted/30 border-b flex items-center justify-between">
        <div className="text-xs text-muted-foreground flex gap-4">
          <span>{workflow.steps.length} steps</span>
          <span>{workflow.input_schema?.length || 0} variables</span>
          <span>v{workflow.version}</span>
        </div>
        <button
          onClick={handleEnhance}
          disabled={isEnhancing || isLoading}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
            'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
            'hover:from-purple-600 hover:to-pink-600',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-all duration-200'
          )}
        >
          {isEnhancing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {isEnhancing ? 'Enhancing...' : 'Enhance with AI'}
        </button>
      </div>

      {/* Variables */}
      {workflow.input_schema && workflow.input_schema.length > 0 && (
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-medium mb-2">Variables</h3>
          <div className="flex flex-wrap gap-2">
            {workflow.input_schema.map((variable) => (
              <span
                key={variable.name}
                className="px-2 py-1 rounded bg-primary/10 text-primary text-xs"
              >
                {'{'}
                {variable.name}
                {'}'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 text-sm font-medium bg-muted/30 border-b sticky top-0">
          Steps
        </div>
        <div className="divide-y">
          {workflow.steps.map((step, index) => (
            <div key={index} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground">
                  #{index + 1}
                </span>
                <span className="text-xs font-medium uppercase text-primary">
                  {step.type}
                </span>
              </div>
              <p className="text-sm">{step.description || step.type}</p>
              {step.target_text && (
                <p className="text-xs text-muted-foreground mt-1">
                  Target: {step.target_text}
                </p>
              )}
              {step.value && (
                <p className="text-xs text-muted-foreground">
                  Value: {step.value}
                </p>
              )}
              {step.url && (
                <p className="text-xs text-muted-foreground truncate">
                  URL: {step.url}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
