# Multi-Agent Workflow Orchestration System

**Vision**: Transform individual extensions into composable building blocks that can work together to handle complex, multi-step tasks through intelligent workflow orchestration.

## 🎯 Overview

Currently, the Browzer extension system routes queries to a single "best-match" extension. The workflow orchestration system extends this to enable **multi-extension pipelines** where extensions collaborate to solve complex tasks.

### Example Transformation

**Current (Single Extension)**:
```
"Research decentralized AI and summarize it in 500 words"
→ Routes to: research-agent
→ Result: Detailed research (but may not respect word limit)
```

**With Workflow Orchestration**:
```
"Research decentralized AI and summarize it in 500 words"
→ Workflow: research-agent → topic-agent
→ Result: Comprehensive research + perfectly summarized to 500 words
```

## 🏗 Architecture Overview

### Core Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Query    │───▶│ Workflow Router  │───▶│  Pipeline       │
└─────────────────┘    └──────────────────┘    │  Executor       │
                                                └─────────────────┘
                                                         │
                       ┌─────────────────┐              ▼
                       │ Result          │◀─────┌──────────────────┐
                       │ Aggregator      │      │ Extension Chain  │
                       └─────────────────┘      │ Management       │
                                                └──────────────────┘
```

### Workflow Types

1. **Sequential Pipelines**: A → B → C (research → summarize → format)
2. **Parallel + Merge**: [A, B] → C (multiple research → comparison)
3. **Conditional Workflows**: A → (if X) → B (research → fact-check if needed)
4. **Iterative Refinement**: A → (evaluate) → A (research → more research if insufficient)

## 📋 Implementation Plan

### Phase 1: Foundation (Week 1)

#### 1.1 Enhanced Intent Analysis
**Goal**: Detect multiple operations in a single query

**Current**: Single intent detection (`research` OR `summarize`)
**Target**: Multi-intent detection (`research` AND `summarize`)

Example enhanced analysis result:
```javascript
{
  "query": "Research quantum computing and explain it simply",
  "primary_intent": "research",
  "secondary_intents": ["explain", "simplify"],
  "workflow_type": "sequential",
  "complexity": "moderate",
  "pipeline": [
    {
      "extension": "research-agent",
      "action": "research",
      "parameters": {
        "depth": "comprehensive",
        "topic": "quantum computing"
      }
    },
    {
      "extension": "topic-agent", 
      "action": "simplify",
      "parameters": {
        "style": "explanatory",
        "audience": "general"
      }
    }
  ]
}
```

#### 1.2 Workflow Data Structures
**Goal**: Define standard formats for workflow representation

Core data structures needed:
```typescript
interface WorkflowStep {
  extension: string;
  action: string;
  parameters: Record<string, any>;
  input_source: 'user_query' | 'previous_step' | 'combined';
  conditions?: WorkflowCondition[];
}

interface WorkflowPlan {
  id: string;
  type: 'sequential' | 'parallel' | 'conditional' | 'iterative';
  steps: WorkflowStep[];
  metadata: {
    estimated_time: number;
    complexity: 'simple' | 'moderate' | 'complex';
    cost_estimate: number;
  };
}

interface WorkflowContext {
  workflow_id: string;
  current_step: number;
  previous_results: Record<string, any>;
  user_query: string;
  accumulated_context: string;
}
```

#### 1.3 Basic Sequential Execution
**Goal**: Implement simple A → B workflows

New Component: `SequentialWorkflowExecutor`
- Execute extensions in order
- Pass results from step N to step N+1
- Handle failures gracefully
- Provide progress updates

### Phase 2: Core Orchestration (Week 2)

#### 2.1 Workflow Manager
**Goal**: Central orchestration and coordination

```typescript
class WorkflowManager {
  // Create execution plan from user query
  async planWorkflow(query: string): Promise<WorkflowPlan>
  
  // Execute a workflow plan
  async executeWorkflow(plan: WorkflowPlan): Promise<WorkflowResult>
  
  // Handle workflow state and recovery
  async resumeWorkflow(workflowId: string): Promise<WorkflowResult>
  
