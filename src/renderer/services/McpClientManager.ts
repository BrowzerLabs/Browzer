import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
// Note: SSEClientTransport has Node.js dependencies, so we'll use fetch-based SSE for browser

/**
 * Browser-compatible SSE transport using native fetch API
 * Implements the MCP Transport interface for Streamable HTTP transport
 */
class BrowserSSETransport {
  private url: URL;
  private eventSource?: EventSource;
  
  public onmessage?: (message: any, extra?: any) => void;
  public onerror?: (error: Error) => void;
  public onclose?: () => void;
  public sessionId?: string;

  constructor(url: URL) {
    this.url = url;
  }

  async start(): Promise<void> {
    // For MCP Streamable HTTP, we use fetch for sending and responses for receiving
    // No persistent connection needed for initialization
    return Promise.resolve();
  }

  async send(message: any, options?: any): Promise<void> {
    try {
      console.log(`[BrowserSSETransport] Sending message to ${this.url.toString()}:`, message);
      const response = await fetch(this.url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(message)
      });
      
      console.log(`[BrowserSSETransport] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle SSE response
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');
        
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent: any = {};
          
          for (const line of lines) {
            if (line.startsWith('data:')) {
              currentEvent.data = line.substring(5).trim();
            } else if (line === '') {
              if (currentEvent.data && this.onmessage) {
                try {
                  const parsed = JSON.parse(currentEvent.data);
                  this.onmessage(parsed);
                } catch (parseError) {
                  console.warn('[MCP] Failed to parse SSE data:', currentEvent.data);
                }
              }
              currentEvent = {};
            }
          }
        }
      } else {
        // JSON response
        const data = await response.json();
        if (this.onmessage) {
          this.onmessage(data);
        }
      }
    } catch (error) {
      if (this.onerror) {
        this.onerror(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    if (this.onclose) {
      this.onclose();
    }
  }

  setProtocolVersion?(version: string): void {
    // Store protocol version if needed
  }
}

export interface McpServerConfig {
  name: string;
  url: string;
  enabled: boolean;
  transport?: 'websocket' | 'sse'; // Auto-detect if not specified
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: any;
  serverName: string;
}

/**
 * MCP Client Manager using the official Model Context Protocol SDK.
 * Manages connections to multiple MCP servers and provides a unified tool registry.
 */
export class McpClientManager {
  private static STORAGE_KEY = 'mcp_servers';

  private clients = new Map<string, Client>();
  private toolIndex = new Map<string, McpTool>();

  constructor() {
    // Auto-connect enabled servers on construction
    this.initializeConnections();
  }

  private async initializeConnections() {
    const configs = this.loadConfigs().filter(c => c.enabled);
    for (const config of configs) {
      await this.connect(config);
    }
  }

  /* ---------- Persistence helpers ---------- */
  loadConfigs(): McpServerConfig[] {
    try {
      const raw = localStorage.getItem(McpClientManager.STORAGE_KEY);
      if (!raw) return [];
      const list: McpServerConfig[] = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  saveConfigs(configs: McpServerConfig[]) {
    localStorage.setItem(McpClientManager.STORAGE_KEY, JSON.stringify(configs));
  }

  async addConfig(config: McpServerConfig) {
    const list = this.loadConfigs();
    list.push(config);
    this.saveConfigs(list);
    if (config.enabled) {
      await this.connect(config);
    }
  }

  async toggleServer(name: string, enabled: boolean) {
    const list = this.loadConfigs();
    const config = list.find(s => s.name === name);
    if (!config) return;
    
    config.enabled = enabled;
    this.saveConfigs(list);
    
    if (enabled) {
      await this.connect(config);
    } else {
      await this.disconnect(name);
    }
  }

  /* ---------- Connection logic ---------- */
  private async connect(config: McpServerConfig) {
    if (this.clients.has(config.name)) {
      console.log(`[MCP] Already connected to ${config.name}`);
      return;
    }

    try {
      console.log(`[MCP] Connecting to ${config.name} at ${config.url}`);
      
      // Auto-detect transport type if not specified
      const transportType = config.transport || this.detectTransportType(config.url);
      console.log(`[MCP] Using ${transportType} transport`);
      
      let transport;
      if (transportType === 'sse') {
        // Use our browser-compatible SSE transport
        transport = new BrowserSSETransport(new URL(config.url));
      } else {
        transport = new WebSocketClientTransport(new URL(config.url));
      }
      
      const client = new Client(
        {
          name: 'browzer-assistant',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      console.log(`[MCP] Attempting connection to ${config.name}...`);
      await client.connect(transport);
      this.clients.set(config.name, client);
      
      console.log(`[MCP] Successfully connected to ${config.name} using ${transportType}`);
      
      // Discover and register tools
      await this.discoverTools(config.name, client);
      
    } catch (error) {
      console.error(`[MCP] Failed to connect to ${config.name}:`, error);
      console.error(`[MCP] Error details:`, {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  private async disconnect(name: string) {
    const client = this.clients.get(name);
    if (client) {
      try {
        await client.close();
      } catch (error) {
        console.warn(`[MCP] Error closing connection to ${name}:`, error);
      }
      this.clients.delete(name);
    }
    
    // Remove tools from this server
    for (const [toolName, tool] of this.toolIndex.entries()) {
      if (tool.serverName === name) {
        this.toolIndex.delete(toolName);
      }
    }
    
    console.log(`[MCP] Disconnected from ${name}`);
  }

  private detectTransportType(url: string): 'websocket' | 'sse' {
    const urlLower = url.toLowerCase();
    
    // WebSocket URLs
    if (urlLower.startsWith('ws://') || urlLower.startsWith('wss://')) {
      return 'websocket';
    }
    
    // HTTPS URLs are typically SSE for MCP
    if (urlLower.startsWith('http://') || urlLower.startsWith('https://')) {
      // Special case: Zapier MCP uses SSE
      if (urlLower.includes('mcp.zapier.com')) {
        return 'sse';
      }
      // Default to SSE for HTTP(S) URLs
      return 'sse';
    }
    
    // Default fallback
    return 'websocket';
  }

  private async discoverTools(serverName: string, client: Client) {
    try {
      console.log(`[MCP] Discovering tools from ${serverName}...`);
      const response = await client.listTools();
      console.log(`[MCP] Raw listTools response from ${serverName}:`, response);
      const tools = response.tools || [];
      
      for (const tool of tools) {
        const fullName = `${serverName}.${tool.name}`;
        this.toolIndex.set(fullName, {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          serverName
        });
        console.log(`[MCP] Registered tool: ${fullName}`, tool);
      }
      
      console.log(`[MCP] Successfully registered ${tools.length} tools from ${serverName}:`, tools.map((t: any) => t.name));
    } catch (error) {
      console.warn(`[MCP] Failed to discover tools from ${serverName}:`, error);
      console.warn(`[MCP] Tool discovery error details:`, {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  /* ---------- Public API ---------- */
  async listAllTools(): Promise<string[]> {
    return Array.from(this.toolIndex.keys());
  }

  getToolInfo(fullName: string): McpTool | undefined {
    return this.toolIndex.get(fullName);
  }

  async getToolsForServer(serverName: string): Promise<any[]> {
    console.log(`[MCP] Requesting tools from ${serverName}...`);
    
    // For SSE servers like Zapier, use direct approach that matches the working test
    const config = this.loadConfigs().find(c => c.name === serverName);
    if (config && this.detectTransportType(config.url) === 'sse') {
      console.log(`[MCP] Using direct SSE approach for ${serverName} (SSE server detected)`);
      return await this.getToolsDirectSSE(config);
    }
    
    // For WebSocket servers, use the SDK client
    const client = this.clients.get(serverName);
    if (!client) {
      console.error(`[MCP] Server ${serverName} is not connected. Available servers:`, Array.from(this.clients.keys()));
      throw new Error(`Server ${serverName} is not connected`);
    }
    
    try {
      const response = await client.listTools();
      console.log(`[MCP] Tools response from ${serverName}:`, response);
      const tools = response.tools || [];
      console.log(`[MCP] Found ${tools.length} tools from ${serverName}:`, tools.map((t: any) => t.name));
      return tools;
    } catch (error) {
      console.error(`[MCP] Failed to get tools from ${serverName}:`, error);
      throw error;
    }
  }

  private async getToolsDirectSSE(config: McpServerConfig): Promise<any[]> {
    try {
      console.log(`[MCP] Using direct SSE approach for ${config.name}`);
      console.log(`[MCP] Target URL: ${config.url}`);
      console.log(`[MCP] Working test URL: https://mcp.zapier.com/api/mcp/s/ZjgwOGM1ZjctYjBkZC00ZWM4LWFiOGEtMGE2ZTA0NmJhNzgzOjdjNDEwOTc0LTIzNTctNGYyYy1hZTBiLWU4Mjg2OTA2MzZlZQ==/mcp`);
      console.log(`[MCP] URLs match: ${config.url === 'https://mcp.zapier.com/api/mcp/s/ZjgwOGM1ZjctYjBkZC00ZWM4LWFiOGEtMGE2ZTA0NmJhNzgzOjdjNDEwOTc0LTIzNTctNGYyYy1hZTBiLWU4Mjg2OTA2MzZlZQ==/mcp'}`);
      
      // First, we need to initialize the session (like the working test does)
      const initPayload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'browzer-assistant', version: '1.0.0' }
        }
      };
      
      console.log(`[MCP] Sending initialize request to ${config.name}...`);
      console.log(`[MCP] Initialize payload:`, JSON.stringify(initPayload, null, 2));
      const initResponse = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(initPayload)
      });
      
      console.log(`[MCP] Initialize response: ${initResponse.status} ${initResponse.statusText}`);
      
      if (!initResponse.ok) {
        throw new Error(`Initialize failed: HTTP ${initResponse.status}: ${initResponse.statusText}`);
      }
      
      // Process initialize response
      let initialized = false;
      if (initResponse.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = initResponse.body?.getReader();
        if (!reader) throw new Error('No response body');
        
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent: any = {};
          
          for (const line of lines) {
            if (line.startsWith('data:')) {
              currentEvent.data = line.substring(5).trim();
            } else if (line === '') {
              if (currentEvent.data) {
                try {
                  const eventData = JSON.parse(currentEvent.data);
                  if (eventData.result && eventData.result.serverInfo) {
                    console.log(`[MCP] Server initialized:`, eventData.result.serverInfo);
                    initialized = true;
                    break;
                  }
                } catch (parseError) {
                  console.warn(`[MCP] Parse error in initialize:`, parseError);
                }
              }
              currentEvent = {};
            }
          }
          if (initialized) break;
        }
      }
      
      if (!initialized) {
        throw new Error('Failed to initialize MCP session');
      }
      
      // Now send tools/list request
      const toolsPayload = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };
      
      console.log(`[MCP] Sending tools/list request to ${config.name}...`);
      const toolsResponse = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(toolsPayload)
      });
      
      console.log(`[MCP] Tools response: ${toolsResponse.status} ${toolsResponse.statusText}`);
      
      if (!toolsResponse.ok) {
        throw new Error(`Tools request failed: HTTP ${toolsResponse.status}: ${toolsResponse.statusText}`);
      }
      
      // Handle tools response
      if (toolsResponse.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = toolsResponse.body?.getReader();
        if (!reader) throw new Error('No response body');
        
        const decoder = new TextDecoder();
        let buffer = '';
        let tools: any[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent: any = {};
          
          for (const line of lines) {
            if (line.startsWith('data:')) {
              currentEvent.data = line.substring(5).trim();
            } else if (line === '') {
              if (currentEvent.data) {
                try {
                  const eventData = JSON.parse(currentEvent.data);
                  if (eventData.result && eventData.result.tools) {
                    tools = eventData.result.tools;
                    console.log(`[MCP] Found ${tools.length} tools via direct SSE:`, tools.map((t: any) => t.name));
                    return tools;
                  }
                } catch (parseError) {
                  console.warn(`[MCP] Parse error in tools response:`, parseError);
                }
              }
              currentEvent = {};
            }
          }
        }
        
        return tools;
      } else {
        // JSON response
        const data = await toolsResponse.json();
        if (data.result && data.result.tools) {
          return data.result.tools;
        }
        return [];
      }
    } catch (error) {
      console.error(`[MCP] Direct SSE tools request failed:`, error);
      throw error;
    }
  }

  async callTool(fullName: string, args: any): Promise<any> {
    // DIAGNOSTIC: Enhanced callTool debugging
    console.log('[DEBUG] callTool invoked:', { fullName, args });

    const tool = this.toolIndex.get(fullName);
    console.log('[DEBUG] Tool exists in registry:', !!tool);
    if (tool) {
      console.log('[DEBUG] Tool info:', {
        name: tool.name,
        serverName: tool.serverName,
        description: tool.description,
        inputSchema: tool.inputSchema
      });
    }

    if (!tool) {
      console.error('[DEBUG] Available tools in registry:', Array.from(this.toolIndex.keys()));
      throw new Error(`Tool ${fullName} not found in registry. Available tools: ${Array.from(this.toolIndex.keys()).join(', ')}`);
    }

    const client = this.clients.get(tool.serverName);
    console.log('[DEBUG] Client exists for server:', { serverName: tool.serverName, clientExists: !!client });
    console.log('[DEBUG] All connected servers:', Array.from(this.clients.keys()));

    if (!client) {
      throw new Error(`Server ${tool.serverName} not connected. Connected servers: ${Array.from(this.clients.keys()).join(', ')}`);
    }

    try {
      console.log(`[MCP] Calling tool ${fullName} with args:`, args);
      console.log('[DEBUG] Actual MCP call parameters:', {
        toolName: tool.name,
        serverName: tool.serverName,
        arguments: args
      });

      const response = await client.callTool({
        name: tool.name,
        arguments: args
      });

      console.log(`[MCP] Tool ${fullName} response:`, response);
      console.log('[DEBUG] Response type and structure:', {
        type: typeof response,
        isArray: Array.isArray(response),
        keys: typeof response === 'object' ? Object.keys(response) : null
      });
      return response;
    } catch (error) {
      console.error(`[MCP] Tool call failed for ${fullName}:`, error);
      console.error('[DEBUG] Full error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : typeof error
      });
      throw error;
    }
  }

  /* ---------- Status and debugging ---------- */
  isServerConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  getStatus() {
    const configs = this.loadConfigs();
    return {
      totalServers: configs.length,
      connectedServers: this.clients.size,
      enabledServers: configs.filter(c => c.enabled).length,
      totalTools: this.toolIndex.size,
      servers: configs.map(c => ({
        name: c.name,
        url: c.url,
        enabled: c.enabled,
        connected: this.clients.has(c.name),
        tools: Array.from(this.toolIndex.values()).filter(t => t.serverName === c.name).length
      }))
    };
  }

  async cleanup() {
    const disconnectPromises = Array.from(this.clients.keys()).map(name => this.disconnect(name));
    await Promise.all(disconnectPromises);
  }
}
