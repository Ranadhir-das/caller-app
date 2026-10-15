import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { apiRequest, apiAuthHeaders, API_BASE_URL } from "./api";

export type ChatChannel = {
  id: number;
  name: string;
  kind: "GENERAL" | "GROUP";
  description: string;
};

export type ChatAttachment = {
  id: number;
  original_name: string;
  mime_type: string;
  file_size: number;
  file_url: string;
  created_at: string;
};

export type ChatMessage = {
  id: number;
  channel: number;
  sender_id: number;
  sender_name: string;
  text: string;
  attachments?: ChatAttachment[];
  created_at: string;
};

export function listChannels(token: string): Promise<ChatChannel[]> {
  return apiRequest<ChatChannel[]>("/mobile/chat/channels/", { token });
}

export function listMessages(
  token: string,
  channelId: number,
  before?: number
): Promise<ChatMessage[]> {
  const query = before ? `?before=${before}` : "";
  return apiRequest<ChatMessage[]>(`/mobile/chat/channels/${channelId}/messages/${query}`, { token });
}

export function sendMessage(
  token: string,
  channelId: number,
  text: string
): Promise<ChatMessage> {
  return apiRequest<ChatMessage>(`/mobile/chat/channels/${channelId}/messages/`, {
    token,
    method: "POST",
    body: { text },
  });
}

export async function sendMessageWithAttachment(
  token: string,
  channelId: number,
  text: string,
  file?: { uri: string; name: string; type: string }
): Promise<ChatMessage> {
  const formData = new FormData();
  if (text.trim()) {
    formData.append("text", text.trim());
  }
  if (file && file.uri) {
    const fileInstance = new File(file.uri);
    if (file.name) {
      Object.defineProperty(fileInstance, 'name', { value: file.name, configurable: true, enumerable: true });
    }
    if (file.type) {
      Object.defineProperty(fileInstance, 'type', { value: file.type, configurable: true, enumerable: true });
    }
    formData.append("file", fileInstance as any);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/mobile/chat/channels/${channelId}/messages/`, {
      method: "POST",
      headers: apiAuthHeaders(token),
      body: formData,
    });
  } catch (fetchError: unknown) {
    const rawMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
    if (/FormData|FormDataPart|BodyInit|Unsupported/i.test(rawMessage)) {
      throw new Error(`Failed to serialize attachment for upload: ${rawMessage}`);
    }
    throw new Error('Could not upload the attachment. Check your connection and try again.');
  }

  if (!response.ok) {
    if (response.status === 413) {
      throw new Error('Attachment is too large for the server (maximum 6 MB).');
    }
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || `Upload failed (${response.status})`);
  }

  return response.json();
}

function attachmentEndpoint(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid chat attachment.');
  return `/mobile/chat/attachments/${id}/download/`;
}

export function chatAttachmentImageSource(id: number, token: string) {
  return { uri: `${API_BASE_URL}${attachmentEndpoint(id)}`, headers: apiAuthHeaders(token) };
}

export async function openChatAttachment(attachment: ChatAttachment, token: string, signal?: AbortSignal) {
  // The endpoint is built from the server's ID, never from an arbitrary file_url.
  const { openAuthenticatedAttachment } = await import('./noticeAttachments');
  return openAuthenticatedAttachment(attachmentEndpoint(attachment.id), {
    id: attachment.id, original_filename: attachment.original_name,
    mime_type: attachment.mime_type, file_size: attachment.file_size,
  }, token, signal);
}

export type ChatTicketResponse = {
  ticket: string;
  expires_in: number;
};

export function getChatTicket(token: string, channelId: number): Promise<ChatTicketResponse> {
  return apiRequest<ChatTicketResponse>(`/mobile/chat/channels/${channelId}/ticket/`, {
    method: "POST",
    token,
  });
}

/** Base URL for the CRM API is like http://host:8000/api/v1 — the chat socket lives
 *  at /ws/chat/<id>/ on the same host, over ws:// (or wss:// when the API is https). */
export function chatSocketUrl(
  channelId: number,
  ticket: string,
  paramName: "ticket" | "token" = "ticket"
): string {
  const httpBase = API_BASE_URL.replace(/\/api\/v1$/, "");
  const wsBase = httpBase.replace(/^http/, "ws");
  return `${wsBase}/ws/chat/${channelId}/?${paramName}=${encodeURIComponent(ticket)}`;
}

export function resolveAttachmentUrl(fileUrl: string): string {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }
  const hostBase = API_BASE_URL.replace(/\/api\/v1$/, "");
  return `${hostBase}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}