  // Monitor and optimize workflow performance
  async optimizeWorkflow(plan: WorkflowPlan): Promise<WorkflowPlan>
}
```

#### 2.2 Inter-Extension Communication Protocol
**Goal**: Standardized data exchange between extensions

Example workflow context data format:
```json
{
  "workflow_context": {
    "workflow_id": "uuid-12345",
    "step_number": 2,
    "total_steps": 3,
    "execution_path": ["research-agent", "topic-agent"]
  },
  "input_data": {
    "user_query": "Research AI and summarize in 500 words",
    "previous_results": {
      "research-agent": {
        "success": true,
        "data": {
          "consolidated_summary": "...",
          "sources": [...],
          "research_metadata": {...}
        },
        "execution_time": 15.2,
        "confidence": 0.9
      }
    }
  },
  "task_parameters": {
    "action": "summarize",
    "constraints": {
      "max_words": 500,
      "style": "accessible",
      "preserve_key_facts": true
    }
  }
}
```

#### 2.3 Enhanced Smart Router Integration
**Goal**: Upgrade existing router for workflow planning

```python
class WorkflowRouter(SmartExtensionRouter):
    def analyze_workflow_intent(self, query: str) -> WorkflowAnalysis:
        """Detect single vs multi-step requirements"""
        pass
    
    def plan_workflow(self, query: str) -> WorkflowPlan:
        """Create execution plan for complex queries"""
        pass
    
    def route_workflow(self, query: str) -> Union[ExtensionResult, WorkflowPlan]:
        """Route to single extension OR create workflow"""
        pass
```

### Phase 3: Advanced Features (Week 3)

#### 3.1 Parallel Execution
**Goal**: Run multiple extensions simultaneously

Example parallel workflow:
```python
# Parallel research + aggregation
workflow = {
  "type": "parallel_then_merge",
  "parallel_steps": [
    {"extension": "research-agent", "parameters": {"topic": "renewable_energy"}},
    {"extension": "research-agent", "parameters": {"topic": "fossil_fuels"}}
  ],
  "merge_step": {
    "extension": "comparison-agent", 
    "action": "compare_research_results"
  }
}
```

#### 3.2 Conditional Logic
**Goal**: Dynamic workflow paths based on results

Example conditional workflow:
```python
# Conditional fact-checking
workflow = {
  "type": "conditional",
  "steps": [
    {"extension": "research-agent", "action": "research"},
    {
      "extension": "fact-check-agent",
      "condition": "if previous_result.contains_claims",
      "action": "verify_claims"
    },
    {"extension": "topic-agent", "action": "present_findings"}
  ]
}
```

#### 3.3 Result Aggregation & Intelligence
**Goal**: Smart combination of multi-extension outputs

```typescript
interface ResultAggregator {
  // Combine results from parallel extensions
  mergeParallelResults(results: ExtensionResult[]): AggregatedResult;
  
  // Create coherent narrative from sequential steps
  synthesizeSequentialResults(results: ExtensionResult[]): SynthesizedResult;
  
  // Handle conflicting information
  resolveConflicts(results: ExtensionResult[]): ResolvedResult;
}
```

### Phase 4: Optimization & Production (Week 4)

#### 4.1 Performance Optimization
- **Caching**: Avoid re-running identical research
- **Async Execution**: Non-blocking parallel operations
- **Resource Management**: CPU/memory optimization
- **Streaming**: Real-time result updates

#### 4.2 Error Handling & Recovery
- **Graceful Degradation**: Continue workflow if one step fails
- **Fallback Strategies**: Alternative execution paths
- **Retry Logic**: Smart retry with exponential backoff
- **State Recovery**: Resume interrupted workflows

#### 4.3 Monitoring & Analytics
- **Performance Metrics**: Execution time, success rates
- **Usage Patterns**: Most common workflows
- **Cost Analysis**: Resource usage tracking
- **Quality Metrics**: User satisfaction with results

## 🔄 Workflow Examples

### Example 1: Research + Summarization
```
Query: "Research blockchain adoption in finance and summarize in 300 words"

Workflow Plan:
1. research-agent: 
   - Gather comprehensive blockchain finance data
   - Find recent adoption statistics
   - Collect expert opinions and case studies
   
2. topic-agent:
   - Input: Full research results
   - Task: Summarize to exactly 300 words
   - Preserve key statistics and insights
   
Expected Result: Concise, well-researched 300-word summary
```

### Example 2: Multi-Source Comparison
```
Query: "Compare different COVID vaccine effectiveness studies"

Workflow Plan:
1. Parallel Research:
   - research-agent(A): Pfizer vaccine studies
   - research-agent(B): Moderna vaccine studies  
   - research-agent(C): J&J vaccine studies
   
