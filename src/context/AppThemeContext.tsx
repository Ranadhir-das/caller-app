import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Appearance } from 'react-native';

const palettes = {
  light: {
    background: '#F5F6FB', surface: '#FFFFFF', surfaceMuted: '#EFF2F8', border: '#D8DFEB',
    text: '#20283B', secondary: '#49566E', muted: '#59677E', placeholder: '#617088',
    primary: '#7153BB', accent: '#6751B9', onPrimary: '#FFFFFF', accentSoft: '#EDE7F8',
    success: '#187452', successSoft: '#DEF3EA', danger: '#B3324F', dangerSoft: '#F8E3EC',
    warning: '#886017', warningSoft: '#FFF0D5', orange: '#A44A18', orangeSoft: '#FFF0E3',
    disabled: '#AFA4CB', shadow: '#000000',
  },
  dark: {
    background: '#0C0E14', surface: '#14171F', surfaceMuted: '#232735', border: '#303647',
    text: '#EDF0F7', secondary: '#CBD2E2', muted: '#A4AEC1', placeholder: '#939FB6',
    primary: '#7153BB', accent: '#BEAEFF', onPrimary: '#FFFFFF', accentSoft: '#302841',
    success: '#78DBB9', successSoft: '#1B3833', danger: '#F4A4BB', dangerSoft: '#3A2434',
    warning: '#E9BF70', warningSoft: '#3D3322', orange: '#F3B27F', orangeSoft: '#392C23',
    disabled: '#49405D', shadow: '#000000',
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
