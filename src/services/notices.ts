import { apiRequest } from "./api";

export type Notice = {
  id: number;
  title: string;
  body: string;
  audience: string;
  created_by: string;
  created_at: string;
};

export function listNotices(token: string): Promise<Notice[]> {
  return apiRequest<Notice[]>("/mobile/employee/notices/", { token });
}