2. comparison-agent:
   - Input: All research results
   - Task: Compare methodologies and findings
   - Identify patterns and discrepancies
   
3. topic-agent:
   - Input: Comparison analysis
   - Task: Present in clear, accessible format
   
Expected Result: Comprehensive comparison with evidence-based insights
```

### Example 3: Investigative Pipeline
```
Query: "Research this economic claim and verify its accuracy"

Workflow Plan:
1. research-agent:
   - Initial research on the economic claim
   - Gather supporting and contradicting evidence
   
2. Conditional Logic:
   IF claim contains specific statistics:
     → fact-check-agent: Verify numbers against authoritative sources
   IF claim involves predictions:
     → analysis-agent: Evaluate prediction methodology
   
3. topic-agent:
   - Input: Research + verification results
   - Task: Present findings with confidence levels
   
Expected Result: Verified analysis with credibility assessment
```

### Example 4: Iterative Deep Dive
```
Query: "I need a comprehensive analysis of AI safety concerns"

Workflow Plan:
1. research-agent: Initial broad research on AI safety
2. Evaluation: Check if coverage is comprehensive
3. If gaps found:
   - research-agent: Targeted research on specific gaps
   - Repeat evaluation
4. topic-agent: Create structured, comprehensive report

Expected Result: Thorough, well-organized analysis covering all major aspects
```

## 🛠 Technical Implementation Details

### Workflow Router Enhancement

```python
# extensions-framework/core/workflow_router.py
class WorkflowRouter(SmartExtensionRouter):
    def __init__(self, extensions_dir: str):
        super().__init__(extensions_dir)
        self.workflow_analyzer = WorkflowAnalyzer()
        self.pipeline_builder = PipelineBuilder()
        self.workflow_executor = WorkflowExecutor()
    
    def route_request(self, query: str) -> Union[RoutingResult, WorkflowPlan]:
        # Analyze for workflow complexity
        analysis = self.workflow_analyzer.analyze(query)
        
        if analysis.requires_workflow:
            # Build multi-extension pipeline
            plan = self.pipeline_builder.create_plan(analysis)
            return plan
        else:
            # Single extension routing (existing logic)
            return super().route_request(query)
    
    def execute_workflow(self, plan: WorkflowPlan) -> WorkflowResult:
        return self.workflow_executor.execute(plan)
```

### Extension Communication Protocol

```python
# extensions-framework/core/workflow_context.py
class WorkflowContext:
    def __init__(self, workflow_id: str, user_query: str):
        self.workflow_id = workflow_id
        self.user_query = user_query
        self.results = {}
        self.current_step = 0
        self.metadata = {}
    
    def add_result(self, extension_id: str, result: dict):
        self.results[extension_id] = result
        self.current_step += 1
    
    def get_context_for_extension(self, extension_id: str) -> dict:
        return {
            "workflow_context": {
                "workflow_id": self.workflow_id,
                "step_number": self.current_step,
                "user_query": self.user_query
            },
            "previous_results": self.results,
            "accumulated_context": self._build_context_summary()
        }
```

### Extension Modifications

Extensions need workflow-aware capabilities:
```python
def main():
    input_data = sys.stdin.read()
    request = json.loads(input_data)
    
    # Check if this is part of a workflow
    workflow_context = request.get('workflow_context')
    if workflow_context:
        # Handle workflow execution
        result = handle_workflow_step(request, workflow_context)
    else:
        # Handle standalone execution (existing logic)
        result = handle_standalone_request(request)
    
    print(json.dumps(result))

def handle_workflow_step(request: dict, workflow_context: dict) -> dict:
    # Access previous results
    previous_results = workflow_context.get('previous_results', {})
    
    # Modify behavior based on workflow position
    if 'research-agent' in previous_results:
        # We're in a pipeline after research
        research_data = previous_results['research-agent']['data']
        # Use research data as context
    
    # Execute with workflow awareness
    return execute_with_context(request, previous_results)
```

## 🎯 Integration Points

### Frontend Integration
```typescript
// src/renderer/workflow-manager.ts
class WorkflowManager {
  async executeQuery(query: string): Promise<Result> {
    // Route query (might return workflow or single extension)
    const routingResult = await this.routeQuery(query);
    
    if (routingResult.type === 'workflow') {
      return this.executeWorkflow(routingResult.plan);
    } else {
      return this.executeSingleExtension(routingResult);
    }
  }
  
