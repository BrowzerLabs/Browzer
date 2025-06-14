# Python Agent SDK - Technical Implementation Guide

## Implementation Architecture

This guide provides the technical details for implementing the Python Agent SDK that will standardize agent development and abstract away complexity.

## Core Implementation

### 1. Base Agent Class (`browzer_sdk/agent.py`)

```python
#!/usr/bin/env python3
"""
Browzer Agent SDK - Base Agent Class
"""

import json
import sys
import asyncio
import time
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from datetime import datetime

from .context import QueryContext
from .providers import AIProviderManager
from .exceptions import BrowzerSDKError, ConfigurationError
from .utils import safe_json_dumps, truncate_text


class BrowzerAgent(ABC):
    """
    Base class for all Browzer agents.
    
    Developers inherit from this class and implement the process_query method.
    All infrastructure concerns (API keys, providers, context parsing) are handled automatically.
    """
    
    def __init__(self):
        """Initialize the agent with context from stdin"""
        self._start_time = time.time()
        self._context_data = None
        self._ai_manager = None
        self._initialized = False
    
    async def _initialize_from_browser(self):
        """Initialize agent from browser context (called automatically)"""
        if self._initialized:
            return
            
        try:
            # Read context from stdin (sent by browser)
            input_data = sys.stdin.read()
            if not input_data.strip():
                raise ConfigurationError("No input data received from browser")
            
            request = json.loads(input_data)
            
            # Parse context
            self._context_data = request
            
            # Initialize AI provider manager
            context = request.get('context', {})
            api_keys = context.get('browser_api_keys', {})
            provider = context.get('selected_provider', 'openai')
            model = context.get('selected_model', 'auto')
            
            self._ai_manager = AIProviderManager(
                api_keys=api_keys,
                default_provider=provider,
                default_model=model
            )
            
            await self._ai_manager.initialize()
            self._initialized = True
            
        except Exception as e:
            await self.log_error(f"Failed to initialize agent: {e}")
            raise ConfigurationError(f"Agent initialization failed: {e}")
    
    @abstractmethod
    async def process_query(self, context: QueryContext) -> Dict[str, Any]:
        """
        Process a query and return a response.
        
        This is the ONLY method developers need to implement.
        
        Args:
            context: QueryContext object with all request data
            
        Returns:
            Dict with response data. Must include 'success' boolean.
        """
        raise NotImplementedError("Agents must implement process_query method")
    
    # Helper methods available to developers
    
    async def get_ai_response(self, prompt: str, **kwargs) -> str:
        """
        Get AI response using the configured provider and model.
        
        Args:
            prompt: The prompt to send to the AI
            **kwargs: Additional parameters (max_tokens, temperature, etc.)
            
        Returns:
            str: AI response text
        """
        if not self._ai_manager:
            raise ConfigurationError("Agent not properly initialized")
        
        return await self._ai_manager.get_response(prompt, **kwargs)
    
    async def get_chat_response(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """
        Get AI response using chat/conversation format.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            **kwargs: Additional parameters
            
        Returns:
            str: AI response text
        """
        if not self._ai_manager:
            raise ConfigurationError("Agent not properly initialized")
        
        return await self._ai_manager.get_chat_response(messages, **kwargs)
    
    def get_processing_time(self) -> float:
        """Get elapsed processing time in seconds"""
        return time.time() - self._start_time
    
    async def log_info(self, message: str):
        """Log info message (goes to stderr, won't interfere with JSON output)"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] INFO [{self.get_agent_id()}]: {message}", file=sys.stderr)
    
    async def log_error(self, message: str):
        """Log error message"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] ERROR [{self.get_agent_id()}]: {message}", file=sys.stderr)
    
    def get_agent_id(self) -> str:
        """Get agent ID from context"""
        if not self._context_data:
            return "unknown"
        return self._context_data.get('context', {}).get('extension_id', 'unknown-agent')
    
    # Internal framework methods
    
    async def _execute(self) -> Dict[str, Any]:
        """
        Internal method called by the framework.
        Handles initialization, context parsing, and error handling.
        """
        try:
            # Initialize from browser context
            await self._initialize_from_browser()
            
            # Parse request context
            context = self._parse_context()
            
            # Log execution start
            await self.log_info(f"Processing query: '{truncate_text(context.query, 50)}'")
            
            # Call developer's implementation
            result = await self.process_query(context)
            
            # Validate response
            if not isinstance(result, dict):
                raise BrowzerSDKError("process_query must return a dictionary")
            
            if 'success' not in result:
                result['success'] = True  # Default to success if not specified
            
            # Add metadata
            result.setdefault('processing_time', self.get_processing_time())
            result.setdefault('agent_id', self.get_agent_id())
            result.setdefault('timestamp', datetime.now().isoformat())
            
            await self.log_info(f"Query processed successfully in {result['processing_time']:.2f}s")
            return result
            
        except Exception as e:
            await self.log_error(f"Query processing failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'processing_time': self.get_processing_time(),
                'agent_id': self.get_agent_id(),
                'timestamp': datetime.now().isoformat()
            }
    
    def _parse_context(self) -> QueryContext:
        """Parse browser context into QueryContext object"""
        if not self._context_data:
            raise ConfigurationError("No context data available")
        
        data = self._context_data.get('data', {})
        context_info = self._context_data.get('context', {})
        
        return QueryContext(
            # Query information
            query=data.get('query', ''),
            is_question=data.get('isQuestion', False),
            
            # Page information
            page_url=data.get('url', ''),
            page_title=data.get('title', ''),
            page_content=data.get('content', ''),
            urls=data.get('urls', []),
            
            # Conversation
            conversation_history=data.get('conversationHistory', []),
            
            # AI configuration
            provider=context_info.get('selected_provider', 'openai'),
            model=context_info.get('selected_model', 'auto'),
            
            # Browser context
            tab_id=data.get('id', ''),
            timestamp=datetime.now()
        )


# Entry point for agents
async def run_agent(agent_class):
    """
    Entry point function that agents call in their __main__ block.
    
    Usage:
        if __name__ == '__main__':
            from browzer_sdk import run_agent
            run_agent(MyAgent)
    """
    try:
        agent = agent_class()
        result = await agent._execute()
        
        # Output result as JSON to stdout
        print(safe_json_dumps(result))
        
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }
        print(safe_json_dumps(error_result))
```

