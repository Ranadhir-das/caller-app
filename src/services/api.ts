export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://192.168.1.32:8000/api/v1"
).replace(/\/+$/, "");

// The CRM's own app-introduction/download page, on whatever host this build
// points at — derived from API_BASE_URL rather than hardcoded, so a local dev
// build links to the local dev server and a production build links to the
// real domain.
export const APP_DOWNLOAD_URL = `${API_BASE_URL.replace(/\/api\/v1$/, "")}/app/`;

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
  suppressErrorLog?: boolean;
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}

export async function apiRequest<T>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    token,
  } = options;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Token ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    signal: options.signal,
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  }).catch(() => {
    throw new Error(
      `Cannot reach Vaani at ${API_BASE_URL}. Check that the server is running and your device is on the same network.`
    );
  });

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    // Response has no JSON body.
  }

  if (!response.ok) {
    if (!options.suppressErrorLog) console.error(
      "API ERROR:",
      response.status,
      data
    );

    throw new ApiError(data ? extractErrorMessage(data) : `Request failed (HTTP ${response.status}). Please check the server endpoint.`, response.status);
  }

  return data as T;
}

/**
 * DRF returns either `{detail: "..."}` / `{non_field_errors: [...]}` for
 * general errors, or `{field_name: ["message"]}` for per-field validation
 * errors (e.g. signup). Surface whichever is present.
 */
function extractErrorMessage(data: any): string {
  if (!data || typeof data !== "object") {
    return "Something went wrong. Please try again.";
  }
  if (typeof data.detail === "string") return data.detail;
  if (typeof data.callback_at === "string") return data.callback_at;
  if (Array.isArray(data.non_field_errors) && typeof data.non_field_errors[0] === "string") {
    return data.non_field_errors[0];
  }
  if (typeof data.message === "string") return data.message;
  if (typeof data.error === "string") return data.error;

  for (const [field, value] of Object.entries(data)) {
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
    if (typeof value === "string") return value;
  }
  return "Something went wrong. Please try again.";
}
