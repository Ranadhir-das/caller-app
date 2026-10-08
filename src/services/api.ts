export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://192.168.31.188:8000/api/v1"
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
  constructor(message: string, public status: number, public details?: unknown) { super(message); this.name = 'ApiError'; }
}

export function apiAuthHeaders(token: string): Record<string, string> {
  return { Authorization: `Token ${token}` };
}

/** Binary downloads use the same API origin and employee credential as JSON requests. */
export async function apiDownloadFile(endpoint: string, destination: string, token: string, signal?: AbortSignal) {
  if (!token) throw new ApiError('Please sign in again to open this attachment.', 401);
  if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('://')) {
    throw new Error('Invalid attachment address.');
  }
  const FS = await import('expo-file-system/legacy');
  const task = FS.createDownloadResumable(`${API_BASE_URL}${endpoint}`, destination, {
    headers: { ...apiAuthHeaders(token), Accept: '*/*', 'Cache-Control': 'no-store' },
  });
  let cancellation: Promise<void> | undefined;
  let interrupted: Error | undefined;
  let interrupt!: (error: Error) => void;
  const cancelled = new Promise<never>((_, reject) => { interrupt = reject; });
  const cancel = (message: string) => {
    if (cancellation) return;
    interrupted = new Error(message);
    cancellation = task.cancelAsync().catch(() => {});
    void cancellation.then(() => interrupt(interrupted!));
  };
  const onAbort = () => cancel('Attachment download cancelled.');
  const timer = setTimeout(() => cancel('Download timed out. Check your connection and try again.'), 90_000);
  signal?.addEventListener('abort', onAbort);
  try {
    if (signal?.aborted) throw new Error('Attachment download cancelled.');
    const result = await Promise.race([task.downloadAsync(), cancelled]);
    if (interrupted) throw interrupted;
    if (!result) throw new Error('Attachment download was interrupted. Please try again.');
    if (result.status !== 200) {
      const message = result.status === 401 ? 'Your session has expired. Please sign in again to open this attachment.'
        : result.status === 403 ? 'You do not have permission to open this attachment.'
        : result.status === 404 ? 'This attachment is no longer available.'
        : 'Could not download the attachment. Please try again.';
      throw new ApiError(message, result.status);
    }
    return result;
  } catch (error) {
    await cancellation;
    await FS.deleteAsync(destination, { idempotent: true }).catch(() => {});
    if (error instanceof ApiError || interrupted || signal?.aborted) throw interrupted || error;
    // Native errors can contain request details; expose only a safe, useful message.
    throw new Error('Could not download the attachment. Check your connection and available storage, then try again.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
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
    Object.assign(headers, apiAuthHeaders(token));
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

    throw new ApiError(data ? extractErrorMessage(data) : `Request failed (HTTP ${response.status}). Please check the server endpoint.`, response.status, data);
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
