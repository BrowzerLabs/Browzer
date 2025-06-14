// Core types for the Browzer Extensions Framework

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: ExtensionType;
  main?: string;
  permissions: ExtensionPermission[];
  apis?: string[];
  dependencies?: ExtensionDependency[];
  files: string[];
  icon?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  minBrowserVersion?: string;
  maxBrowserVersion?: string;
  platform?: string[];
  configSchema?: ConfigSchema;
  background?: {
    scripts?: string[];
    page?: string;
    persistent?: boolean;
  };
  contentScripts?: ContentScript[];
  webAccessibleResources?: string[];
  host_permissions?: string[];
}

export enum ExtensionType {
  WEB_EXTENSION = 'web_extension',
  PYTHON_AGENT = 'python_agent',
  JS_MODULE = 'js_module',
  THEME = 'theme',
  PROTOCOL_HANDLER = 'protocol_handler',
  AI_ASSISTANT = 'ai_assistant',
  BROWSER_ENHANCEMENT = 'browser_enhancement'
}

export enum ExtensionPermission {
  TABS = 'tabs',
  ACTIVE_TAB = 'activeTab',
  BOOKMARKS = 'bookmarks',
  HISTORY = 'history',
  STORAGE = 'storage',
  COOKIES = 'cookies',
  NOTIFICATIONS = 'notifications',
  WEBNAVIGATION = 'webNavigation',
  WEBREQUEST = 'webRequest',
  WEBREQUEST_BLOCKING = 'webRequestBlocking',
  PYTHON_EXECUTION = 'python_execution',
  FILE_SYSTEM = 'file_system',
  NETWORK_ACCESS = 'network_access',
  AI_API_ACCESS = 'ai_api_access',
  CROSS_EXTENSION_MESSAGING = 'cross_extension_messaging',
  BROWSER_ACTIONS = 'browser_actions',
  CONTEXT_MENUS = 'contextMenus',
  DOWNLOADS = 'downloads',
  GEOLOCATION = 'geolocation',
  IDENTITY = 'identity',
  MANAGEMENT = 'management',
  PRIVACY = 'privacy',
  PROXY = 'proxy',
  SYSTEM_INFO = 'system.info'
}

export interface ExtensionDependency {
  id: string;
  version: string;
  optional?: boolean;
}

export interface ContentScript {
  matches: string[];
  js?: string[];
  css?: string[];
  run_at?: 'document_start' | 'document_end' | 'document_idle';
  all_frames?: boolean;
  include_globs?: string[];
  exclude_globs?: string[];
  exclude_matches?: string[];
}

export interface ConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    default?: any;
    description?: string;
    required?: boolean;
    options?: any[];
  };
}

export interface ExtensionContext {
  id: string;
  manifest: ExtensionManifest;
  path: string;
  config: Record<string, any>;
  permissions: ExtensionPermission[];
  sandbox: ExtensionSandbox;
  runtime: ExtensionRuntime;
  apis: ExtensionAPIRegistry;
  storage: ExtensionStorage;
  messaging: ExtensionMessaging;
  logger: ExtensionLogger;
}

export interface ExtensionSandbox {
  type: 'isolated' | 'shared' | 'native';
  restrictions: SandboxRestriction[];
  resourceLimits: ResourceLimits;
}

export interface SandboxRestriction {
  type: 'network' | 'filesystem' | 'process' | 'memory' | 'cpu';
  rules: string[];
}

export interface ResourceLimits {
  maxMemory: number; // MB
  maxCpu: number; // percentage
  maxNetworkRequests: number;
  maxFileSize: number; // MB
  maxExecutionTime: number; // seconds
}

export interface ExtensionRuntime {
  type: RuntimeType;
  version: string;
  environment: Record<string, string>;
  entrypoint: string;
}

export enum RuntimeType {
  JAVASCRIPT = 'javascript',
  PYTHON = 'python',
  WEBASSEMBLY = 'webassembly',
  NATIVE = 'native'
}

export interface ExtensionAPIRegistry {
  register(api: ExtensionAPI): void;
  unregister(apiName: string): void;
  get(apiName: string): ExtensionAPI | undefined;
  list(): string[];
}

export interface ExtensionAPI {
  name: string;
  version: string;
  methods: APIMethod[];
  events: APIEvent[];
  permissions: ExtensionPermission[];
}

