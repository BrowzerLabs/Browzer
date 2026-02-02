import { PasswordAPI } from '../types/password.types';

import { createEventListener, invoke } from '@/preload/utils/ipc-helpers';
import { PasswordFormData, CredentialSavePrompt } from '@/shared/types';

export const createPasswordAPI = (): PasswordAPI => ({
  save: (formData: PasswordFormData) => invoke('password:save', formData),
  get: (id: string) => invoke('password:get', id),
  getAll: () => invoke('password:get-all'),
  getSuggestions: (url: string) => invoke('password:get-suggestions', url),
  update: (
    id: string,
    updates: Partial<
      Pick<
        PasswordFormData,
        'password' | 'username' | 'usernameField' | 'passwordField'
      >
    >
  ) => invoke('password:update', id, updates),
  delete: (id: string) => invoke('password:delete', id),
  search: (query: string) => invoke('password:search', query),
  markUsed: (id: string) => invoke('password:mark-used', id),
  export: () => invoke('password:export'),
  import: (credentials: any[]) => invoke('password:import', credentials),
  clearAll: () => invoke('password:clear-all'),
  onSavePrompt: (callback) =>
    createEventListener<CredentialSavePrompt>('password:save-prompt', callback),
});
