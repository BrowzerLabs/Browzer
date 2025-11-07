import { ApiClient, ApiResponse } from './ApiClient';
import { AxiosRequestConfig } from 'axios';


let apiClientInstance: ApiClient | null = null;

export function initializeApi(client: ApiClient): void {
  apiClientInstance = client;
}
function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    throw new Error('API client not initialized. Ensure ConnectionService is initialized first.');
  }
  return apiClientInstance;
}

export const api = {
  get: <T = any>(endpoint: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    return getApiClient().get<T>(endpoint, config);
  },
  post: <T = any>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    return getApiClient().post<T>(endpoint, data, config);
  },
  put: <T = any>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    return getApiClient().put<T>(endpoint, data, config);
  },
  patch: <T = any>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    return getApiClient().patch<T>(endpoint, data, config);
  },
  delete: <T = any>(endpoint: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    return getApiClient().delete<T>(endpoint, config);
  },
  getClient: (): ApiClient => {
    return getApiClient();
  },
};