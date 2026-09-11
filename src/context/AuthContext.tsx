import React, {
    createContext,
    useContext,
    useEffect,
    useState,
} from "react";

import {
    getCurrentUser,
    getStoredToken,
    LoggedInUser,
    login as loginUser,
    logout as logoutUser,
} from "@/services/auth";

type AuthContextType = {
  user: LoggedInUser | null;
  token: string | null;
  loading: boolean;
  login: (
    username: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<LoggedInUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const storedToken = await getStoredToken();

      if (!storedToken) {
        return;
      }

      const currentUser = await getCurrentUser(storedToken);

      setToken(storedToken);
      setUser(currentUser);
    } catch (error) {
      console.log("Session restore failed:", error);

      await logoutUser();

      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (
    username: string,
    password: string
  ) => {
    const response = await loginUser(
      username,
      password
    );

    setToken(response.token);
    setUser(response.user);
  };

  const logout = async () => {
    await logoutUser();

    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}