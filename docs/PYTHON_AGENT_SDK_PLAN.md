# Python Agent SDK Plan

## Overview

The Python Agent SDK provides a uniform development experience for creating intelligent browser extensions. It abstracts away all complexity related to model management, API keys, context handling, and browser communication, allowing developers to focus purely on their agent's logic.

## Architecture

### 1. Core SDK Structure

```
browzer-agent-sdk/
├── browzer_sdk/
│   ├── __init__.py
│   ├── agent.py          # Base agent class
│   ├── context.py        # Request context objects
│   ├── providers.py      # AI provider abstractions
│   ├── models.py         # Model management
│   ├── utils.py          # Utility functions
│   └── exceptions.py     # Custom exceptions
├── examples/
│   ├── simple_agent.py
│   ├── qa_agent.py
│   └── summarizer_agent.py
├── setup.py
├── requirements.txt
└── README.md
```

### 2. Developer Experience

Developers will inherit from a base `BrowzerAgent` class and implement a single required method:

```python
from browzer_sdk import BrowzerAgent, QueryContext

class MyAgent(BrowzerAgent):
    def process_query(self, context: QueryContext) -> dict:
        # Developer's logic here
        return {"response": "Hello world!"}
```

## Core Components

### 1. BrowzerAgent Base Class

**Purpose**: Abstract base class that handles all infrastructure concerns.

**Features**:
- Automatic model and provider management
- API key handling and validation
- Request/response formatting
- Error handling and logging
- Context parsing and validation

**Interface**:
```python
class BrowzerAgent:
    def __init__(self):
        # Automatically initialized from browser context
        pass
    
    def process_query(self, context: QueryContext) -> dict:
        # REQUIRED: Must be implemented by developer
        raise NotImplementedError
    
    # Helper methods available to developers
    def get_ai_response(self, prompt: str, **kwargs) -> str:
        # Handles provider selection and API calls
        pass
    
    def log_info(self, message: str):
        # Proper logging that doesn't interfere with JSON output
        pass
    
    def log_error(self, message: str):
        # Error logging
        pass
```

### 2. QueryContext Object

**Purpose**: Clean, typed access to all request data.

**Interface**:
```python
@dataclass
class QueryContext:
    # Query Information
    query: str                    # The user's query/question
    is_question: bool             # Whether this is a question vs. page analysis
    
    # Page Information  
    page_url: str                 # Current page URL
    page_title: str               # Page title
    page_content: str             # Extracted page content
    urls: List[str]               # All URLs on the page
    
    # Conversation
    conversation_history: List[dict]  # Previous messages
    
    # AI Configuration (read-only for developer)
    provider: str                 # 'openai', 'anthropic', 'perplexity'
    model: str                    # Model name (e.g., 'gpt-4', 'claude-3')
    
    # Browser Context
    tab_id: str                   # Browser tab ID
    timestamp: datetime           # Request timestamp
```

### 3. AI Provider Abstraction

**Purpose**: Unified interface for all AI providers with automatic failover.

**Features**:
- Provider-agnostic API calls
- Automatic API key management
- Model availability checking
- Rate limiting and error handling
- Streaming support

**Interface**:
```python
# Developers don't call providers directly, but use helper methods:

# Simple text generation
response = self.get_ai_response("Summarize this text: " + context.page_content)

# Advanced options
response = self.get_ai_response(
    prompt="Analyze this page",
    max_tokens=500,
    temperature=0.7,
    stream=False
)

# Chat-style interaction
response = self.get_chat_response([
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": context.query}
])
```

### 4. Model Management

**Purpose**: Automatic model selection and availability.

**Features**:
- Provider-specific model mapping
- Automatic model selection based on task
- Model capability awareness (context length, features)
- Fallback model selection

**Available Models**:
```python
# OpenAI
OPENAI_MODELS = {
    'gpt-4-turbo': {'context': 128000, 'features': ['text', 'vision']},
    'gpt-4': {'context': 8192, 'features': ['text']},
    'gpt-3.5-turbo': {'context': 16385, 'features': ['text']}
}

# Anthropic  
ANTHROPIC_MODELS = {
    'claude-3-opus': {'context': 200000, 'features': ['text', 'vision']},
    'claude-3-sonnet': {'context': 200000, 'features': ['text', 'vision']},
    'claude-3-haiku': {'context': 200000, 'features': ['text']}
}

# Perplexity
PERPLEXITY_MODELS = {
    'pplx-7b-online': {'context': 4096, 'features': ['text', 'web']},
    'pplx-70b-online': {'context': 4096, 'features': ['text', 'web']}
}
```

## Implementation Plan

### Phase 1: Core SDK (Week 1-2)

1. **Create Base Agent Class**
   - Abstract base class with required `process_query` method
   - Infrastructure setup (logging, error handling)
   - Context parsing and validation

2. **Implement QueryContext**
   - Typed data classes for all context information
   - Validation and sanitization
   - Helper properties and methods

3. **Provider Abstraction**
   - Unified AI provider interface
   - API key management
   - Basic model selection

### Phase 2: Enhanced Features (Week 3)

1. **Advanced Model Management**
   - Automatic model selection based on task
   - Context length optimization
   - Feature-based routing (vision, web search, etc.)

2. **Error Handling & Resilience**
   - Automatic retries with exponential backoff
   - Provider failover
   - Graceful degradation

3. **Utilities & Helpers**
   - Text processing utilities
   - Content extraction helpers
   - Response formatting tools

### Phase 3: Developer Experience (Week 4)

1. **Examples & Templates**
   - Multiple example agents
   - Common use case templates
   - Best practices documentation

