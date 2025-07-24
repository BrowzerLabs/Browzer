#!/usr/bin/env python3
"""
Smart Extension Router for Browzer Extension Framework
Enhanced with Multi-Agent Workflow Orchestration.
Uses semantic similarity and embeddings for intelligent routing.
Completely dynamic - works with any number of extensions (2-100+).
"""

import json
import sys
import os
import re
from typing import Dict, List, Optional, Tuple, Union, Callable
from dataclasses import dataclass
from pathlib import Path
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False

class NumpyJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles NumPy data types"""
    def default(self, obj):
        if NUMPY_AVAILABLE:
            if isinstance(obj, np.integer):
                return int(obj)
            elif isinstance(obj, np.floating):
                return float(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            elif hasattr(obj, 'item'):  # Handle numpy scalars
                return obj.item()
        
        # Handle generic float32 type even without numpy import
        if hasattr(obj, 'item') and str(type(obj)).find('float32') >= 0:
            return float(obj.item())
        
        return super().default(obj)

try:
    from sentence_transformers import SentenceTransformer
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    EMBEDDINGS_AVAILABLE = False
    print("Warning: sentence-transformers not available. Install with: pip install sentence-transformers", file=sys.stderr)

# Import workflow components
try:
    from workflow_analyzer import WorkflowAnalyzer
    from workflow_executor import WorkflowExecutor, WorkflowStep
    WORKFLOW_AVAILABLE = True
except ImportError:
    WORKFLOW_AVAILABLE = False
    print("Warning: Workflow components not available", file=sys.stderr)

@dataclass
class RoutingResult:
    extension_id: str
    confidence: float
    reason: str
    matched_keywords: List[str]
    is_workflow: bool = False
    workflow_info: Optional[Dict] = None

class SmartExtensionRouter:
    def __init__(self, extensions_dir: str, progress_callback: Optional[Callable] = None):
        self.extensions_dir = Path(extensions_dir)
        self.master_config = self._load_master_config()
        self.progress_callback = progress_callback
        
        # Initialize workflow components if available
        if WORKFLOW_AVAILABLE:
            try:
                self.workflow_analyzer = WorkflowAnalyzer(extensions_dir)
                self.workflow_executor = WorkflowExecutor(extensions_dir, progress_callback)
                self.workflow_enabled = True
                print("[SmartRouter] Workflow orchestration enabled", file=sys.stderr)
            except Exception as e:
                print(f"[SmartRouter] Failed to initialize workflow components: {e}", file=sys.stderr)
                self.workflow_enabled = False
        else:
            self.workflow_enabled = False
        
        # Initialize embedding model if available
        if EMBEDDINGS_AVAILABLE:
            try:
                self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
                self.use_embeddings = True
                print("[SmartRouter] Loaded embedding model for semantic similarity", file=sys.stderr)
            except Exception as e:
                print(f"[SmartRouter] Failed to load embedding model: {e}", file=sys.stderr)
                self.use_embeddings = False
        else:
            self.use_embeddings = False
            
        # Precompute extension embeddings if possible
        if self.use_embeddings and self.master_config:
            self._precompute_extension_embeddings()
        
    def _load_master_config(self) -> Optional[Dict]:
        """Load the master.json configuration file from extensions directory"""
        master_file = self.extensions_dir / "master.json"
        
        if not master_file.exists():
            print(f"Warning: master.json not found at {master_file}", file=sys.stderr)
            return None
            
        try:
            with open(master_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                print(f"[SmartRouter] Loaded master.json with {len(config.get('extensions', []))} extensions", file=sys.stderr)
                return config
        except Exception as e:
            print(f"Error loading master.json: {e}", file=sys.stderr)
            return None
    
    def _precompute_extension_embeddings(self):
        """Precompute embeddings for all extensions"""
        self.extension_embeddings = {}
        
        for extension in self.master_config.get('extensions', []):
            if not extension.get('enabled', True):
                continue
                
            # Create comprehensive text representation of the extension
            extension_text = self._create_extension_text(extension)
            
            # Compute embedding
            embedding = self.embedding_model.encode(extension_text)
            self.extension_embeddings[extension['id']] = {
                'embedding': embedding,
                'text': extension_text
            }
            
        print(f"[SmartRouter] Precomputed embeddings for {len(self.extension_embeddings)} extensions", file=sys.stderr)
    
    def _create_extension_text(self, extension: Dict) -> str:
        """Create a comprehensive text representation of an extension for embedding"""
        parts = []
        
        # Core info
        parts.append(f"Name: {extension.get('name', '')}")
        parts.append(f"Description: {extension.get('description', '')}")
        parts.append(f"Category: {extension.get('category', '')}")
        
        # Keywords with emphasis
        keywords = extension.get('keywords', [])
        if keywords:
            parts.append(f"Specializes in: {', '.join(keywords)}")
        
        # Intents with emphasis  
        intents = extension.get('intents', [])
        if intents:
            intent_text = ', '.join(intents).replace('_', ' ')
            parts.append(f"Can help with: {intent_text}")
        
        return '. '.join(parts)
    
    def route_request(self, user_request: str, data: Optional[Dict] = None, routing_only: bool = False) -> Union[RoutingResult, Dict]:
        """Enhanced routing that can handle both single extensions and workflows"""
        if not self.master_config:
            return self._get_fallback_result("Master config not loaded")
        
        enabled_extensions = [
            ext for ext in self.master_config.get('extensions', []) 
            if ext.get('enabled', True)
        ]
        
        if not enabled_extensions:
            return self._get_fallback_result("No enabled extensions found")
        
        # Check if workflow orchestration is needed
        if self.workflow_enabled:
            workflow_result = self._try_workflow_routing(user_request, data or {}, routing_only)
            if workflow_result and workflow_result.get('type') == 'workflow':
                return workflow_result
        
        # Fallback to single extension routing
        print("[SmartRouter] Using single extension routing", file=sys.stderr)
        
        # Use semantic similarity if available, otherwise fallback to enhanced rule-based
        if self.use_embeddings and hasattr(self, 'extension_embeddings'):
            return self._route_with_embeddings(user_request, enabled_extensions)
        else:
            return self._route_with_enhanced_rules(user_request, enabled_extensions)
    
    def _try_workflow_routing(self, user_request: str, data: Dict, routing_only: bool) -> Optional[Dict]:
        """Try to route using workflow orchestration"""
        try:
            # Analyze query for workflow requirements
            analysis = self.workflow_analyzer.analyze_query(user_request)
            
            if analysis.requires_workflow:
                print(f"[SmartRouter] Workflow detected: {' → '.join(analysis.suggested_pipeline)}", file=sys.stderr)
                
                # If routing_only=True, return routing info without execution
                if routing_only:
                    print("[SmartRouter] Routing mode: returning workflow info without execution", file=sys.stderr)
                    return {
                        'type': 'workflow',
                        'success': True,
                        'data': None,  # No execution data
                        'workflow_info': {
                            'pipeline': analysis.suggested_pipeline,
                            'complexity': analysis.complexity,
                            'confidence': analysis.confidence,
                            'reasoning': analysis.reasoning
                        }
                    }
                
                # Execution mode: actually run the workflow
                print("[SmartRouter] Execution mode: running workflow", file=sys.stderr)
                
                # Create workflow steps dynamically
                steps = []
                for i, extension_id in enumerate(analysis.suggested_pipeline):
                    constraints = {}
                    if i == len(analysis.suggested_pipeline) - 1:  # Last step
                        constraints = self._extract_constraints(user_request)
                    
                    step = WorkflowStep(
                        extension_id=extension_id,
                        action='process_page',
                        parameters=constraints,
                        input_source='previous_step' if i > 0 else 'user_query'
                    )
                    steps.append(step)
                
                # Execute the workflow
                result = self.workflow_executor.execute_sequential_workflow(steps, user_request, data)
                
                if result['success']:
                    return {
                        'type': 'workflow',
                        'success': True,
                        'data': result['final_result'],
                        'workflow_info': {
                            'pipeline': analysis.suggested_pipeline,
                            'steps_executed': len(result['results']),
                            'total_time': result['total_time'],
                            'complexity': analysis.complexity,
                            'confidence': analysis.confidence,
                            'reasoning': analysis.reasoning
                        }
                    }
                else:
                    return {
                        'type': 'workflow',
                        'success': False,
                        'error': result['error'],
                        'workflow_info': {
                            'pipeline': analysis.suggested_pipeline,
                            'failed_at_step': len(result['results'])
                        }
                    }
            
            return None  # No workflow needed
            
        except Exception as e:
            print(f"[SmartRouter] Workflow routing failed: {e}", file=sys.stderr)
            return None
    
    def _extract_constraints(self, query: str) -> Dict:
        """Extract constraints like word limits from query"""
        constraints = {}
        query_lower = query.lower()
        
        # Word limits
        word_patterns = [
            r'\bin\s+(\d+)\s+words?\b',
            r'\bunder\s+(\d+)\s+words?\b',
            r'\bmax\s+(\d+)\s+words?\b',
            r'\bsummarize\s+in\s+(\d+)\b',
            r'\blimit\s+to\s+(\d+)\b'
        ]
        
        for pattern in word_patterns:
            match = re.search(pattern, query_lower)
            if match:
                constraints['max_words'] = int(match.group(1))
                constraints['style'] = 'concise'
                break
        
        # Style constraints
        if 'simple' in query_lower or 'explain' in query_lower:
            constraints['style'] = 'simple'
        elif 'detailed' in query_lower or 'comprehensive' in query_lower:
            constraints['style'] = 'detailed'
        
        return constraints
    
    def _route_with_embeddings(self, user_request: str, extensions: List[Dict]) -> RoutingResult:
        """Route using semantic similarity with embeddings"""
        # Encode the user request
        query_embedding = self.embedding_model.encode(user_request)
        
        matches = []
        
        for extension in extensions:
            ext_id = extension['id']
            if ext_id not in self.extension_embeddings:
                continue
                
            ext_embedding = self.extension_embeddings[ext_id]['embedding']
            
            # Calculate cosine similarity
            similarity = np.dot(query_embedding, ext_embedding) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(ext_embedding)
            )
            
            # Apply priority bonus
            priority = extension.get('priority', 5)
            priority_bonus = priority / 100.0
            
            final_score = similarity * (1 + priority_bonus)
            
            matches.append((extension, final_score, similarity, ext_id))
        
        # Sort by final score
        matches.sort(key=lambda x: x[1], reverse=True)
        
        if not matches:
            return self._get_fallback_result("No embeddings available")
        
        best_match = matches[0]
        extension, final_score, raw_similarity, ext_id = best_match
        
        # Check confidence threshold (adjusted for similarity scores)
        threshold = self.master_config.get('routing', {}).get('confidenceThreshold', 0.3)
        similarity_threshold = threshold * 0.5  # Embeddings typically have lower scores
        
        if raw_similarity >= similarity_threshold:
            return RoutingResult(
                extension_id=extension['id'],
                confidence=final_score,
                reason=f"Semantic similarity: {raw_similarity:.3f} (with priority bonus: {final_score:.3f})",
                matched_keywords=[f"semantic_match_{raw_similarity:.3f}"],
                is_workflow=False
            )
        
        return self._get_fallback_result(
            f"Low semantic similarity ({raw_similarity:.3f} < {similarity_threshold:.3f})"
        )
    
    def _route_with_enhanced_rules(self, user_request: str, extensions: List[Dict]) -> RoutingResult:
        """Enhanced rule-based routing with smarter keyword matching"""
        request_lower = user_request.lower()
        matches = []
        
        for extension in extensions:
            score, matched_keywords = self._calculate_enhanced_match_score(request_lower, extension)
            matches.append((extension, score, matched_keywords))
        
        # Sort by score (highest first)
        matches.sort(key=lambda x: x[1], reverse=True)
        
        best_match = matches[0]
        extension, score, matched_keywords = best_match
        
        # Check confidence threshold
        threshold = self.master_config.get('routing', {}).get('confidenceThreshold', 0.3)
        
        if score >= threshold:
            return RoutingResult(
                extension_id=extension['id'],
                confidence=score,
                reason=f"Enhanced matching - Keywords: {', '.join(matched_keywords)}",
                matched_keywords=matched_keywords,
                is_workflow=False
            )
        
        return self._get_fallback_result(
            f"No extension met confidence threshold ({score:.2f} < {threshold})"
        )
    
    def _calculate_enhanced_match_score(self, user_request: str, extension: Dict) -> Tuple[float, List[str]]:
        """Enhanced scoring with better keyword matching and weighting"""
        matched_keywords = []
        score = 0.0
        
        # Extract words from user request
        words = re.findall(r'\b\w+\b', user_request.lower())
        
        # Exact keyword matches with smart weighting
        for keyword in extension.get('keywords', []):
            keyword_lower = keyword.lower()
            
            if keyword_lower in user_request:
                matched_keywords.append(keyword)
                
                # Give higher scores for more specific keywords
                if len(keyword_lower) > 6:  # Longer, more specific keywords
                    score += 2.0
                else:
                    score += 1.0
                
                # Bonus for exact word boundaries
                if f' {keyword_lower} ' in f' {user_request} ':
                    score += 1.0
        
        # Intent matching with better logic
        for intent in extension.get('intents', []):
            intent_words = intent.replace('_', ' ').split()
            intent_matches = 0
            
            for intent_word in intent_words:
                if any(intent_word.lower() == word for word in words):
                    intent_matches += 1
            
            # Score based on how many intent words matched
            if intent_matches > 0:
                matched_keywords.append(intent)
                score += intent_matches * 1.5
        
        # Category bonus (reduced to avoid conflicts)
        category = extension.get('category', '').replace('_', ' ')
        if category.lower() in user_request:
            score += 0.3
        
        # Description overlap (reduced weight)
        description = extension.get('description', '').lower()
        common_words = set(words) & set(re.findall(r'\b\w+\b', description))
        if common_words:
            score += len(common_words) * 0.1
        
        # Apply priority multiplier (reduced impact)
        priority = extension.get('priority', 5)
        score *= (1 + (priority / 200))  # Reduced from /100 to /200
        
        return score, matched_keywords
    
    def _get_fallback_result(self, reason: str) -> RoutingResult:
        """Get fallback routing result - dynamically choose best available extension"""
        # Try to find the best general-purpose extension
        fallback_extension = self._find_best_fallback_extension()
        
        return RoutingResult(
            extension_id=fallback_extension,
            confidence=0.0,
            reason=f"Fallback: {reason}",
            matched_keywords=[],
            is_workflow=False
        )
    
    def _find_best_fallback_extension(self) -> str:
        """Dynamically find the best fallback extension from available extensions"""
        if not self.master_config:
            return 'unknown'
        
        # Look for extensions with general capabilities
        enabled_extensions = [
            ext for ext in self.master_config.get('extensions', []) 
            if ext.get('enabled', True)
        ]
        
        if not enabled_extensions:
            return 'unknown'
        
        # Prefer extensions with high priority and general capabilities
        best_extension = None
        best_score = 0
        
        for ext in enabled_extensions:
            score = ext.get('priority', 5)
            
            # Bonus for general keywords
            keywords = [kw.lower() for kw in ext.get('keywords', [])]
            if any(general_kw in keywords for general_kw in ['general', 'summary', 'help', 'topic', 'content']):
                score += 5
            
            # Bonus for content analysis category
            if ext.get('category', '').lower() in ['content_analysis', 'general', 'utility']:
                score += 3
            
            if score > best_score:
                best_score = score
                best_extension = ext['id']
        
        return best_extension or enabled_extensions[0]['id']
    
    def analyze_query_capabilities(self, user_request: str) -> Dict:
        """Analyze what the router would do with a query (for debugging)"""
        result = {
            'query': user_request,
            'workflow_analysis': None,
            'single_extension_analysis': None
        }
        
        # Workflow analysis
        if self.workflow_enabled:
            try:
                analysis = self.workflow_analyzer.analyze_query(user_request)
                result['workflow_analysis'] = {
                    'requires_workflow': analysis.requires_workflow,
                    'primary_intent': analysis.primary_intent,
                    'secondary_intents': analysis.secondary_intents,
                    'complexity': analysis.complexity,
                    'confidence': analysis.confidence,
                    'suggested_pipeline': analysis.suggested_pipeline,
                    'reasoning': analysis.reasoning
                }
            except Exception as e:
                result['workflow_analysis'] = {'error': str(e)}
        
        # Single extension analysis
        enabled_extensions = [
            ext for ext in self.master_config.get('extensions', []) 
            if ext.get('enabled', True)
        ]
        
        routing_result = self._route_with_enhanced_rules(user_request, enabled_extensions)
        
        result['single_extension_analysis'] = {
            'extension_id': routing_result.extension_id,
            'confidence': routing_result.confidence,
            'reason': routing_result.reason,
            'matched_keywords': routing_result.matched_keywords
        }
        
        return result

def main():
    """CLI interface for the enhanced smart router"""
    if len(sys.argv) < 3:
        print("Usage: python smart_extension_router.py <extensions_dir> <user_request> [--routing-only|analyze]", file=sys.stderr)
        print("Flags: --routing-only (for routing without execution), analyze (for analysis)", file=sys.stderr)
        sys.exit(1)
    
    extensions_dir = sys.argv[1]
    
    # Parse command line arguments for flags
    routing_only = '--routing-only' in sys.argv
    is_analyze = 'analyze' in sys.argv
    
    # Extract user request (everything except the extensions_dir and flags)
    user_request_parts = []
    for arg in sys.argv[2:]:
        if arg not in ['--routing-only', 'analyze']:
            user_request_parts.append(arg)
    user_request = " ".join(user_request_parts)
    
    print(f"[SmartRouter] Routing only mode: {routing_only}", file=sys.stderr)
    print(f"[SmartRouter] User request: {user_request}", file=sys.stderr)
    
    router = SmartExtensionRouter(extensions_dir)
    
    if is_analyze:
        result = router.analyze_query_capabilities(user_request)
        print(json.dumps(result, indent=2, cls=NumpyJSONEncoder))
        return
    
    # Check if workflow data is provided via environment variable
    workflow_data_str = os.environ.get('WORKFLOW_DATA')
    
    print(f"[SmartRouter] WORKFLOW_DATA env var present: {workflow_data_str is not None}", file=sys.stderr)
    if workflow_data_str:
        print(f"[SmartRouter] WORKFLOW_DATA length: {len(workflow_data_str)}", file=sys.stderr)
        print(f"[SmartRouter] WORKFLOW_DATA preview: {workflow_data_str[:200]}...", file=sys.stderr)
    
    if workflow_data_str:
        # Workflow data available - use routing_only flag to decide execution
        try:
            workflow_data = json.loads(workflow_data_str)
            print(f"[SmartRouter] Successfully parsed workflow data with keys: {list(workflow_data.keys())}", file=sys.stderr)
            print(f"[SmartRouter] browserApiKeys present: {'browserApiKeys' in workflow_data}", file=sys.stderr)
            if 'browserApiKeys' in workflow_data:
                api_keys = workflow_data['browserApiKeys']
                print(f"[SmartRouter] Available API providers: {list(api_keys.keys())}", file=sys.stderr)
                # Don't log actual keys, just check if they exist and aren't test keys
                for provider, key in api_keys.items():
                    is_test_key = key == 'test-key'
                    has_real_key = key and len(key) > 10 and not is_test_key
                    if key:
                        masked_key = key[:8] + "..." + key[-4:] if len(key) > 12 else "short_key"
                        print(f"[SmartRouter] {provider}: {masked_key} (length: {len(key)}) {'✅' if has_real_key else '❌'}", file=sys.stderr)
                    else:
                        print(f"[SmartRouter] {provider}: EMPTY or None ❌", file=sys.stderr)
            
            # Use the routing_only flag to determine whether to execute or just route
            print(f"[SmartRouter] Calling route_request with routing_only={routing_only}", file=sys.stderr)
            result = router.route_request(user_request, workflow_data, routing_only=routing_only)
            
            # Ensure proper JSON output format for main process
            if isinstance(result, dict) and result.get('type') == 'workflow':
                # Workflow result - format for main process
                output = {
                    'success': result.get('success', False),
                    'type': 'workflow',
                    'data': result.get('data', {}),
                    'workflow_info': result.get('workflow_info', {}),
                    'error': result.get('error')
                }
            else:
                # Single extension result - format for main process
                output = {
                    'success': True,
                    'type': 'single_extension', 
                    'data': {
                        'extensionId': result.extension_id,
                        'confidence': result.confidence,
                        'reason': result.reason,
                        'matchedKeywords': result.matched_keywords,
                        'isWorkflow': result.is_workflow
                    }
                }
            
            print(json.dumps(output, cls=NumpyJSONEncoder))
            
        except json.JSONDecodeError as e:
            print(f"[SmartRouter] JSON decode error: {e}", file=sys.stderr)
            error_result = {
                'success': False,
                'error': f'Failed to parse workflow data: {e}',
                'type': 'error'
            }
            print(json.dumps(error_result, cls=NumpyJSONEncoder))
        except Exception as e:
            print(f"[SmartRouter] Workflow execution error: {e}", file=sys.stderr)
            error_result = {
                'success': False,
                'error': f'Workflow execution failed: {e}',
                'type': 'error'
            }
            print(json.dumps(error_result, cls=NumpyJSONEncoder))
    else:
        # No workflow data - always routing only mode
        print(f"[SmartRouter] No workflow data - using routing-only mode", file=sys.stderr)
        test_data = {
            'query': user_request,
            'pageContent': None,
            'browserApiKeys': {'anthropic': 'test-key'},
            'selectedProvider': 'anthropic',
            'selectedModel': 'claude-3-7-sonnet-latest',
            'isQuestion': True,
            'conversationHistory': []
        }
        
        # Only route, don't execute (routing_only=True)
        result = router.route_request(user_request, test_data, routing_only=True)
        
        if isinstance(result, dict) and result.get('type') == 'workflow':
            # Workflow routing result - no execution data
            print(json.dumps(result, indent=2, cls=NumpyJSONEncoder))
        else:
            # Single extension result
            output = {
                "extensionId": result.extension_id,
                "confidence": result.confidence,
                "reason": result.reason,
                "matchedKeywords": result.matched_keywords,
                "isWorkflow": result.is_workflow,
                "workflowInfo": result.workflow_info
            }
            print(json.dumps(output, indent=2, cls=NumpyJSONEncoder))

if __name__ == "__main__":
    main() 