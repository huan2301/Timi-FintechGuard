import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth-store';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const hydrate = useAuthStore((state) => state.hydrate);
  const user = useAuthStore((state) => state.user);
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    void hydrate().finally(() => SplashScreen.hideAsync());
  }, [hydrate]);

  useLayoutEffect(() => {
    const userId = user?.id ?? null;
    if (previousUserId.current === userId) return;

    // Most mobile query keys are intentionally shared by screen. Clear them
    // before paint whenever the signed-in account changes so cached balances,
    // transactions or notifications never flash for another account.
    queryClient.clear();
    previousUserId.current = userId;
  }, [user?.id]);

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <View style={styles.loadingMark}>
          <ActivityIndicator color={colors.white} size="large" />
        </View>
        <Text style={styles.loadingTitle}>Timi</Text>
        <Text style={styles.loadingMessage}>Đang khôi phục phiên đăng nhập an toàn...</Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="register" />
        <Stack.Screen name="google-complete" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="info" />
        <Stack.Protected guard={Boolean(user)}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="pin" />
          <Stack.Screen name="face" />
          <Stack.Screen name="verify-transfer" />
          <Stack.Screen name="devices" />
          <Stack.Screen name="guardian" />
        </Stack.Protected>
      </Stack>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: '#F4F7FC',
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  loadingMark: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 26, height: 72, justifyContent: 'center', width: 72 },
  loadingTitle: { color: colors.navy, fontSize: 27, fontWeight: '900' },
  loadingMessage: { color: colors.textMuted, fontSize: 13 },
});
