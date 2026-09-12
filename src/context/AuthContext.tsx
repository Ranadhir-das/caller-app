import React, {
    createContext,
    useContext,
    useEffect,
    useState,
} from "react";
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
    sessionHeartbeat,
    getCurrentUser,
    getStoredToken,
    LoggedInUser,
    login as loginUser,
    logout as logoutUser,
} from "@/services/auth";

type AuthContextType = {
  photo: string | null;
  setPhoto: (photo: string | null) => Promise<void>;
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
  const [savedPhoto, setSavedPhoto] = useState<{ userId: number; uri: string | null } | null>(null);
  const photo = savedPhoto?.userId === user?.id ? savedPhoto?.uri ?? null : null;

  useEffect(() => {
    let active = true;
    if (user) {
      const userId = user.id;
      AsyncStorage.getItem(`caller_profile_photo_${userId}`)
        .then((uri) => { if (active) setSavedPhoto({ userId, uri }); })
        .catch(() => { if (active) setSavedPhoto(null); });
    }
    return () => { active = false; };
  }, [user?.id]);

  const setPhoto = async (uri: string | null) => {
    if (!user) return;
    const key = `caller_profile_photo_${user.id}`;
    if (uri) await AsyncStorage.setItem(key, uri);
    else await AsyncStorage.removeItem(key);
    setSavedPhoto({ userId: user.id, uri });
  };

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    if (!token) return;
    let queue = Promise.resolve();
    const send = (active: boolean) => {
      queue = queue.then(() => sessionHeartbeat(token, active)).catch(() => {});
    };
    send(AppState.currentState === 'active');
    const timer = setInterval(() => { if (AppState.currentState === 'active') send(true); }, 30000);
    const subscription = AppState.addEventListener('change', state => send(state === 'active'));
    return () => { clearInterval(timer); subscription.remove(); };
  }, [token]);

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
        photo,
        setPhoto,
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
