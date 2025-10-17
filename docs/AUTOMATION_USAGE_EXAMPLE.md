# Automation Usage Example

## Renderer-Side Implementation Example

This document shows how to use the LLM automation system from the renderer (React/UI) side.

## Basic Usage

### 1. Initialize Automation Service

```typescript
// In your settings or initialization component
const initializeAutomation = async (apiKey: string) => {
  const result = await window.electronAPI.invoke('automation:initialize', apiKey);
  
  if (result.success) {
    console.log('Automation service initialized');
  } else {
    console.error('Failed to initialize:', result.error);
  }
};
```

### 2. Execute Automation

```typescript
import { RecordingSession, AutomationResult } from '@/shared/types';

const executeAutomation = async (
  userPrompt: string,
  recordingSession: RecordingSession,
  apiKey: string
) => {
  // Set up progress listener
  const progressHandler = (data: any) => {
    const { step, index, total } = data;
    console.log(`Step ${index + 1}/${total}: ${step.description}`);
    console.log(`Status: ${step.status}`);
    
    // Update UI with progress
    setProgress({
      current: index + 1,
      total: total,
      step: step.description,
      status: step.status
    });
  };
  
  window.electronAPI.on('automation:progress', progressHandler);
  
  try {
    const result: AutomationResult = await window.electronAPI.invoke('automation:execute', {
      userPrompt,
      recordingSession,
      apiKey
    });
    
    if (result.success) {
      console.log('Automation completed successfully!');
      console.log(`Completed ${result.plan.completedSteps}/${result.plan.steps.length} steps`);
      console.log(`Duration: ${result.executionTime}ms`);
    } else {
      console.error('Automation failed:', result.error);
      console.log(`Failed steps: ${result.plan.failedSteps}`);
    }
    
    return result;
  } finally {
    // Clean up listener
    window.electronAPI.removeListener('automation:progress', progressHandler);
  }
};
```

### 3. React Component Example

```typescript
import React, { useState } from 'react';
import { RecordingSession, AutomationResult } from '@/shared/types';

interface AutomationPanelProps {
  recordings: RecordingSession[];
  apiKey: string;
}

export const AutomationPanel: React.FC<AutomationPanelProps> = ({ recordings, apiKey }) => {
  const [selectedRecording, setSelectedRecording] = useState<RecordingSession | null>(null);
  const [userPrompt, setUserPrompt] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, step: '', status: '' });
  const [result, setResult] = useState<AutomationResult | null>(null);

  const handleExecute = async () => {
    if (!selectedRecording || !userPrompt) {
      alert('Please select a recording and enter a prompt');
      return;
    }

    setIsExecuting(true);
    setResult(null);

    // Set up progress listener
    const progressHandler = (data: any) => {
      setProgress({
        current: data.index + 1,
        total: data.total,
        step: data.step.description,
        status: data.step.status
      });
    };

    window.electronAPI.on('automation:progress', progressHandler);

    try {
      const automationResult = await window.electronAPI.invoke('automation:execute', {
        userPrompt,
        recordingSession: selectedRecording,
        apiKey
      });

      setResult(automationResult);
    } catch (error) {
      console.error('Automation error:', error);
      alert('Automation failed: ' + (error as Error).message);
    } finally {
      setIsExecuting(false);
      window.electronAPI.removeListener('automation:progress', progressHandler);
    }
  };

  const handleCancel = async () => {
    await window.electronAPI.invoke('automation:cancel');
    setIsExecuting(false);
  };

  return (
    <div className="automation-panel">
      <h2>Browser Automation</h2>

      {/* Recording Selection */}
      <div className="recording-selector">
        <label>Select Recording:</label>
        <select 
          value={selectedRecording?.id || ''} 
          onChange={(e) => {
            const recording = recordings.find(r => r.id === e.target.value);
            setSelectedRecording(recording || null);
          }}
          disabled={isExecuting}
        >
          <option value="">-- Select a recording --</option>
          {recordings.map(recording => (
            <option key={recording.id} value={recording.id}>
              {recording.name} ({recording.actionCount} actions)
            </option>
          ))}
        </select>
      </div>

      {/* User Prompt */}
      <div className="prompt-input">
        <label>What do you want to automate?</label>
        <textarea
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          placeholder="E.g., Create a repository called 'my-awesome-project'"
          disabled={isExecuting}
          rows={3}
        />
      </div>

      {/* Action Buttons */}
      <div className="actions">
        {!isExecuting ? (
          <button onClick={handleExecute} disabled={!selectedRecording || !userPrompt}>
            Execute Automation
          </button>
        ) : (
          <button onClick={handleCancel} className="cancel">
            Cancel
          </button>
        )}
      </div>

      {/* Progress Display */}
      {isExecuting && (
        <div className="progress">
          <h3>Executing Automation...</h3>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <p>Step {progress.current}/{progress.total}: {progress.step}</p>
          <p className={`status status-${progress.status}`}>
            Status: {progress.status}
          </p>
        </div>
      )}

      {/* Results Display */}
      {result && (
        <div className={`result ${result.success ? 'success' : 'error'}`}>
          <h3>{result.success ? '✅ Automation Completed' : '❌ Automation Failed'}</h3>
          <div className="result-details">
            <p>Completed Steps: {result.plan.completedSteps}/{result.plan.steps.length}</p>
            <p>Failed Steps: {result.plan.failedSteps}</p>
            <p>Duration: {(result.executionTime / 1000).toFixed(2)}s</p>
            {result.error && <p className="error-message">Error: {result.error}</p>}
          </div>

          {/* Step Details */}
          <div className="steps-list">
            <h4>Execution Steps:</h4>
            {result.plan.steps.map((step, index) => (
              <div key={step.id} className={`step step-${step.status}`}>
                <span className="step-number">{index + 1}</span>
                <span className="step-description">{step.description}</span>
                <span className={`step-status status-${step.status}`}>
                  {step.status === 'completed' ? '✓' : 
                   step.status === 'failed' ? '✗' : 
                   step.status === 'running' ? '⟳' : '○'}
                </span>
                {step.error && <p className="step-error">{step.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

### 4. CSS Styling Example

```css
.automation-panel {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.recording-selector,
.prompt-input {
  margin-bottom: 20px;
}

.recording-selector label,
.prompt-input label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}

