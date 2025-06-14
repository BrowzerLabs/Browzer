#!/usr/bin/env python3
"""
Research Agent Example - Browzer SDK

This demonstrates advanced SDK usage with multi-step processing,
complex analysis, and structured research workflows.
"""

from browzer_sdk import BrowzerAgent, QueryContext, run_agent


class ResearchAgent(BrowzerAgent):
    """
    An advanced agent that performs multi-step research and analysis.
    
    This agent can:
    - Analyze query intent and context
    - Extract relevant information from content
    - Perform structured research workflows
    - Generate comprehensive responses with metadata
    """
    
    async def process_query(self, context: QueryContext) -> dict:
        """
        Process query using multi-step research workflow.
        """
        await self.log_info("Starting multi-step research workflow")
        
        try:
            # Step 1: Analyze the query intent
            intent_analysis = await self._analyze_query_intent(context)
            await self.log_info(f"Query intent: {intent_analysis['intent']}")
            
            # Step 2: Extract relevant information based on intent
            extracted_info = await self._extract_relevant_information(context, intent_analysis)
            
            # Step 3: Generate comprehensive response
            response = await self._generate_comprehensive_response(
                context, intent_analysis, extracted_info
            )
            
            # Step 4: Add research metadata
            metadata = self._build_research_metadata(intent_analysis, extracted_info, context)
            
            return {
                "success": True,
                "response": response,
                "research_metadata": metadata,
                "workflow_steps": ["intent_analysis", "information_extraction", "response_generation"],
                "processing_time": self.get_processing_time()
            }
            
        except Exception as e:
            await self.log_error(f"Research workflow failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "partial_results": getattr(self, '_partial_results', None)
            }
    
    async def _analyze_query_intent(self, context: QueryContext) -> dict:
        """Analyze the user's query to understand intent and context"""
        
        prompt = f"""
        Analyze this query to understand the user's intent and research needs:
        
        Query: "{context.query}"
        Context: {"Question about page content" if context.is_question else "General page analysis"}
        Page Title: {context.page_title}
        
        Provide analysis in the following format:
        Intent: [primary intent - question, analysis, research, comparison, etc.]
        Topic: [main topic/subject]
        Scope: [broad, specific, technical, general]
        Research Type: [factual, analytical, explanatory, comparative]
        Key Concepts: [list 2-3 key concepts to focus on]
        """
        
        analysis_text = await self.get_ai_response(prompt, max_tokens=200, temperature=0.3)
        
        # Parse the analysis (simplified parsing)
        return {
            "intent": self._extract_field(analysis_text, "Intent"),
            "topic": self._extract_field(analysis_text, "Topic"),
            "scope": self._extract_field(analysis_text, "Scope"),
            "research_type": self._extract_field(analysis_text, "Research Type"),
            "key_concepts": self._extract_field(analysis_text, "Key Concepts"),
            "full_analysis": analysis_text
        }
    
    async def _extract_relevant_information(self, context: QueryContext, intent_analysis: dict) -> dict:
        """Extract information relevant to the identified intent"""
        
        if not context.has_content:
            return {"error": "No content available for information extraction"}
        
        prompt = f"""
        Based on the query intent and page content, extract the most relevant information:
        
        Query Intent: {intent_analysis['intent']}
        Key Topics: {intent_analysis['topic']}
        Focus Areas: {intent_analysis['key_concepts']}
        
        Page Content: {context.truncated_content}
        
        Extract and organize:
        1. Key Facts: [relevant factual information]
        2. Main Arguments: [primary arguments or points made]
        3. Supporting Evidence: [evidence, examples, data mentioned]
        4. Context/Background: [relevant background information]
        5. Relationships: [connections between concepts]
        
        Focus on information most relevant to: {context.query}
        """
        
        extraction = await self.get_ai_response(prompt, max_tokens=600, temperature=0.4)
        
        return {
            "extracted_content": extraction,
            "content_length": len(context.page_content),
            "extraction_focus": intent_analysis['key_concepts'],
            "source_url": context.page_url
        }
    
    async def _generate_comprehensive_response(self, context: QueryContext, 
                                             intent_analysis: dict, extracted_info: dict) -> str:
        """Generate a comprehensive response based on all analysis"""
        
        # Build context for final response generation
        research_context = f"""
        Research Intent: {intent_analysis['intent']}
        Topic Focus: {intent_analysis['topic']}
        
        Extracted Information:
        {extracted_info.get('extracted_content', 'No content extracted')}
        
        Original Query: {context.query}
        Source: {context.page_title} ({context.page_url})
        """
        
        # Use chat format for more sophisticated response generation
        messages = [
            {
                "role": "system",
                "content": "You are a research assistant that provides comprehensive, well-structured responses based on thorough analysis."
            },
            {
                "role": "user",
                "content": f"""
                Based on this research context, provide a comprehensive answer:
                
                {research_context}
                
                Please structure your response with:
                1. Direct answer to the query
                2. Supporting details and evidence
                3. Additional context or implications
                4. Any limitations or considerations
                
                Make sure the response is accurate, helpful, and well-organized.
                """
            }
        ]
        
        return await self.get_chat_response(messages, max_tokens=800, temperature=0.6)
    
    def _build_research_metadata(self, intent_analysis: dict, extracted_info: dict, context: QueryContext) -> dict:
        """Build comprehensive metadata about the research process"""
        
        return {
            "query_analysis": {
                "intent": intent_analysis.get('intent', 'unknown'),
                "topic": intent_analysis.get('topic', 'unknown'),
                "complexity": intent_analysis.get('scope', 'unknown')
            },
            "source_analysis": {
                "page_title": context.page_title,
                "page_url": context.page_url,
                "content_length": context.content_length,
                "has_urls": len(context.urls) > 0,
                "url_count": len(context.urls)
            },
            "processing_details": {
                "conversation_context": context.has_conversation,
                "conversation_length": context.conversation_length,
                "extraction_success": "extracted_content" in extracted_info,
                "provider": context.provider,
                "model": context.model
            }
        }
    
    def _extract_field(self, text: str, field_name: str) -> str:
        """Simple field extraction from structured text"""
        lines = text.split('\n')
        for line in lines:
            if line.strip().startswith(f"{field_name}:"):
                return line.split(':', 1)[1].strip()
        return "unknown"


# Required: Agent instance for the framework
agent = ResearchAgent()

if __name__ == '__main__':
    run_agent(ResearchAgent) 