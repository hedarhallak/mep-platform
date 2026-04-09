import api from "./api";
import { saveToken, saveUser, clearAll } from "../utils/storage";

export const login = async (username, password) => {
  const response = await api.post("/auth/login", { username, password });
  const { token, user } = response.data;
  await saveToken(token);
  await saveUser(user);
  return { token, user };
};

export const logout = async () => {
  await clearAll();
};
