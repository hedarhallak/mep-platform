import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "constrai_token";
const USER_KEY = "constrai_user";

export const saveToken = async (token) => {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
};

export const getToken = async () => {
  return await SecureStore.getItemAsync(TOKEN_KEY);
};

export const removeToken = async () => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
};

export const saveUser = async (user) => {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
};

export const getUser = async () => {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
};

export const removeUser = async () => {
  await SecureStore.deleteItemAsync(USER_KEY);
};

export const clearAll = async () => {
  await removeToken();
  await removeUser();
};
