
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { app } from 'electron';
import { randomUUID } from 'crypto';
import os from 'os';

export interface ApiConfig {
  baseURL: string;
  apiKey: string;
  timeout?: number;
  getAccessToken: () => string | null;
  clearSession: () => void;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status: number;
}

export class ApiClient {
  private axios: AxiosInstance;
  private apiKey: string;
  private electronId: string;

  private getAccessToken: () => string | null;
  private clearSession: () => void;
  

  constructor(config: ApiConfig) {
    this.apiKey = config.apiKey;
    this.electronId = this.generateElectronId();

    this.getAccessToken = config.getAccessToken;
    this.clearSession = config.clearSession;
    

    // Create axios instance with base configuration
    this.axios = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `Browzer/${app.getVersion()} (${os.platform()})`,
      },
    });

    // Setup interceptors
    this.setupInterceptors();
  }

  /**
   * Generate a unique identifier for this Electron instance
   */
  private generateElectronId(): string {
    const machineId = os.hostname();
    const instanceId = randomUUID();
    return `${machineId}-${instanceId}`;
  }

  /**
   * Setup axios interceptors for auth and error handling
   */
  private setupInterceptors(): void {
    // Request interceptor - Add auth headers
    this.axios.interceptors.request.use(
      (config) => {
        // Add API key and Electron ID to all requests
        config.headers['X-API-Key'] = this.apiKey;
        config.headers['X-Electron-ID'] = this.electronId;

        const accessToken = this.getAccessToken();
        if (accessToken) {
          config.headers['Authorization'] = `Bearer ${accessToken}`;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - Handle errors and retry
    this.axios.interceptors.response.use(
      (response) => {
        return response;
      },
      async (error: AxiosError) => {
        console.error('[ApiClient] Request failed:', error.message);
        if (error.response?.status === 401) {
          console.warn('[ApiClient] 401 Unauthorized - access token may be expired');
          this.clearSession();
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Establish connection with backend
   * Note: This only verifies Electron app instance, not user authentication
   */
  async connect(): Promise<ApiResponse<{
    sse_url: string;
    message: string;
  }>> {
    try {
      const response = await this.axios.post('/connection/establish', {
        electron_version: app.getVersion(),
        os_platform: os.platform(),
      });

      console.log('[ApiClient] Electron app connection established successfully');

      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  /**
   * Check connection health
   */
  async healthCheck(): Promise<ApiResponse<{
    status: string;
    server_time: string;
  }>> {
    try {
      const response = await this.axios.get('/connection/health');
      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  /**
   * Disconnect from backend
   */
  async disconnect(): Promise<ApiResponse> {
    try {
      const response = await this.axios.post('/connection/disconnect');
      this.clearSession();
      console.log('[ApiClient] Disconnected successfully');
      
      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  /**
   * Generic GET request
   */
  async get<T>(endpoint: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.axios.get<T>(endpoint, config);
      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  /**
   * Generic POST request
   */
  async post<T>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.axios.post<T>(endpoint, data, config);
      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  /**
   * Generic PUT request
   */
  async put<T>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.axios.put<T>(endpoint, data, config);
      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  /**
   * Generic PATCH request
   */
  async patch<T>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.axios.patch<T>(endpoint, data, config);
      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  /**
   * Generic DELETE request
   */
  async delete<T>(endpoint: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.axios.delete<T>(endpoint, config);
      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  /**
   * Handle axios errors consistently
   */
  private handleError(error: AxiosError): ApiResponse {
    console.error('[ApiClient] Request failed:', error.message);

    if (error.response) {
      // Server responded with error
      const data = error.response.data as any;
      return {
        success: false,
        error: data?.detail || data?.error || data?.message || 'Request failed',
        status: error.response.status,
      };
    } else if (error.request) {
      // Request made but no response
      return {
        success: false,
        error: 'No response from server',
        status: 0,
      };
    } else {
      // Error setting up request
      return {
        success: false,
        error: error.message || 'Network error',
        status: 0,
      };
    }
  }


  /**
   * Get Electron instance ID
   */
  getElectronId(): string {
    return this.electronId;
  }

  /**
   * Check if user is authenticated (has access token)
   */
  isAuthenticated(): boolean {
    return this.getAccessToken() !== null;
  }

  /**
   * Get direct axios instance for advanced usage
   */
  getAxiosInstance(): AxiosInstance {
    return this.axios;
  }
}
