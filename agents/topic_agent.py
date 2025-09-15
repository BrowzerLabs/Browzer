import requests
import json
from bs4 import BeautifulSoup
import nltk
from nltk.tokenize import sent_tokenize
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from nltk.probability import FreqDist
import heapq
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
from google import genai
from google.genai import types

# Set up logging
LOG_FILE = os.path.join(os.path.dirname(__file__), 'topic_agent.log')
def log_event(message):
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{datetime.now().isoformat()}] {message}\n")

class TopicAgent:
    def __init__(self):
        log_event("Initializing TopicAgent")
        # Download required NLTK data
        try:
            nltk.data.find('tokenizers/punkt')
        except LookupError:
            nltk.download('punkt')
        try:
            nltk.data.find('corpora/stopwords')
        except LookupError:
            nltk.download('stopwords')
        
        self.stop_words = set(stopwords.words('english'))
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36 Edg/90.0.818.66',
        ]
        log_event('TopicAgent initialization complete')

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
            log_event(f'Sending request to URL: {url}')
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            log_event(f'Successfully fetched content for URL: {url} (status: {response.status_code})')
            return response.text
        except Exception as e:
            log_event(f'Error fetching URL {url}: {e}')
            return None

    def extract_text(self, html_content):
        """Extract and clean text from HTML content"""
        if not html_content:
            log_event('No HTML content to extract text from')
            return ""
        
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Remove script, style, and header/footer elements
        for element in soup(['script', 'style', 'header', 'footer', 'nav', 'aside']):
            element.decompose()
        
        # Get text
        text = soup.get_text(separator=' ')
        
        # Clean up the text
        text = re.sub(r'\s+', ' ', text).strip()  # Replace multiple spaces with single space
        text = re.sub(r'\n+', ' ', text)  # Replace newlines with spaces
        
        # Log a sample of the extracted text
        sample = text[:150] + "..." if len(text) > 150 else text
        log_event(f'Extracted text sample: {sample}')
        
        return text

    def summarize_text(self, text, num_sentences=5):
        """Create an extractive summary of text by selecting important sentences"""
        if not text or len(text) < 100:
            log_event(f'Text too short to summarize: {len(text) if text else 0} characters')
            return text
        
        # Tokenize the text into sentences
        try:
            sentences = sent_tokenize(text)
            log_event(f'Text tokenized into {len(sentences)} sentences')
            
            if len(sentences) <= num_sentences:
                log_event('Text has fewer sentences than requested summary length, returning full text')
                return text
            
            # Tokenize words and remove stopwords
            word_tokens = word_tokenize(text.lower())
            word_tokens = [word for word in word_tokens if word.isalnum() and word not in self.stop_words]
            
            # Calculate word frequencies
            freq_dist = FreqDist(word_tokens)
            
            # Score sentences based on word frequencies
            sentence_scores = {}
            for i, sentence in enumerate(sentences):
                for word in word_tokenize(sentence.lower()):
                    if word in freq_dist:
                        if i not in sentence_scores:
                            sentence_scores[i] = freq_dist[word]
                        else:
                            sentence_scores[i] += freq_dist[word]
            
            # Get top sentences
            if not sentence_scores:
                log_event('No sentence scores calculated, returning first few sentences')
                return ' '.join(sentences[:num_sentences])
                
            top_sentences = heapq.nlargest(num_sentences, sentence_scores.items(), key=lambda x: x[1])
            top_sentences = sorted(top_sentences, key=lambda x: x[0])
            
            # Combine sentences
            summary = ' '.join(sentences[i] for i, _ in top_sentences)
            return summary
        except Exception as e:
            log_event(f'Error in summarize_text: {e}')
            return text[:500] + "..." if len(text) > 500 else text  # Fallback to simple truncation

    def clean_query(self, query):
        """Clean and normalize the query"""
        try:
            # If it's a URL with a query parameter, extract it
            if '?' in query and ('http://' in query or 'https://' in query):
                parsed_url = urllib.parse.urlparse(query)
                query_params = urllib.parse.parse_qs(parsed_url.query)
                if 'q' in query_params:
                    clean_query = query_params['q'][0]
                    log_event(f'Extracted query from URL parameter: {clean_query}')
                    return clean_query
            
            # Remove special characters and excessive whitespace
            clean_query = re.sub(r'[^\w\s]', ' ', query)
            clean_query = re.sub(r'\s+', ' ', clean_query).strip()
            
            # If the query is too long, truncate it
            if len(clean_query) > 150:
                clean_query = clean_query[:150]
                log_event(f'Truncated query to 150 chars: {clean_query}')
            
            return clean_query
        except Exception as e:
            log_event(f'Error cleaning query: {e}')
            return query

    def get_google_search_results(self, query):
        """Get the top search results from Google."""
        clean_query = urllib.parse.quote(query)
        search_url = f"https://www.google.com/search?q={clean_query}&num=10"
        log_event(f'Search URL: {search_url}')
        
        content = self.get_webpage_content(search_url)
        if not content:
            log_event('Failed to fetch search results page')
            return []
        
        soup = BeautifulSoup(content, 'html.parser')
        results = []
        
        # Try different selectors for Google search results
        # Method 1: Modern Google search results with div.g
        search_divs = soup.find_all('div', class_='g')
        if search_divs:
            log_event(f'Found {len(search_divs)} results with div.g selector')
            for div in search_divs:
                link_element = div.find('a')
                if link_element and 'href' in link_element.attrs:
                    url = link_element['href']
                    if url.startswith('http') and 'google.com' not in url:
                        results.append(url)
        
        # Method 2: Results wrapped in different divs
        if not results:
            search_results = soup.select('div[jscontroller] a[href^="http"]')
            log_event(f'Found {len(search_results)} results with jscontroller selector')
            for link in search_results:
                url = link['href']
                if url.startswith('http') and 'google.com' not in url and url not in results:
                    results.append(url)
        
        # Method 3: Direct link extraction
        if not results:
            all_links = soup.find_all('a')
            log_event(f'Trying direct link extraction from {len(all_links)} links')
            for link in all_links:
                if 'href' in link.attrs:
                    url = link['href']
                    # Filter out Google's internal links and clean redirect URLs
                    if url.startswith('/url?q='):
                        url = url.split('/url?q=')[1].split('&')[0]
                    if url.startswith('http') and 'google.com' not in url and url not in results:
                        results.append(url)
        
        # Ensure we only return unique URLs
        results = list(dict.fromkeys(results))
        log_event(f'Found {len(results)} unique search result URLs')
        
        # Take only top 5 results
        return results[:5]

    def process_urls(self, urls, query):
        """Process a list of URLs to extract summaries"""
        log_event(f'Processing {len(urls)} URLs for query: {query}')
        
        summaries = []
        for url in urls:
            if len(summaries) >= 3:  # Limit to 3 summaries
                break
                
            log_event(f'Processing URL: {url}')
            # Add a small delay to avoid rate limiting
            time.sleep(0.5 + random.random())
            
            page_content = self.get_webpage_content(url)
            if not page_content:
                log_event(f'Failed to fetch content from {url}')
                continue
            
            text = self.extract_text(page_content)
            if not text or len(text) < 200:  # Skip pages with too little text
                log_event(f'Not enough text content in {url}')
                continue
            
            summary = self.summarize_text(text)
            if summary:
                # Get a title for the page
                title = "Untitled Page"
                try:
                    soup = BeautifulSoup(page_content, 'html.parser')
                    title_tag = soup.find('title')
                    if title_tag:
                        title = title_tag.text.strip()
                except:
                    pass
                
                summaries.append({
                    'title': title,
                    'url': url,
                    'summary': summary
                })
                log_event(f'Added summary for: {title} ({url})')
        
        return summaries

    def is_question(self, query: str) -> bool:
        """Determine if the query is a question"""
        # Skip question detection for URLs
        if query.startswith('http://') or query.startswith('https://'):
            log_event(f"Query is a URL, not a question: {query}")
            return False
            
        # Check for explicit question format
        if 'DIRECT QUESTION:' in query or query.strip().endswith('?'):
            log_event(f"Query is explicitly a question: {query}")
            return True
        
        # Check for question words
        question_words = ['who', 'what', 'when', 'where', 'why', 'how', 'did', 'do', 'does', 'is', 'are', 'was', 'were']
        words = query.lower().split()
        if any(word in question_words for word in words):
            log_event(f"Query contains question words: {query}")
            return True
            
        # Additional checks from params if available
        return False
    
    def generate_llm_response(self, prompt_type: str, input_text: str, model_info: Dict) -> Tuple[bool, Optional[str], float]:
        """Generate a response using an LLM provider"""
        log_event(f"Generating {prompt_type} using LLM")
        
        # Start timing
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
            # Track the LLM call timing
            llm_call_start = time.time()
            
            if provider == 'anthropic':
                client = Anthropic(api_key=api_key)
                log_event("[DEBUG] Making Anthropic API call")
                response = client.messages.create(
                    model="claude-3-7-sonnet-latest",
                    max_tokens=64000,
                    temperature=0.3,
                    system=input_text["system"],
                    messages=[{"role": "user", "content": input_text["user"]}],
                    timeout=25
                )
                result = response.content[0].text
            elif provider == 'openai':
                client = openai.OpenAI(api_key=api_key)
                log_event("[DEBUG] Making OpenAI API call")
                response = client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[
                        {"role": "system", "content": input_text["system"]},
                        {"role": "user", "content": input_text["user"]}
                    ],
                    temperature=0.3,
                    max_tokens=100000,
                    timeout=25
                )
                result = response.choices[0].message.content
            elif provider == 'perplexity':
                headers = {
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json'
                }
                log_event("[DEBUG] Making Perplexity API call")
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
            elif provider == 'gemini':
                log_event(f"[DEBUG] Using Google Gemini API")
                
                try:
                    # Configure the Gemini client
                    client = genai.Client(
                        api_key="AIzaSyDuRfVEjL1ppESeitDMDrBbW3xhikSSnNo"
                    )
                    response = client.models.generate_content(
                        model="gemini-2.5-flash",
                        contents=input_text["user"],
                        config=types.GenerateContentConfig(
                            thinking_config=types.ThinkingConfig(thinking_budget=0) # Disables thinking
                        ),
                    )
                    
                    result = response.text
                    
                except Exception as gemini_error:
                    log_event(f"[ERROR] Gemini API error: {str(gemini_error)}")
                    return False, f"Gemini API error: {str(gemini_error)}", 0
                
            elif provider == 'chutes':
                log_event(f"[DEBUG] Using Chutes API")
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
                    "temperature": 0.7
                }
                
                response = requests.post(
                    "https://llm.chutes.ai/v1/chat/completions",
                    headers=headers,
                    json=body,
                    timeout=25
                )
                response.raise_for_status()
                result = response.json()['choices'][0]['message']['content']
            else:
                log_event(f"Unsupported provider: {provider}")
                return False, None, 0
                
            # Calculate timing
            llm_call_end = time.time()
            total_time = time.time() - start_time
            llm_time = llm_call_end - llm_call_start
            
            log_event(f"[DEBUG] LLM call took {llm_time:.2f} seconds. Total generation took {total_time:.2f} seconds")
            
            return True, result, total_time
        except Exception as e:
            log_event(f"Error in LLM call: {str(e)}")
            log_event(traceback.format_exc())
            total_time = time.time() - start_time
            return False, None, total_time

    def create_question_answer(self, query: str, summaries: List[Dict[str, str]], model_info: Dict, conversation_history=None) -> Tuple[bool, Dict]:
        """Generate an answer to a question using available sources and model knowledge"""
        log_event(f"Creating answer for question: {query}")
        
        # Clean any DIRECT QUESTION: prefix for better prompt formatting
        clean_query = query.replace("DIRECT QUESTION:", "").strip()
        
        # Analyze if the query is comparing sources or asking for comparisons
        is_comparison_question = self._is_comparison_query(clean_query)
        log_event(f"Query identified as comparison question: {is_comparison_question}")
        
        # Create the prompt for question answering
        system_prompt = (
            "You are a helpful assistant that answers questions accurately and thoroughly. "
            "Always provide a direct answer to questions. "
            "IMPORTANT INSTRUCTIONS:\n"
            "1. If the answer IS in the provided sources or memory, use that information and cite sources.\n"
            "2. If the answer is NOT in the sources or memory, use your general knowledge to provide the best possible answer.\n"
            "3. NEVER refuse to answer - always provide your best response.\n"
            "4. When using general knowledge not from sources, clearly indicate this.\n"
            "5. Keep your answers concise and relevant to the question.\n"
            "6. If there are multiple sources or memories with conflicting information, acknowledge this and explain the differences.\n"
            "7. When comparing information from different sources, organize your answer in a structured way that highlights similarities and differences.\n"
            "8. When memory items contain information from pages visited at different times, clearly identify temporal relationships like 'according to more recent information' or 'previously known information'."
        )
        
        user_prompt = f"QUESTION: {clean_query}\n\n"
        
        # Include conversation history if available
        memory_items = []
        current_conversation = []
        
        # Track domain frequencies for source comparison
        domain_frequencies = {}
        memory_domains = set()
        memory_topics = set()
        memory_timestamps = []
        
        # First pass through conversation history to collect metadata
        if conversation_history and len(conversation_history) > 0:
            for item in conversation_history:
                role = item.get('role', '')
                content = item.get('content', '')
                is_memory = item.get('isMemory', False)
                
                # Skip items with no content
                if not content.strip():
                    continue
                
                # Collect domain and topic information from memory items
                if is_memory and 'source' in item:
                    source_info = item.get('source', {})
                    domain = source_info.get('domain', '')
                    if domain:
                        memory_domains.add(domain)
                        if domain in domain_frequencies:
                            domain_frequencies[domain] += 1
                        else:
                            domain_frequencies[domain] = 1
                    
                    # Extract topic if available
                    topic = source_info.get('topic', '')
                    if topic:
                        memory_topics.add(topic)
                    
                    # Track timestamps
                    timestamp = source_info.get('timestamp', 0)
                    if timestamp:
                        memory_timestamps.append(timestamp)
                
                # Collect memory items separately for better organization
                if is_memory:
                    memory_items.append({'role': role, 'content': content})
                else:
                    current_conversation.append({'role': role, 'content': content})
        
        # Analyze memory metadata for potential conflicts or source comparison opportunities
        has_multiple_sources = len(memory_domains) > 1
        has_temporal_differences = len(memory_timestamps) > 1 and max(memory_timestamps) - min(memory_timestamps) > 24 * 60 * 60 * 1000  # 24 hours in ms
        
        user_prompt += "Here is the relevant conversation and memory context:\n\n"
        
        # Add note about comparison context if appropriate
        if is_comparison_question and has_multiple_sources:
            user_prompt += "COMPARISON CONTEXT: This question appears to be comparing information across multiple sources "
            user_prompt += f"from domains: {', '.join(memory_domains)}. "
            if has_temporal_differences:
                user_prompt += "These sources were accessed at different times, so temporal context may be relevant. "
            user_prompt += "When answering, explicitly compare and contrast information from different sources.\n\n"
        
        # First add memory items if available
        if memory_items:
            user_prompt += "MEMORY CONTEXT (Information from previous conversations):\n"
            
            # Group memory items by domain for easier source comparison
            domain_groups = {}
            ungrouped_memories = []
            
            for item in memory_items:
                role = item.get('role', '')
                content = item.get('content', '')
                source_info = item.get('source', {})
                domain = source_info.get('domain', '')
                
                if domain and role == 'assistant':  # Group only answer memories by domain
                    if domain not in domain_groups:
                        domain_groups[domain] = []
                    domain_groups[domain].append(item)
                else:
                    ungrouped_memories.append(item)
            
            # Output memory items by domain groups for easier comparison
            if domain_groups and len(domain_groups) > 1 and is_comparison_question:
                user_prompt += "--- MEMORY GROUPED BY SOURCE ---\n"
                for domain, items in domain_groups.items():
                    user_prompt += f"\nFrom {domain}:\n"
                    for item in items:
                        role = item.get('role', '')
                        content = item.get('content', '')
                        timestamp = item.get('source', {}).get('timestamp', 0)
                        
                        # Add timestamp context for temporal comparison
                        date_str = ""
                        if timestamp:
                            try:
                                date_obj = datetime.fromtimestamp(timestamp / 1000)  # Convert from ms to seconds
                                date_str = f" (from {date_obj.strftime('%Y-%m-%d')})"
                            except:
                                pass
                        
                        if role == 'user':
                            user_prompt += f"Question{date_str}: {content}\n\n"
                        elif role == 'assistant':
                            user_prompt += f"Answer{date_str}: {content}\n\n"
                user_prompt += "--- END OF GROUPED MEMORY ---\n\n"
            
            # Output remaining ungrouped memories
            for item in ungrouped_memories:
                role = item.get('role', '')
                content = item.get('content', '')
                
                # Format differently based on role
                if role == 'user':
                    user_prompt += f"Previous Question: {content}\n\n"
                elif role == 'assistant':
                    user_prompt += f"Previous Answer: {content}\n\n"
            
            user_prompt += "---\n\n"
            
            # Add explicit comparison instruction if needed
            if is_comparison_question and has_multiple_sources:
                user_prompt += "IMPORTANT: The question is asking to compare information across different sources or time periods. "
                user_prompt += "Please clearly identify differences and similarities between sources "
                user_prompt += "and explain any discrepancies you find.\n\n"
        
        # Then add recent conversation
        if current_conversation:
            user_prompt += "RECENT CONVERSATION:\n"
            for item in current_conversation:
                role = item.get('role', '')
                content = item.get('content', '')
                
                if role == 'user':
                    user_prompt += f"User: {content}\n\n"
                elif role == 'assistant':
                    user_prompt += f"Assistant: {content}\n\n"
            user_prompt += "---\n\n"
        
        user_prompt += "CURRENT QUESTION AND SOURCES:\n"
        
        # Check if we have any full content sources
        has_full_content = any(source.get('is_full_content', False) for source in summaries)
        # Check if any sources contain HTML content with links
        has_html_content = any(source.get('has_html', False) for source in summaries)
        
        # Include the sources in the prompt
        if summaries:
            # If we have full content sources, prioritize them and make it clear
            if has_full_content:
                user_prompt += "FULL WEBPAGE CONTENT (complete, not summarized):\n\n"
                for idx, source in enumerate(summaries, 1):
                    if source.get('is_full_content', False):
                        user_prompt += f"Title: {source.get('title', 'Untitled')}\n"
                        user_prompt += f"URL: {source.get('url', 'No URL')}\n"
                        user_prompt += f"Content: {source.get('summary', '')}\n\n"
                        
                        # Add explicit instruction to use this full content
                        user_prompt += "IMPORTANT: This is the complete content of the webpage, not a summary. "
                        user_prompt += "The answer to the question is likely contained within this content. "
                        user_prompt += "Please read through the full content carefully to find relevant information.\n\n"
                        
                        # Add special instructions for HTML content with links
                        if source.get('has_html', False):
                            user_prompt += "NOTE: This content includes HTML with actual links in the format 'text [LINK: url]'. "
                            user_prompt += "When referring to links, use the exact URLs provided. Do not create or guess URLs. "
                            user_prompt += "If asked about links or articles, only mention those that are explicitly present in the content.\n\n"
            else:
                # Regular processing for summarized content
                for idx, source in enumerate(summaries, 1):
                    # Truncate long summaries
                    summary_text = source.get('summary', '')
                    if len(summary_text) > 500 and not source.get('is_full_content', False):
                        summary_text = summary_text[:497] + "..."
                    
                    user_prompt += f"Source {idx}:\n"
                    user_prompt += f"Title: {source.get('title', 'Untitled')}\n"
                    user_prompt += f"URL: {source.get('url', 'No URL')}\n"
                    user_prompt += f"Content: {summary_text}\n\n"
        else:
            user_prompt += "No recent sources are available. Please answer based on memory context and your general knowledge.\n\n"
            
        user_prompt += (
            "Now answer the question directly and specifically. "
            "If the answer is in the sources or memory context, cite the source. "
            "If the information is not in the sources but in memory, indicate which memory item contains the information. "
            "If neither sources nor memory contain the answer, provide the answer from your general knowledge "
            "and clearly state that it comes from your knowledge rather than the provided sources."
        )
        
        # For comparison questions, add extra guidance
        if is_comparison_question:
            user_prompt += (
                "\n\nSince this question involves comparing information, please structure your answer to clearly "
                "highlight similarities and differences between sources. You may use a structured format like:\n"
                "* Point of comparison 1: [Source A says X, Source B says Y]\n"
                "* Point of comparison 2: [Source A says P, Source B says Q]\n"
                "Conclude with insights about why these differences might exist."
            )
        
        # Generate the answer using LLM
        success, answer, generation_time = self.generate_llm_response(
            "question_answer", 
            {"system": system_prompt, "user": user_prompt}, 
            model_info
        )
        
        if not success:
            log_event("Failed to generate question answer")
            return False, {
                "query": clean_query,
                "summaries": summaries,
                "consolidated_summary": "Failed to generate an answer to your question.",
                "generation_time": generation_time,
                "isQuestion": True
            }
        
        log_event(f"Generated question answer in {generation_time:.2f} seconds")
        
        return True, {
            "query": clean_query,
            "summaries": summaries,
            "consolidated_summary": answer,
            "generation_time": generation_time,
            "isQuestion": True
        }

    def _is_comparison_query(self, query: str) -> bool:
        """Detect if a query is asking for comparison between sources or information"""
        # Convert to lowercase for easier matching
        query_lower = query.lower()
        
        # Patterns indicating comparison questions
        comparison_words = ['compare', 'difference', 'different', 'similarities', 'similar', 'versus', 'vs', 'vs.', 'better', 'worse', 'stronger', 'weaker']
        comparison_phrases = ['what is the difference', 'how do they compare', 'which one is', 'pros and cons', 'advantages and disadvantages']
        
        # Check for comparison words
        if any(word in query_lower.split() for word in comparison_words):
            return True
            
        # Check for comparison phrases
        if any(phrase in query_lower for phrase in comparison_phrases):
            return True
            
        # Check for "A or B" pattern
        if re.search(r'\b\w+\s+or\s+\w+\b', query_lower):
            return True
            
        # Check for multiple mentions of the same type of entity
        entity_patterns = [
            r'(?:between|among)\s+(.+?)\s+and\s+(.+?)\b',  # "between X and Y"
            r'(\w+)\s*(?:,|\band\b)\s*(\w+)\s+(?:are|is)'  # "X and Y are" or "X, Y are"
        ]
        
        for pattern in entity_patterns:
            if re.search(pattern, query_lower):
                return True
                
        return False

    def create_summary(self, query: str, summaries: List[Dict[str, str]], model_info: Dict) -> Tuple[bool, Dict]:
        """Generate a summary from the provided content"""
        log_event(f"Creating summary for: {query}")
        
        # Create the prompt for summarization
        system_prompt = (
            "You are a helpful assistant that creates concise, accurate summaries. "
            "Summarize the provided sources into a coherent overview that captures the key points. "
            "Focus on accuracy and clarity."
        )
        
        user_prompt = f"Please create a summary for: {query}\n\n"
        user_prompt += "Here are the sources to summarize:\n\n"
        
        # Include the sources in the prompt
        if summaries:
            for idx, source in enumerate(summaries, 1):
                # Truncate long summaries
                summary_text = source.get('summary', '')
                if len(summary_text) > 500:
                    summary_text = summary_text[:497] + "..."
                
                user_prompt += f"Source {idx}:\n"
                user_prompt += f"Title: {source.get('title', 'Untitled')}\n"
                user_prompt += f"URL: {source.get('url', 'No URL')}\n"
                user_prompt += f"Content: {summary_text}\n\n"
        else:
            user_prompt += "No sources are available for summarization.\n\n"
            
        user_prompt += (
            "Create a well-structured summary that captures the key information from all sources. "
            "Focus on accuracy and readability. "
            "Keep the consolidated summary concise (less than 150 words)."
        )
        
        # Generate the summary using LLM
        success, summary, generation_time = self.generate_llm_response(
            "summary", 
            {"system": system_prompt, "user": user_prompt}, 
            model_info
        )
        
        if not success:
            log_event("Failed to generate summary")
            return False, {
                "query": query,
                "summaries": summaries,
                "consolidated_summary": "Failed to generate summary.",
                "generation_time": generation_time,
                "isQuestion": False
            }
        
        log_event(f"Generated summary in {generation_time:.2f} seconds")
        
        return True, {
            "query": query,
            "summaries": summaries,
            "consolidated_summary": summary,
            "generation_time": generation_time,
            "isQuestion": False
        }

    def process_query(self, query, provided_urls=None, page_content=None, model_info=None, is_question=None, conversation_history=None):
        """Main entry point for processing a query - either summarizing content or answering a question"""
        log_event(f'Processing query: {query}')
        
        try:
            # Clean and prepare the query
            clean_query = self.clean_query(query)
            log_event(f'Cleaned query: {clean_query}')
            
            # Check if the query is a URL - URLs should never be considered questions
            is_url = query.startswith('http://') or query.startswith('https://')
            if is_url:
                log_event(f'Query is a URL, forcing is_question=False: {query}')
                query_is_question = False
            else:
                # Determine if this is a question
                query_is_question = is_question if is_question is not None else self.is_question(query)
                
                # Also check model_info for isQuestion flag if available
                if model_info and isinstance(model_info, dict) and 'isQuestion' in model_info:
                    query_is_question = query_is_question or model_info.get('isQuestion')
                    
                # Check originalQuery if available
                original_query = ""
                if model_info and isinstance(model_info, dict):
                    original_query = model_info.get('originalQuery', '')
                    if original_query and not is_url and self.is_question(original_query):
                        query_is_question = True
            
            # Check if this is a query about links, UI elements, or navigation
            is_about_links = False
            if model_info and isinstance(model_info, dict) and 'isAboutLinks' in model_info:
                is_about_links = model_info.get('isAboutLinks', False)
                
            # If we have HTML content, check if it should be used directly
            has_html_content = page_content and isinstance(page_content, dict) and 'htmlContent' in page_content
            if has_html_content:
                log_event(f'Page content contains HTML: {len(page_content.get("htmlContent", ""))} characters')
            
            # Log if conversation history is available
            if conversation_history:
                log_event(f'Received conversation history with {len(conversation_history)} items')
                # Log the first few items for debugging
                for i, item in enumerate(conversation_history[:3]):  # Log up to 3 items to avoid excessive logs
                    role = item.get('role', 'unknown')
                    content_preview = item.get('content', '')[:50] + '...' if len(item.get('content', '')) > 50 else item.get('content', '')
                    is_memory = item.get('isMemory', False)
                    log_event(f'  History item {i}: role={role}, isMemory={is_memory}, content={content_preview}')
            else:
                log_event('No conversation history received')
                
            log_event(f'Query is{"" if query_is_question else " not"} a question')
            
            # Special handling for queries about links with HTML content
            if query_is_question and is_about_links and has_html_content and model_info:
                log_event(f'Processing question about links/UI using HTML content')
                
                # Set up special system prompt for HTML analysis
                system_prompt = (
                    "You are a helpful assistant with expertise in understanding webpage structure and content. "
                    "When analyzing HTML content, pay special attention to links, buttons, navigation elements, and UI components. "
                    "If asked about specific UI elements or links, identify them clearly in your answer. "
                    "Format links as '[Link text](URL)' in your response for clarity. "
                    "Always provide direct answers based on the actual page content, "
                    "and do not make assumptions about content that isn't visible."
                )
                
                # Create a user prompt specifically for HTML analysis
                user_prompt = f"WEBPAGE ANALYSIS QUESTION: {clean_query}\n\n"
                user_prompt += "Below is the HTML content of a webpage with specially marked links in the format 'text [LINK: url]'.\n\n"
                user_prompt += f"Page title: {page_content.get('title', 'Untitled')}\n"
                user_prompt += f"URL: {page_content.get('url', '')}\n\n"
                
                # Add HTML content
                html_content = page_content.get('htmlContent', '')
                # Use a reasonable length limit for the HTML
                if len(html_content) > 50000:
                    html_content = html_content[:50000] + "... [HTML truncated]"
                    
                user_prompt += "HTML CONTENT:\n"
                user_prompt += html_content
                user_prompt += "\n\n"
                
                user_prompt += (
                    "Please analyze this HTML to answer the question. "
                    "If the question is about finding links, buttons, or navigation elements, "
                    "list all relevant elements with their text and URLs. "
                    "If asked about a specific link or UI element, provide details if found. "
                    "If the information isn't available in the HTML, clearly state that you cannot find it."
                )
                
                # Generate response using LLM
                success, answer, generation_time = self.generate_llm_response(
                    "html_analysis", 
                    {"system": system_prompt, "user": user_prompt}, 
                    model_info
                )
                
                if success:
                    log_event('Successfully processed HTML query')
                    return {
                        'success': True,
                        'data': {
                            "query": clean_query,
                            "summaries": [],  # No need for summaries in this mode
                            "consolidated_summary": answer,
                            "generation_time": generation_time,
                            "isQuestion": True
                        }
                    }
                
                # If HTML analysis fails, fall back to standard processing
                log_event('HTML analysis failed, falling back to standard processing')
            
            # Special handling for direct page content with questions
            if query_is_question and page_content and isinstance(page_content, dict) and model_info:
                log_event(f'Direct question with page content detected - using full content')
                
                # Extract content details - prefer HTML content if available
                has_html = 'htmlContent' in page_content and page_content.get('htmlContent')
                if has_html:
                    content = page_content.get('htmlContent', '')
                    log_event(f'Using HTML content with links ({len(content)} chars)')
                else:
                    content = page_content.get('content', '')
                    log_event(f'Using text content ({len(content)} chars)')
                
                title = page_content.get('title', 'Untitled Page')
                url = page_content.get('url', query)
                
                if content and len(content) > 200:
                    # Create a special "full content" summary that preserves all the original content
                    # This ensures we don't lose information in the summarization process
                    summaries = [{
                        'title': title,
                        'url': url,
                        'summary': content,  # Now using HTML content when available
                        'is_full_content': True,  # Flag to indicate this is full content
                        'has_html': has_html  # Track whether this contains HTML
                    }]
                    log_event(f'Using full page content for question: {title}')
                    
                    # Generate answer directly from full content
                    success, result = self.create_question_answer(clean_query, summaries, model_info, conversation_history)
                    if success:
                        return {'success': True, 'data': result}
                    else:
                        log_event('Failed to answer question with full content')
                        # Continue with normal processing as fallback
            
            # Generate summaries from sources
            summaries = []
            
            # Normal processing path for non-questions or if direct handling failed
            # If direct page content is provided, just summarize that
            if page_content and isinstance(page_content, dict):
                log_event(f'Processing direct page content: {page_content.get("title", "Untitled")}')
                
                # Prefer HTML content if available, otherwise use text content
                has_html = 'htmlContent' in page_content and page_content.get('htmlContent')
                if has_html:
                    content = page_content.get('htmlContent', '')
                    log_event(f'Using HTML content for processing ({len(content)} chars)')
                else:
                    content = page_content.get('content', '')
                    log_event(f'Using text content for processing ({len(content)} chars)')
                    
                title = page_content.get('title', 'Untitled Page')
                url = page_content.get('url', query)
                
                if content and len(content) > 200:
                    summary = self.summarize_text(content)
                    summaries.append({
                        'title': title,
                        'url': url,
                        'summary': summary,
                        'has_html': has_html
                    })
                    log_event(f'Added summary for direct page: {title}')
                else:
                    log_event('Not enough content to summarize in direct page content')
            # If URLs are provided directly, use them instead of searching
            elif provided_urls and len(provided_urls) > 0:
                log_event(f'Using {len(provided_urls)} provided URLs')
                summaries = self.process_urls(provided_urls, clean_query)
            else:
                # Otherwise, perform a search to find URLs
                log_event('No URLs provided, performing search')
                search_urls = self.get_google_search_results(clean_query)
                
                if search_urls:
                    summaries = self.process_urls(search_urls, clean_query)
            
            log_event(f'Generated {len(summaries)} summaries')
            
            # Default response for no summaries
            if not summaries:
                log_event('No summaries generated')
                default_message = "No relevant information found."
                
                # If it's a question, we'll try to answer it anyway
                if query_is_question and model_info:
                    log_event('Attempting to answer question without sources')
                    success, result = self.create_question_answer(clean_query, [], model_info, conversation_history)
                    if success:
                        return {'success': True, 'data': result}
                
                # Return a default response
                return {
                    'success': True,
                    'data': {
                        'query': clean_query,
                        'summaries': [],
                        'consolidated_summary': default_message,
                        'generation_time': 0,
                        'isQuestion': query_is_question
                    }
                }
            
            # If there's no model_info, we can only return the extracted summaries
            if not model_info:
                log_event('No model info provided, returning only summaries')
                return {
                    'success': True,
                    'data': {
                        'query': clean_query,
                        'summaries': summaries,
                        'consolidated_summary': None,
                        'generation_time': 0,
                        'isQuestion': query_is_question
                    }
                }
            
            # Generate response based on whether it's a question or summary request
            if query_is_question:
                success, result = self.create_question_answer(clean_query, summaries, model_info, conversation_history)
            else:
                success, result = self.create_summary(clean_query, summaries, model_info)
                
            if not success:
                log_event('Failed to generate response')
                return {
                    'success': True,  # Still return success to avoid client errors
                    'data': {
                        'query': clean_query,
                        'summaries': summaries,
                        'consolidated_summary': "Failed to generate a response.",
                        'generation_time': 0,
                        'isQuestion': query_is_question
                    }
                }
                
            log_event('Successfully processed query')
            return {'success': True, 'data': result}
            
        except Exception as e:
            log_event(f'Error in process_query: {e}')
            log_event(traceback.format_exc())
            return {
                'success': False,
                'error': str(e)
            }

