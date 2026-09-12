import { useAppTheme } from '@/context/AppThemeContext';
export function useColorScheme() { return useAppTheme().mode; }
