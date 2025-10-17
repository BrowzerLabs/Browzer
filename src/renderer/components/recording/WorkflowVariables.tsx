import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Trash2, Edit2, Check, X, Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WorkflowVariable } from '../../../shared/types';

interface WorkflowVariablesProps {
  className?: string;
  variables?: WorkflowVariable[];
  editable?: boolean;
  recordingId?: string;
  onVariablesChange?: (variables?: WorkflowVariable[]) => void;
}

export function WorkflowVariables({ className, variables: propsVariables, editable = true, recordingId, onVariablesChange }: WorkflowVariablesProps) {
  const [variables, setVariables] = useState<WorkflowVariable[]>(propsVariables || []);
  const [loading, setLoading] = useState(!propsVariables);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editValue, setEditValue] = useState('');
  const [showValues, setShowValues] = useState(false);

  // Load variables from the current recording if not provided
  useEffect(() => {
    if (!propsVariables) {
      loadVariables();
    } else {
      setVariables(propsVariables);
      setLoading(false);
    }
  }, [propsVariables]);

  // Update local state when props change (only if not currently editing)
  useEffect(() => {
    if (propsVariables && !editingId) {
      setVariables(propsVariables);
    }
  }, [propsVariables, editingId]);

  const loadVariables = async () => {
    try {
      setLoading(true);
      const currentVariables = await window.browserAPI.getCurrentRecordingVariables();
      setVariables(currentVariables || []);
    } catch (error) {
      console.error('Failed to load variables:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (variable: WorkflowVariable) => {
    setEditingId(variable.id);
    setEditName(variable.name);
    setEditValue(String(variable.currentValue || variable.defaultValue || ''));
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    console.log('Saving variable edit:', { editingId, editName, editValue });

    const updatedVariables = variables.map(v =>
      v.id === editingId
        ? {
            ...v,
            name: editName,
            currentValue: editValue,
            isUserEdited: true
          }
        : v
    );

    console.log('Updated variables:', updatedVariables);

    try {
      if (recordingId) {
        console.log('Updating saved recording variables for:', recordingId);
        await window.browserAPI.updateRecordingVariables(recordingId, updatedVariables);
      } else {
        console.log('Updating current recording variables');
        await window.browserAPI.updateCurrentRecordingVariables(updatedVariables);
      }
      setVariables(updatedVariables);
      if (onVariablesChange) {
        if (recordingId) {
          // For saved recordings, just notify that changes were made
          onVariablesChange();
        } else {
          // For current recordings, pass the updated variables
          onVariablesChange(updatedVariables);
        }
      }
      setEditingId(null);
      setEditName('');
      setEditValue('');
      console.log('Variable edit saved successfully');
    } catch (error) {
      console.error('Failed to update variables:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditValue('');
  };

  const handleRemove = async (variableId: string) => {
    const filtered = variables.filter(v => v.id !== variableId);
    
    try {
      if (recordingId) {
        // For saved recordings, send the filtered list (completely removing the variable)
        await window.browserAPI.updateRecordingVariables(recordingId, filtered);
      } else {
        // For current recording, just remove completely
        await window.browserAPI.updateCurrentRecordingVariables(filtered);
      }
      
      setVariables(filtered);
      if (onVariablesChange) {
        if (recordingId) {
          // For saved recordings, just notify that changes were made
          onVariablesChange();
        } else {
          // For current recordings, pass the filtered variables
          onVariablesChange(filtered);
        }
      }
    } catch (error) {
      console.error('Failed to remove variable:', error);
    }
  };

  const getVariableTypeColor = (type: string) => {
    const colors = {
      input: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      select: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      checkbox: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      radio: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      file: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  };

  const getVariableLabel = (variable: WorkflowVariable) => {
    // Prefer label, ariaLabel, placeholder, then name/id
    return (
      variable.label ||
      variable.placeholder ||
      variable.elementName ||
      variable.elementId ||
      variable.name
    );
  };

  const maskValue = (value: string, type: string) => {
    if (!showValues && type === 'input') {
      return '••••••••';
    }
    return value;
  };

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
          <div className="h-20 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (variables.length === 0) {
    return (
      <div className={cn("space-y-4", className)}>
        <div>
          <Label className="text-sm font-medium">Your Variables</Label>
          <p className="text-xs text-muted-foreground mt-1">
            No form fields were detected in this recording
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Your Variables</Label>
          <p className="text-xs text-muted-foreground mt-1">
            {variables.length} form field{variables.length !== 1 ? 's' : ''} detected - customize names and values
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowValues(!showValues)}
          className="h-8 px-2"
        >
          {showValues ? (
            <>
              <EyeOff className="h-3 w-3 mr-1" />
              Hide
            </>
          ) : (
            <>
              <Eye className="h-3 w-3 mr-1" />
              Show
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="space-y-3">
            {variables.map((variable) => (
              <div
                key={variable.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="outline"
                      className={cn("text-xs px-2 py-0.5", getVariableTypeColor(variable.type))}
                    >
                      {variable.type}
                    </Badge>
                    {editingId === variable.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-6 text-sm font-medium"
                        placeholder="Variable name"
                      />
                    ) : (
                      <span className="text-sm font-medium truncate">
                        {variable.name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mb-1">
                    {variable.label || variable.placeholder || variable.elementName || variable.elementId ? (
                      `${variable.label || variable.placeholder || variable.elementName || variable.elementId} field` 
                    ) : null}
                  </div>
                  {editingId === variable.id ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-7 text-xs"
                      placeholder="Default value"
                    />
                  ) : (
                    <div className="text-xs font-mono bg-muted/50 rounded px-2 py-1 truncate">
                      {maskValue(String(variable.currentValue || variable.defaultValue || ''), variable.type)}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 ml-3">
                  {editingId === variable.id ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleSaveEdit}
                        className="h-7 w-7 p-0"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                        className="h-7 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(variable)}
                        className="h-7 w-7 p-0"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(variable.id)}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}