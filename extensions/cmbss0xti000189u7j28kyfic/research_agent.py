#!/usr/bin/env python3
"""
Research Agent - Standalone Version

Advanced research agent that performs comprehensive analysis, fact-checking, 
and multi-source information gathering without external SDK dependencies.
"""

import requests
import json
from bs4 import BeautifulSoup
import os
from datetime import datetime
import sys
import re
import urllib.parse
import random
import time
from anthropic import Anthropic
import openai
from typing import Dict, List, Optional, Tuple
import traceback

# Set up logging
LOG_FILE = os.path.join(os.path.dirname(__file__), 'research_agent.log')
def log_event(message):
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{datetime.now().isoformat()}] {message}\n")

class ResearchAgent:
    def __init__(self):
        log_event("Initializing ResearchAgent")
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
        ]
        self.start_time = time.time()
        log_event('ResearchAgent initialization complete')

    def get_processing_time(self):
        """Get processing time since initialization"""
        return time.time() - self.start_time

    def get_random_user_agent(self):
        """Return a random user agent string"""
        return random.choice(self.user_agents)

    def get_webpage_content(self, url):
        """Fetch the HTML content of a webpage"""
        try:
            headers = {
                'User-Agent': self.get_random_user_agent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.google.com/',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
            log_event(f'Fetching URL: {url}')
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
            log_event(f'Successfully fetched content for URL: {url} (status: {response.status_code})')
            return response.text
        except Exception as e:
            log_event(f'Error fetching URL {url}: {e}')
            return None

    def extract_text(self, html_content):
        """Extract and clean text from HTML content"""
        if not html_content:
            return ""
        
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Remove script, style, and header/footer elements
        for element in soup(['script', 'style', 'header', 'footer', 'nav', 'aside']):
            element.decompose()
        
        # Get text
        text = soup.get_text(separator=' ')
        
        # Clean up the text
        text = re.sub(r'\s+', ' ', text).strip()
        text = re.sub(r'\n+', ' ', text)
        
        return text

    def get_google_search_results(self, query, num_results=8):
        """Get search results from Google for research purposes"""
        clean_query = urllib.parse.quote(query)
        search_url = f"https://www.google.com/search?q={clean_query}&num={num_results}"
        log_event(f'Research search URL: {search_url}')
        
        content = self.get_webpage_content(search_url)
        if not content:
            log_event('Failed to fetch search results page')
            return []
        
        soup = BeautifulSoup(content, 'html.parser')
        results = []
        
        # Extract search results
        search_divs = soup.find_all('div', class_='g')
        if search_divs:
            log_event(f'Found {len(search_divs)} search result divs')
            for div in search_divs:
                link_element = div.find('a')
                if link_element and 'href' in link_element.attrs:
                    url = link_element['href']
                    if url.startswith('http') and 'google.com' not in url:
                        results.append(url)
        
        # Fallback methods for result extraction
        if not results:
            search_results = soup.select('div[jscontroller] a[href^="http"]')
            for link in search_results:
                url = link['href']
                if url.startswith('http') and 'google.com' not in url and url not in results:
                    results.append(url)
        
        results = list(dict.fromkeys(results))[:num_results]
        log_event(f'Found {len(results)} research URLs')
        return results

    def generate_llm_response(self, prompt_type: str, input_text: Dict, model_info: Dict) -> Tuple[bool, Optional[str], float]:
        """Generate a response using an LLM provider"""
        log_event(f"Generating {prompt_type} using LLM")
        
        start_time = time.time()
        
        # Get provider and API key
        provider = model_info.get('provider', '').lower()
        api_key = None
        for key_name in ['api_key', 'apiKey', 'API_KEY', 'api-key']:
            if key_name in model_info and model_info[key_name]:
                api_key = model_info[key_name]
                break
                
        if not api_key:
            log_event("[ERROR] No API key found in model_info")
            return False, None, 0
        
        try:
            llm_call_start = time.time()
            
            if provider == 'anthropic':
                client = Anthropic(api_key=api_key)
                log_event("[DEBUG] Making Anthropic API call for research")
                response = client.messages.create(
                    model="claude-3-7-sonnet-latest",
                    max_tokens=64000,
                    temperature=0.3,
                    system=input_text["system"],
                    messages=[{"role": "user", "content": input_text["user"]}],
                    timeout=30
                )
                result = response.content[0].text
            elif provider == 'openai':
                client = openai.OpenAI(api_key=api_key)
                log_event("[DEBUG] Making OpenAI API call for research")
                response = client.chat.completions.create(
                    model="gpt-4",  # Use GPT-4 for better research quality
                    messages=[
                        {"role": "system", "content": input_text["system"]},
                        {"role": "user", "content": input_text["user"]}
                    ],
                    temperature=0.3,
                    max_tokens=100000,
                    timeout=30
                )
                result = response.choices[0].message.content
            elif provider == 'perplexity':
                headers = {
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json'
                }
                log_event("[DEBUG] Making Perplexity API call for research")
                response = requests.post(
                    'https://api.perplexity.ai/chat/completions',
                    headers=headers,
                    json={
                        'model': 'pplx-7b-online',
                        'messages': [
                            {'role': 'system', 'content': input_text["system"]},
                            {'role': 'user', 'content': input_text["user"]}
                        ],
                        'temperature': 0.3,
                        'max_tokens': 100000
                    }
                )
                response.raise_for_status()
                result = response.json()['choices'][0]['message']['content']
            elif provider == 'chutes':
                log_event(f"[DEBUG] Using Chutes API for research")
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                
                body = {
                    "model": "deepseek-ai/DeepSeek-R1",
                    "messages": [
                        {"role": "system", "content": input_text["system"]},
                        {"role": "user", "content": input_text["user"]}
                    ],
                    "stream": False,
                    "max_tokens": 100000,
                    "temperature": 0.3
                }
                
                response = requests.post(
                    "https://llm.chutes.ai/v1/chat/completions",
                    headers=headers,
                    json=body,
                    timeout=30
                )
                response.raise_for_status()
                result = response.json()['choices'][0]['message']['content']
            else:
                log_event(f"Unsupported provider for research: {provider}")
                return False, None, 0
                
            llm_call_end = time.time()
            total_time = time.time() - start_time
            llm_time = llm_call_end - llm_call_start
            
            log_event(f"[DEBUG] Research LLM call took {llm_time:.2f} seconds. Total: {total_time:.2f} seconds")
            
            return True, result, total_time
        except Exception as e:
            log_event(f"Error in research LLM call: {str(e)}")
            log_event(traceback.format_exc())
            total_time = time.time() - start_time
            return False, None, total_time

    def analyze_query_intent(self, query: str, context: Dict, model_info: Dict) -> Dict:
        """Analyze the user's query to understand research intent and context"""
        
        system_prompt = (
            "You are an expert research analyst. Analyze user queries to understand their research needs, "
            "intent, and the type of investigation required. Be precise and systematic in your analysis."
        )
        
        user_prompt = f"""
        Analyze this research query to understand the user's intent and research needs:
        
        Query: "{query}"
        Context: {"Question about page content" if context.get('is_question') else "General research/analysis"}
        Page Title: {context.get('page_title', 'Unknown')}
        
        Provide analysis in the following format:
        Intent: [primary intent - research, investigation, fact-check, comparison, analysis, etc.]
        Topic: [main topic/subject being researched]
        Scope: [broad, specific, technical, academic, current-events, historical]
        Research Type: [factual, analytical, investigative, comparative, verification]
        Key Concepts: [list 3-4 key concepts to focus research on]
        Information Needs: [what specific information is needed]
        Source Requirements: [what types of sources would be most valuable]
        """
        
        success, analysis_text, _ = self.generate_llm_response(
            "intent_analysis", 
            {"system": system_prompt, "user": user_prompt}, 
            model_info
        )
        
        if not success:
            return {
                "intent": "research",
                "topic": query,
                "scope": "general",
                "research_type": "factual",
                "key_concepts": [query],
                "full_analysis": "Analysis failed"
            }
        
        # Parse the analysis
        return {
            "intent": self._extract_field(analysis_text, "Intent"),
            "topic": self._extract_field(analysis_text, "Topic"),
            "scope": self._extract_field(analysis_text, "Scope"),
            "research_type": self._extract_field(analysis_text, "Research Type"),
            "key_concepts": self._extract_field(analysis_text, "Key Concepts"),
            "information_needs": self._extract_field(analysis_text, "Information Needs"),
            "source_requirements": self._extract_field(analysis_text, "Source Requirements"),
            "full_analysis": analysis_text
        }

    def gather_research_sources(self, query: str, intent_analysis: Dict, max_sources: int = 5) -> List[Dict]:
        """Gather research sources from multiple search strategies"""
        log_event(f"Gathering research sources for: {query}")
        
        sources = []
        
        # Primary search based on main query
        primary_urls = self.get_google_search_results(query, 4)
        
        # Secondary search based on key concepts
        key_concepts = intent_analysis.get('key_concepts', '')
        if key_concepts and key_concepts != 'unknown':
            concept_query = f"{query} {key_concepts}"
            secondary_urls = self.get_google_search_results(concept_query, 3)
            primary_urls.extend(secondary_urls)
        
        # Remove duplicates while preserving order
        unique_urls = []
        seen = set()
        for url in primary_urls:
            if url not in seen:
                unique_urls.append(url)
                seen.add(url)
        
        # Process URLs to extract content
        for url in unique_urls[:max_sources]:
            log_event(f'Processing research source: {url}')
            time.sleep(0.5 + random.random())  # Rate limiting
            
            page_content = self.get_webpage_content(url)
            if not page_content:
                continue
            
            text = self.extract_text(page_content)
            if not text or len(text) < 300:  # Minimum content threshold for research
                continue
            
            # Get page title
            title = "Untitled Research Source"
            try:
                soup = BeautifulSoup(page_content, 'html.parser')
                title_tag = soup.find('title')
                if title_tag:
                    title = title_tag.text.strip()
            except:
                pass
            
            # For research, we want more comprehensive content extraction
            # Limit to reasonable size but keep more content than topic agent
            if len(text) > 3000:
                text = text[:3000] + "... [Content truncated for analysis]"
            
            sources.append({
                'title': title,
                'url': url,
                'content': text,
                'word_count': len(text.split())
            })
            log_event(f'Added research source: {title} ({len(text)} chars)')
        
        log_event(f'Gathered {len(sources)} research sources')
        return sources

    def analyze_sources(self, sources: List[Dict], intent_analysis: Dict, model_info: Dict) -> Dict:
        """Analyze gathered sources for relevant information"""
        log_event("Analyzing research sources")
        
        if not sources:
            return {"error": "No sources available for analysis"}
        
        system_prompt = (
            "You are a research analyst specializing in information extraction and source analysis. "
            "Your task is to carefully analyze multiple sources and extract the most relevant, accurate, "
            "and comprehensive information based on the research intent."
        )
        
        user_prompt = f"""
        Research Intent: {intent_analysis['intent']}
        Topic Focus: {intent_analysis['topic']}
        Key Concepts: {intent_analysis['key_concepts']}
        Information Needs: {intent_analysis.get('information_needs', 'Comprehensive understanding')}
        
        Analyze the following sources and extract relevant information:
        
        """
        
        for idx, source in enumerate(sources, 1):
            user_prompt += f"SOURCE {idx}:\n"
            user_prompt += f"Title: {source['title']}\n"
            user_prompt += f"URL: {source['url']}\n"
            user_prompt += f"Content: {source['content']}\n\n"
        
        user_prompt += """
        Please provide a comprehensive analysis with:
        
        1. KEY FINDINGS: Most important facts and information relevant to the research query
        2. SOURCE CREDIBILITY: Assessment of source reliability and potential biases
        3. EVIDENCE QUALITY: Strength and type of evidence presented
        4. CONTRADICTIONS: Any conflicting information between sources
        5. GAPS: Important information that may be missing
        6. SYNTHESIS: How the information from different sources relates and connects
        
        Focus on accuracy, comprehensiveness, and highlighting the most valuable insights.
        """
        
        success, analysis, _ = self.generate_llm_response(
            "source_analysis", 
            {"system": system_prompt, "user": user_prompt}, 
            model_info
        )
        
        if not success:
            return {"error": "Failed to analyze sources"}
        
        return {
            "analysis": analysis,
            "sources_analyzed": len(sources),
            "total_content_length": sum(len(s['content']) for s in sources),
            "source_urls": [s['url'] for s in sources]
        }

    def generate_research_response(self, query: str, intent_analysis: Dict, source_analysis: Dict, 
                                 sources: List[Dict], model_info: Dict, conversation_history=None) -> str:
        """Generate comprehensive research response"""
        log_event("Generating comprehensive research response")
        
        system_prompt = (
            "You are an expert research analyst and writer. You provide comprehensive, well-structured "
            "research responses that are thorough, accurate, and insightful. Your responses should be "
            "scholarly in quality while remaining accessible and well-organized."
        )
        
        # Build comprehensive context
        research_context = f"""
        RESEARCH QUERY: {query}
        
        RESEARCH ANALYSIS:
        Intent: {intent_analysis['intent']}
        Topic: {intent_analysis['topic']}
        Scope: {intent_analysis['scope']}
        Research Type: {intent_analysis['research_type']}
        Key Concepts: {intent_analysis['key_concepts']}
        
        SOURCE ANALYSIS:
        {source_analysis.get('analysis', 'No source analysis available')}
        
        RESEARCH SOURCES:
        """
        
        for idx, source in enumerate(sources, 1):
            research_context += f"{idx}. {source['title']} ({source['url']})\n"
        
        # Include conversation history if available
        if conversation_history and len(conversation_history) > 0:
            research_context += "\n\nCONVERSATION CONTEXT:\n"
            for item in conversation_history[-5:]:  # Last 5 items for context
                role = item.get('role', '')
                content = item.get('content', '')
                if content.strip():
                    research_context += f"{role.title()}: {content[:200]}...\n"
        
        user_prompt = f"""
        Based on this comprehensive research, provide a detailed response to the query.
        
        {research_context}
        
        Structure your response as follows:
        
        1. **Executive Summary** (2-3 sentences answering the main question)
        
        2. **Detailed Analysis** (comprehensive explanation with key findings)
        
        3. **Key Evidence** (important facts, data, and supporting information)
        
        4. **Different Perspectives** (if applicable, various viewpoints or approaches)
        
        5. **Implications** (significance, consequences, or broader context)
        
        6. **Sources** (brief mention of source types and credibility)
        
        Requirements:
        - Be comprehensive and thorough
        - Maintain academic rigor while being accessible
        - Cite specific information when possible
        - Address multiple aspects of the query
        - Provide actionable insights where appropriate
        - Acknowledge limitations or uncertainties
        
        Focus on delivering maximum value and insight for the research query.
        """
        
        success, response, _ = self.generate_llm_response(
            "research_response", 
            {"system": system_prompt, "user": user_prompt}, 
            model_info
        )
        
        if not success:
            return "Failed to generate comprehensive research response."
        
        return response

    def conduct_research(self, query: str, page_content=None, model_info=None, 
                        is_question=None, conversation_history=None) -> Dict:
        """Main research workflow"""
        log_event(f'Starting research workflow for: {query}')
        
        try:
            # Build context
            context = {
                'query': query,
                'is_question': is_question,
                'page_title': page_content.get('title', 'Unknown') if page_content else 'Unknown',
                'has_content': page_content is not None
            }
            
            # Step 1: Analyze query intent
            log_event("Step 1: Analyzing query intent")
            intent_analysis = self.analyze_query_intent(query, context, model_info)
            log_event(f"Research intent: {intent_analysis['intent']}")
            
            # Step 2: Gather research sources
            log_event("Step 2: Gathering research sources")
            sources = []
            
            # If page content is provided, include it as primary source
            if page_content and isinstance(page_content, dict):
                log_event("Including provided page content as primary source")
                content = page_content.get('content', '')
                if 'htmlContent' in page_content:
                    content = page_content.get('htmlContent', '')
                
                if content and len(content) > 300:
                    sources.append({
                        'title': page_content.get('title', 'Primary Source'),
                        'url': page_content.get('url', query),
                        'content': content[:5000],  # Keep substantial content for research
                        'word_count': len(content.split()),
                        'is_primary': True
                    })
            
            # Gather additional sources from web search
            additional_sources = self.gather_research_sources(query, intent_analysis, 4)
            sources.extend(additional_sources)
            
            if not sources:
                log_event("No sources found, generating response from knowledge")
                # Generate response using just the query and LLM knowledge
                system_prompt = (
                    "You are a research expert. Provide a comprehensive research response "
                    "based on your knowledge, clearly indicating that external sources were not available."
                )
                user_prompt = f"Research Query: {query}\n\nPlease provide a comprehensive research response based on your knowledge."
                
                success, response, generation_time = self.generate_llm_response(
                    "knowledge_research", 
                    {"system": system_prompt, "user": user_prompt}, 
                    model_info
                )
                
                if success:
                    return {
                        'success': True,
                        'data': {
                            'query': query,
                            'summaries': [],
                            'consolidated_summary': response,
                            'generation_time': generation_time,
                            'isQuestion': bool(is_question),
                            'research_metadata': {
                                'sources_analyzed': 0,
                                'research_type': 'knowledge_based',
                                'processing_time': self.get_processing_time()
                            }
                        }
                    }
                else:
                    return {
                        'success': False,
                        'error': 'Failed to conduct research - no sources available and knowledge response failed'
                    }
            
            # Step 3: Analyze sources
            log_event("Step 3: Analyzing research sources")
            source_analysis = self.analyze_sources(sources, intent_analysis, model_info)
            
            if 'error' in source_analysis:
                log_event(f"Source analysis failed: {source_analysis['error']}")
                return {
                    'success': False,
                    'error': f"Research analysis failed: {source_analysis['error']}"
                }
            
            # Step 4: Generate comprehensive response
            log_event("Step 4: Generating comprehensive research response")
            response = self.generate_research_response(
                query, intent_analysis, source_analysis, sources, model_info, conversation_history
            )
            
            # Step 5: Build metadata
            metadata = {
                'query_analysis': {
                    'intent': intent_analysis.get('intent', 'research'),
                    'topic': intent_analysis.get('topic', 'unknown'),
                    'scope': intent_analysis.get('scope', 'unknown'),
                    'research_type': intent_analysis.get('research_type', 'unknown')
                },
                'sources_analyzed': len(sources),
                'primary_source_included': any(s.get('is_primary') for s in sources),
                'processing_time': self.get_processing_time(),
                'workflow_steps': ['intent_analysis', 'source_gathering', 'source_analysis', 'response_generation']
            }
            
            # Convert sources to summaries format for compatibility
            summaries = []
            for source in sources:
                summaries.append({
                    'title': source['title'],
                    'url': source['url'],
                    'summary': source['content'][:1000] + '...' if len(source['content']) > 1000 else source['content']
                })
            
            log_event(f'Research workflow completed successfully in {self.get_processing_time():.2f} seconds')
            
            return {
                'success': True,
                'data': {
                    'query': query,
                    'summaries': summaries,
                    'consolidated_summary': response,
                    'generation_time': self.get_processing_time(),
                    'isQuestion': bool(is_question),
                    'research_metadata': metadata
                }
            }
            
        except Exception as e:
            log_event(f'Error in research workflow: {e}')
            log_event(traceback.format_exc())
            return {
                'success': False,
                'error': str(e)
            }

    def _extract_field(self, text: str, field_name: str) -> str:
        """Simple field extraction from structured text"""
        lines = text.split('\n')
        for line in lines:
            if line.strip().startswith(f"{field_name}:"):
                return line.split(':', 1)[1].strip()
        return "unknown"

def main():
    """Main entry point for the research agent extension"""
    log_event("=== Starting Research Agent Extension ===")
    
    try:
        # Read input from stdin
        input_data = sys.stdin.read()
        if not input_data.strip():
            log_event("No input data received")
            return
            
        request = json.loads(input_data)
        log_event(f"Received research request: {json.dumps(request, indent=2)}")
        
        # Extract context and action
        context = request.get('context', {})
        action = request.get('action', 'process_page')
        data = request.get('data', {})
        
        # Extract configuration
        extension_id = context.get('extension_id', 'research-agent')
        browser_api_keys = context.get('browser_api_keys', {})
        selected_provider = context.get('selected_provider', 'anthropic')
        selected_model = context.get('selected_model', 'claude-3-7-sonnet-latest')
        
        log_event(f"Extension ID: {extension_id}")
        log_event(f"Action: {action}")
        log_event(f"Selected provider: {selected_provider}")
        
        # Create model_info
        model_info = {
            'provider': selected_provider,
            'model': selected_model,
            'api_key': browser_api_keys.get(selected_provider),
            'apiKey': browser_api_keys.get(selected_provider)
        }
        
        if not model_info['api_key']:
            error_result = {
                'success': False,
                'error': f'No API key configured for {selected_provider} in browser settings'
            }
            print(json.dumps(error_result))
            return
        
        # Initialize research agent
        agent = ResearchAgent()
        
        # Handle different actions
        if action == 'process_page':
            query = data.get('query', '')
            page_content = data.get('pageContent')
            is_question = data.get('isQuestion')
            conversation_history = data.get('conversationHistory')
            
            log_event(f"Processing research query: {query}")
            log_event(f"Is question: {is_question}")
            log_event(f"Has page content: {page_content is not None}")
            
            # Conduct research
            result = agent.conduct_research(
                query=query,
                page_content=page_content,
                model_info=model_info,
                is_question=is_question,
                conversation_history=conversation_history
            )
            
        elif action == 'research':
            # Direct research action
            query = data.get('query', '')
            context_data = data.get('context', '')
            conversation_history = data.get('conversationHistory')
            
            log_event(f"Direct research query: {query}")
            
            page_content = None
            if context_data:
                page_content = {
                    'title': 'Research Context',
                    'content': context_data,
                    'url': 'context'
                }
            
            result = agent.conduct_research(
                query=query,
                page_content=page_content,
                model_info=model_info,
                is_question=True,
                conversation_history=conversation_history
            )
            
        else:
            result = {
                'success': False,
                'error': f'Unknown action: {action}'
            }
        
        # Return result
        print(json.dumps(result))
        log_event(f'Research agent completed. Success: {result.get("success", False)}')
        
    except Exception as e:
        log_event(f'Error in research agent main: {e}')
        log_event(traceback.format_exc())
        error_result = {
            'success': False,
            'error': str(e)
        }
        print(json.dumps(error_result))

if __name__ == "__main__":
    main() 