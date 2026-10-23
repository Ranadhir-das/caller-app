import React from 'react';
import { QuickCaptureShareRegistration } from '@/components/QuickCaptureShareRegistration';
import { IncomingCallBanner } from '@/components/IncomingCallBanner';
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
import { isCallerCapable, isCounselorCapable, isDualRole } from '@/services/capabilities';

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

    if (!user) return;

    const employeeRoutes = ['/employee', '/employee/index', '/employee/attendance', '/employee/leave', '/employee/work', '/profile', '/settings', '/chat', '/notices', '/notifications', '/login'];
    const canCaller = isCallerCapable(user) && !user.needs_onboarding;
    const canCounselor = isCounselorCapable(user) && !user.needs_onboarding;

    // Pure counselor entry flow: counselors land in /counselor
    if (canCounselor && !canCaller) {
      if (pathname === '/login' || ![...employeeRoutes, ...COUNSELOR_ROUTES].includes(pathname)) {
        router.replace('/counselor' as never);
      }
      return;
    }

    // Callers, dual-role employees, and general staff land on /employee from login
    if (pathname === '/login') {
      router.replace('/employee' as never);
      return;
    }

    // If on a counselor route without counselor capability, redirect out
    if (COUNSELOR_ROUTES.includes(pathname) && !canCounselor) {
      router.replace('/employee' as never);
      return;
    }

    // If on a caller route without caller capability, redirect to counselor or employee
    if (!employeeRoutes.includes(pathname) && !COUNSELOR_ROUTES.includes(pathname) && !canCaller) {
      router.replace(canCounselor ? ('/counselor' as never) : ('/employee' as never));
      return;
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
      <QuickCaptureShareRegistration />
      <IncomingCallBanner />

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
        <Stack.Protected guard={isCallerCapable(user) && !user?.needs_onboarding}>
          <Stack.Screen name="direct-dialer" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="lead-details" />
          <Stack.Screen name="call-history-details" />
          <Stack.Screen name="incoming-enquiry" />
          <Stack.Screen name="follow-up-details" />
          <Stack.Screen name="call-outcome" />
          <Stack.Screen name="dialer" />
          <Stack.Screen name="dialer-backup" />
          <Stack.Screen name="admissions" />
          <Stack.Screen name="counselling" />
          <Stack.Protected guard={user?.can_manage_apostille_leads === true}>
            <Stack.Screen name="apostille-leads" />
            <Stack.Screen name="apostille-lead" />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={isCounselorCapable(user) && !user?.needs_onboarding}>
          <Stack.Screen name="counselor" />
          <Stack.Screen name="counselor-lead" />
          <Stack.Screen name="counselor-note" />
          <Stack.Screen name="counselor-created-lead" />
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