  async executeWorkflow(plan: WorkflowPlan): Promise<Result> {
    const context = new WorkflowContext(plan.id, plan.query);
    
    for (const step of plan.steps) {
      const stepResult = await this.executeStep(step, context);
      context.addResult(step.extension, stepResult);
      
      // Update UI with progress
      this.updateProgress(context.progress);
    }
    
    return this.aggregateResults(context);
  }
}
```

### Backend Integration
```typescript
// src/main/ExtensionManager.ts
class ExtensionManager {
  async routeRequest(query: string): Promise<RoutingResult | WorkflowPlan> {
    // Use workflow router instead of simple router
    return this.workflowRouter.route_request(query);
  }
  
  async executeWorkflow(plan: WorkflowPlan): Promise<WorkflowResult> {
    const executor = new WorkflowExecutor(this.extensionsDir);
    return executor.execute(plan);
  }
}
```

## 📊 Benefits & Use Cases

### Immediate Benefits
1. **Task Completeness**: Multi-step queries fully satisfied
2. **Specialized Excellence**: Each extension does what it does best
3. **Intelligent Composition**: Smart combination of capabilities
4. **User Intent Matching**: Natural language → sophisticated execution

### Advanced Use Cases
1. **Research Reports**: Research → Fact-check → Format → Summarize
2. **Comparative Analysis**: Multiple research → Comparison → Presentation
3. **Investigative Journalism**: Research → Cross-reference → Verify → Report
4. **Academic Papers**: Research → Analysis → Synthesis → Formatting

### Business Value
1. **User Satisfaction**: Complex tasks handled seamlessly
2. **Competitive Advantage**: Unique multi-agent capabilities
3. **Extensibility**: Easy to add new workflow types
4. **Monetization**: Premium workflows for advanced users

## 🔮 Future Extensions

### Advanced Workflow Types
1. **Machine Learning Pipelines**: Data → Analysis → Modeling → Insights
2. **Creative Workflows**: Research → Brainstorm → Draft → Refine
3. **Business Intelligence**: Data gathering → Analysis → Visualization → Reporting
4. **Content Creation**: Research → Outline → Write → Edit → Format

### AI-Powered Optimization
1. **Learning from Usage**: Optimize workflows based on success patterns
2. **Personalization**: User-specific workflow preferences
3. **Predictive Planning**: Suggest workflows before user completes query
4. **Dynamic Adaptation**: Modify workflows based on intermediate results

## 📋 Success Metrics

### Technical Metrics
- **Workflow Success Rate**: % of workflows completed successfully
- **Average Execution Time**: Performance optimization tracking
- **Extension Utilization**: How often each extension is used
- **Error Recovery Rate**: % of failed workflows that recover gracefully

### User Experience Metrics
- **Query Satisfaction**: User ratings of workflow results
- **Task Completion Rate**: % of complex tasks fully resolved
- **Feature Adoption**: Usage of workflow vs single-extension queries
- **User Retention**: Impact on overall browser usage

### Business Metrics
- **Premium Conversions**: Advanced workflows driving subscriptions
- **User Engagement**: Time spent using workflow features
- **Competitive Differentiation**: Unique capabilities vs competitors
- **Developer Ecosystem**: Third-party extensions supporting workflows

---

## 🚀 Getting Started

### Phase 1 Quick Start
1. **Enhance Intent Analyzer**: Detect multi-step queries
2. **Build Basic Pipeline**: Sequential A → B execution
3. **Test Simple Workflows**: Research → Summarize use case

### Development Priorities
1. **Week 1**: Foundation (intent analysis, basic pipelines)
2. **Week 2**: Core orchestration (workflow manager, communication)
3. **Week 3**: Advanced features (parallel, conditional)
4. **Week 4**: Production readiness (optimization, monitoring)

This workflow orchestration system transforms Browzer from a single-agent browser into a **multi-agent intelligent workspace** capable of handling complex, real-world tasks through intelligent extension collaboration.

## 🔗 Related Documents

- [MULTI_AGENT_ROUTING_ARCHITECTURE.md](./MULTI_AGENT_ROUTING_ARCHITECTURE.md) - Foundation routing system
- [SIMPLE_EXTENSION_ROUTING_IMPLEMENTED.md](./SIMPLE_EXTENSION_ROUTING_IMPLEMENTED.md) - Current implementation
- [EXTENSION_ARCHITECTURE_PROGRESS.md](./EXTENSION_ARCHITECTURE_PROGRESS.md) - Overall extension system progress 