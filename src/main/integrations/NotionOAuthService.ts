import { BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';

import { getNotionTokenManager } from './NotionTokenManager';

import { api } from '@/main/api';
import type {
  NotionOAuthResponse,
  NotionWorkspaceMetadata,
  NotionConnectionState,
  NotionDisconnectResponse,
} from '@/shared/types';

const NOTION_CLIENT_ID = '2f5d872b-594c-80a0-8e48-0037b7993e3b';
const OAUTH_PORT = 8080;
const NOTION_REDIRECT_URI = `http://localhost:${OAUTH_PORT}/notion/callback`;
const NOTION_AUTH_URL = 'https://api.notion.com/v1/oauth/authorize';

export class NotionOAuthService {
  private authWindow: BrowserWindow | null = null;
  private pendingState: string | null = null;
  private callbackServer: Server | null = null;

  constructor() {
    this.restoreConnection();
  }

  private restoreConnection(): void {
    const metadata = getNotionTokenManager().getMetadata();
    if (metadata) {
      console.log(
        '[NotionOAuthService] Connection restored for workspace:',
        metadata.workspace_name
      );
    }
  }

  public async connect(): Promise<NotionOAuthResponse> {
    if (!NOTION_CLIENT_ID) {
      return {
        success: false,
        error: {
          code: 'MISSING_CREDENTIALS',
          message:
            'Notion OAuth client ID is not configured. Please set NOTION_CLIENT_ID environment variable.',
        },
      };
    }

    try {
      const state = randomUUID();
      this.pendingState = state;

      const authUrl = new URL(NOTION_AUTH_URL);
      authUrl.searchParams.set('client_id', NOTION_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', NOTION_REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('owner', 'user');
      authUrl.searchParams.set('state', state);

      return new Promise((resolve) => {
        let resolved = false;
        const safeResolve = (value: NotionOAuthResponse) => {
          if (resolved) return;
          resolved = true;
          resolve(value);
        };

        this.startCallbackServer(safeResolve);

        this.authWindow = new BrowserWindow({
          width: 500,
          height: 700,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
          title: 'Connect to Notion',
          modal: true,
          resizable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          closable: true,
          autoHideMenuBar: true,
        });

        this.authWindow.setMenu(null);

        this.authWindow.once('ready-to-show', () => {
          this.authWindow?.show();
        });

        this.authWindow.on('closed', () => {
          this.authWindow = null;
          this.pendingState = null;
          this.stopCallbackServer();
          safeResolve({
            success: false,
            error: {
              code: 'OAUTH_CANCELLED',
              message: 'Notion authorization was cancelled',
            },
          });
        });

        this.authWindow.loadURL(authUrl.toString());
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          code: 'OAUTH_EXCEPTION',
          message:
            errorMessage || 'An unexpected error occurred during Notion OAuth',
        },
      };
    }
  }

  private startCallbackServer(
    resolve: (value: NotionOAuthResponse) => void
  ): void {
    this.callbackServer = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '', `http://localhost:${OAUTH_PORT}`);

        if (url.pathname === '/notion/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          const state = url.searchParams.get('state');

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
                  .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                  h1 { color: #333; margin-bottom: 10px; }
                  p { color: #666; }
                </style>
              </head>
              <body>
                <div class="container">
                  <h1>${error ? 'Connection Failed' : 'Connected!'}</h1>
                  <p>${error ? 'Please close this window and try again.' : 'You can close this window now.'}</p>
                </div>
              </body>
            </html>
          `);

          this.stopCallbackServer();

          if (state !== this.pendingState) {
            this.closeAuthWindow();
            resolve({
              success: false,
              error: {
                code: 'OAUTH_STATE_MISMATCH',
                message: 'OAuth state mismatch - possible CSRF attack',
              },
            });
            return;
          }

          if (error) {
            this.closeAuthWindow();
            resolve({
              success: false,
              error: {
                code: 'OAUTH_ERROR',
                message: url.searchParams.get('error_description') || error,
              },
            });
            return;
          }

          if (!code) {
            this.closeAuthWindow();
            resolve({
              success: false,
              error: {
                code: 'OAUTH_NO_CODE',
                message: 'No authorization code received from Notion',
              },
            });
            return;
          }

          try {
            const metadata = await this.exchangeCodeForToken(code);

            if (!metadata) {
              this.closeAuthWindow();
              resolve({
                success: false,
                error: {
                  code: 'TOKEN_EXCHANGE_FAILED',
                  message: 'Failed to connect to Notion',
                },
              });
              return;
            }

            getNotionTokenManager().saveMetadata(metadata);

            this.closeAuthWindow();
            resolve({
              success: true,
              data: metadata,
            });
          } catch (err: unknown) {
            const errorMessage =
              err instanceof Error ? err.message : 'Unknown error';
            this.closeAuthWindow();
            resolve({
              success: false,
              error: {
                code: 'OAUTH_CALLBACK_EXCEPTION',
                message:
                  errorMessage || 'Error processing Notion OAuth callback',
              },
            });
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      }
    );

    this.callbackServer.listen(OAUTH_PORT, () => {
      console.log(
        `[NotionOAuthService] Callback server listening on port ${OAUTH_PORT}`
      );
    });

    this.callbackServer.on('error', (err: NodeJS.ErrnoException) => {
      console.error('[NotionOAuthService] Callback server error:', err);
      this.closeAuthWindow();
      if (err.code === 'EADDRINUSE') {
        resolve({
          success: false,
          error: {
            code: 'PORT_IN_USE',
            message: `Port ${OAUTH_PORT} is already in use. Please close other applications using this port.`,
          },
        });
      } else {
        resolve({
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: `Callback server error: ${err.message}`,
          },
        });
      }
    });
  }

  private stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
      console.log('[NotionOAuthService] Callback server stopped');
    }
  }

  private async exchangeCodeForToken(
    code: string
  ): Promise<NotionWorkspaceMetadata | null> {
    try {
      const response = await api.post('/notion/oauth/exchange', {
        code,
        redirect_uri: NOTION_REDIRECT_URI,
      });

      const data = response.data;

      if (!data?.success) {
        console.error(
          '[NotionOAuthService] Token exchange failed:',
          data?.error
        );
        return null;
      }

      return {
        bot_id: data.bot_id,
        workspace_id: data.workspace_id,
        workspace_name: data.workspace_name,
        workspace_icon: data.workspace_icon,
        owner: data.owner,
        created_at: Date.now(),
      };
    } catch (error) {
      console.error('[NotionOAuthService] Token exchange error:', error);
      return null;
    }
  }

  private closeAuthWindow(): void {
    this.pendingState = null;
    this.stopCallbackServer();
    if (this.authWindow) {
      this.authWindow.close();
      this.authWindow = null;
    }
  }

  public async disconnect(): Promise<NotionDisconnectResponse> {
    try {
      try {
        await api.delete('/notion/disconnect');
        console.log('[NotionOAuthService] Server disconnection successful');
      } catch (error) {
        console.warn(
          '[NotionOAuthService] Server disconnection failed:',
          error
        );
      }

      getNotionTokenManager().clearMetadata();
      return { success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage || 'Failed to disconnect from Notion',
      };
    }
  }

  public getConnectionState(): NotionConnectionState {
    const metadata = getNotionTokenManager().getMetadata();

    if (!metadata) {
      return {
        isConnected: false,
        isLoading: false,
        error: null,
        workspace: null,
        owner: null,
      };
    }

    return {
      isConnected: true,
      isLoading: false,
      error: null,
      workspace: {
        id: metadata.workspace_id,
        name: metadata.workspace_name || 'Unknown Workspace',
        icon: metadata.workspace_icon,
      },
      owner: metadata.owner,
    };
  }

  public async startSync(forceFullSync = false): Promise<{
    success: boolean;
    message: string;
    syncId?: string;
  }> {
    try {
      const response = await api.post('/notion/sync', {
        force_full_sync: forceFullSync,
      });

      if (response.data?.success) {
        console.log(
          '[NotionOAuthService] Sync started:',
          response.data.sync_id
        );
        return {
          success: true,
          message: response.data.message,
          syncId: response.data.sync_id,
        };
      }

      return {
        success: false,
        message: response.data?.message || 'Failed to start sync',
      };
    } catch (error) {
      console.error('[NotionOAuthService] Failed to start sync:', error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to start sync',
      };
    }
  }

  public async getServerConnectionStatus(): Promise<{
    isConnected: boolean;
    syncStatus?: string;
    lastSyncAt?: string;
    totalDocuments?: number;
    syncError?: string;
  }> {
    try {
      const response = await api.get('/notion/connection');
      const data = response.data;

      if (!data) {
        return { isConnected: false };
      }

      // Map snake_case from backend to camelCase for frontend
      return {
        isConnected: data.is_connected ?? false,
        syncStatus: data.sync_status,
        lastSyncAt: data.last_sync_at,
        totalDocuments: data.total_documents,
        syncError: data.sync_error,
      };
    } catch (error) {
      console.error('[NotionOAuthService] Failed to get server status:', error);
      return { isConnected: false };
    }
  }

  public destroy(): void {
    this.closeAuthWindow();
    getNotionTokenManager().destroy();
  }
}
