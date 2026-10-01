import { apiRequest, API_BASE_URL } from "./api";

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
  if (file) {
    formData.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);
  }

  const response = await fetch(`${API_BASE_URL}/mobile/chat/channels/${channelId}/messages/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || `Upload failed (${response.status})`);
  }

  return response.json();
}

/** Base URL for the CRM API is like http://host:8000/api/v1 — the chat socket lives
 *  at /ws/chat/<id>/ on the same host, over ws:// (or wss:// when the API is https). */
export function chatSocketUrl(channelId: number, token: string): string {
  const httpBase = API_BASE_URL.replace(/\/api\/v1$/, "");
  const wsBase = httpBase.replace(/^http/, "ws");
  return `${wsBase}/ws/chat/${channelId}/?token=${encodeURIComponent(token)}`;
}

export function resolveAttachmentUrl(fileUrl: string): string {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }
  const hostBase = API_BASE_URL.replace(/\/api\/v1$/, "");
  return `${hostBase}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}
