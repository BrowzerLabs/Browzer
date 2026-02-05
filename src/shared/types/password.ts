export interface PasswordCredential {
  id: string;
  url: string;
  hostname: string;
  username: string;
  password: string;
  usernameField?: string;
  passwordField?: string;
  createdAt: number;
  updatedAt: number;
  lastUsed?: number;
  timesUsed: number;
}

export interface PasswordSuggestion {
  credential: PasswordCredential;
  matchType: 'exact' | 'subdomain' | 'domain';
}

export interface CredentialSavePrompt {
  id: string;
  hostname: string;
  url: string;
  username: string;
  password: string;
  usernameField?: string;
  passwordField?: string;
}

export interface PasswordFormData {
  url: string;
  hostname: string;
  username: string;
  password: string;
  usernameField?: string;
  passwordField?: string;
}
