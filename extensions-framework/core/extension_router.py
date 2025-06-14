#!/usr/bin/env python3
"""
Extension Router for Browzer Extension Framework
Routes user requests to appropriate extensions based on intent analysis.
"""

import json
import sys
import os
import re
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path

@dataclass
class RoutingResult:
    extension_id: str
    confidence: float
    reason: str
    matched_keywords: List[str]

class ExtensionRouter:
    def __init__(self, extensions_dir: str):
        self.extensions_dir = Path(extensions_dir)
        self.master_config = self._load_master_config()
        
    def _load_master_config(self) -> Optional[Dict]:
        """Load the master.json configuration file from extensions directory"""
        master_file = self.extensions_dir / "master.json"
        
        if not master_file.exists():
            print(f"Warning: master.json not found at {master_file}", file=sys.stderr)
            return None
            
        try:
            with open(master_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                print(f"[Router] Loaded master.json with {len(config.get('extensions', []))} extensions", file=sys.stderr)
                return config
        except Exception as e:
            print(f"Error loading master.json: {e}", file=sys.stderr)
            return None
    
    def route_request(self, user_request: str) -> RoutingResult:
        """Route a user request to the best matching extension"""
        if not self.master_config:
            return self._get_fallback_result("Master config not loaded")
        
        enabled_extensions = [
            ext for ext in self.master_config.get('extensions', []) 
            if ext.get('enabled', True)
        ]
        
        if not enabled_extensions:
            return self._get_fallback_result("No enabled extensions found")
        
        # Analyze user request
        request_lower = user_request.lower()
        matches = []
        
        for extension in enabled_extensions:
            score, matched_keywords = self._calculate_match_score(request_lower, extension)
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
                reason=f"Matched keywords: {', '.join(matched_keywords)}",
                matched_keywords=matched_keywords
            )
        
        return self._get_fallback_result(
            f"No extension met confidence threshold ({score:.2f} < {threshold})"
        )
    
    def _calculate_match_score(self, user_request: str, extension: Dict) -> Tuple[float, List[str]]:
        """Calculate how well an extension matches the user request"""
        matched_keywords = []
        score = 0.0
        
        # Extract words from user request
        words = re.findall(r'\b\w+\b', user_request.lower())
        
        # Check keywords (exact match)
        for keyword in extension.get('keywords', []):
            if keyword.lower() in user_request:
                matched_keywords.append(keyword)
                score += 1.0  # Base score for keyword match
        
        # Check intents (fuzzy match)
        for intent in extension.get('intents', []):
            intent_words = intent.replace('_', ' ').split()
            
            # Check if any intent words appear in user request
            for intent_word in intent_words:
                if any(intent_word.lower() in word or word in intent_word.lower() 
                       for word in words):
                    matched_keywords.append(intent)
                    score += 1.5  # Higher score for intent match
                    break  # Only count intent once
        
        # Check category relevance
        category = extension.get('category', '').replace('_', ' ')
        if category.lower() in user_request:
            score += 0.5
        
        # Check description for semantic similarity (basic)
        description = extension.get('description', '').lower()
        common_words = set(words) & set(re.findall(r'\b\w+\b', description))
        if common_words:
            score += len(common_words) * 0.2
            matched_keywords.extend(list(common_words))
        
        # Apply priority multiplier
        priority = extension.get('priority', 5)
        score *= (1 + (priority / 100))
        
        return score, matched_keywords
    
    def _get_fallback_result(self, reason: str) -> RoutingResult:
        """Get fallback routing result"""
        default_extension = 'topic-agent'
        
        if self.master_config:
            default_extension = self.master_config.get('routing', {}).get('defaultExtension', 'topic-agent')
        
        return RoutingResult(
            extension_id=default_extension,
            confidence=0.0,
            reason=f"Fallback: {reason}",
            matched_keywords=[]
        )
    
    def get_available_extensions(self) -> List[Dict]:
        """Get list of available extensions"""
        if not self.master_config:
            return []
        
        return [
            ext for ext in self.master_config.get('extensions', [])
            if ext.get('enabled', True)
        ]
    
    def reload_config(self) -> bool:
        """Reload the master.json configuration"""
        try:
            self.master_config = self._load_master_config()
            return self.master_config is not None
        except Exception as e:
            print(f"Error reloading config: {e}", file=sys.stderr)
            return False

def main():
    """CLI interface for the router"""
    if len(sys.argv) < 3:
        print("Usage: python extension_router.py <extensions_dir> <user_request>", file=sys.stderr)
        sys.exit(1)
    
    extensions_dir = sys.argv[1]
    user_request = " ".join(sys.argv[2:])
    
    router = ExtensionRouter(extensions_dir)
    result = router.route_request(user_request)
    
    # Output result as JSON for easy parsing
    output = {
        "extensionId": result.extension_id,
        "confidence": result.confidence,
        "reason": result.reason,
        "matchedKeywords": result.matched_keywords
    }
    
    print(json.dumps(output))

if __name__ == "__main__":
    main() 