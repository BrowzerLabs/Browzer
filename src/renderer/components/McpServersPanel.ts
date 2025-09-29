import { McpClientManager, McpServerConfig } from '../services/McpClientManager';

/**
 * Lightweight UI helper that injects an MCP Servers section into the Settings page.
 * Requires a <div id="mcp-servers-root"></div> placeholder within settings.html.
 */
export class McpServersPanel {
  private root: HTMLElement;
  private manager: McpClientManager;

  constructor(root: HTMLElement, manager: McpClientManager) {
    this.root = root;
    this.manager = manager;
    this.render();
  }

  private render() {
    const cfgs = this.manager.loadConfigs();
    this.root.innerHTML = `
      <h3 class="settings-card-title">
        <span class="settings-icon">🔌</span> MCP Servers
      </h3>
      <p class="settings-card-description">Connect Browzer to external tool servers (Model Context Protocol)</p>
      <div class="mcp-server-list">
        ${cfgs.map((c, i) => this.renderRow(c, i)).join('')}
      </div>
      <button id="mcp-add-btn" class="chrome-btn chrome-btn-primary">Add Server</button>
    `;

    this.root.querySelector('#mcp-add-btn')?.addEventListener('click', () => this.showAddModal());
    cfgs.forEach((_c, idx) => {
      console.log(`Adding event listeners for server ${idx}: ${cfgs[idx].name}`);
      
      this.root.querySelector(`#toggle-${idx}`)?.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.manager.toggleServer(cfgs[idx].name, checked);
        // Update test button state
        const testBtn = this.root.querySelector(`#test-${idx}`) as HTMLButtonElement;
        if (testBtn) {
          testBtn.disabled = !checked;
        }
      });
      
      const testBtn = this.root.querySelector(`#test-${idx}`);
      console.log(`Test button found for ${idx}:`, !!testBtn);
      testBtn?.addEventListener('click', () => {
        console.log(`Test button clicked for ${cfgs[idx].name}`);
        alert(`Button clicked for ${cfgs[idx].name}!`);
        this.testServerTools(cfgs[idx], idx);
      });
      
      this.root.querySelector(`#remove-${idx}`)?.addEventListener('click', () => {
        const list = this.manager.loadConfigs();
        list.splice(idx,1);
        this.manager.saveConfigs(list);
        this.render();
      });
    });
  }

  private renderRow(c: McpServerConfig, i: number) {
    const isConnected = this.manager.isServerConnected(c.name);
    const connectionStatus = isConnected ? '🟢 Connected' : (c.enabled ? '🟡 Connecting...' : '⚫ Disabled');
    
    return `
      <div class="mcp-row">
        <span class="mcp-name">${c.name}</span>
        <span class="mcp-url">${c.url}</span>
        <span class="mcp-status" title="Connection Status">${connectionStatus}</span>
        <label class="mcp-toggle">
          <input type="checkbox" id="toggle-${i}" ${c.enabled ? 'checked' : ''}>
          <span>Enabled</span>
        </label>
        <button id="test-${i}" class="chrome-btn chrome-btn-secondary chrome-btn-small" ${!c.enabled ? 'disabled' : ''}>Test Tools</button>
        <button id="remove-${i}" class="chrome-btn chrome-btn-danger chrome-btn-small">Remove</button>
      </div>
      <div id="tools-list-${i}" class="mcp-tools-list" style="display: none;"></div>
    `;
  }

  private async testServerTools(config: McpServerConfig, index: number) {
    alert(`Testing ${config.name}!`);
    const toolsListElement = this.root.querySelector(`#tools-list-${index}`) as HTMLElement;
    const testBtn = this.root.querySelector(`#test-${index}`) as HTMLButtonElement;
    
    if (!toolsListElement) {
      alert('Tools list element not found!');
      return;
    }
    
    // Toggle visibility
    const isVisible = toolsListElement.style.display !== 'none';
    if (isVisible) {
      toolsListElement.style.display = 'none';
      testBtn.textContent = 'Test Tools';
      return;
    }
    
    // Show loading state
    testBtn.textContent = 'Testing...';
    testBtn.disabled = true;
    toolsListElement.style.display = 'block';
    toolsListElement.innerHTML = '<div class="mcp-tools-loading">🔄 Discovering tools...</div>';
    
    function addLog(message: string) {
      const currentContent = toolsListElement.innerHTML;
      toolsListElement.innerHTML = currentContent + `<div style="font-size: 11px; color: #666; margin: 2px 0;">${message}</div>`;
    }
    
    try {
      // Use the exact same approach as the working integration test
      addLog(`📤 Testing ${config.name} at ${config.url}`);
      console.log(`[MCP Panel] Testing ${config.name} at ${config.url}`);
      
      // Step 1: Initialize (exactly like integration test)
      const initPayload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'browzer-electron-test', version: '1.0.0' }
        }
      };
      
      addLog(`📤 Sending initialize request...`);
      console.log(`[MCP Panel] Sending initialize to ${config.url}`);
      console.log(`[MCP Panel] Payload:`, JSON.stringify(initPayload, null, 2));
      
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(initPayload)
      });
      
      addLog(`📥 Response: ${response.status} ${response.statusText}`);
      console.log(`[MCP Panel] Initialize response: ${response.status} ${response.statusText}`);
      console.log(`[MCP Panel] Response headers:`, response.headers.get('content-type'));
      
      if (!response.ok) {
        addLog(`❌ Initialize failed: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Handle SSE response
      let serverConnected = false;
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body!.getReader();
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
                    console.log(`[MCP Panel] Connected to: ${eventData.result.serverInfo.name}`);
                    serverConnected = true;
                    break;
                  }
                } catch (parseError) {
                  // Continue processing
                }
              }
              currentEvent = {};
            }
          }
          
          if (serverConnected) break;
        }
      }
      
      if (!serverConnected) {
        throw new Error('Failed to establish MCP connection');
      }
      
      // Step 2: Get tools (exactly like integration test)
      const toolsPayload = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };
      
      const toolsResponse = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(toolsPayload)
      });
      
      let tools: any[] = [];
      if (toolsResponse.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = toolsResponse.body!.getReader();
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
                  if (eventData.result && eventData.result.tools) {
                    tools = eventData.result.tools;
                    break;
                  }
                } catch (parseError) {
                  // Continue processing
                }
              }
              currentEvent = {};
            }
          }
          
          if (tools.length > 0) break;
        }
      }
      
      if (tools && tools.length > 0) {
        toolsListElement.innerHTML = `
          <div class="mcp-tools-header">
            <h4>🛠️ Available Tools from ${config.name} (${tools.length})</h4>
          </div>
          <div class="mcp-tools-grid">
            ${tools.map(tool => `
              <div class="mcp-tool-card">
                <div class="mcp-tool-name">${tool.name}</div>
                <div class="mcp-tool-description">${tool.description || 'No description provided'}</div>
                <div class="mcp-tool-schema">
                  <details>
                    <summary>Input Schema</summary>
                    <pre>${JSON.stringify(tool.inputSchema, null, 2)}</pre>
                  </details>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        toolsListElement.innerHTML = `
          <div class="mcp-tools-empty">
            ❌ No tools found from ${config.name}
            <br><small>Server may not be running or may not support tool listing</small>
          </div>
        `;
      }
      
      testBtn.textContent = 'Hide Tools';
    } catch (error: any) {
      console.error(`[MCP Panel] Failed to get tools from ${config.name}:`, error);
      toolsListElement.innerHTML = `
        <div class="mcp-tools-error">
          ❌ Failed to get tools: ${error.message}
          <br><small>Check browser console for detailed error information</small>
        </div>
      `;
      testBtn.textContent = 'Test Tools';
    } finally {
      testBtn.disabled = false;
    }
  }

  private showAddModal() {
    const name = prompt('Server name (unique id)');
    if (!name) return;
    const url = prompt('WebSocket URL (e.g., ws://localhost:7900/ws)');
    if (!url) return;
    const cfg: McpServerConfig = {
      id: '', // Will be auto-generated by addConfig
      name,
      url,
      enabled: true
    };
    this.manager.addConfig(cfg);
    this.render();
  }
}
