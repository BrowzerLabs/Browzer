/**
 * Form field information
 */
export interface FormField {
  nodeId?: number;
  selector: string;
  type: 'username' | 'email' | 'password' | 'new-password' | 'current-password';
  name?: string;
  id?: string;
  autocomplete?: string;
  value?: string;
  isVisible: boolean;
  confidence: number; // 0-1 score for field type detection
}

/**
 * Detected login form
 */
export interface DetectedForm {
  formId: string;
  formSelector?: string;
  action?: string;
  method?: string;
  origin: string;
  usernameField?: FormField;
  emailField?: FormField;
  passwordField?: FormField;
  newPasswordField?: FormField;
  confirmPasswordField?: FormField;
  submitButton?: {
    selector: string;
    text?: string;
  };
  formType: 'login' | 'signup' | 'change-password' | 'multi-step';
  confidence: number;
  timestamp: number;
}

/**
 * Form submission data
 */
export interface FormSubmission {
  formId: string;
  origin: string;
  username?: string;
  email?: string;
  password: string;
  newPassword?: string;
  timestamp: number;
  url: string;
}

/**
 * Autofill suggestion
 */
export interface AutofillSuggestion {
  credentialId: string;
  username: string;
  displayName?: string;
  lastUsed: number;
  icon?: string;
}

/**
 * Password prompt action
 */
export type PasswordPromptAction = 'save' | 'update' | 'never';

/**
 * Password prompt data
 */
export interface PasswordPromptData {
  type: 'save' | 'update';
  origin: string;
  username: string;
  password: string;
  existingCredentialId?: string;
  timestamp: number;
}

/**
 * Form monitoring state
 */
export interface FormMonitorState {
  detectedForms: Map<string, DetectedForm>;
  activeFormId: string | null;
  lastSubmission: FormSubmission | null;
  pendingPrompt: PasswordPromptData | null;
}

/**
 * Autofill position
 */
export interface AutofillPosition {
  top: number;
  left: number;
  width: number;
  fieldRect: DOMRect;
}

/**
 * Password generation options
 */
export interface PasswordGenerationOptions {
  length: number;
  includeUppercase: boolean;
  includeLowercase: boolean;
  includeNumbers: boolean;
  includeSymbols: boolean;
  excludeSimilar: boolean;
  excludeAmbiguous: boolean;
}

/**
 * Form detection heuristics
 */
export interface FormHeuristics {
  // Username/Email field indicators
  usernamePatterns: RegExp[];
  emailPatterns: RegExp[];
  
  // Password field indicators
  passwordPatterns: RegExp[];
  newPasswordPatterns: RegExp[];
  currentPasswordPatterns: RegExp[];
  
  // Form action indicators
  loginActionPatterns: RegExp[];
  signupActionPatterns: RegExp[];
  changePasswordPatterns: RegExp[];
  
  // Submit button indicators
  submitButtonPatterns: RegExp[];
}
