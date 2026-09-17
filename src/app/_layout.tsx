import React from 'react';
import {
  DarkTheme,
  DefaultTheme,
  Redirect,
  Stack,
  ThemeProvider,
  usePathname,
  router,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppThemeProvider, useAppTheme } from '@/context/AppThemeContext';
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';

import {
  AuthProvider,
  useAuth,
} from '@/context/AuthContext';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DialerSessionProvider } from '@/context/DialerSessionContext';
import { LeadProvider } from '@/context/LeadContext';

SplashScreen.preventAutoHideAsync();

function AuthRedirect() {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  React.useEffect(() => {
    if (loading) {
      return;
    }

    if (!user && !['/login', '/signup'].includes(pathname)) {
      router.replace('/login');
      return;
    }

    if (user && (user.role !== 'CALLER' || user.needs_onboarding) && !['/employee', '/employee/index', '/employee/attendance', '/employee/leave', '/employee/work', '/profile', '/settings', '/chat', '/notices', '/login'].includes(pathname)) {
      // '/employee' is the NativeTabs group root (like '/(tabs)' elsewhere) — navigating to
      // '/employee/index' directly breaks at runtime ("Unmatched Route") even though it type-checks.
      router.replace('/employee' as never);
      return;
    }
    if (user && pathname === '/login') {
      router.replace('/employee' as never);
    }
  }, [user, loading, pathname]);

  return null;
}

function AppNavigator() {
  const { colors } = useAppTheme();
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <AuthRedirect />

      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="employee" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="chat" />
          <Stack.Screen name="notices" />
        </Stack.Protected>
        <Stack.Protected guard={user?.role === 'CALLER' && !user.needs_onboarding}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="lead-details" />
          <Stack.Screen name="call-history-details" />
          <Stack.Screen name="follow-up-details" />
          <Stack.Screen name="call-outcome" />
          <Stack.Screen name="dialer" />
          <Stack.Screen name="dialer-backup" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return <AppThemeProvider><ThemedRoot /></AppThemeProvider>;
}

function ThemedRoot() {
  const { mode, colors, ready } = useAppTheme();
  if (!ready) return null;
  const navigationTheme = mode === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider
      value={
        { ...navigationTheme, colors: { ...navigationTheme.colors, background: colors.background,
          card: colors.surface, text: colors.text, border: colors.border, primary: colors.accent } }
      }
    >
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <AuthProvider>
        <AnimatedSplashOverlay />
        <AccountData />
      </AuthProvider>
    </ThemeProvider>
  );
}

function AccountData() {
  const { user } = useAuth();
  return (
        <LeadProvider key={user?.id ?? "signed-out"}>
          <DialerSessionProvider>

            <AppNavigator />

          </DialerSessionProvider>
        </LeadProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
