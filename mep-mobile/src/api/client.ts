import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEV_URL = 'http://10.0.0.172:3000';

export const apiClient = axios.create({
  baseURL: DEV_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('mep_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('mep_token');
      await AsyncStorage.removeItem('mep_user');
    }
    return Promise.reject(error);
  }
);