### 2. Query Context (`browzer_sdk/context.py`)

```python
"""
Browzer Agent SDK - Context Objects
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from datetime import datetime


@dataclass
class QueryContext:
    """
    Context object containing all information about the current request.
    
    This provides developers with clean, typed access to all request data
    without needing to parse JSON or handle missing fields.
    """
    
    # Query Information
    query: str                              # The user's query/question
    is_question: bool                       # Whether this is a question vs. page analysis
    
    # Page Information
    page_url: str                          # Current page URL
    page_title: str                        # Page title
    page_content: str                      # Extracted page content
    urls: List[str]                        # All URLs found on the page
    
    # Conversation Context
    conversation_history: List[Dict[str, Any]]  # Previous messages in conversation
    
    # AI Configuration (read-only)
    provider: str                          # AI provider: 'openai', 'anthropic', 'perplexity'
    model: str                            # Model name or 'auto' for automatic selection
    
    # Browser Context
    tab_id: str                           # Browser tab identifier
    timestamp: datetime                    # Request timestamp
    
    # Computed properties
    
    @property
    def has_content(self) -> bool:
        """Whether page content is available"""
        return bool(self.page_content and self.page_content.strip())
    
    @property
    def content_length(self) -> int:
        """Length of page content"""
        return len(self.page_content) if self.page_content else 0
    
    @property
    def has_conversation(self) -> bool:
        """Whether conversation history exists"""
        return bool(self.conversation_history)
    
    @property
    def conversation_length(self) -> int:
        """Number of messages in conversation history"""
        return len(self.conversation_history)
    
    @property
    def truncated_content(self) -> str:
        """Page content truncated to reasonable length for AI processing"""
        if not self.page_content:
            return ""
        
        # Truncate to ~4000 characters for AI processing
        if len(self.page_content) > 4000:
            return self.page_content[:4000] + "... [content truncated]"
        
        return self.page_content
    
    def get_recent_conversation(self, max_messages: int = 10) -> List[Dict[str, Any]]:
        """Get recent conversation messages"""
        if not self.conversation_history:
            return []
        
        return self.conversation_history[-max_messages:]
```

### 3. AI Provider Manager (`browzer_sdk/providers.py`)

