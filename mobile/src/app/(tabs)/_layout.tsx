import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth-store';

const icons = {
  index: 'home-variant',
  transfer: 'bank-transfer',
  assistant: 'creation',
  scan: 'qrcode-scan',
  history: 'history',
  profile: 'account-circle',
} as const;

export default function TabsLayout() {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: route.name === 'assistant' ? colors.primary : colors.primary,
        tabBarInactiveTintColor: '#8B96A9',
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '800', marginBottom: 5 },
        tabBarStyle: {
          backgroundColor: colors.white,
          borderColor: colors.border,
          borderRadius: 25,
          borderTopWidth: 1,
          bottom: 10,
          elevation: 18,
          height: 76,
          left: 12,
          paddingTop: 7,
          position: 'absolute',
          right: 12,
        },
        tabBarIcon: ({ color, focused }) => {
          const isAssistant = route.name === 'assistant';
          return (
          <View style={[
            styles.tabIcon,
            focused && styles.tabIconActive,
            isAssistant && styles.timiTabIcon,
            isAssistant && focused && styles.timiTabIconActive,
          ]}>
            <MaterialCommunityIcons
              color={isAssistant ? colors.white : color}
              name={icons[route.name as keyof typeof icons] ?? 'circle-outline'}
              size={isAssistant ? 22 : focused ? 23 : 22}
            />
          </View>
          );
        },
      })}>
      <Tabs.Screen name="index" options={{ title: 'Trang chủ' }} />
      <Tabs.Screen name="transfer" options={{ title: 'Chuyển tiền' }} />
      <Tabs.Screen name="assistant" options={{ title: 'Timi AI' }} />
      <Tabs.Screen name="scan" options={{ title: 'Quét QR' }} />
      <Tabs.Screen name="history" options={{ href: null, title: 'Lịch sử' }} />
      <Tabs.Screen name="profile" options={{ title: 'Tài khoản' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: { alignItems: 'center', borderRadius: 13, height: 32, justifyContent: 'center', width: 42 },
  tabIconActive: { backgroundColor: colors.primarySoft },
  timiTabIcon: { backgroundColor: colors.primary, borderColor: colors.white, borderRadius: 17, borderWidth: 3, height: 44, marginTop: -12, width: 44 },
  timiTabIconActive: { backgroundColor: colors.primaryDark },
});
