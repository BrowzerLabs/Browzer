import {
  PasswordCredential,
  PasswordFormData,
  PasswordSuggestion,
  CredentialSavePrompt,
} from '@/shared/types';

export interface PasswordAPI {
  save: (formData: PasswordFormData) => Promise<PasswordCredential>;
  get: (id: string) => Promise<PasswordCredential | null>;
  getAll: () => Promise<PasswordCredential[]>;
  getSuggestions: (url: string) => Promise<PasswordSuggestion[]>;
  update: (
    id: string,
    updates: Partial<
      Pick<
        PasswordFormData,
        'password' | 'username' | 'usernameField' | 'passwordField'
      >
    >
  ) => Promise<PasswordCredential>;
  delete: (id: string) => Promise<boolean>;
  search: (query: string) => Promise<PasswordCredential[]>;
  markUsed: (id: string) => Promise<boolean>;
  export: () => Promise<PasswordCredential[]>;
  import: (credentials: any[]) => Promise<number>;
  clearAll: () => Promise<boolean>;
  onSavePrompt: (
    callback: (prompt: CredentialSavePrompt) => void
  ) => () => void;
}
