import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const DEV_URL = 'https://app.constrai.ca';

export const apiClient = axios.create({
  baseURL: DEV_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Flag to prevent multiple refresh attempts at once
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else if (token) resolve(token);
  });
  failedQueue = [];
}

// Auto-attach access token
apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('mep_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 → try refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/api/auth/refresh') &&
      !originalRequest.url?.includes('/api/auth/login')
    ) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = await SecureStore.getItemAsync('mep_refresh_token');

      if (refreshToken) {
        try {
          const res = await axios.post(`${DEV_URL}/api/auth/refresh`, {
            refresh_token: refreshToken,
          });

          if (res.data.ok) {
            await SecureStore.setItemAsync('mep_token', res.data.token);
            await SecureStore.setItemAsync('mep_refresh_token', res.data.refresh_token);

            originalRequest.headers.Authorization = `Bearer ${res.data.token}`;
            processQueue(null, res.data.token);
            return apiClient(originalRequest);
          }
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          // Refresh failed — clear tokens
          await SecureStore.deleteItemAsync('mep_token');
          await SecureStore.deleteItemAsync('mep_refresh_token');
          await SecureStore.deleteItemAsync('mep_user');
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      }

      // No refresh token — clear everything
      await SecureStore.deleteItemAsync('mep_token');
      await SecureStore.deleteItemAsync('mep_refresh_token');
      await SecureStore.deleteItemAsync('mep_user');
    }

    return Promise.reject(error);
  }
);
