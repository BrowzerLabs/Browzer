
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { app } from 'electron';
import { randomUUID } from 'crypto';
import os from 'os';
import { tokenManager } from '../auth/TokenManager';

export interface ApiConfig {
  baseURL: string;
  timeout?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status: number;
}

export class ApiClient {
  private axios: AxiosInstance;
  private electronId: string;
  private refreshCallback: (() => Promise<boolean>) | null = null;

  constructor(config: ApiConfig) {
    this.electronId = this.generateElectronId();
    
    this.axios = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `Browzer/${app.getVersion()} (${os.platform()})`,
      },
    });

    this.setupInterceptors();
  }

  /**
   * Set refresh callback (called by AuthService)
   */
  public setRefreshCallback(callback: () => Promise<boolean>): void {
    this.refreshCallback = callback;
  }

  private generateElectronId(): string {
    const machineId = os.hostname();
    const instanceId = randomUUID();
    return `${machineId}-${instanceId}`;
  }

  private setupInterceptors(): void {
    this.axios.interceptors.request.use(
      (config) => {
        config.headers['X-Electron-ID'] = this.electronId;

        const accessToken = tokenManager.getAccessToken();
        if (accessToken) {
          config.headers['Authorization'] = `Bearer ${accessToken}`;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.axios.interceptors.response.use(
      (response) => {
        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

        // Handle 401 Unauthorized - attempt token refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
          console.warn('[ApiClient] 401 Unauthorized - attempting token refresh');

          // Check if refresh is already in progress
          if (tokenManager.isRefreshInProgress()) {
            console.log('[ApiClient] Refresh already in progress, waiting...');
            const success = await tokenManager.waitForRefresh();
            
            if (success) {
              // Retry original request with new token
              const newToken = tokenManager.getAccessToken();
              if (newToken && originalRequest.headers) {
                originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
              }
              return this.axios.request(originalRequest);
            } else {
              console.error('[ApiClient] Token refresh failed, clearing session');
              tokenManager.clearTokens();
              return Promise.reject(error);
            }
          }

          // Mark request as retried to prevent infinite loops
          originalRequest._retry = true;

          // Attempt to refresh token
          if (this.refreshCallback) {
            try {
              const refreshPromise = this.refreshCallback();
              tokenManager.setRefreshing(refreshPromise);
              const success = await refreshPromise;

              if (success) {
                console.log('[ApiClient] Token refreshed successfully, retrying request');
                
                // Retry original request with new token
                const newToken = tokenManager.getAccessToken();
                if (newToken && originalRequest.headers) {
                  originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                }
                
                return this.axios.request(originalRequest);
              } else {
                console.error('[ApiClient] Token refresh failed');
                tokenManager.clearTokens();
              }
            } catch (refreshError) {
              console.error('[ApiClient] Token refresh exception:', refreshError);
              tokenManager.clearTokens();
            }
          } else {
            console.error('[ApiClient] No refresh callback available');
            tokenManager.clearTokens();
          }
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
      tokenManager.clearTokens();
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
    return tokenManager.getAccessToken() !== null;
  }

  /**
   * Get direct axios instance for advanced usage
   */
  getAxiosInstance(): AxiosInstance {
    return this.axios;
  }
}