if __name__ == "__main__":
    log_event("=== Starting new topic_agent.py execution ===")
    
    # Check if we have direct input from the browser
    if len(sys.argv) > 1:
        input_arg = sys.argv[1]
        log_event(f'Received input: {input_arg[:100]}...' if len(input_arg) > 100 else input_arg)
        
        # Try to parse as JSON
        try:
            params = json.loads(input_arg)
            log_event(f"Parsed JSON parameters: {json.dumps(params)}")
            
            # Extract parameters
            query = params.get('query', '')
            urls = params.get('urls', [])
            page_content = params.get('pageContent', None)
            model_info = params.get('modelInfo', None)
            is_question = params.get('isQuestion', None)
            conversation_history = params.get('conversationHistory', None)
            is_about_links = params.get('isAboutLinks', False)
            
            # Check if HTML content was provided and needs to be preserved in page_content
            if page_content and isinstance(page_content, dict) and 'htmlContent' in page_content:
                log_event(f"HTML content found ({len(page_content['htmlContent'])} chars)")
                # We already have the HTML content in page_content, no action needed
            
            # Add isAboutLinks to model_info for processing by the agent
            if is_about_links and model_info and isinstance(model_info, dict):
                model_info['isAboutLinks'] = is_about_links
                log_event(f"Added isAboutLinks=True to model_info")
            
            # Force is_question to False if query is a URL
            if query.startswith('http://') or query.startswith('https://'):
                log_event(f"Query is a URL, forcing is_question=False: {query}")
                is_question = False
                
                # Also update in modelInfo if present
                if model_info and isinstance(model_info, dict):
                    model_info['isQuestion'] = False
            
            # Execute agent
            agent = TopicAgent()
            result = agent.process_query(query, urls, page_content, model_info, is_question, conversation_history)
            
            # Return result
            print(json.dumps(result))
            log_event(f'Completed processing. Success: {result.get("success", False)}')
            sys.exit(0)
        except json.JSONDecodeError:
            # Not JSON, treat as regular query
            log_event(f'Input is not JSON, treating as regular query: {input_arg}')
            query = input_arg
    else:
        # Default query if none provided
        query = "artificial intelligence"
    
    # Standard processing with search for non-JSON input
    log_event(f'Starting agent with query: {query}')
    agent = TopicAgent()
    result = agent.process_query(query)
    
    # Output result as JSON
    print(json.dumps(result))
    log_event(f'Completed processing. Success: {result.get("success", False)}') 