import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Appearance } from 'react-native';

const palettes = {
  light: {
    background: '#F4F7FC', surface: '#FFFFFF', surfaceMuted: '#EDF2F9', border: '#D5E0F0',
    text: '#0A1128', secondary: '#334155', muted: '#64748B', placeholder: '#94A3B8',
    primary: '#0062FF', accent: '#00C2FF', onPrimary: '#FFFFFF', accentSoft: '#E8F1FF',
    waveCyan: '#00C2FF', wavePurple: '#7C3AED',
    success: '#10B981', successSoft: '#DCFCE7', danger: '#E11D48', dangerSoft: '#FFE4E6',
    warning: '#D97706', warningSoft: '#FEF3C7', orange: '#EA580C', orangeSoft: '#FFEDD5',
    disabled: '#94A3B8', shadow: '#000000',
  },
  dark: {
    background: '#070B14', surface: '#0E1424', surfaceMuted: '#162038', border: '#1E2C4A',
    text: '#F1F5F9', secondary: '#CBD5E1', muted: '#8190AC', placeholder: '#576885',
    primary: '#0062FF', accent: '#38BDF8', onPrimary: '#FFFFFF', accentSoft: '#0F2447',
    waveCyan: '#38BDF8', wavePurple: '#A78BFA',
    success: '#34D399', successSoft: '#063025', danger: '#FB7185', dangerSoft: '#38111E',
    warning: '#FBBF24', warningSoft: '#38290E', orange: '#FB923C', orangeSoft: '#381D0E',
    disabled: '#2A3852', shadow: '#000000',
  },
};

export type AppColors = typeof palettes.light;
type Mode = keyof typeof palettes;
const ThemeContext = createContext<{ mode: Mode; colors: AppColors; ready: boolean; toggleTheme: () => void } | null>(null);
const STORAGE_KEY = 'caller_app_theme';

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('light');
  const [ready, setReady] = useState(false);
  const pendingWrite = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then(saved => {
      if (active && (saved === 'light' || saved === 'dark')) setMode(saved);
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (ready) Appearance.setColorScheme(mode);
  }, [mode, ready]);
  const value = useMemo(() => ({ mode, colors: palettes[mode], ready, toggleTheme: () => {
    const next = mode === 'light' ? 'dark' : 'light';
    setMode(next);
    pendingWrite.current = pendingWrite.current.then(() => AsyncStorage.setItem(STORAGE_KEY, next))
      .catch(() => { Alert.alert('Theme preference', 'The theme changed, but could not be saved. Please try again.'); });
  } }), [mode, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useAppTheme requires AppThemeProvider');
  return context;
}

export function useAppStyles<T>(createStyles: (colors: AppColors) => T): T {
  const { colors } = useAppTheme();
  return useMemo(() => createStyles(colors), [colors, createStyles]);
}
