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
import {
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
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

    if (!user && pathname !== '/login') {
      router.replace('/login');
      return;
    }

    if (user && pathname === '/login') {
      router.replace('/(tabs)');
    }
  }, [user, loading, pathname]);

  return null;
}

function AppNavigator() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <AuthRedirect />

      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="lead-details" />
        <Stack.Screen name="call-history-details" />
        <Stack.Screen name="follow-up-details" />
        <Stack.Screen name="call-outcome" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider
      value={
        colorScheme === 'dark'
          ? DarkTheme
          : DefaultTheme
      }
    >
      <AuthProvider>
        <LeadProvider>
          <DialerSessionProvider>
            <AnimatedSplashOverlay />

            <AppNavigator />

          </DialerSessionProvider>
        </LeadProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});