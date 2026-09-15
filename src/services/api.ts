const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://10.58.15.93:8000/api/v1"
).replace(/\/+$/, "");

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string;
};

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
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new Error(
      `Cannot reach the CRM at ${API_BASE_URL}. Check that the CRM server is running and your device is on the same network.`
    );
  });

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    // Response has no JSON body.
  }

  if (!response.ok) {
    console.error(
      "API ERROR:",
      response.status,
      data
    );

    throw new Error(extractErrorMessage(data));
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
  for (const [field, value] of Object.entries(data)) {
    if (Array.isArray(value) && typeof value[0] === "string") {
      return field === "non_field_errors" ? value[0] : `${field}: ${value[0]}`;
    }
    if (typeof value === "string") return value;
  }
  return "Something went wrong. Please try again.";
}