```python
"""
Browzer Agent SDK - AI Provider Management
"""

import asyncio
from typing import Dict, Any, List, Optional
from abc import ABC, abstractmethod

from .exceptions import ProviderError, ConfigurationError
from .models import ModelManager


class AIProvider(ABC):
    """Abstract base class for AI providers"""
    
    def __init__(self, api_key: str, model_manager: ModelManager):
        self.api_key = api_key
        self.model_manager = model_manager
        self.name = self.__class__.__name__.lower().replace('provider', '')
    
    @abstractmethod
    async def get_response(self, prompt: str, model: str, **kwargs) -> str:
        """Get a text response from the AI provider"""
        pass
    
    @abstractmethod
    async def get_chat_response(self, messages: List[Dict[str, str]], model: str, **kwargs) -> str:
        """Get a chat response from the AI provider"""
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if this provider is available (has API key, etc.)"""
        pass


class OpenAIProvider(AIProvider):
    """OpenAI provider implementation"""
    
    async def get_response(self, prompt: str, model: str, **kwargs) -> str:
        try:
            import openai
            client = openai.AsyncOpenAI(api_key=self.api_key)
            
            response = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=kwargs.get('max_tokens', 1000),
                temperature=kwargs.get('temperature', 0.7)
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            raise ProviderError(f"OpenAI request failed: {e}")
    
    async def get_chat_response(self, messages: List[Dict[str, str]], model: str, **kwargs) -> str:
        try:
            import openai
            client = openai.AsyncOpenAI(api_key=self.api_key)
            
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=kwargs.get('max_tokens', 1000),
                temperature=kwargs.get('temperature', 0.7)
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            raise ProviderError(f"OpenAI chat request failed: {e}")
    
    def is_available(self) -> bool:
        return bool(self.api_key and self.api_key.strip())


class AnthropicProvider(AIProvider):
    """Anthropic provider implementation"""
    
    async def get_response(self, prompt: str, model: str, **kwargs) -> str:
        try:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=self.api_key)
            
            response = await client.messages.create(
                model=model,
                max_tokens=kwargs.get('max_tokens', 1000),
                messages=[{"role": "user", "content": prompt}]
            )
            
            return response.content[0].text
            
        except Exception as e:
            raise ProviderError(f"Anthropic request failed: {e}")
    
    async def get_chat_response(self, messages: List[Dict[str, str]], model: str, **kwargs) -> str:
        try:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=self.api_key)
            
            # Filter out system messages for Anthropic
            user_messages = [msg for msg in messages if msg['role'] != 'system']
            
            response = await client.messages.create(
                model=model,
                max_tokens=kwargs.get('max_tokens', 1000),
                messages=user_messages
            )
            
            return response.content[0].text
            
        except Exception as e:
            raise ProviderError(f"Anthropic chat request failed: {e}")
    
    def is_available(self) -> bool:
        return bool(self.api_key and self.api_key.strip())


class PerplexityProvider(AIProvider):
    """Perplexity provider implementation"""
    
    async def get_response(self, prompt: str, model: str, **kwargs) -> str:
        try:
            import openai  # Perplexity uses OpenAI-compatible API
            client = openai.AsyncOpenAI(
                api_key=self.api_key,
                base_url="https://api.perplexity.ai"
            )
            
            response = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=kwargs.get('max_tokens', 1000),
                temperature=kwargs.get('temperature', 0.7)
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            raise ProviderError(f"Perplexity request failed: {e}")
    
    async def get_chat_response(self, messages: List[Dict[str, str]], model: str, **kwargs) -> str:
        try:
            import openai
            client = openai.AsyncOpenAI(
                api_key=self.api_key,
                base_url="https://api.perplexity.ai"
            )
            
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=kwargs.get('max_tokens', 1000),
                temperature=kwargs.get('temperature', 0.7)
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            raise ProviderError(f"Perplexity chat request failed: {e}")
    
    def is_available(self) -> bool:
        return bool(self.api_key and self.api_key.strip())


class AIProviderManager:
    """Manages multiple AI providers with automatic failover"""
    
    def __init__(self, api_keys: Dict[str, str], default_provider: str = 'openai', default_model: str = 'auto'):
        self.api_keys = api_keys
        self.default_provider = default_provider
        self.default_model = default_model
        self.providers: Dict[str, AIProvider] = {}
        self.model_manager = ModelManager()
    
    async def initialize(self):
        """Initialize available providers"""
        # Initialize providers based on available API keys
        if 'openai_api_key' in self.api_keys:
            self.providers['openai'] = OpenAIProvider(
                self.api_keys['openai_api_key'], 
                self.model_manager
            )
        
        if 'anthropic_api_key' in self.api_keys:
            self.providers['anthropic'] = AnthropicProvider(
                self.api_keys['anthropic_api_key'], 
                self.model_manager
            )
        
        if 'perplexity_api_key' in self.api_keys:
            self.providers['perplexity'] = PerplexityProvider(
                self.api_keys['perplexity_api_key'], 
                self.model_manager
            )
        
        if not self.providers:
            raise ConfigurationError("No AI providers available - check API keys")
    
    async def get_response(self, prompt: str, **kwargs) -> str:
        """Get AI response with automatic provider/model selection"""
        provider_name = kwargs.get('provider', self.default_provider)
        model = kwargs.get('model', self.default_model)
        
        # Auto-select model if needed
        if model == 'auto':
            model = self.model_manager.select_best_model(provider_name, prompt)
        
        # Try primary provider
        if provider_name in self.providers and self.providers[provider_name].is_available():
            try:
                return await self.providers[provider_name].get_response(prompt, model, **kwargs)
            except Exception as e:
                # Log error and try fallback
                print(f"Provider {provider_name} failed: {e}", file=sys.stderr)
        
        # Try fallback providers
        for fallback_provider in self.providers.values():
            if fallback_provider.name != provider_name and fallback_provider.is_available():
                try:
                    fallback_model = self.model_manager.select_best_model(fallback_provider.name, prompt)
                    return await fallback_provider.get_response(prompt, fallback_model, **kwargs)
                except Exception:
                    continue
        
        raise ProviderError("All AI providers failed")
    
    async def get_chat_response(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Get chat response with automatic provider/model selection"""
        provider_name = kwargs.get('provider', self.default_provider)
        model = kwargs.get('model', self.default_model)
        
        # Auto-select model if needed
        if model == 'auto':
            content = ' '.join([msg['content'] for msg in messages])
            model = self.model_manager.select_best_model(provider_name, content)
        
        # Try primary provider
        if provider_name in self.providers and self.providers[provider_name].is_available():
            try:
                return await self.providers[provider_name].get_chat_response(messages, model, **kwargs)
            except Exception as e:
                print(f"Provider {provider_name} failed: {e}", file=sys.stderr)
        
        # Try fallback providers
        for fallback_provider in self.providers.values():
            if fallback_provider.name != provider_name and fallback_provider.is_available():
                try:
                    content = ' '.join([msg['content'] for msg in messages])
                    fallback_model = self.model_manager.select_best_model(fallback_provider.name, content)
                    return await fallback_provider.get_chat_response(messages, fallback_model, **kwargs)
                except Exception:
                    continue
        
        raise ProviderError("All AI providers failed")
```

