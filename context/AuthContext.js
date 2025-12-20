import { createContext, useState, useEffect, useContext } from "react";
import { authHelper } from "../lib/authHelper";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        setLoading(true);
        const currentUser = await authHelper.getCurrentUser();
        setUser(currentUser);
        setError(null);
      } catch (err) {
        console.error("Auth initialization error:", err);
        setError(err.message);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const signin = async (email, password) => {
    try {
      setLoading(true);
      const result = await authHelper.signin(email, password);
      setUser(result);
      setError(null);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (email, password, userData) => {
    try {
      setLoading(true);
      const authUser = await authHelper.signup(email, password, userData);
      setError(null);
      return authUser;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signout = async () => {
    try {
      setLoading(true);
      await authHelper.signout();
      setUser(null);
      setError(null);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    loading,
    error,
    signin,
    signup,
    signout,
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin",
    userId: user?.uid,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return context;
}

// Keep old hook name for backward compatibility
export const useAuth = useAuthContext;
