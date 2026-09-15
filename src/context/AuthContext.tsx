import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
    sessionHeartbeat,
    getCurrentUser,
    getStoredToken,
    LoggedInUser,
    LoginChallenge,
    VerifyLoginResult,
    beginLogin as beginLoginRequest,
    verifyLogin as verifyLoginRequest,
    logout as logoutUser,
} from "@/services/auth";

type AuthContextType = {
  refreshUser: () => Promise<void>;
  photo: string | null;
  setPhoto: (photo: string | null) => Promise<void>;
  user: LoggedInUser | null;
  token: string | null;
  loading: boolean;
  beginLogin: (
    username: string,
    password: string
  ) => Promise<LoginChallenge>;
  completeLogin: (
    challenge: string,
    photo?: string,
    consent?: boolean
  ) => Promise<VerifyLoginResult>;
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

  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    let queue = Promise.resolve();
    const send = (active: boolean) => {
      // Skip once logout has started: the token is about to be (or already) invalidated
      // server-side, and this effect's cleanup only runs after the async logout resolves,
      // so without this guard a heartbeat can race the logout call and hit a 401.
      if (loggingOutRef.current) return;
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

  const beginLogin = (username: string, password: string) =>
    beginLoginRequest(username, password);

  const completeLogin = async (
    challenge: string,
    photo?: string,
    consent?: boolean
  ) => {
    const response = await verifyLoginRequest(challenge, photo, consent);

    if ("token" in response) {
      loggingOutRef.current = false;
      setToken(response.token);
      setUser(response.user);
    }

    return response;
  };

  const refreshUser = async () => {
    if (!token) return;
    const updated = await getCurrentUser(token);
    setUser(current => current?.id === updated.id ? updated : current);
  };

  const logout = async () => {
    loggingOutRef.current = true;
    await logoutUser();

    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        refreshUser,
        photo,
        setPhoto,
        user,
        token,
        loading,
        beginLogin,
        completeLogin,
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