### 4. Model Management (`browzer_sdk/models.py`)

```python
"""
Browzer Agent SDK - Model Management
"""

from typing import Dict, Any, List


class ModelManager:
    """Manages model selection and capabilities"""
    
    # Model definitions with capabilities
    MODELS = {
        'openai': {
            'gpt-4-turbo': {
                'context': 128000, 
                'features': ['text', 'vision'], 
                'cost': 'high',
                'speed': 'medium'
            },
            'gpt-4': {
                'context': 8192, 
                'features': ['text'], 
                'cost': 'high',
                'speed': 'slow'
            },
            'gpt-3.5-turbo': {
                'context': 16385, 
                'features': ['text'], 
                'cost': 'low',
                'speed': 'fast'
            }
        },
        'anthropic': {
            'claude-3-opus-20240229': {
                'context': 200000, 
                'features': ['text', 'vision'], 
                'cost': 'high',
                'speed': 'slow'
            },
            'claude-3-sonnet-20240229': {
                'context': 200000, 
                'features': ['text', 'vision'], 
                'cost': 'medium',
                'speed': 'medium'
            },
            'claude-3-haiku-20240307': {
                'context': 200000, 
                'features': ['text'], 
                'cost': 'low',
                'speed': 'fast'
            }
        },
        'perplexity': {
            'pplx-7b-online': {
                'context': 4096, 
                'features': ['text', 'web'], 
                'cost': 'low',
                'speed': 'fast'
            },
            'pplx-70b-online': {
                'context': 4096, 
                'features': ['text', 'web'], 
                'cost': 'medium',
                'speed': 'medium'
            }
        }
    }
    
    def select_best_model(self, provider: str, content: str = '') -> str:
        """
        Automatically select the best model for a provider based on content length and complexity.
        
        Args:
            provider: Provider name ('openai', 'anthropic', 'perplexity')
            content: Content to be processed (used for length estimation)
            
        Returns:
            str: Best model name for the provider
        """
        if provider not in self.MODELS:
            # Fallback defaults
            defaults = {
                'openai': 'gpt-3.5-turbo',
                'anthropic': 'claude-3-haiku-20240307',
                'perplexity': 'pplx-7b-online'
            }
            return defaults.get(provider, 'gpt-3.5-turbo')
        
        provider_models = self.MODELS[provider]
        content_length = len(content)
        
        # Select based on content length and complexity
        if content_length > 50000:  # Very long content
            # Need high context length
            best_model = max(provider_models.items(), 
                           key=lambda x: x[1]['context'])
            return best_model[0]
        
        elif content_length > 10000:  # Medium content
            # Balance between capability and cost
            medium_models = {k: v for k, v in provider_models.items() 
                           if v['cost'] in ['low', 'medium']}
            if medium_models:
                best_model = max(medium_models.items(), 
                               key=lambda x: x[1]['context'])
                return best_model[0]
        
        else:  # Short content
            # Prefer fast, cost-effective models
            fast_models = {k: v for k, v in provider_models.items() 
                         if v['speed'] == 'fast'}
            if fast_models:
                return list(fast_models.keys())[0]
        
        # Fallback to first available model
        return list(provider_models.keys())[0]
    
    def get_model_info(self, provider: str, model: str) -> Dict[str, Any]:
        """Get information about a specific model"""
        return self.MODELS.get(provider, {}).get(model, {})
    
    def get_available_models(self, provider: str) -> List[str]:
        """Get list of available models for a provider"""
        return list(self.MODELS.get(provider, {}).keys())
```

