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

    def process_query(self, query, provided_urls=None, page_content=None):
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
                        ]
                    }
                }
            
            
            return {
                'success': True,
                'data': {
                    'query': clean_query,
                    'summaries': summaries
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
            query = params.get('query', '')
            urls = params.get('urls', [])
            page_content = params.get('pageContent', None)
            
            agent = TopicAgent()
            
            if page_content:
                log_event(f'Parsed input as JSON with direct page content: {page_content.get("title", "Untitled")}')
                result = agent.process_query(query, None, page_content)
            elif urls:
                log_event(f'Parsed input as JSON with {len(urls)} URLs and query: {query}')
                result = agent.process_query(query, urls)
            else:
                log_event(f'Parsed input as JSON but found no URLs or page content')
                result = agent.process_query(query)
                
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