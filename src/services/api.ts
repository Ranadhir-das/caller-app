const API_BASE_URL = "http://192.168.31.191:8000/api/v1";

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
    
    const message =
      data?.detail ||
      data?.callback_at ||
      data?.non_field_errors?.[0] ||
      "Something went wrong. Please try again.";
    
    throw new Error(
      typeof message === "string"
        ? message
        : JSON.stringify(message)
    );

  }

  return data as T;
}
