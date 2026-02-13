/**
 * Notion integration related types
 */

export interface NotionWorkspace {
  id: string;
  name: string;
  icon: string | null;
}

export interface NotionUser {
  id: string;
  name: string | null;
  avatar_url: string | null;
  type: 'person' | 'bot';
  person?: {
    email: string;
  };
}

export interface NotionOwner {
  type: 'user' | 'workspace';
  user?: NotionUser;
  workspace?: boolean;
}

export interface NotionWorkspaceMetadata {
  bot_id: string;
  workspace_id: string;
  workspace_name: string | null;
  workspace_icon: string | null;
  owner: NotionOwner;
  created_at: number;
}

export interface NotionConnectionState {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  workspace: NotionWorkspace | null;
  owner: NotionOwner | null;
}

export interface NotionOAuthResponse {
  success: boolean;
  data?: NotionWorkspaceMetadata;
  error?: {
    code: string;
    message: string;
  };
}

export interface NotionDisconnectResponse {
  success: boolean;
  error?: string;
}
