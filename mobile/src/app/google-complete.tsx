import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppScreen, FormField, PrimaryButton } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth-store';
import { getApiErrorMessage } from '@/utils/format';

export default function GoogleCompleteScreen() {
  const completion = useAuthStore((state) => state.googleCompletion);
  const busy = useAuthStore((state) => state.busy);
  const completeGooglePhone = useAuthStore((state) => state.completeGooglePhone);
  const cancelGoogleCompletion = useAuthStore((state) => state.cancelGoogleCompletion);
  const [phone, setPhone] = useState('');

  if (!completion) return <Redirect href="/" />;

  const submit = async () => {
    const normalizedPhone = phone.replace(/\D/g, '');
    if (!/^0\d{9}$/.test(normalizedPhone)) {
      Alert.alert('Số điện thoại chưa đúng', 'Vui lòng nhập đúng 10 chữ số, bắt đầu bằng số 0.');
      return;
    }

    try {
      await completeGooglePhone(normalizedPhone);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Chưa thể hoàn tất', getApiErrorMessage(error, 'Vui lòng thử lại sau.'));
    }
  };

  const cancel = () => {
    cancelGoogleCompletion();
    router.replace('/');
  };

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>HOÀN TẤT TÀI KHOẢN</Text>
        <Text style={styles.title}>Thêm số điện thoại Timi</Text>
        <Text style={styles.subtitle}>
          Tài khoản Google {completion.email} đã xác thực. Số điện thoại giúp Timi bảo vệ tài khoản và hỗ trợ bạn khi cần.
        </Text>
      </View>

      <View style={styles.card}>
        <FormField
          autoCapitalize="none"
          keyboardType="phone-pad"
          label="Số điện thoại"
          maxLength={10}
          onChangeText={(value) => setPhone(value.replace(/\D/g, ''))}
          placeholder="0901234567"
          value={phone}
        />
        <PrimaryButton label="Hoàn tất đăng nhập" loading={busy} loadingLabel="Đang hoàn tất tài khoản" onPress={() => void submit()} />
        <PrimaryButton label="Dùng tài khoản khác" onPress={cancel} variant="outline" />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xl, justifyContent: 'center', paddingBottom: spacing.xxxl },
  hero: { gap: spacing.md },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 23 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, borderWidth: 1, gap: spacing.lg, padding: spacing.lg },
});
