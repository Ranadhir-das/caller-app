import { apiRequest } from "./api";

export type NoticeAttachment = {
  id: number;
  original_filename: string;
  mime_type: string;
  file_size: number;
  file_url: string;
};

export type Notice = {
  id: number;
  title: string;
  body: string;
  audience: string;
  created_by: string;
  created_at: string;
  attachments?: NoticeAttachment[];
};

export function listNotices(token: string): Promise<Notice[]> {
  return apiRequest<Notice[]>("/mobile/employee/notices/", { token });
}

export function resolveNoticeAttachmentUrl(fileUrl: string): string {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }
  const { API_BASE_URL } = require("./api");
  const hostBase = API_BASE_URL.replace(/\/api\/v1$/, "");
  return `${hostBase}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

