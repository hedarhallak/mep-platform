import React, { createContext, useContext, useEffect, useState } from "react";
import { getToken, getUser, clearAll } from "../utils/storage";
import { login as loginService, logout as logoutService } from "../services/authService";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedToken = await getToken();
        const storedUser = await getUser();
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(storedUser);
        }
      } catch {
        await clearAll();
      } finally {
        setLoading(false);
      }
    };
    loadSession();
  }, []);

  const login = async (username, password) => {
    const result = await loginService(username, password);
    setToken(result.token);
    setUser(result.user);
    return result;
  };

  const logout = async () => {
    await logoutService();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
