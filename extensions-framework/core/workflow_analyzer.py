#!/usr/bin/env python3
"""
Extension-Agnostic Workflow Analyzer
Dynamically detects multi-step queries and plans workflows using ANY available extensions.
Completely dynamic - works with 2 extensions or 100+ extensions.
"""

import json
import re
import os
import sys
from typing import Dict, List, Optional, Tuple, Set
from dataclasses import dataclass
from pathlib import Path

@dataclass
class WorkflowAnalysis:
    requires_workflow: bool
    primary_intent: str
    secondary_intents: List[str]
    complexity: str  # 'simple', 'moderate', 'complex'
    confidence: float
    suggested_pipeline: List[str]
    reasoning: str

@dataclass
class ExtensionCapability:
    extension_id: str
    capabilities: Set[str]  # What this extension can do
    keywords: Set[str]
    intents: Set[str]
    category: str
    priority: float
    input_types: Set[str]  # What types of input it accepts
    output_types: Set[str]  # What types of output it produces

class WorkflowAnalyzer:
    def __init__(self, extensions_dir: str):
        self.extensions_dir = Path(extensions_dir)
        self.extension_capabilities = self._discover_extension_capabilities()
        self.capability_map = self._build_capability_map()
        self.intent_patterns = self._build_dynamic_intent_patterns()
        
        print(f"[WorkflowAnalyzer] Dynamically discovered {len(self.extension_capabilities)} extensions", file=sys.stderr)
        print(f"[WorkflowAnalyzer] Identified {len(self.capability_map)} unique capabilities", file=sys.stderr)
    
    def _discover_extension_capabilities(self) -> Dict[str, ExtensionCapability]:
        """Dynamically discover what each extension can actually do"""
        master_file = self.extensions_dir / "master.json"
        
        if not master_file.exists():
            print(f"Warning: master.json not found at {master_file}", file=sys.stderr)
            return {}
        
        try:
            with open(master_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                extensions = config.get('extensions', [])
                
                capabilities = {}
                for ext in extensions:
                    if not ext.get('enabled', True):
                        continue
                    
                    ext_id = ext['id']
                    
                    # Extract capabilities from multiple sources
                    raw_capabilities = set()
                    
                    # From keywords
                    for keyword in ext.get('keywords', []):
                        raw_capabilities.add(keyword.lower())
                    
                    # From intents
                    for intent in ext.get('intents', []):
                        raw_capabilities.add(intent.lower().replace('_', ' '))
                    
                    # From category
                    if ext.get('category'):
                        raw_capabilities.add(ext['category'].lower())
                    
                    # From description (extract action verbs)
                    description = ext.get('description', '').lower()
                    action_verbs = self._extract_action_verbs(description)
                    raw_capabilities.update(action_verbs)
                    
                    # Infer input/output types
                    input_types, output_types = self._infer_io_types(ext, raw_capabilities)
                    
                    capabilities[ext_id] = ExtensionCapability(
                        extension_id=ext_id,
                        capabilities=raw_capabilities,
                        keywords=set(kw.lower() for kw in ext.get('keywords', [])),
                        intents=set(intent.lower() for intent in ext.get('intents', [])),
                        category=ext.get('category', '').lower(),
                        priority=ext.get('priority', 5) / 10.0,  # Normalize to 0-1
                        input_types=input_types,
                        output_types=output_types
                    )
                
                print(f"[WorkflowAnalyzer] Discovered capabilities for {len(capabilities)} extensions", file=sys.stderr)
                return capabilities
                
        except Exception as e:
            print(f"Error discovering extension capabilities: {e}", file=sys.stderr)
            return {}
    
    def _extract_action_verbs(self, text: str) -> Set[str]:
        """Extract action verbs from extension descriptions"""
        # Common action verbs that indicate capabilities
        action_verbs = {
            'analyze', 'research', 'summarize', 'search', 'find', 'investigate',
            'explain', 'simplify', 'translate', 'convert', 'generate', 'create',
            'compare', 'evaluate', 'assess', 'review', 'check', 'verify',
            'extract', 'parse', 'format', 'organize', 'structure', 'compile',
            'gather', 'collect', 'aggregate', 'combine', 'merge', 'join'
        }
        
        found_verbs = set()
        words = re.findall(r'\b\w+\b', text.lower())
        
        for word in words:
            if word in action_verbs:
                found_verbs.add(word)
        
        return found_verbs
    
    def _infer_io_types(self, ext: Dict, capabilities: Set[str]) -> Tuple[Set[str], Set[str]]:
        """Infer what types of input/output an extension handles"""
        input_types = set()
        output_types = set()
        
        # Input type inference
        if any(cap in capabilities for cap in ['research', 'search', 'investigate']):
            input_types.update(['query', 'topic', 'keywords'])
            output_types.update(['data', 'information', 'sources'])
        
        if any(cap in capabilities for cap in ['summarize', 'explain', 'simplify']):
            input_types.update(['text', 'data', 'information'])
            output_types.update(['summary', 'explanation', 'simplified_text'])
        
        if any(cap in capabilities for cap in ['analyze', 'evaluate', 'assess']):
            input_types.update(['data', 'information', 'content'])
            output_types.update(['analysis', 'evaluation', 'insights'])
        
        if any(cap in capabilities for cap in ['compare', 'contrast']):
            input_types.update(['multiple_sources', 'data', 'information'])
            output_types.update(['comparison', 'differences', 'similarities'])
        
        if any(cap in capabilities for cap in ['format', 'structure', 'organize']):
            input_types.update(['unstructured_data', 'raw_content'])
            output_types.update(['formatted_content', 'structured_data'])
        
        # Default fallback
        if not input_types:
            input_types.add('general')
        if not output_types:
            output_types.add('general')
        
        return input_types, output_types
    
    def _build_capability_map(self) -> Dict[str, List[str]]:
        """Build a map of capabilities to extensions that have them"""
        capability_map = {}
        
        for ext_id, ext_cap in self.extension_capabilities.items():
            for capability in ext_cap.capabilities:
                if capability not in capability_map:
                    capability_map[capability] = []
                capability_map[capability].append(ext_id)
        
        # Sort by priority
        for capability, extensions in capability_map.items():
            extensions.sort(key=lambda ext_id: self.extension_capabilities[ext_id].priority, reverse=True)
        
        return capability_map
    
    def _build_dynamic_intent_patterns(self) -> Dict[str, List[str]]:
        """Build intent detection patterns dynamically from discovered capabilities"""
        all_capabilities = set()
        for ext_cap in self.extension_capabilities.values():
            all_capabilities.update(ext_cap.capabilities)
        
        patterns = {
            'sequential_connectors': [
                r'\band\s+then\b', r'\bthen\b', r'\bafter\s+that\b',
                r'\bfollowed\s+by\b', r'\bsubsequently\b', r'\bnext\b'
            ],
            'parallel_connectors': [
                r'\band\s+also\b', r'\bcompare.*\bwith\b', r'\b(\w+)\s+vs\s+(\w+)\b',
                r'\bsimultaneously\b', r'\bmeanwhile\b'
            ],
            'constraint_patterns': [
                r'\bin\s+(\d+)\s+words?\b', r'\bunder\s+(\d+)\s+words?\b',
                r'\bsummarize\s+in\s+(\d+)\b', r'\bmax\s+(\d+)\s+words?\b'
            ]
        }
        
        # Add dynamic patterns for discovered capabilities
        for capability in all_capabilities:
            patterns.setdefault('capability_patterns', []).append(rf'\b{re.escape(capability)}\b')
        
        return patterns
    
    def analyze_query(self, query: str) -> WorkflowAnalysis:
        """Dynamically analyze query and plan workflows based on available extensions"""
        print(f"[WorkflowAnalyzer] Analyzing query: {query}", file=sys.stderr)
        
        # Detect required capabilities from the query
        required_capabilities = self._detect_required_capabilities(query)
        
        # Check if workflow is needed
        requires_workflow = len(required_capabilities) > 1 or self._has_workflow_indicators(query)
        
        if not requires_workflow:
            # Single capability - find best extension
            primary_capability = required_capabilities[0] if required_capabilities else 'general'
            best_extension = self._find_best_extension_for_capability(primary_capability, query)
            
            return WorkflowAnalysis(
                requires_workflow=False,
                primary_intent=primary_capability,
                secondary_intents=[],
                complexity='simple',
                confidence=0.9,
                suggested_pipeline=[best_extension] if best_extension else [],
                reasoning=f"Single capability '{primary_capability}' detected, no workflow needed"
            )
        
        # Multi-capability workflow needed
        workflow_plan = self._plan_dynamic_workflow(query, required_capabilities)
        
        return WorkflowAnalysis(
            requires_workflow=True,
            primary_intent=required_capabilities[0] if required_capabilities else 'general',
            secondary_intents=required_capabilities[1:],
            complexity=self._estimate_complexity(required_capabilities, query),
            confidence=workflow_plan['confidence'],
            suggested_pipeline=workflow_plan['pipeline'],
            reasoning=workflow_plan['reasoning']
        )
    
    def _detect_required_capabilities(self, query: str) -> List[str]:
        """Dynamically detect what capabilities are needed for this query"""
        query_lower = query.lower()
        capability_scores = {}
        
        # Score each capability based on query content
        for capability, extensions in self.capability_map.items():
            score = 0.0
            
            # Direct capability mention
            if capability in query_lower:
                score += 5.0
            
            # Partial matches
            capability_words = capability.split()
            for word in capability_words:
                if word in query_lower:
                    score += 2.0
            
            # Synonym/related word matching
            synonyms = self._get_capability_synonyms(capability)
            for synonym in synonyms:
                if synonym in query_lower:
                    score += 3.0
            
            # Context-based scoring with better logic
            if capability == 'research' or capability == 'comprehensive research':
                if any(word in query_lower for word in ['research', 'investigate', 'study', 'find out', 'lookup']):
                    score += 6.0  # Higher score for explicit research
            
            if capability == 'search':
                # Only score 'search' highly if it's not in a research context
                if 'search' in query_lower and 'research' not in query_lower:
                    score += 4.0
                elif 'search' in query_lower and 'research' in query_lower:
                    score += 1.0  # Lower score when research is also mentioned
            
            if capability == 'summarize':
                if any(word in query_lower for word in ['summarize', 'summary', 'brief', 'concise', 'shorten']):
                    score += 6.0  # Higher score for explicit summarization
                    
                    # Extra bonus if word limits are specified
                    if any(re.search(pattern, query_lower) for pattern in self.intent_patterns.get('constraint_patterns', [])):
                        score += 3.0
            
            if capability == 'analyze':
                if any(word in query_lower for word in ['analyze', 'analysis', 'evaluate', 'examine', 'assess']):
                    score += 5.0
            
            if score > 0:
                capability_scores[capability] = score
        
        # Sort by score and return top capabilities
        sorted_capabilities = sorted(capability_scores.items(), key=lambda x: x[1], reverse=True)
        
        # Filter by minimum threshold and return
        threshold = 3.0  # Increased threshold for better filtering
        required_capabilities = [cap for cap, score in sorted_capabilities if score >= threshold]
        
        # Ensure we don't have redundant capabilities
        filtered_capabilities = self._filter_redundant_capabilities(required_capabilities, query_lower)
        
        print(f"[WorkflowAnalyzer] Detected capabilities: {filtered_capabilities}", file=sys.stderr)
        return filtered_capabilities
    
    def _filter_redundant_capabilities(self, capabilities: List[str], query: str) -> List[str]:
        """Filter out redundant or overlapping capabilities"""
        filtered = []
        
        # If we have both 'research' and 'comprehensive research', keep the more specific one
        if 'research' in capabilities and 'comprehensive research' in capabilities:
            capabilities.remove('research')
        
        # If we have both 'search' and 'research', prefer 'research' in research contexts
        if 'search' in capabilities and any(research_cap in capabilities for research_cap in ['research', 'comprehensive research']):
            capabilities.remove('search')
        
        # If we have multiple similar capabilities, keep the highest scoring ones
        research_caps = [cap for cap in capabilities if 'research' in cap]
        summary_caps = [cap for cap in capabilities if 'summariz' in cap or 'summary' in cap]
        analysis_caps = [cap for cap in capabilities if 'analyz' in cap or 'analysis' in cap]
        
        # Keep one from each major category
        if research_caps:
            filtered.append(research_caps[0])  # Take the first (highest scored)
        
        if summary_caps:
            filtered.append(summary_caps[0])
        
        if analysis_caps:
            filtered.append(analysis_caps[0])
        
        # Add any other capabilities that don't fall into these categories
        major_categories = {'research', 'comprehensive research', 'summarize', 'summary', 'analyze', 'analysis'}
        for cap in capabilities:
            if cap not in major_categories and cap not in filtered:
                filtered.append(cap)
        
        return filtered
    
    def _get_capability_synonyms(self, capability: str) -> List[str]:
        """Get synonyms for a capability to improve detection"""
        synonyms_map = {
            'research': ['investigate', 'study', 'explore', 'examine', 'lookup', 'find'],
            'summarize': ['summary', 'brief', 'concise', 'shorten', 'condense', 'abstract'],
            'analyze': ['analysis', 'evaluate', 'examine', 'assess', 'review', 'study'],
            'compare': ['comparison', 'contrast', 'versus', 'vs', 'against', 'difference'],
            'explain': ['explanation', 'clarify', 'describe', 'elaborate', 'detail'],
            'search': ['find', 'lookup', 'seek', 'locate', 'discover'],
            'generate': ['create', 'produce', 'make', 'build', 'construct'],
            'format': ['structure', 'organize', 'arrange', 'layout', 'style'],
            'extract': ['get', 'pull', 'retrieve', 'obtain', 'collect'],
            'verify': ['check', 'confirm', 'validate', 'authenticate', 'prove']
        }
        
        return synonyms_map.get(capability, [])
    
    def _has_workflow_indicators(self, query: str) -> bool:
        """Check for explicit workflow indicators in query"""
        query_lower = query.lower()
        
        # Check for sequential connectors
        for pattern in self.intent_patterns.get('sequential_connectors', []):
            if re.search(pattern, query_lower):
                return True
        
        # Check for parallel indicators
        for pattern in self.intent_patterns.get('parallel_connectors', []):
            if re.search(pattern, query_lower):
                return True
        
        # Check for constraint patterns (usually indicate multi-step)
        for pattern in self.intent_patterns.get('constraint_patterns', []):
            if re.search(pattern, query_lower):
                return True
        
        return False
    
    def _plan_dynamic_workflow(self, query: str, required_capabilities: List[str]) -> Dict:
        """Dynamically plan workflow based on required capabilities and available extensions"""
        print(f"[WorkflowAnalyzer] Planning workflow for capabilities: {required_capabilities}", file=sys.stderr)
        
        pipeline = []
        confidence = 0.8
        reasoning_parts = []
        
        # Map each capability to the best available extension
        for capability in required_capabilities:
            best_extension = self._find_best_extension_for_capability(capability, query)
            if best_extension:
                pipeline.append(best_extension)
                reasoning_parts.append(f"{capability} → {best_extension}")
            else:
                confidence -= 0.2
                reasoning_parts.append(f"{capability} → no suitable extension")
        
        # Remove duplicates while preserving order
        seen = set()
        optimized_pipeline = []
        for ext in pipeline:
            if ext not in seen:
                optimized_pipeline.append(ext)
                seen.add(ext)
        
        # Optimize pipeline order based on input/output compatibility
        final_pipeline = self._optimize_pipeline_flow(optimized_pipeline, query)
        
        reasoning = f"Dynamic pipeline: {' → '.join(reasoning_parts)} (optimized: {' → '.join(final_pipeline)})"
        
        return {
            'pipeline': final_pipeline,
            'confidence': max(0.1, confidence),
            'reasoning': reasoning
        }
    
    def _find_best_extension_for_capability(self, capability: str, query: str) -> Optional[str]:
        """Dynamically find the best extension for a specific capability"""
        # Get extensions that have this capability
        candidate_extensions = self.capability_map.get(capability, [])
        
        if not candidate_extensions:
            # Fallback: find extensions with similar capabilities
            candidate_extensions = self._find_similar_capability_extensions(capability)
        
        if not candidate_extensions:
            return None
        
        # Score each candidate extension
        best_extension = None
        best_score = 0
        
        for ext_id in candidate_extensions:
            ext_cap = self.extension_capabilities[ext_id]
            score = 0
            
            # Base score from having the capability
            if capability in ext_cap.capabilities:
                score += 5.0
            
            # Bonus for keyword matches in query
            query_lower = query.lower()
            for keyword in ext_cap.keywords:
                if keyword in query_lower:
                    score += 2.0
            
            # Priority bonus
            score += ext_cap.priority * 2.0
            
            # Specialization bonus (fewer capabilities = more specialized)
            specialization_bonus = max(0, 10 - len(ext_cap.capabilities)) * 0.1
            score += specialization_bonus
            
            if score > best_score:
                best_score = score
                best_extension = ext_id
        
        print(f"[WorkflowAnalyzer] Best extension for '{capability}': {best_extension} (score: {best_score})", file=sys.stderr)
        return best_extension
    
    def _find_similar_capability_extensions(self, capability: str) -> List[str]:
        """Find extensions with similar capabilities when exact match not found"""
        synonyms = self._get_capability_synonyms(capability)
        candidate_extensions = []
        
        for synonym in synonyms:
            if synonym in self.capability_map:
                candidate_extensions.extend(self.capability_map[synonym])
        
        # Remove duplicates and return
        return list(set(candidate_extensions))
    
    def _optimize_pipeline_flow(self, pipeline: List[str], query: str) -> List[str]:
        """Optimize pipeline order based on input/output flow compatibility"""
        if len(pipeline) <= 1:
            return pipeline
        
        # Special case: if query has word limit constraints, ensure proper ordering
        has_word_constraints = any(re.search(pattern, query.lower()) for pattern in self.intent_patterns.get('constraint_patterns', []))
        
        if has_word_constraints:
            # Separate research and summarization extensions
            research_extensions = []
            summary_extensions = []
            other_extensions = []
            
            for ext_id in pipeline:
                ext_cap = self.extension_capabilities[ext_id]
                
                # Check if this extension is primarily for research
                research_score = sum(1 for cap in ext_cap.capabilities if cap in ['research', 'search', 'investigate', 'comprehensive research'])
                summary_score = sum(1 for cap in ext_cap.capabilities if cap in ['summarize', 'summary', 'explain', 'simplify'])
                
                if research_score > summary_score:
                    research_extensions.append(ext_id)
                elif summary_score > research_score:
                    summary_extensions.append(ext_id)
                else:
                    # If tied, check the extension's primary category or description
                    if ext_cap.category in ['research', 'investigation'] or any(kw in ext_cap.keywords for kw in ['research', 'investigate']):
                        research_extensions.append(ext_id)
                    elif ext_cap.category in ['content_analysis', 'summary'] or any(kw in ext_cap.keywords for kw in ['summarize', 'summary', 'explain']):
                        summary_extensions.append(ext_id)
                    else:
                        other_extensions.append(ext_id)
            
            # Order: research → other → summary
            ordered_pipeline = research_extensions + other_extensions + summary_extensions
            print(f"[WorkflowAnalyzer] Word constraints detected - reordered pipeline: {' → '.join(ordered_pipeline)}", file=sys.stderr)
            return ordered_pipeline
        
        # Create a flow-optimized order for general cases
        ordered_pipeline = []
        remaining_extensions = pipeline.copy()
        
        # Start with extensions that accept 'query' as input
        for ext_id in remaining_extensions[:]:
            ext_cap = self.extension_capabilities[ext_id]
            if 'query' in ext_cap.input_types or 'general' in ext_cap.input_types:
                ordered_pipeline.append(ext_id)
                remaining_extensions.remove(ext_id)
                break
        
        # Chain remaining extensions based on input/output compatibility
        while remaining_extensions:
            last_ext = ordered_pipeline[-1] if ordered_pipeline else None
            last_output_types = self.extension_capabilities[last_ext].output_types if last_ext else {'general'}
            
            best_next = None
            best_compatibility = 0
            
            for ext_id in remaining_extensions:
                ext_cap = self.extension_capabilities[ext_id]
                
                # Calculate compatibility score
                compatibility = len(last_output_types & ext_cap.input_types)
                if 'general' in ext_cap.input_types:
                    compatibility += 0.5
                
                if compatibility > best_compatibility:
                    best_compatibility = compatibility
                    best_next = ext_id
            
            if best_next:
                ordered_pipeline.append(best_next)
                remaining_extensions.remove(best_next)
            else:
                # No compatible extension found, just add the first remaining
                ordered_pipeline.append(remaining_extensions.pop(0))
        
        print(f"[WorkflowAnalyzer] Optimized pipeline flow: {' → '.join(ordered_pipeline)}", file=sys.stderr)
        return ordered_pipeline
    
    def _estimate_complexity(self, capabilities: List[str], query: str) -> str:
        """Estimate the complexity of the workflow"""
        complexity_score = len(capabilities)
        
        # Add score for query length
        query_words = len(query.split())
        if query_words > 20:
            complexity_score += 2
        elif query_words > 10:
            complexity_score += 1
        
        # Add score for parallel indicators
        if any(re.search(pattern, query.lower()) for pattern in self.intent_patterns.get('parallel_connectors', [])):
            complexity_score += 2
        
        # Determine complexity level
        if complexity_score <= 2:
            return 'simple'
        elif complexity_score <= 4:
            return 'moderate'
        else:
            return 'complex'

def main():
    """Test the dynamic workflow analyzer"""
    if len(sys.argv) < 3:
        print("Usage: python workflow_analyzer.py <extensions_dir> <query>")
        sys.exit(1)
    
    extensions_dir = sys.argv[1]
    query = " ".join(sys.argv[2:])
    
    analyzer = WorkflowAnalyzer(extensions_dir)
    analysis = analyzer.analyze_query(query)
    
    print(json.dumps({
        'requires_workflow': analysis.requires_workflow,
        'primary_intent': analysis.primary_intent,
        'secondary_intents': analysis.secondary_intents,
        'complexity': analysis.complexity,
        'confidence': analysis.confidence,
        'suggested_pipeline': analysis.suggested_pipeline,
        'reasoning': analysis.reasoning
    }, indent=2))

if __name__ == "__main__":
    main() 