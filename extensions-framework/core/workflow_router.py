#!/usr/bin/env python3
"""
Enhanced Extension Router with Multi-Agent Workflow Orchestration
"""

import json
import sys
import os
import re
from typing import Dict, List, Optional
from pathlib import Path
import numpy as np

class NumpyJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles NumPy data types"""
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif hasattr(obj, 'item'):  # Handle numpy scalars
            return obj.item()
        return super().default(obj)

# Import our custom modules
from workflow_analyzer import WorkflowAnalyzer, WorkflowAnalysis
from workflow_executor import WorkflowExecutor, WorkflowStep

class WorkflowRouter:
    """Enhanced router for single extensions and multi-agent workflows"""
    
    def __init__(self, extensions_dir: str):
        self.extensions_dir = Path(extensions_dir)
        self.workflow_analyzer = WorkflowAnalyzer(extensions_dir)
        self.workflow_executor = WorkflowExecutor(extensions_dir)
        
        print(f"[WorkflowRouter] Initialized with {len(self.workflow_analyzer.available_extensions)} extensions", file=sys.stderr)
    
    def route_request(self, query: str, data: Dict) -> Dict:
        """Main routing function"""
        print(f"[WorkflowRouter] Routing request: {query}", file=sys.stderr)
        
        # Analyze the query
        analysis = self.workflow_analyzer.analyze_query(query)
        
        if analysis.requires_workflow:
            return self._execute_workflow(analysis, query, data)
        else:
            return self._route_single_extension(analysis, query, data)
    
    def _execute_workflow(self, analysis: WorkflowAnalysis, query: str, data: Dict) -> Dict:
        """Execute a multi-agent workflow"""
        print(f"[WorkflowRouter] Executing workflow: {' → '.join(analysis.suggested_pipeline)}", file=sys.stderr)
        
        # Create workflow steps
        steps = []
        for i, extension_id in enumerate(analysis.suggested_pipeline):
            constraints = {}
            if i == len(analysis.suggested_pipeline) - 1:  # Last step
                constraints = self._extract_constraints(query)
            
            step = WorkflowStep(
                extension_id=extension_id,
                action='process_page',
                parameters=constraints,
                input_source='previous_step' if i > 0 else 'user_query'
            )
            steps.append(step)
        
        # Execute the workflow
        result = self.workflow_executor.execute_sequential_workflow(steps, query, data)
        
        if result['success']:
            return {
                'success': True,
                'type': 'workflow',
                'data': result['final_result'],
                'workflow_info': {
                    'pipeline': analysis.suggested_pipeline,
                    'steps_executed': len(result['results']),
                    'total_time': result['total_time']
                }
            }
        else:
            return {
                'success': False,
                'type': 'workflow',
                'error': result['error'],
                'workflow_info': {
                    'pipeline': analysis.suggested_pipeline
                }
            }
    
    def _route_single_extension(self, analysis: WorkflowAnalysis, query: str, data: Dict) -> Dict:
        """Route to a single extension"""
        best_extension = self._find_best_extension(analysis.primary_intent, query)
        
        if not best_extension:
            return {
                'success': False,
                'type': 'single_extension',
                'error': f"No suitable extension found for: {analysis.primary_intent}"
            }
        
        # Execute single extension
        step = WorkflowStep(
            extension_id=best_extension,
            action='process_page',
            parameters=self._extract_constraints(query),
            input_source='user_query'
        )
        
        result = self.workflow_executor.execute_sequential_workflow([step], query, data)
        
        if result['success']:
            return {
                'success': True,
                'type': 'single_extension',
                'data': result['final_result'],
                'extension_info': {
                    'extension_id': best_extension,
                    'execution_time': result['total_time']
                }
            }
        else:
            return {
                'success': False,
                'type': 'single_extension',
                'error': result['error']
            }
    
    def _find_best_extension(self, intent: str, query: str) -> Optional[str]:
        """Find the best extension for an intent"""
        best_extension = None
        best_score = 0
        
        query_lower = query.lower()
        
        for ext_id, ext_data in self.workflow_analyzer.available_extensions.items():
            score = 0
            
            # Category match
            if ext_data['category'] == intent:
                score += 5.0
            
            # Keyword matches
            for keyword in ext_data['keywords']:
                if keyword in query_lower:
                    score += 2.0
            
            # Intent matches
            for ext_intent in ext_data['intents']:
                if ext_intent == intent:
                    score += 3.0
            
            if score > best_score:
                best_score = score
                best_extension = ext_id
        
        return best_extension
    
    def _extract_constraints(self, query: str) -> Dict:
        """Extract constraints from query"""
        constraints = {}
        query_lower = query.lower()
        
        # Word limits
        word_patterns = [
            r'\bin\s+(\d+)\s+words?\b',
            r'\bmax\s+(\d+)\s+words?\b',
            r'\bsummarize\s+in\s+(\d+)\b'
        ]
        
        for pattern in word_patterns:
            match = re.search(pattern, query_lower)
            if match:
                constraints['max_words'] = int(match.group(1))
                break
        
        return constraints
    
    def analyze_query_capabilities(self, query: str) -> Dict:
        """Analyze what the router would do with a query"""
        analysis = self.workflow_analyzer.analyze_query(query)
        
        return {
            'query': query,
            'requires_workflow': analysis.requires_workflow,
            'primary_intent': analysis.primary_intent,
            'secondary_intents': analysis.secondary_intents,
            'complexity': analysis.complexity,
            'confidence': analysis.confidence,
            'suggested_pipeline': analysis.suggested_pipeline,
            'reasoning': analysis.reasoning
        }

def main():
    """Test the workflow router"""
    if len(sys.argv) < 3:
        print("Usage: python workflow_router.py <extensions_dir> <query> [analyze]")
        sys.exit(1)
    
    extensions_dir = sys.argv[1]
    query = sys.argv[2]
    analyze_only = len(sys.argv) > 3 and sys.argv[3] == 'analyze'
    
    router = WorkflowRouter(extensions_dir)
    
    if analyze_only:
        result = router.analyze_query_capabilities(query)
        print(json.dumps(result, indent=2, cls=NumpyJSONEncoder))
    else:
        test_data = {
            'query': query,
            'pageContent': None,
            'browserApiKeys': {},  # Empty - should be provided by caller
            'selectedProvider': 'anthropic',
            'selectedModel': 'claude-3-7-sonnet-latest'
        }
        
        result = router.route_request(query, test_data)
        print(json.dumps(result, indent=2, cls=NumpyJSONEncoder))

if __name__ == "__main__":
    main() 