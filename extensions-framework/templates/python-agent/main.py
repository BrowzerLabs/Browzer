#!/usr/bin/env python3
"""
Example Python Agent Extension for Browzer

This demonstrates how to create AI-powered browser extensions using Python.
"""

import json
import sys
import asyncio
from typing import Dict, Any, List, Optional
import openai
from dataclasses import dataclass


@dataclass
class ExtensionContext:
    """Context passed from the browser to the extension"""
    extension_id: str
    config: Dict[str, Any]
    permissions: List[str]
    
    
@dataclass 
class BrowserTab:
    """Information about a browser tab"""
    id: str
    url: str
    title: str
    content: str


class PythonAgent:
    """Main Python agent class"""
    
    def __init__(self, context: ExtensionContext):
        self.context = context
        self.config = context.config
        
        # Initialize AI client
        if 'apiKey' in self.config:
            openai.api_key = self.config['apiKey']
        
    async def initialize(self):
        """Initialize the agent"""
        await self.log_info("Python Agent initialized successfully")
        
    async def process_page(self, tab: BrowserTab) -> Dict[str, Any]:
        """Process a web page and return insights"""
        try:
            # Extract key information from the page
            insights = await self._analyze_content(tab.content, tab.url)
            
            return {
                'success': True,
                'insights': insights,
                'summary': await self._generate_summary(tab.content),
                'keywords': await self._extract_keywords(tab.content),
                'sentiment': await self._analyze_sentiment(tab.content)
            }
            
        except Exception as e:
            await self.log_error(f"Error processing page: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def answer_question(self, question: str, context: str = "") -> Dict[str, Any]:
        """Answer a question based on the page content"""
        try:
            prompt = self._build_qa_prompt(question, context)
            
            response = await openai.ChatCompletion.acreate(
                model=self.config.get('model', 'gpt-3.5-turbo'),
                messages=[
                    {"role": "system", "content": "You are a helpful AI assistant that answers questions about web content."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=self.config.get('maxTokens', 1000),
                temperature=self.config.get('temperature', 0.7)
            )
            
            answer = response.choices[0].message.content
            
            return {
                'success': True,
                'answer': answer,
                'model': self.config.get('model', 'gpt-3.5-turbo')
            }
            
        except Exception as e:
            await self.log_error(f"Error answering question: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _analyze_content(self, content: str, url: str) -> Dict[str, Any]:
        """Analyze web content using AI"""
        # Truncate content if too long
        if len(content) > 4000:
            content = content[:4000] + "..."
            
        prompt = f"""
        Analyze this web page content and provide insights:
        
        URL: {url}
        Content: {content}
        
        Please provide:
        1. Main topic/theme
        2. Key points (3-5 bullet points)  
        3. Content type (article, product page, news, etc.)
        4. Estimated reading time
        5. Quality assessment (1-10)
        """
        
        try:
            response = await openai.ChatCompletion.acreate(
                model=self.config.get('model', 'gpt-3.5-turbo'),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=500,
                temperature=0.3
            )
            
            return {
                'analysis': response.choices[0].message.content,
                'url': url,
                'content_length': len(content)
            }
            
        except Exception as e:
            return {'error': str(e)}
    
    async def _generate_summary(self, content: str) -> str:
        """Generate a summary of the content"""
        if len(content) > 3000:
            content = content[:3000] + "..."
            
        prompt = f"Summarize this content in 2-3 sentences:\n\n{content}"
        
        try:
            response = await openai.ChatCompletion.acreate(
                model=self.config.get('model', 'gpt-3.5-turbo'),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=150,
                temperature=0.3
            )
            
            return response.choices[0].message.content
            
        except Exception:
            return "Unable to generate summary"
    
    async def _extract_keywords(self, content: str) -> List[str]:
        """Extract keywords from content"""
        # Simple keyword extraction (in real implementation, use NLP libraries)
        words = content.lower().split()
        # Filter out common words, count frequencies, return top keywords
        # This is a simplified version
        return ['keyword1', 'keyword2', 'keyword3']  # Placeholder
    
    async def _analyze_sentiment(self, content: str) -> str:
        """Analyze sentiment of the content"""
        if len(content) > 2000:
            content = content[:2000]
            
        prompt = f"Analyze the sentiment of this text (positive/negative/neutral):\n\n{content}"
        
        try:
            response = await openai.ChatCompletion.acreate(
                model=self.config.get('model', 'gpt-3.5-turbo'),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=50,
                temperature=0.1
            )
            
            return response.choices[0].message.content.strip().lower()
            
        except Exception:
            return "neutral"
    
    def _build_qa_prompt(self, question: str, context: str) -> str:
        """Build a prompt for question answering"""
        return f"""
        Based on this context, please answer the following question:
        
        Context: {context[:3000]}
        
        Question: {question}
        
        Please provide a clear and concise answer based on the context provided.
        """
    
    async def log_info(self, message: str):
        """Log info message"""
        print(f"[INFO] {self.context.extension_id}: {message}")
    
    async def log_error(self, message: str):
        """Log error message"""
        print(f"[ERROR] {self.context.extension_id}: {message}")


async def main():
    """Main entry point for the extension"""
    try:
        # Read input from stdin (sent by the browser)
        input_data = sys.stdin.read()
        request = json.loads(input_data)
        
        # Extract context and action
        context = ExtensionContext(**request['context'])
        action = request['action']
        data = request.get('data', {})
        
        # Create agent instance
        agent = PythonAgent(context)
        await agent.initialize()
        
        # Handle different actions
        result = {}
        
        if action == 'process_page':
            tab = BrowserTab(**data)
            result = await agent.process_page(tab)
            
        elif action == 'answer_question':
            result = await agent.answer_question(
                data['question'], 
                data.get('context', '')
            )
            
        else:
            result = {
                'success': False,
                'error': f'Unknown action: {action}'
            }
        
        # Return result as JSON
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e)
        }
        print(json.dumps(error_result))


if __name__ == '__main__':
    asyncio.run(main()) 