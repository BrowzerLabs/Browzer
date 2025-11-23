import { SSEClient } from './SSEClient';

export let sse: SSEClient | null = null;

export function initializeSSEClient(client: SSEClient): void {
  if (sse) {
    console.warn('[SSEClientInstance] SSE client already initialized');
    return;
  }
  
  sse = client;
  console.log('✅ [SSEClientInstance] Global SSE client initialized');
}

export function resetSSEClient(): void {
  sse = null;
  console.log('[SSEClientInstance] SSE client reset');
}