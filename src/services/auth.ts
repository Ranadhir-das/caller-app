import * as SecureStore from "expo-secure-store";
import { apiRequest } from "./api";

const TOKEN_KEY = "caller_auth_token";

export type LoggedInUser = {
  id: number;
  username: string;
  email: string;
  name: string;
  role: string;
};

const SESSION_KEY = "caller_session_id";

type LoginResponse = {
  session_id: string;
  token: string;
  user: LoggedInUser;
};

export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>("/mobile/login/", {
    method: "POST",
    body: {
      username,
      password,
    },
  });

  await SecureStore.setItemAsync(TOKEN_KEY, response.token);
  await SecureStore.setItemAsync(SESSION_KEY, response.session_id);

  return response;
}

export async function getStoredToken() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export async function getCurrentUser(
  token: string
): Promise<LoggedInUser> {
  return apiRequest<LoggedInUser>("/mobile/me/", {
    token,
  });
}

export async function logout(): Promise<void> {
  const token = await getStoredToken();
  const session_id = await SecureStore.getItemAsync(SESSION_KEY);
  if (token && session_id) await apiRequest('/mobile/session/', { token, method: 'POST', body: { session_id, action: 'logout', active: false } });
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function sessionHeartbeat(token: string, active: boolean) {
  let session_id = await SecureStore.getItemAsync(SESSION_KEY);
  if (!session_id) {
    const result = await apiRequest<{session_id: string}>('/mobile/session/', {token, method: 'POST', body: {action: 'start'}});
    session_id = result.session_id;
    await SecureStore.setItemAsync(SESSION_KEY, session_id);
  }
  await apiRequest('/mobile/session/', {token, method: 'POST', body: {session_id, action: 'heartbeat', active}});
}