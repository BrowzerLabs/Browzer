#!/usr/bin/env python3
"""
Extension-Agnostic Workflow Executor with Real-time Progress Events
"""

import json
import sys
import os
import time
import uuid
import subprocess
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass
from pathlib import Path

@dataclass
class WorkflowStep:
    extension_id: str
    action: str
    parameters: Dict[str, Any]
    input_source: str

@dataclass
class WorkflowPlan:
    id: str
    type: str  # 'sequential', 'parallel', 'conditional'
    steps: List[WorkflowStep]
    estimated_time: float
    complexity: str
    confidence: float

@dataclass
class StepResult:
    extension_id: str
    success: bool
    data: Dict[str, Any]
    execution_time: float
    error: Optional[str] = None

@dataclass
class WorkflowResult:
    workflow_id: str
    success: bool
    final_output: Dict[str, Any]
    steps_executed: List[StepResult]
    total_execution_time: float
    error: Optional[str] = None

class WorkflowContext:
    def __init__(self, workflow_id: str, user_query: str, original_data: Dict):
        self.workflow_id = workflow_id
        self.user_query = user_query
        self.original_data = original_data
        self.step_results = {}
        self.current_step = 0
        self.start_time = time.time()
    
    def add_step_result(self, extension_id: str, result: StepResult):
        """Add result from a workflow step"""
        self.step_results[extension_id] = result
        self.current_step += 1
    
    def get_previous_results(self) -> Dict[str, Any]:
        """Get all previous step results for context"""
        return {ext_id: result.data for ext_id, result in self.step_results.items()}
    
    def get_last_result(self) -> Optional[Dict[str, Any]]:
        """Get the result from the most recent step"""
        if not self.step_results:
            return None
        
        last_result = max(self.step_results.values(), key=lambda r: r.execution_time)
        return last_result.data
    
    def build_extension_context(self, extension_id: str, step: WorkflowStep) -> Dict[str, Any]:
        """Build context data for a specific extension"""
        return {
            'workflow_context': {
                'workflow_id': self.workflow_id,
                'step_number': self.current_step,
                'total_steps': None,  # Will be set by executor
                'user_query': self.user_query
            },
            'previous_results': self.get_previous_results(),
            'current_task': {
                'action': step.action,
                'parameters': step.parameters,
                'input_source': step.input_source
            }
        }

