import * as SecureStore from "expo-secure-store";
import { apiRequest } from "./api";

const TOKEN_KEY = "caller_auth_token";

export type LoggedInUser = {
  id: number;
  username: string;
  email: string;
  name: string;
  role: string;
  needs_onboarding?: boolean;
};

const SESSION_KEY = "caller_session_id";

export type LoginChallenge = {
  status: "PENDING" | "ENROLLMENT_REQUIRED" | "PHOTO_REQUIRED";
  challenge?: string;
  expires_in?: number;
  photo_required?: boolean;
  review_note?: string;
  detail?: string;
};

export type VerifyLoginResult =
  | { status: "PENDING"; detail: string }
  | { token: string; session_id: string; user: LoggedInUser };

/** Step 1: credentials only. Never returns a token; returns a camera challenge instead. */
export async function beginLogin(
  username: string,
  password: string
): Promise<LoginChallenge> {
  return apiRequest<LoginChallenge>("/mobile/login/", {
    method: "POST",
    body: {
      username,
      password,
    },
  });
}

/** Step 2: submit the challenge (with a photo when the server required one) to receive a token.
 *  `location` is best-effort — the server still logs the session without it if the employee
 *  denies the permission or the device can't get a fix in time. */
export async function verifyLogin(
  challenge: string,
  photo?: string,
  consent?: boolean,
  location?: { latitude: number; longitude: number } | null
): Promise<VerifyLoginResult> {
  const response = await apiRequest<VerifyLoginResult>("/mobile/login/verify/", {
    method: "POST",
    body: {
      challenge,
      photo,
      consent,
      latitude: location?.latitude,
      longitude: location?.longitude,
    },
  });

  if ("token" in response) {
    await SecureStore.setItemAsync(TOKEN_KEY, response.token);
    await SecureStore.setItemAsync(SESSION_KEY, response.session_id);
  }

  return response;
}

export type SignupInput = {
  username: string;
  password: string;
  first_name: string;
  last_name?: string;
  email: string;
  phone: string;
  photo: string;
  consent: boolean;
};

export type SignupResult = { status: "PENDING"; detail: string };

/** New employee registration. Always ends in PENDING — an administrator must approve
 *  the enrollment photo before the account can sign in. Never returns a token. */
export async function signup(input: SignupInput): Promise<SignupResult> {
  return apiRequest<SignupResult>("/mobile/signup/", {
    method: "POST",
    body: input,
  });
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