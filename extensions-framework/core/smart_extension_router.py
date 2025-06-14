#!/usr/bin/env python3
"""
Smart Extension Router for Browzer Extension Framework
Uses semantic similarity and embeddings for intelligent routing.
"""

import json
import sys
import os
import re
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    EMBEDDINGS_AVAILABLE = False
    print("Warning: sentence-transformers not available. Install with: pip install sentence-transformers", file=sys.stderr)

@dataclass
class RoutingResult:
    extension_id: str
    confidence: float
    reason: str
    matched_keywords: List[str]

class SmartExtensionRouter:
    def __init__(self, extensions_dir: str):
        self.extensions_dir = Path(extensions_dir)
        self.master_config = self._load_master_config()
        
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
    
    def route_request(self, user_request: str) -> RoutingResult:
        """Route a user request to the best matching extension using smart algorithms"""
        if not self.master_config:
            return self._get_fallback_result("Master config not loaded")
        
        enabled_extensions = [
            ext for ext in self.master_config.get('extensions', []) 
            if ext.get('enabled', True)
        ]
        
        if not enabled_extensions:
            return self._get_fallback_result("No enabled extensions found")
        
        # Use semantic similarity if available, otherwise fallback to enhanced rule-based
        if self.use_embeddings and hasattr(self, 'extension_embeddings'):
            return self._route_with_embeddings(user_request, enabled_extensions)
        else:
            return self._route_with_enhanced_rules(user_request, enabled_extensions)
    
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
                matched_keywords=[f"semantic_match_{raw_similarity:.3f}"]
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
                matched_keywords=matched_keywords
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

def main():
    """CLI interface for the smart router"""
    if len(sys.argv) < 3:
        print("Usage: python smart_extension_router.py <extensions_dir> <user_request>", file=sys.stderr)
        sys.exit(1)
    
    extensions_dir = sys.argv[1]
    user_request = " ".join(sys.argv[2:])
    
    router = SmartExtensionRouter(extensions_dir)
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