class WorkflowExecutor:
    def __init__(self, extensions_dir: str, progress_callback: Optional[Callable] = None):
        self.extensions_dir = Path(extensions_dir)
        self.python_executable = sys.executable
        self.progress_callback = progress_callback
    
    def execute_sequential_workflow(self, steps: List[WorkflowStep], user_query: str, data: Dict[str, Any]) -> Dict:
        """Execute a sequential workflow with real-time progress updates"""
        workflow_id = str(uuid.uuid4())
        print(f"[WorkflowExecutor] Starting workflow {workflow_id} with {len(steps)} steps", file=sys.stderr)
        
        # Emit workflow start event
        self._emit_progress('workflow_start', {
            'workflow_id': workflow_id,
            'type': 'workflow' if len(steps) > 1 else 'single_extension',
            'total_steps': len(steps),
            'steps': [{'extension_id': step.extension_id, 'extension_name': self._get_extension_name(step.extension_id)} for step in steps]
        })
        
        current_data = data.copy()
        results = []
        start_time = time.time()
        
        for i, step in enumerate(steps):
            print(f"[WorkflowExecutor] Executing step {i+1}/{len(steps)}: {step.extension_id}", file=sys.stderr)
            
            # Emit step start event
            self._emit_progress('step_start', {
                'workflow_id': workflow_id,
                'current_step': i,
                'step_status': 'running',
                'extension_id': step.extension_id,
                'extension_name': self._get_extension_name(step.extension_id)
            })
            
            # Execute the step
            step_result = self._execute_step(step, current_data, user_query, i, len(steps))
            results.append(step_result)
            
            if not step_result.success:
                # Emit step failure event
                self._emit_progress('step_complete', {
                    'workflow_id': workflow_id,
                    'current_step': i,
                    'step_status': 'failed',
                    'step_error': step_result.error
                })
                
                # Emit workflow failure event
                self._emit_progress('workflow_error', {
                    'workflow_id': workflow_id,
                    'error': f"Step {step.extension_id} failed: {step_result.error}",
                    'failed_at_step': i
                })
                
                return {
                    'success': False,
                    'error': f"Step {step.extension_id} failed: {step_result.error}",
                    'results': results,
                    'total_time': time.time() - start_time,
                    'workflow_id': workflow_id
                }
            
            # Emit step completion event
            self._emit_progress('step_complete', {
                'workflow_id': workflow_id,
                'current_step': i,
                'step_status': 'completed',
                'step_result': step_result.data,
                'execution_time': step_result.execution_time
            })
            
            # Use result for next step while preserving workflow data
            # Preserve essential workflow data (API keys, provider, etc.)
            preserved_data = {
                'browserApiKeys': data.get('browserApiKeys', {}),
                'selectedProvider': data.get('selectedProvider', 'anthropic'),
                'selectedModel': data.get('selectedModel', 'claude-3-7-sonnet-latest'),
                'isQuestion': data.get('isQuestion', False),
                'conversationHistory': data.get('conversationHistory', [])
            }
            
            # Merge step result with preserved workflow data
            current_data = {**preserved_data, **step_result.data}
            
            # Ensure the query is updated if the step produced new content
            if 'query' in step_result.data:
                current_data['query'] = step_result.data['query']
            
            print(f"[WorkflowExecutor] Preserved API keys for next step: {list(preserved_data.get('browserApiKeys', {}).keys())}", file=sys.stderr)
        
        # Emit workflow completion event
        self._emit_progress('workflow_complete', {
            'workflow_id': workflow_id,
            'result': current_data,
            'total_steps': len(steps),
            'total_time': time.time() - start_time
        })
        
        return {
            'success': True,
            'final_result': current_data,
            'results': results,
            'total_time': time.time() - start_time,
            'workflow_id': workflow_id
        }
    
    def _execute_step(self, step: WorkflowStep, data: Dict[str, Any], user_query: str, step_num: int, total_steps: int) -> StepResult:
        """Execute a single workflow step"""
        start_time = time.time()
        
        try:
            # Find extension script
            extension_script = self._find_extension_script(step.extension_id)
            if not extension_script:
                return StepResult(
                    extension_id=step.extension_id,
                    success=False,
                    data={},
                    execution_time=time.time() - start_time,
                    error=f"Extension script not found for {step.extension_id}"
                )
            
            # Build input data
            input_data = self._build_input_data(step, data, user_query, step_num, total_steps)
            
            # Execute extension
            result = self._run_extension(extension_script, input_data)
            
            execution_time = time.time() - start_time
            
            if result.get('success', False):
                return StepResult(
                    extension_id=step.extension_id,
                    success=True,
                    data=result.get('data', {}),
                    execution_time=execution_time
                )
            else:
                return StepResult(
                    extension_id=step.extension_id,
                    success=False,
                    data={},
                    execution_time=execution_time,
                    error=result.get('error', 'Unknown error')
                )
        
        except Exception as e:
            return StepResult(
                extension_id=step.extension_id,
                success=False,
                data={},
                execution_time=time.time() - start_time,
                error=str(e)
            )
    
    def _build_input_data(self, step: WorkflowStep, data: Dict, user_query: str, step_num: int, total_steps: int) -> Dict:
        """Build input data for extension"""
        input_data = data.copy()
        
        # Add workflow context
        input_data['workflow_context'] = {
            'step_number': step_num + 1,
            'total_steps': total_steps,
            'user_query': user_query,
            'is_workflow': total_steps > 1,
            'extension_id': step.extension_id
        }
        
        # Add step parameters
        if step.parameters:
            input_data.setdefault('parameters', {}).update(step.parameters)
        
        return input_data
    
    def _find_extension_script(self, extension_id: str) -> Optional[Path]:
        """Find the Python script for an extension"""
        extension_dirs = [d for d in self.extensions_dir.iterdir() if d.is_dir()]
        
        for ext_dir in extension_dirs:
            manifest_file = ext_dir / 'manifest.json'
            if manifest_file.exists():
                try:
                    with open(manifest_file, 'r') as f:
                        manifest = json.load(f)
                        if manifest.get('id') == extension_id:
                            main_script = manifest.get('main', f"{extension_id.replace('-', '_')}.py")
                            script_path = ext_dir / main_script
                            if script_path.exists():
                                return script_path
                except Exception:
                    continue
        
        return None
    
    def _get_extension_name(self, extension_id: str) -> str:
        """Get the display name for an extension"""
        extension_dirs = [d for d in self.extensions_dir.iterdir() if d.is_dir()]
        
        for ext_dir in extension_dirs:
            manifest_file = ext_dir / 'manifest.json'
            if manifest_file.exists():
                try:
                    with open(manifest_file, 'r') as f:
                        manifest = json.load(f)
                        if manifest.get('id') == extension_id:
                            return manifest.get('name', extension_id)
                except Exception:
                    continue
        
        return extension_id
    
    def _run_extension(self, script_path: Path, input_data: Dict) -> Dict:
        """Execute an extension script"""
        print(f"[WorkflowExecutor] Running extension: {script_path}", file=sys.stderr)
        print(f"[WorkflowExecutor] Input data keys: {list(input_data.keys())}", file=sys.stderr)
        
        try:
            input_json = json.dumps({
                'context': {
                    'browser_api_keys': input_data.get('browserApiKeys', {}),
                    'selected_provider': input_data.get('selectedProvider', 'anthropic'),
                    'selected_model': input_data.get('selectedModel', 'claude-3-7-sonnet-latest')
                },
                'action': 'process_page',
                'data': {
                    'query': input_data.get('query', ''),
                    'pageContent': input_data.get('pageContent'),
                    'isQuestion': input_data.get('isQuestion', False),
                    'conversationHistory': input_data.get('conversationHistory', [])
                },
                'workflow_context': input_data.get('workflow_context'),
                'parameters': input_data.get('parameters', {})
            })
            
            # Debug logging
            api_keys = input_data.get('browserApiKeys', {})
            print(f"[WorkflowExecutor] API Keys available: {list(api_keys.keys())}", file=sys.stderr)
            print(f"[WorkflowExecutor] Selected provider: {input_data.get('selectedProvider', 'Not set')}", file=sys.stderr)
            print(f"[WorkflowExecutor] Page content length: {len(str(input_data.get('pageContent', '')))}", file=sys.stderr)
            print(f"[WorkflowExecutor] Query: {input_data.get('query', 'No query')[:100]}...", file=sys.stderr)
            
            print(f"[WorkflowExecutor] Executing: {self.python_executable} {script_path}", file=sys.stderr)
            
            process = subprocess.Popen(
                [self.python_executable, str(script_path)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            stdout, stderr = process.communicate(input=input_json, timeout=60)
            
            print(f"[WorkflowExecutor] Extension exit code: {process.returncode}", file=sys.stderr)
            print(f"[WorkflowExecutor] Extension stdout length: {len(stdout)}", file=sys.stderr)
            print(f"[WorkflowExecutor] Extension stderr length: {len(stderr)}", file=sys.stderr)
            
            if stderr:
                print(f"[WorkflowExecutor] Extension stderr: {stderr[:1000]}", file=sys.stderr)
            
            if process.returncode != 0:
                print(f"[WorkflowExecutor] Extension failed with code {process.returncode}", file=sys.stderr)
                return {
                    'success': False,
                    'error': f"Extension failed: {stderr}"
                }
            
            if not stdout.strip():
                print(f"[WorkflowExecutor] Extension returned empty output", file=sys.stderr)
                return {
                    'success': False,
                    'error': "Extension returned empty output"
                }
            
            try:
                print(f"[WorkflowExecutor] Raw extension output: {stdout[:500]}...", file=sys.stderr)
                result = json.loads(stdout)
                print(f"[WorkflowExecutor] Extension output parsed successfully", file=sys.stderr)
                if isinstance(result, dict):
                    print(f"[WorkflowExecutor] Output keys: {list(result.keys())}", file=sys.stderr)
                return result
            except json.JSONDecodeError as e:
                print(f"[WorkflowExecutor] JSON parse error: {e}", file=sys.stderr)
                return {
                    'success': False,
                    'error': f"Invalid JSON output: {stdout[:200]}"
                }
        
        except subprocess.TimeoutExpired:
            print(f"[WorkflowExecutor] Extension execution timed out", file=sys.stderr)
            return {
                'success': False,
                'error': "Extension timed out"
            }
        except Exception as e:
            print(f"[WorkflowExecutor] Extension execution exception: {str(e)}", file=sys.stderr)
            return {
                'success': False,
                'error': f"Execution failed: {str(e)}"
            }
    
    def _emit_progress(self, event_type: str, data: Dict):
        """Emit progress event via callback or print to stderr for IPC"""
        event = {
            'type': event_type,
            'timestamp': time.time(),
            'data': data
        }
        
        if self.progress_callback:
            self.progress_callback(event)
        else:
            # Print to stderr for IPC pickup by main process
            print(f"WORKFLOW_PROGRESS: {json.dumps(event)}", file=sys.stderr, flush=True)

def main():
    """Test the workflow executor"""
    print("Workflow executor with progress events created successfully")

if __name__ == "__main__":
    main() 