2. **Testing Framework**
   - Unit testing utilities
   - Mock contexts for development
   - Integration testing helpers

3. **Documentation & Guides**
   - Comprehensive API documentation
   - Step-by-step tutorials
   - Migration guide from current format

## SDK Usage Examples

### 1. Simple Summary Agent

```python
from browzer_sdk import BrowzerAgent, QueryContext

class SummaryAgent(BrowzerAgent):
    def process_query(self, context: QueryContext) -> dict:
        if context.is_question:
            # Handle Q&A
            prompt = f"Answer this question based on the page: {context.query}\n\nPage: {context.page_content}"
        else:
            # Handle page analysis  
            prompt = f"Summarize this webpage: {context.page_content}"
        
        summary = self.get_ai_response(prompt, max_tokens=300)
        
        return {
            "success": True,
            "response": summary,
            "type": "question" if context.is_question else "analysis"
        }
```

### 2. Advanced Multi-Step Agent

```python
from browzer_sdk import BrowzerAgent, QueryContext

class ResearchAgent(BrowzerAgent):
    def process_query(self, context: QueryContext) -> dict:
        try:
            # Step 1: Analyze the query intent
            intent = self._analyze_intent(context.query)
            
            # Step 2: Extract relevant information
            info = self._extract_info(context.page_content, intent)
            
            # Step 3: Generate response
            response = self._generate_response(info, context)
            
            return {
                "success": True,
                "response": response,
                "metadata": {
                    "intent": intent,
                    "page_url": context.page_url,
                    "processing_time": self.get_processing_time()
                }
            }
        except Exception as e:
            self.log_error(f"Processing failed: {e}")
            return {"success": False, "error": str(e)}
    
    def _analyze_intent(self, query: str) -> str:
        prompt = f"What is the main intent of this query? {query}"
        return self.get_ai_response(prompt, max_tokens=50)
    
    def _extract_info(self, content: str, intent: str) -> str:
        prompt = f"Extract information relevant to '{intent}' from: {content}"
        return self.get_ai_response(prompt, max_tokens=500)
    
    def _generate_response(self, info: str, context: QueryContext) -> str:
        messages = [
            {"role": "system", "content": "You are a helpful research assistant."},
            {"role": "user", "content": f"Based on this information: {info}, please respond to: {context.query}"}
        ]
        return self.get_chat_response(messages)
```

### 3. Conversation-Aware Agent

```python
from browzer_sdk import BrowzerAgent, QueryContext

class ConversationAgent(BrowzerAgent):
    def process_query(self, context: QueryContext) -> dict:
        # Build conversation context
        messages = [{"role": "system", "content": "You are a helpful assistant that remembers previous conversation."}]
        
        # Add conversation history
        for msg in context.conversation_history[-5:]:  # Last 5 messages
            messages.append({
                "role": msg["role"],
                "content": msg["content"]
            })
        
        # Add current query with page context
        current_message = f"User question: {context.query}\n\nCurrent page: {context.page_title}\n{context.page_content[:1000]}"
        messages.append({"role": "user", "content": current_message})
        
        response = self.get_chat_response(messages, max_tokens=500)
        
        return {
            "success": True,
            "response": response,
            "conversation_length": len(context.conversation_history)
        }
```

## Installation & Setup

### 1. Package Installation

```bash
pip install browzer-agent-sdk
```

### 2. Agent Creation

```python
# my_agent.py
from browzer_sdk import BrowzerAgent, QueryContext

class MyAgent(BrowzerAgent):
    def process_query(self, context: QueryContext) -> dict:
        # Your logic here
        return {"response": "Hello!"}

# Required: Create agent instance for the framework
agent = MyAgent()
```

### 3. Manifest Configuration

```json
{
  "name": "My Agent",
  "version": "1.0.0",
  "main": "my_agent.py",
  "permissions": ["page_content", "ai_models"],
  "requirements": [
    "browzer-agent-sdk>=1.0.0"
  ]
}
```

## Migration Strategy

### 1. Backward Compatibility

The SDK will detect and support the current format during a transition period:

```python
# Current agents will continue to work
if hasattr(agent, 'process_page'):
    # Legacy mode
    result = agent.process_page(tab_data)
else:
    # New SDK mode
    result = agent.process_query(context)
```

### 2. Migration Tools

- Automatic converter for existing agents
- Side-by-side comparison during development
- Migration guide with examples

### 3. Gradual Rollout

1. Release SDK alongside current system
2. Update example agents to demonstrate SDK
3. Provide migration period (2-3 months)
4. Phase out legacy format

## Benefits

### For Developers

- **Simplified Development**: Single method to implement
- **Consistent Interface**: Same patterns across all agents
- **Built-in Best Practices**: Error handling, logging, formatting
- **Provider Agnostic**: Works with any AI provider
- **Rich Context**: Easy access to all request data
- **Testing Support**: Mock contexts and testing utilities

### For Platform

- **Standardization**: All agents follow same patterns
- **Maintainability**: Easier to update and extend
- **Quality Control**: Built-in validation and error handling
- **Performance**: Optimized provider management
- **Scalability**: Easy to add new features and providers

## Next Steps

1. **Approve Plan**: Review and approve this SDK design
2. **Create Repository**: Set up `browzer-agent-sdk` repository
3. **Implement Core**: Build base classes and core functionality
4. **Create Examples**: Develop example agents using SDK
5. **Test Integration**: Ensure seamless integration with browser
6. **Documentation**: Complete API docs and tutorials
7. **Release**: Publish SDK and update existing agents

This SDK will transform agent development from complex, boilerplate-heavy implementations to clean, focused business logic that developers can easily understand and maintain. 