### 5. Utilities (`browzer_sdk/utils.py`)

```python
"""
Browzer Agent SDK - Utilities
"""

import json
import sys
from typing import Any


def safe_json_dumps(obj: Any) -> str:
    """Safely serialize object to JSON string"""
    try:
        return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    except Exception as e:
        # Fallback for non-serializable objects
        return json.dumps({
            'success': False, 
            'error': f'JSON serialization failed: {e}'
        })


def truncate_text(text: str, max_length: int) -> str:
    """Truncate text to maximum length with ellipsis"""
    if not text:
        return ""
    
    if len(text) <= max_length:
        return text
    
    return text[:max_length-3] + "..."


def log_debug(message: str, agent_id: str = "unknown"):
    """Debug logging that goes to stderr"""
    print(f"[DEBUG] [{agent_id}]: {message}", file=sys.stderr)
```

### 6. SDK Package Entry Point (`browzer_sdk/__init__.py`)

```python
"""
Browzer Agent SDK

A simple, unified SDK for creating intelligent browser extensions.
"""

from .agent import BrowzerAgent, run_agent
from .context import QueryContext
from .exceptions import BrowzerSDKError, ProviderError, ConfigurationError

__version__ = "1.0.0"
__all__ = [
    'BrowzerAgent',
    'QueryContext', 
    'run_agent',
    'BrowzerSDKError',
    'ProviderError',
    'ConfigurationError'
]

# Simple usage example in docstring
"""
Usage Example:

    from browzer_sdk import BrowzerAgent, QueryContext, run_agent

    class MyAgent(BrowzerAgent):
        async def process_query(self, context: QueryContext) -> dict:
            response = await self.get_ai_response(
                f"Answer this question about the page: {context.query}"
            )
            
            return {
                "success": True,
                "response": response
            }

    if __name__ == '__main__':
        run_agent(MyAgent)
"""
```

## Integration with Existing System

### 1. Framework Integration

Update `PythonExtensionHandler.ts` to detect SDK-based agents:

```typescript
// In PythonExtensionHandler.ts
private async detectAgentType(scriptPath: string): Promise<'sdk' | 'legacy'> {
    try {
        const content = await fs.readFile(scriptPath, 'utf8');
        
        // Check for SDK imports
        if (content.includes('from browzer_sdk import') || 
            content.includes('import browzer_sdk')) {
            return 'sdk';
        }
        
        // Check for legacy patterns
        if (content.includes('class ExtensionContext') || 
            content.includes('def main()')) {
            return 'legacy';
        }
        
        return 'legacy'; // Default to legacy
    } catch (error) {
        return 'legacy';
    }
}

private async executeSDKAgent(scriptPath: string, data: any): Promise<any> {
    // SDK agents use the run_agent entry point
    const command = `python3 -c "
import sys
sys.path.insert(0, '${path.dirname(scriptPath)}')
from ${path.basename(scriptPath, '.py')} import agent
from browzer_sdk import run_agent
import asyncio
asyncio.run(run_agent(type(agent)))
"`;
    
    return this.executePythonScript(command, data);
}
```

### 2. Installation Script

Create installation script for the SDK:

```bash
#!/bin/bash
# install-sdk.sh

