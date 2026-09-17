import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/services/api';

export type Workspace = {
  role_label: string; date: string;
  attendance: { id: number; date: string; checked_in: string | null; checked_out: string | null }[];
  leaves: { id: number; start_date: string; end_date: string; reason: string; status: string; review_note: string }[];
  projects: { id: number; title: string; description: string; due_date: string | null; status: string }[];
  reports: { id: number; date: string; notes: string; work_link: string; has_photo: boolean }[];
  holidays: { id: number; name: string; date: string }[];
  photo_requests: { id: number; action: string; status: string; created_at: string; review_note: string }[];
  enrolled: boolean;
};

type EmployeeWorkspaceState = {
  data: Workspace | null;
  refreshing: boolean;
  busy: boolean;
  error: string;
  load: () => Promise<void>;
  run: (action: () => Promise<void>) => Promise<void>;
  request: (path: string, body?: unknown, method?: 'POST' | 'PATCH' | 'DELETE') => Promise<unknown>;
  photo: (action: string) => Promise<void>;
};

const EmployeeWorkspaceContext = createContext<EmployeeWorkspaceState | null>(null);

// Shared across the Home / Attendance / Leave / My work tabs so switching
// tabs never re-fetches — one load(), one busy lock, one workspace snapshot.
export function EmployeeWorkspaceProvider({ children }: { children: ReactNode }) {
  const { token, refreshUser } = useAuth();
  const [data, setData] = useState<Workspace | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);

  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try { setData(await apiRequest<Workspace>('/mobile/employee/', { token })); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load workspace.'); }
    finally { setRefreshing(false); }
  }, [token]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try { await action(); await load(); }
    catch (e) { Alert.alert('Unable to complete', e instanceof Error ? e.message : 'Please try again.'); }
    finally { locked.current = false; setBusy(false); }
  }, [load]);

  const request = useCallback(
    (path: string, body?: unknown, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') =>
      apiRequest('/mobile/employee/' + path, { token: token!, method, body }),
    [token],
  );

  const photo = useCallback((action: string) => run(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera permission is required. Enable it in phone settings.');
    const challenge = await apiRequest<{ id: string }>('/mobile/employee/photo-challenge/', { token: token!, method: 'POST', body: { action } });
    const result = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, mediaTypes: ['images'], quality: 0.4, base64: true, allowsEditing: false });
    if (result.canceled) return;
    const image = result.assets[0].base64;
    if (!image) throw new Error('Photo could not be read. Please try again.');
    await request('photo-attendance/', { challenge: challenge.id, photo: image });
    await refreshUser();
    Alert.alert('Photo submitted', 'Your photo is awaiting administrator review. Attendance is confirmed after approval.');
  }), [run, request, refreshUser, token]);

  const value = useMemo(() => ({ data, refreshing, busy, error, load, run, request, photo }),
    [data, refreshing, busy, error, load, run, request, photo]);

  return <EmployeeWorkspaceContext.Provider value={value}>{children}</EmployeeWorkspaceContext.Provider>;
}

export function useEmployeeWorkspace() {
  const ctx = useContext(EmployeeWorkspaceContext);
  if (!ctx) throw new Error('useEmployeeWorkspace must be used within EmployeeWorkspaceProvider');
  return ctx;
}
