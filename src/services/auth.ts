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

type LoginResponse = {
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

  return response;
}

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getCurrentUser(
  token: string
): Promise<LoggedInUser> {
  return apiRequest<LoggedInUser>("/mobile/me/", {
    token,
  });
}

export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}