echo "Installing Browzer Agent SDK..."

# Create SDK directory
mkdir -p browzer-agent-sdk

# Install via pip (when published)
pip install browzer-agent-sdk

# Or install from local source during development
# pip install -e ./browzer-agent-sdk

echo "SDK installation complete!"
```

### 3. Migration Helper

Create migration tool for existing agents:

```python
#!/usr/bin/env python3
"""
Agent Migration Tool - Convert legacy agents to SDK format
"""

import re
import os
import argparse
from pathlib import Path


def migrate_agent(legacy_file: Path, output_file: Path):
    """Convert legacy agent to SDK format"""
    
    with open(legacy_file, 'r') as f:
        content = f.read()
    
    # Extract class name
    class_match = re.search(r'class (\w+Agent):', content)
    class_name = class_match.group(1) if class_match else 'MyAgent'
    
    # Generate SDK version
    sdk_content = f'''#!/usr/bin/env python3
"""
Migrated Agent - {class_name}
"""

from browzer_sdk import BrowzerAgent, QueryContext, run_agent


class {class_name}(BrowzerAgent):
    async def process_query(self, context: QueryContext) -> dict:
        """Process query using SDK context"""
        
        # TODO: Migrate your logic here
        # Access context data with: context.query, context.page_content, etc.
        # Use self.get_ai_response() for AI calls
        
        response = await self.get_ai_response(
            f"Process this query: {{context.query}} for page: {{context.page_title}}"
        )
        
        return {{
            "success": True,
            "response": response
        }}


# Agent instance for framework
agent = {class_name}()

if __name__ == '__main__':
    run_agent({class_name})
'''
    
    with open(output_file, 'w') as f:
        f.write(sdk_content)
    
    print(f"Migrated {legacy_file} -> {output_file}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Migrate legacy agents to SDK format')
    parser.add_argument('input', help='Legacy agent file')
    parser.add_argument('output', help='Output SDK agent file')
    
    args = parser.parse_args()
    migrate_agent(Path(args.input), Path(args.output))
```

## Testing Strategy

### 1. Unit Tests

```python
# tests/test_agent.py
import pytest
import asyncio
from unittest.mock import Mock, patch
from browzer_sdk import BrowzerAgent, QueryContext


class TestAgent(BrowzerAgent):
    async def process_query(self, context: QueryContext) -> dict:
        return {"success": True, "test": True}


@pytest.mark.asyncio
async def test_agent_execution():
    """Test basic agent execution"""
    agent = TestAgent()
    
    # Mock context data
    mock_context = QueryContext(
        query="test query",
        is_question=True,
        page_url="https://example.com",
        page_title="Test Page",
        page_content="Test content",
        urls=[],
        conversation_history=[],
        provider="openai",
        model="gpt-3.5-turbo",
        tab_id="test-tab",
        timestamp=datetime.now()
    )
    
    result = await agent.process_query(mock_context)
    
    assert result["success"] is True
    assert result["test"] is True
```

### 2. Integration Tests

```python
# tests/test_integration.py
import subprocess
import json
import tempfile
from pathlib import Path


def test_sdk_agent_execution():
    """Test full SDK agent execution via subprocess"""
    
    # Create test agent
    agent_code = '''
from browzer_sdk import BrowzerAgent, QueryContext, run_agent

class TestAgent(BrowzerAgent):
    async def process_query(self, context: QueryContext) -> dict:
        return {"success": True, "query": context.query}

agent = TestAgent()

if __name__ == '__main__':
    run_agent(TestAgent)
'''
    
    # Test input
    test_input = {
        "context": {
            "extension_id": "test-agent",
            "browser_api_keys": {"openai_api_key": "test-key"},
            "selected_provider": "openai"
        },
        "data": {
            "query": "test query",
            "isQuestion": True
        }
    }
    
    # Execute agent
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(agent_code)
        f.flush()
        
        result = subprocess.run(
            ['python3', f.name],
            input=json.dumps(test_input),
            capture_output=True,
            text=True
        )
        
        output = json.loads(result.stdout)
        assert output["success"] is True
        assert output["query"] == "test query"
```

This implementation provides a complete, production-ready SDK that dramatically simplifies agent development while maintaining full compatibility with the existing system. Developers can focus on their agent logic while the SDK handles all infrastructure concerns automatically. 