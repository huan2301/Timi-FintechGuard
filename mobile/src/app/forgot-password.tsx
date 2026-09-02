import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, Card, FormField, PageHeader, PrimaryButton } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { requestPasswordReset, resetPassword } from '@/services/password';
import { getApiErrorMessage } from '@/utils/format';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);

  const sendOtp = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Email chưa hợp lệ', 'Nhập email đã dùng để đăng ký tài khoản Timi.');
      return;
    }
    setBusy(true);
    try {
      const response = await requestPasswordReset(email);
      setStep(2);
      Alert.alert('Kiểm tra email', response.message);
    } catch (error) {
      Alert.alert('Không thể gửi OTP', getApiErrorMessage(error, 'Vui lòng thử lại sau.'));
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async () => {
    if (!/^\d{6}$/.test(otp)) {
      Alert.alert('OTP chưa hợp lệ', 'Nhập đủ 6 chữ số trong email Timi gửi cho bạn.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Mật khẩu quá ngắn', 'Mật khẩu mới cần ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mật khẩu chưa khớp', 'Hãy nhập lại đúng mật khẩu mới ở cả hai ô.');
      return;
    }
    setBusy(true);
    try {
      const response = await resetPassword({ email, otp, newPassword });
      Alert.alert('Đặt lại thành công', response.message, [{ text: 'Đăng nhập', onPress: () => router.replace('/') }]);
    } catch (error) {
      Alert.alert('Không thể đặt lại mật khẩu', getApiErrorMessage(error, 'OTP có thể đã hết hạn. Vui lòng yêu cầu mã mới.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
      <AppScreen>
        <PageHeader
          action={(
            <Pressable accessibilityLabel="Quay lại" hitSlop={10} onPress={() => router.back()} style={styles.backButton}>
              <MaterialCommunityIcons color={colors.text} name="arrow-left" size={22} />
            </Pressable>
          )}
          eyebrow="Khôi phục tài khoản"
          subtitle="Timi chỉ gửi OTP đến email đã đăng ký và không yêu cầu bạn gửi OTP qua chat."
          title="Quên mật khẩu?"
        />

        <Card style={styles.card}>
          <View style={styles.iconShell}>
            <MaterialCommunityIcons color={colors.primary} name={step === 1 ? 'email-fast-outline' : 'lock-reset'} size={30} />
          </View>
          <Text style={styles.cardTitle}>{step === 1 ? 'Nhận mã xác minh' : 'Tạo mật khẩu mới'}</Text>
          <Text style={styles.cardDescription}>
            {step === 1
              ? 'Nhập email tài khoản. Nếu email tồn tại, OTP sẽ được gửi trong ít phút.'
              : `Mã OTP đã gửi đến ${email}. Mã có hiệu lực trong 10 phút.`}
          </Text>

          <FormField
            autoCapitalize="none"
            autoComplete="email"
            editable={step === 1}
            icon="email-outline"
            keyboardType="email-address"
            label="Email tài khoản"
            onChangeText={setEmail}
            placeholder="ban@example.com"
            value={email}
          />

          {step === 2 ? (
            <>
              <FormField
                autoFocus
                icon="numeric"
                keyboardType="number-pad"
                label="Mã OTP 6 chữ số"
                maxLength={6}
                onChangeText={(value) => setOtp(value.replace(/\D/g, ''))}
                placeholder="000000"
                value={otp}
              />
              <FormField
                autoCapitalize="none"
                icon="lock-outline"
                label="Mật khẩu mới"
                onChangeText={setNewPassword}
                placeholder="Ít nhất 8 ký tự"
                secureTextEntry
                value={newPassword}
              />
              <FormField
                autoCapitalize="none"
                icon="lock-check-outline"
                label="Nhập lại mật khẩu mới"
                onChangeText={setConfirmPassword}
                placeholder="Nhập lại mật khẩu"
                secureTextEntry
                value={confirmPassword}
              />
              <PrimaryButton icon="lock-reset" label="Đặt lại mật khẩu" loading={busy} loadingLabel="Đang đặt lại mật khẩu" onPress={() => void submitReset()} />
              <Pressable disabled={busy} onPress={() => void sendOtp()} style={styles.resendButton}>
                <Text style={styles.resendText}>Gửi lại mã OTP</Text>
              </Pressable>
            </>
          ) : (
            <PrimaryButton icon="email-edit-outline" label="Gửi mã OTP" loading={busy} loadingLabel="Đang gửi mã OTP" onPress={() => void sendOtp()} />
          )}
        </Card>
        <Text style={styles.safetyText}>Không chia sẻ OTP hoặc mật khẩu mới với bất kỳ ai, kể cả người tự xưng là nhân viên Timi.</Text>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  backButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  card: { gap: spacing.lg },
  iconShell: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.primarySoft, borderRadius: 25, height: 68, justifyContent: 'center', width: 68 },
  cardTitle: { color: colors.text, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  cardDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  resendButton: { alignItems: 'center', paddingVertical: spacing.xs },
  resendText: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  safetyText: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
