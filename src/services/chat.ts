import { apiRequest, API_BASE_URL } from "./api";

export type ChatChannel = {
  id: number;
  name: string;
  kind: "GENERAL" | "GROUP";
  description: string;
};

export type ChatMessage = {
  id: number;
  channel: number;
  sender_id: number;
  sender_name: string;
  text: string;
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

/** Base URL for the CRM API is like http://host:8000/api/v1 — the chat socket lives
 *  at /ws/chat/<id>/ on the same host, over ws:// (or wss:// when the API is https). */
export function chatSocketUrl(channelId: number, token: string): string {
  const httpBase = API_BASE_URL.replace(/\/api\/v1$/, "");
  const wsBase = httpBase.replace(/^http/, "ws");
  return `${wsBase}/ws/chat/${channelId}/?token=${encodeURIComponent(token)}`;
}
