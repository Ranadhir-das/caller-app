import React from 'react';
import { PushNotificationRegistration } from '@/components/PushNotificationRegistration';
import { EmployeeLocationRegistration } from '@/components/EmployeeLocationRegistration';
import { PeerAppreciationModal } from '@/components/PeerAppreciationModal';
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
import { COUNSELOR_ROUTES, isCounselor } from '@/services/counselor';

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

    const employeeRoutes = ['/employee', '/employee/index', '/employee/attendance', '/employee/leave', '/employee/work', '/profile', '/settings', '/chat', '/notices', '/notifications', '/login'];
    if (user && isCounselor(user) && !user.needs_onboarding) {
      // Counselors never enter caller screens; they get their own workspace.
      if (pathname === '/login' || ![...employeeRoutes, ...COUNSELOR_ROUTES].includes(pathname)) {
        router.replace('/counselor' as never);
      }
      return;
    }

    if (user && (user.role !== 'CALLER' || user.needs_onboarding) && !employeeRoutes.includes(pathname)) {
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
          <Stack.Screen name="notifications" />
        </Stack.Protected>
        <Stack.Protected guard={user?.role === 'CALLER' && !user.needs_onboarding}>
          <Stack.Screen name="direct-dialer" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="lead-details" />
          <Stack.Screen name="call-history-details" />
          <Stack.Screen name="follow-up-details" />
          <Stack.Screen name="call-outcome" />
          <Stack.Screen name="dialer" />
          <Stack.Screen name="dialer-backup" />
          <Stack.Screen name="admissions" />
          <Stack.Screen name="counselling" />
        </Stack.Protected>
        <Stack.Protected guard={user?.role === 'COUNSELOR' && !user.needs_onboarding}>
          <Stack.Screen name="counselor" />
          <Stack.Screen name="counselor-lead" />
          <Stack.Screen name="counselor-note" />
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
        <PushNotificationRegistration />
        <AnimatedSplashOverlay />
        <AccountData />
        <EmployeeLocationRegistration />
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
        {user ? <PeerAppreciationModal /> : null}
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
