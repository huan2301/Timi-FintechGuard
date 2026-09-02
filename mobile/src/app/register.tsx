import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, FormField, PrimaryButton } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { type RegistrationPayload, useAuthStore } from '@/stores/auth-store';
import { getApiErrorMessage } from '@/utils/format';

const initialPayload: RegistrationPayload = {
  full_name: '',
  email: '',
  phone: '',
  password: '',
};

export default function RegisterScreen() {
  const busy = useAuthStore((state) => state.busy);
  const requestOtp = useAuthStore((state) => state.requestOtp);
  const completeRegistration = useAuthStore((state) => state.completeRegistration);
  const [payload, setPayload] = useState(initialPayload);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');

  const update = (key: keyof RegistrationPayload, value: string) => {
    setPayload((current) => ({ ...current, [key]: value }));
  };

  const sendOtp = async () => {
    if (Object.values(payload).some((value) => !value.trim())) {
      Alert.alert('Thiếu thông tin', 'Vui lòng hoàn thành tất cả trường đăng ký.');
      return;
    }
    if (payload.password.length < 8) {
      Alert.alert('Mật khẩu chưa đủ mạnh', 'Mật khẩu cần ít nhất 8 ký tự.');
      return;
    }
    try {
      await requestOtp({ ...payload, email: payload.email.trim().toLowerCase() });
      setOtpSent(true);
      Alert.alert('Đã gửi mã', 'Kiểm tra email để lấy mã OTP đăng ký.');
    } catch (error) {
      Alert.alert('Không gửi được OTP', getApiErrorMessage(error, 'Vui lòng thử lại sau.'));
    }
  };

  const verify = async () => {
    if (otp.trim().length < 4) {
      Alert.alert('Mã OTP chưa đúng', 'Vui lòng nhập mã được gửi tới email.');
      return;
    }
    try {
      await completeRegistration(payload, otp.trim());
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Không thể đăng ký', getApiErrorMessage(error, 'Mã OTP không hợp lệ hoặc đã hết hạn.'));
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
      <AppScreen contentStyle={styles.screen}>
        <View style={styles.topBar}>
          <Pressable hitSlop={12} onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons color={colors.navy} name="arrow-left" size={24} />
          </Pressable>
          <Text style={styles.topTitle}>Tạo tài khoản Timi</Text>
          <View style={styles.backPlaceholder} />
        </View>

        <View style={styles.intro}>
          <Text style={styles.title}>{otpSent ? 'Xác thực email' : 'Bắt đầu an toàn hơn'}</Text>
          <Text style={styles.subtitle}>
            {otpSent
              ? `Mã xác thực đã được gửi tới ${payload.email}.`
              : 'Chỉ mất khoảng một phút để tạo tài khoản và bật lớp bảo vệ giao dịch.'}
          </Text>
        </View>

        {otpSent ? (
          <View style={styles.form}>
            <FormField
              autoFocus
              keyboardType="number-pad"
              label="Mã OTP"
              maxLength={8}
              onChangeText={setOtp}
              placeholder="Nhập mã trong email"
              value={otp}
            />
            <PrimaryButton label="Xác nhận và đăng ký" loading={busy} loadingLabel="Đang xác minh OTP" onPress={() => void verify()} />
            <Pressable onPress={() => setOtpSent(false)}>
              <Text style={styles.editLink}>Sửa thông tin đăng ký</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <FormField icon="account-outline" label="Họ và tên" onChangeText={(value) => update('full_name', value)} placeholder="Nguyễn Minh Anh" value={payload.full_name} />
            <FormField autoCapitalize="none" icon="email-outline" keyboardType="email-address" label="Email" onChangeText={(value) => update('email', value)} placeholder="ban@example.com" value={payload.email} />
            <FormField icon="phone-outline" keyboardType="phone-pad" label="Số điện thoại" onChangeText={(value) => update('phone', value)} placeholder="090 123 4567" value={payload.phone} />
            <FormField autoCapitalize="none" icon="lock-outline" label="Mật khẩu" onChangeText={(value) => update('password', value)} placeholder="Tối thiểu 8 ký tự" secureTextEntry value={payload.password} />
            <PrimaryButton label="Gửi mã xác thực" loading={busy} loadingLabel="Đang gửi mã đến email" onPress={() => void sendOtp()} />
          </View>
        )}

        <View style={styles.termsRow}>
          <Text style={styles.terms}>Khi đăng ký, bạn đồng ý với </Text>
          <Pressable onPress={() => router.push('/info?section=terms' as Href)}><Text style={styles.termsLink}>Điều khoản</Text></Pressable>
          <Text style={styles.terms}> và </Text>
          <Pressable onPress={() => router.push('/info?section=privacy' as Href)}><Text style={styles.termsLink}>Bảo mật</Text></Pressable>
          <Text style={styles.terms}>.</Text>
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  screen: { gap: spacing.xxl, paddingBottom: spacing.xxxl },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  backButton: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
  backPlaceholder: { width: 44 },
  topTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  intro: { gap: spacing.sm },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  form: { gap: spacing.lg },
  editLink: { color: colors.primary, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  terms: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  termsRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  termsLink: { color: colors.primary, fontSize: 12, fontWeight: '800', lineHeight: 18 },
});