.recording-selector select,
.prompt-input textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.prompt-input textarea {
  resize: vertical;
  font-family: inherit;
}

.actions {
  margin-bottom: 20px;
}

.actions button {
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: #0066cc;
  color: white;
}

.actions button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.actions button.cancel {
  background: #cc0000;
}

.progress {
  background: #f5f5f5;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.progress-bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin: 10px 0;
}

.progress-fill {
  height: 100%;
  background: #0066cc;
  transition: width 0.3s ease;
}

.result {
  padding: 20px;
  border-radius: 8px;
  margin-top: 20px;
}

.result.success {
  background: #e8f5e9;
  border: 1px solid #4caf50;
}

.result.error {
  background: #ffebee;
  border: 1px solid #f44336;
}

.steps-list {
  margin-top: 20px;
}

.step {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: white;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
}

.step-number {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
}

.step-description {
  flex: 1;
}

.step-status {
  font-size: 18px;
}

.step.step-completed {
  border-color: #4caf50;
}

.step.step-failed {
  border-color: #f44336;
}

.step-error {
  width: 100%;
  margin-top: 8px;
  padding: 8px;
  background: #ffebee;
  border-radius: 4px;
  font-size: 12px;
  color: #c62828;
}

.status-completed {
  color: #4caf50;
}

.status-failed {
  color: #f44336;
}

.status-running {
  color: #ff9800;
}

.status-pending {
  color: #9e9e9e;
}
```

## Advanced Usage

### Generate Plan Without Executing

```typescript
const generatePlan = async (userPrompt: string, recordingSession: RecordingSession) => {
  const response = await window.electronAPI.invoke('automation:generate-plan', 
    userPrompt, 
    recordingSession
  );
  
  if (response.success && response.steps) {
    console.log('Generated plan with', response.steps.length, 'steps');
    console.log('Token usage:', response.tokensUsed);
    
    // Display steps to user for review
    response.steps.forEach((step, index) => {
      console.log(`${index + 1}. ${step.description}`);
    });
    
    return response.steps;
  } else {
    console.error('Plan generation failed:', response.error);
    return null;
  }
};
```

### Check Automation Status

```typescript
const checkStatus = async () => {
  const status = await window.electronAPI.invoke('automation:get-status');
  
  console.log('Is executing:', status.isExecuting);
  if (status.currentPlan) {
    console.log('Current plan:', status.currentPlan.id);
    console.log('Progress:', status.currentPlan.completedSteps, '/', status.currentPlan.steps.length);
  }
  
  return status;
};
```

### Store API Key Securely

```typescript
// Use electron-store or similar for persistent storage
const saveApiKey = async (apiKey: string) => {
  // Initialize automation service
  await window.electronAPI.invoke('automation:initialize', apiKey);
  
  // Store in settings (encrypted by electron-store)
  await window.electronAPI.invoke('settings:update', 'automation', 'apiKey', apiKey);
};

const loadApiKey = async () => {
  const settings = await window.electronAPI.invoke('settings:get-category', 'automation');
  return settings?.apiKey || '';
};
```

## TypeScript Types

Make sure to import types from shared:

```typescript
import {
  RecordingSession,
  AutomationResult,
  AutomationPlan,
  AutomationStep,
  LLMAutomationRequest,
  LLMAutomationResponse
} from '@/shared/types';
```

## Error Handling

```typescript
const executeWithErrorHandling = async (
  userPrompt: string,
  recordingSession: RecordingSession,
  apiKey: string
) => {
  try {
    const result = await window.electronAPI.invoke('automation:execute', {
      userPrompt,
      recordingSession,
      apiKey
    });
    
    if (!result.success) {
      // Handle automation failure
      if (result.error?.includes('API key')) {
        alert('Invalid API key. Please check your Anthropic API key.');
      } else if (result.error?.includes('No active tab')) {
        alert('Please open a tab before running automation.');
      } else {
        alert(`Automation failed: ${result.error}`);
      }
    }
    
    return result;
  } catch (error) {
    // Handle IPC or network errors
    console.error('Automation error:', error);
    alert('Failed to execute automation. Please try again.');
    return null;
  }
};
```

## Best Practices

1. **Always initialize** the automation service with API key before use
2. **Clean up listeners** after automation completes
3. **Show progress** to users during execution
4. **Handle errors gracefully** with user-friendly messages
5. **Store API keys securely** using electron-store
6. **Validate inputs** before sending to main process
7. **Provide feedback** on each step's status
8. **Allow cancellation** for long-running automations

## Testing

```typescript
// Test automation with a simple recording
const testAutomation = async () => {
  const testRecording: RecordingSession = {
    id: 'test-1',
    name: 'Test Recording',
    actions: [
      {
        type: 'navigate',
        timestamp: Date.now(),
        url: 'https://example.com',
        verified: true
      }
    ],
    createdAt: Date.now(),
    duration: 5000,
    actionCount: 1,
    url: 'https://example.com'
  };
  
  const result = await executeAutomation(
    'Navigate to example.com',
    testRecording,
    'your-api-key'
  );
  
  console.log('Test result:', result);
};
```
