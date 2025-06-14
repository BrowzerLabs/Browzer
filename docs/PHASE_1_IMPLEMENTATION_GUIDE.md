# Phase 1 Implementation Guide: Extension Registry & Event Bus

## Overview

This guide provides concrete steps to implement Phase 1 of the multi-agent routing architecture in 2 weeks.

## Week 1: Extension Registry

### Day 1-2: Capability Schema Design

Create the capability system in `extensions-framework/core/capabilities/`:

```typescript
// CapabilityRegistry.ts
export interface Capability {
  id: string;
  name: string;
  description: string;
  category: 'analysis' | 'generation' | 'transformation' | 'research' | 'utility';
  
  // Define expected input/output
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  
  outputSchema: {
    type: 'object';
    properties: Record<string, any>;
  };
  
  // Performance metrics
  metrics?: {
    avgExecutionTime?: number;
    successRate?: number;
    lastUpdated?: Date;
  };
}

export class CapabilityRegistry {
  private capabilities: Map<string, Capability[]> = new Map();
  
  register(extensionId: string, capabilities: Capability[]): void {
    this.capabilities.set(extensionId, capabilities);
    this.emit('capabilities.registered', { extensionId, capabilities });
  }
  
  query(filter: CapabilityFilter): ExtensionCapability[] {
    // Return extensions matching the capability filter
  }
  
  getCapabilitiesForExtension(extensionId: string): Capability[] {
    return this.capabilities.get(extensionId) || [];
  }
}
```

### Day 3-4: Enhance Extension Manifest

Update manifest structure to include capabilities:

```typescript
// Update ExtensionManifest interface
interface ExtensionManifest {
  // ... existing fields ...
  
  capabilities?: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    inputSchema?: object;
    outputSchema?: object;
    examples?: Array<{
      input: any;
      output: any;
      description?: string;
    }>;
  }>;
  
  routing?: {
    keywords?: string[]; // Keywords that might trigger this extension
    intents?: string[];  // Intents this extension can handle
    priority?: number;   // Routing priority (1-10)
  };
}
```

### Day 5: Registry Integration

Integrate capability registration into extension loading:

```typescript
// In ExtensionRuntime.ts
private async loadExtension(extensionPath: string): Promise<ExtensionContext> {
  // ... existing loading logic ...
  
  // Register capabilities if present
  if (manifest.capabilities) {
    await this.capabilityRegistry.register(manifest.id, manifest.capabilities);
  }
  
  // ... rest of loading logic ...
}
```

## Week 2: Event Bus Implementation

### Day 1-2: Core Event Bus

Create the event bus system in `extensions-framework/core/events/`:

```typescript
// EventBus.ts
export interface ExtensionEvent {
  id: string;
  source: string;
  type: string;
  payload: any;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface EventSubscription {
  pattern: string | RegExp;
  handler: (event: ExtensionEvent) => void | Promise<void>;
  extensionId: string;
}

export class ExtensionEventBus {
  private subscriptions: Map<string, Set<EventSubscription>> = new Map();
  private eventHistory: ExtensionEvent[] = [];
  private eventQueue: Queue<ExtensionEvent>;
  
  constructor() {
    this.eventQueue = new Queue();
    this.startEventProcessor();
  }
  
  // Publish an event
  async emit(source: string, type: string, payload: any): Promise<void> {
    const event: ExtensionEvent = {
      id: generateId(),
      source,
      type,
      payload,
      timestamp: Date.now()
    };
    
    await this.eventQueue.enqueue(event);
  }
  
  // Subscribe to events
  subscribe(extensionId: string, pattern: string | RegExp, handler: EventHandler): Unsubscribe {
    const subscription: EventSubscription = {
      pattern,
      handler,
      extensionId
    };
    
    const key = pattern instanceof RegExp ? pattern.source : pattern;
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }
    
    this.subscriptions.get(key)!.add(subscription);
    
    return () => {
      this.subscriptions.get(key)?.delete(subscription);
    };
  }
  
  private async processEvent(event: ExtensionEvent): Promise<void> {
    // Find matching subscriptions
    const handlers: EventSubscription[] = [];
    
    for (const [pattern, subs] of this.subscriptions) {
      if (this.matchesPattern(event.type, pattern)) {
        handlers.push(...subs);
      }
    }
    
    // Execute handlers in parallel
    await Promise.all(
      handlers.map(sub => this.executeHandler(sub, event))
    );
  }
}
```

### Day 3-4: Extension API Integration

Add event bus access to extensions:

```typescript
// ExtensionContext enhancement
export interface ExtensionContext {
  // ... existing fields ...
  
  events: {
    emit(type: string, payload: any): Promise<void>;
    on(pattern: string | RegExp, handler: EventHandler): Unsubscribe;
    once(pattern: string, handler: EventHandler): Unsubscribe;
  };
  
  capabilities: {
    register(capability: Capability): void;
    query(filter: CapabilityFilter): ExtensionCapability[];
  };
}
```

### Day 5: Testing & Documentation

Create test cases and documentation:

```typescript
// Example test
describe('EventBus', () => {
  it('should deliver events to matching subscribers', async () => {
    const bus = new ExtensionEventBus();
    const received: ExtensionEvent[] = [];
    
    // Subscribe to topic events
    bus.subscribe('test-ext', 'topic.*', async (event) => {
      received.push(event);
    });
    
    // Emit events
    await bus.emit('source-ext', 'topic.analyzed', { topics: ['AI', 'ML'] });
    await bus.emit('source-ext', 'other.event', { data: 'ignored' });
    
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('topic.analyzed');
  });
});
```

## Implementation Checklist

### Week 1 Deliverables
- [ ] Capability schema and interfaces defined
- [ ] CapabilityRegistry class implemented
- [ ] Extension manifest schema updated
- [ ] Capability registration integrated into loading
- [ ] Basic capability querying working

### Week 2 Deliverables
- [ ] EventBus core implementation
- [ ] Event subscription/publishing working
- [ ] Extension API for events
- [ ] Event history and replay
- [ ] Tests and documentation

## Migration Example

Here's how to migrate the topic-agent extension:

```json
{
  "id": "topic-agent",
  "name": "Topic Agent",
  "version": "1.1.0",
  "type": "python_agent",
  
  // NEW: Capabilities
  "capabilities": [
    {
      "id": "extract_topics",
      "name": "Extract Topics",
      "description": "Extracts main topics from web page content",
      "category": "analysis",
      "inputSchema": {
        "type": "object",
        "properties": {
          "pageContent": { "type": "string" },
          "maxTopics": { "type": "number", "default": 5 }
        },
        "required": ["pageContent"]
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "topics": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "relevance": { "type": "number" }
              }
            }
          }
        }
      }
    }
  ],
  
  // NEW: Routing hints
  "routing": {
    "keywords": ["topic", "subject", "theme", "main points"],
    "intents": ["analyze", "summarize", "extract"],
    "priority": 8
  }
}
```

## Next Steps

After Phase 1 completion:
1. Test with 2-3 extensions using the new capabilities
2. Gather metrics on event bus performance
3. Document lessons learned
4. Prepare for Phase 2: Communication Layer

## Resources

- [Full Architecture Document](./MULTI_AGENT_ROUTING_ARCHITECTURE.md)
- [TypeScript Event Bus Examples](https://github.com/examples/event-bus)
- [JSON Schema Documentation](https://json-schema.org/) 