export interface APIMethod {
  name: string;
  parameters: APIParameter[];
  returns: APIReturn;
  permissions: ExtensionPermission[];
  description?: string;
}

export interface APIParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface APIReturn {
  type: string;
  description?: string;
}

export interface APIEvent {
  name: string;
  parameters: APIParameter[];
  description?: string;
}

export interface ExtensionStorage {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

export interface ExtensionMessaging {
  send(extensionId: string, message: ExtensionMessage): Promise<any>;
  broadcast(message: ExtensionMessage): Promise<void>;
  listen(callback: MessageHandler): void;
  unlisten(callback: MessageHandler): void;
}

export interface ExtensionMessage {
  id: string;
  from: string;
  to?: string;
  type: MessageType;
  data: any;
  timestamp: number;
}

export enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  EVENT = 'event',
  BROADCAST = 'broadcast'
}

export type MessageHandler = (message: ExtensionMessage) => Promise<any> | any;

export interface ExtensionLogger {
  debug(message: string, data?: any): void;
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, error?: Error): void;
  trace(message: string, data?: any): void;
}

export interface ExtensionEvent {
  type: ExtensionEventType;
  extensionId: string;
  data?: any;
  timestamp: number;
}

export enum ExtensionEventType {
  INSTALLED = 'installed',
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  UNINSTALLED = 'uninstalled',
  UPDATED = 'updated',
  ERROR = 'error',
  PERMISSION_REQUESTED = 'permission_requested',
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_DENIED = 'permission_denied'
}

export interface ExtensionStore {
  search(query: string, filters?: StoreFilters): Promise<StoreSearchResult>;
  get(extensionId: string): Promise<StoreExtension | null>;
  install(extensionId: string, version?: string): Promise<InstallResult>;
  uninstall(extensionId: string): Promise<boolean>;
  update(extensionId: string): Promise<UpdateResult>;
  checkUpdates(): Promise<UpdateInfo[]>;
  getInstalled(): Promise<ExtensionContext[]>;
  getCategories(): Promise<StoreCategory[]>;
}

export interface StoreFilters {
  type?: ExtensionType;
  category?: string;
  author?: string;
  verified?: boolean;
  rating?: number;
  price?: 'free' | 'paid';
}

export interface StoreSearchResult {
  results: StoreExtension[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StoreExtension {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  type: ExtensionType;
  category: string;
  tags: string[];
  rating: number;
  downloads: number;
  verified: boolean;
  price: number;
  screenshots: string[];
  icon: string;
  homepage: string;
  updatedAt: string;
  createdAt: string;
}

export interface StoreCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  extensionCount: number;
}

export interface InstallResult {
  success: boolean;
  extensionId: string;
  version: string;
  error?: string;
}

export interface UpdateResult {
  success: boolean;
  oldVersion: string;
  newVersion: string;
  error?: string;
}

export interface UpdateInfo {
  extensionId: string;
  currentVersion: string;
  availableVersion: string;
  changelog?: string;
}

// Extension Framework Configuration
export interface ExtensionFrameworkConfig {
  maxExtensions: number;
  developmentMode: boolean;
  autoUpdate: boolean;
  storageQuota: number; // MB per extension
  defaultPermissions: ExtensionPermission[];
  trustedSources: string[];
  securityLevel: SecurityLevel;
  pythonExecutable?: string;
  pythonVirtualEnv?: string;
  storeEndpoint: string;
  telemetryEnabled: boolean;
}

export enum SecurityLevel {
  STRICT = 'strict',
  MODERATE = 'moderate',
  PERMISSIVE = 'permissive'
}

// Error types
export class ExtensionError extends Error {
  constructor(
    message: string,
    public code: ExtensionErrorCode,
    public extensionId?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

export enum ExtensionErrorCode {
  INVALID_MANIFEST = 'INVALID_MANIFEST',
  MISSING_PERMISSIONS = 'MISSING_PERMISSIONS',
  SANDBOX_VIOLATION = 'SANDBOX_VIOLATION',
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  INSTALLATION_FAILED = 'INSTALLATION_FAILED',
  DEPENDENCY_MISSING = 'DEPENDENCY_MISSING',
  VERSION_CONFLICT = 'VERSION_CONFLICT',
  RESOURCE_LIMIT_EXCEEDED = 'RESOURCE_LIMIT_EXCEEDED',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  COMMUNICATION_ERROR = 'COMMUNICATION_ERROR'
} 