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
import asyncio
import aiohttp

LOG_FILE = os.path.join(os.path.dirname(__file__), 'topic_agent.log')
def log_event(message):
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{datetime.now().isoformat()}] {message}\n")

class TopicAgent:
    def __init__(self):
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
        log_event('Initialized TopicAgent')

    def get_random_user_agent(self):
        return random.choice(self.user_agents)

    def get_webpage_content(self, url):
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
            log_event(f'Fetched content for URL: {url} (status: {response.status_code})')
            return response.text
        except Exception as e:
            log_event(f'Error fetching URL {url}: {e}')
            return None

    def extract_text(self, html_content):
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
        
        # Log a sample of the extracted text for debugging
        sample = text[:150] + "..." if len(text) > 150 else text
        log_event(f'Extracted text sample: {sample}')
        
        return text

    def summarize_text(self, text, num_sentences=5):
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
        # Clean and normalize the query
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
        
        # Take only top 5 results (we'll process until we get 3 valid ones)
        return results[:5]

    def process_urls(self, urls, query):
        """Process a list of URLs provided directly by the browser"""
        log_event(f'Processing {len(urls)} URLs provided by browser for query: {query}')
        
        summaries = []
        for url in urls:
            if len(summaries) >= 3:
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

    def create_consolidated_summary(self, summaries: List[Dict[str, str]], model_info: Dict[str, str]) -> Tuple[bool, Optional[str], float]:
        log_event(f"[DEBUG] Received model_info: {model_info}")
        
        # Start timing
        start_time = time.time()
        
        # Check if model_info is None or empty
        if not model_info:
            log_event(f"[ERROR] model_info is None or empty. Cannot generate summary.")
            return False, None, 0
            
        # Get provider with proper error handling
        provider = model_info.get('provider', '').lower()
        
        # Try different ways to access the API key (api_key, apiKey, API_KEY, etc.)
        api_key = None
        for key_name in ['api_key', 'apiKey', 'API_KEY', 'api-key']:
            if key_name in model_info and model_info[key_name]:
                api_key = model_info[key_name]
                log_event(f"[DEBUG] Found API key with key name: {key_name}")
                break
                
        log_event(f"[DEBUG] Provider: {provider}, API Key present: {bool(api_key)}")
        
        if not api_key:
            log_event("[ERROR] No API key found in model_info with any known key names")
            return False, None, 0
        
        try:
            # Prepare the input text
            input_text = "Please create a concise, easy-to-understand summary from these sources:\n\n"
            
            # Limit each summary to 500 characters to avoid context window issues
            for idx, source in enumerate(summaries, 1):
                summary_text = source.get('summary', 'N/A')
                if len(summary_text) > 500:
                    summary_text = summary_text[:497] + "..."
                    log_event(f"[DEBUG] Truncated summary {idx} from {len(source.get('summary', 'N/A'))} to 500 chars")
                
                input_text += f"Source {idx}:\n"
                input_text += f"Title: {source.get('title', 'N/A')}\n"
                input_text += f"URL: {source.get('url', 'N/A')}\n"
                input_text += f"Content: {summary_text}\n\n"
            
            input_text += "\nPlease provide a clear, well-structured summary that captures the key points and main ideas from all sources. Focus on accuracy and readability. Keep the consolidate summary less than 100 words. Give me just the consolidate summary, nothing additional that's irrelevant to the topic."
            
            log_event(f"[DEBUG] Input text length: {len(input_text)} characters")
            if len(input_text) > 8000:
                log_event("[WARNING] Input text is very large, which may cause timeout issues")
                
            # Track the LLM call timing more precisely
            llm_call_start = time.time()
            
            if provider == 'anthropic':
                client = Anthropic(api_key=api_key)
                log_event("[DEBUG] Making Anthropic API call")
                response = client.messages.create(
                    model="claude-3-7-sonnet-latest",  # Use a faster, smaller model
                    max_tokens=64000,
                    temperature=0.3,
                    system="You are a helpful assistant that creates clear, concise summaries from multiple sources.",
                    messages=[{"role": "user", "content": input_text}],
                    timeout=20  # Add timeout
                )
                summary = response.content[0].text
            elif provider == 'openai':
                client = openai.OpenAI(api_key=api_key)
                log_event("[DEBUG] Making OpenAI API call")
                response = client.chat.completions.create(
                    model="gpt-3.5-turbo",  # Use a faster model
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant that creates clear, concise summaries from multiple sources."},
                        {"role": "user", "content": input_text}
                    ],
                    temperature=0.3,
                    max_tokens=100000,
                    timeout=20  # Add timeout
                )
                summary = response.choices[0].message.content
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
                            {'role': 'system', 'content': 'You are a helpful assistant that creates clear, concise summaries from multiple sources.'},
                            {'role': 'user', 'content': input_text}
                        ],
                        'temperature': 0.3,
                        'max_tokens': 100000
                    }
                )
                response.raise_for_status()
                summary = response.json()['choices'][0]['message']['content']
            elif provider == 'chutes':
                # Use a non-streaming approach with requests instead of async
                log_event(f"[DEBUG] Using Chutes with non-streaming approach")
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                
                body = {
                    "model": "deepseek-ai/DeepSeek-R1",
                    "messages": [
                        {"role": "user", "content": input_text}
                    ],
                    "stream": False,  # Non-streaming mode
                    "max_tokens": 100000,
                    "temperature": 0.7
                }
                
                try:
                    log_event("[DEBUG] Making Chutes API call")
                    response = requests.post(
                        "https://llm.chutes.ai/v1/chat/completions",
                        headers=headers,
                        json=body,
                        timeout=20  # Lower timeout to prevent hanging
                    )
                    response.raise_for_status()
                    response_json = response.json()
                    log_event(f"[DEBUG] Chutes response received: {response_json}")
                    summary = response_json['choices'][0]['message']['content']
                except Exception as e:
                    log_event(f"[ERROR] Error in Chutes request: {str(e)}")
                    return False, None, 0
            else:
                log_event(f"Unsupported provider: {provider}")
                return False, None, 0
                
            # Calculate timing
            llm_call_end = time.time()
            total_time = time.time() - start_time
            llm_time = llm_call_end - llm_call_start
            
            log_event(f"[DEBUG] LLM call took {llm_time:.2f} seconds. Total summary generation took {total_time:.2f} seconds")
            log_event("Successfully generated consolidated summary")
            
            return True, summary, total_time
        except Exception as e:
            log_event(f"Error creating consolidated summary: {str(e)}")
            total_time = time.time() - start_time
            return False, None, total_time

    def process_query(self, query, provided_urls=None, page_content=None, model_info=None):
        log_event(f'Processing query: {query}')
        
        # Clean and prepare the query
        clean_query = self.clean_query(query)
        log_event(f'Cleaned query: {clean_query}')
        
        try:
            summaries = []
            
            # If direct page content is provided, just summarize that
            if page_content and isinstance(page_content, dict):
                log_event(f'Processing direct page content: {page_content.get("title", "Untitled")}')
                
                # Extract the content
                content = page_content.get('content', '')
                title = page_content.get('title', 'Untitled Page')
                url = page_content.get('url', query)
                
                if content and len(content) > 200:
                    summary = self.summarize_text(content)
                    summaries.append({
                        'title': title,
                        'url': url,
                        'summary': summary
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
            
            if not summaries:
                log_event('Failed to generate any summaries')
                return {
                    'success': True,
                    'data': {
                        'query': clean_query,
                        'summaries': [
                            {
                                'title': 'No Results',
                                'url': 'https://example.com',
                                'summary': f'Unable to generate summaries for the query: "{clean_query}". Please try a different search term or visit a specific website.'
                            }
                        ],
                        'consolidated_summary': None,
                        'generation_time': 0
                    }
                }
            
            # Create consolidated summary if model info is provided
            consolidated_summary = None
            generation_time = 0
            log_event(f"[DEBUG] PROCESS_QUERY BEFORE IF: Received model_info: {model_info} and summaries: {summaries}")
            if model_info and summaries:
                log_event(f"[DEBUG] PROCESS_QUERY: Creating consolidated summary with model_info: {model_info}")
                success, summary, generation_time = self.create_consolidated_summary(summaries, model_info)
                if success:
                    consolidated_summary = summary
                    log_event(f'Successfully created consolidated summary in {generation_time:.2f} seconds')
                else:
                    log_event('Failed to create consolidated summary')
            
            return {
                'success': True,
                'data': {
                    'query': clean_query,
                    'summaries': summaries,
                    'consolidated_summary': consolidated_summary,
                    'generation_time': generation_time
                }
            }
            
        except Exception as e:
            log_event(f'Error in process_query: {e}')
            return {
                'success': False,
                'error': str(e)
            }

if __name__ == "__main__":
    # Check if we have direct URLs from the browser
    if len(sys.argv) > 1:
        input_arg = sys.argv[1]
        log_event(f'Received input: {input_arg[:100]}...' if len(input_arg) > 100 else input_arg)
        
        # Try to parse as JSON (containing URLs and query)
        try:
            params = json.loads(input_arg)
            log_event(f"[DEBUG] Parsed JSON parameters: {json.dumps(params)}")
            
            query = params.get('query', '')
            urls = params.get('urls', [])
            page_content = params.get('pageContent', None)
            model_info = params.get('modelInfo', None)
            
            log_event(f"[DEBUG] modelInfo in params: {model_info}")
            if model_info:
                log_event(f"[DEBUG] modelInfo keys: {list(model_info.keys())}")
                log_event(f"[DEBUG] modelInfo provider: {model_info.get('provider')}")
                if 'apiKey' in model_info:
                    log_event(f"[DEBUG] modelInfo has apiKey: {bool(model_info['apiKey'])}")
                if 'api_key' in model_info:
                    log_event(f"[DEBUG] modelInfo has api_key: {bool(model_info['api_key'])}")
            
            agent = TopicAgent()
            
            if page_content:
                log_event(f'Parsed input as JSON with direct page content: {page_content.get("title", "Untitled")}')
                result = agent.process_query(query, None, page_content, model_info)
            elif urls:
                log_event(f'Parsed input as JSON with {len(urls)} URLs and query: {query}')
                result = agent.process_query(query, urls, None, model_info)
            else:
                log_event(f'Parsed input as JSON with query: {query} and modelInfo: {model_info is not None}')
                result = agent.process_query(query, None, None, model_info)
                
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
    
    # Standard processing with search
    log_event(f'Starting agent with query: {query}')
    agent = TopicAgent()
    result = agent.process_query(query)
    
    # Output result as JSON
    print(json.dumps(result))
    log_event(f'Completed processing. Success: {result.get("success", False)}') 