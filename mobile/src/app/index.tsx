import { GoogleSignin, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type Href, Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppScreen, FormField, PrimaryButton } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth-store';
import { getApiErrorMessage } from '@/utils/format';

export default function LoginScreen() {
  const user = useAuthStore((state) => state.user);
  const busy = useAuthStore((state) => state.busy);
  const login = useAuthStore((state) => state.login);
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const enterDemo = useAuthStore((state) => state.enterDemo);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  if (user) return <Redirect href="/(tabs)" />;

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập email và mật khẩu.');
      return;
    }
    try {
      await login(email, password);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Không thể đăng nhập', getApiErrorMessage(error, 'Email hoặc mật khẩu chưa đúng.'));
    }
  };

  const preview = () => {
    enterDemo();
    router.replace('/(tabs)');
  };

  const signInWithGoogle = async () => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (Platform.OS !== 'android') {
      Alert.alert('Google trên Android', 'Luồng Google native này dành cho APK Android.');
      return;
    }
    if (!webClientId || webClientId.startsWith('your-')) {
      Alert.alert(
        'Thiếu cấu hình Google',
        'Hãy điền EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID trong mobile/.env.local và tạo lại APK.',
      );
      return;
    }

    setGoogleBusy(true);
    try {
      GoogleSignin.configure({ webClientId });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      if (!isSuccessResponse(result)) return;

      const credential = result.data.idToken;
      if (!credential) {
        Alert.alert('Google chưa trả về mã xác thực', 'Vui lòng thử lại bằng tài khoản Google khác.');
        return;
      }

      const next = await loginWithGoogle(credential);
      router.replace((next === 'phone_required' ? '/google-complete' : '/(tabs)') as Href);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
      if (code === statusCodes.SIGN_IN_CANCELLED) return;
      Alert.alert('Không thể đăng nhập Google', getApiErrorMessage(error, 'Vui lòng thử lại sau.'));
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboard}>
      <AppScreen contentStyle={styles.screen}>
        <View style={styles.brandArea}>
          <View style={styles.logoShell}>
            <Image source={require('@/assets/images/timi-logo.png')} style={styles.logo} />
          </View>
          <View style={styles.trustPill}>
            <MaterialCommunityIcons color={colors.green} name="shield-check" size={16} />
            <Text style={styles.trustText}>Bảo vệ tài chính thông minh</Text>
          </View>
          <Text style={styles.title}>Chào mừng trở lại</Text>
          <Text style={styles.subtitle}>
            Đăng nhập để Timi tiếp tục bảo vệ từng giao dịch của bạn.
          </Text>
        </View>

        <View style={styles.form}>
          <FormField
            autoCapitalize="none"
            autoComplete="email"
            icon="email-outline"
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="ban@example.com"
            value={email}
          />
          <FormField
            autoCapitalize="none"
            icon="lock-outline"
            label="Mật khẩu"
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
            placeholder="Nhập mật khẩu"
            returnKeyType="done"
            right={
              <Pressable hitSlop={10} onPress={() => setShowPassword((value) => !value)}>
                <MaterialCommunityIcons
                  color={colors.textMuted}
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={21}
                />
              </Pressable>
            }
            secureTextEntry={!showPassword}
            value={password}
          />
          <Pressable onPress={() => router.push('/forgot-password' as Href)} style={styles.forgot}>
            <Text style={styles.link}>Quên mật khẩu?</Text>
          </Pressable>
          <PrimaryButton disabled={googleBusy} label="Đăng nhập an toàn" loading={busy} loadingLabel="Đang xác thực tài khoản" onPress={() => void submit()} />

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>hoặc</Text>
            <View style={styles.divider} />
          </View>

          <PrimaryButton
            icon="google"
            label="Tiếp tục với Google"
            loading={googleBusy}
            loadingLabel="Đang mở Google"
            disabled={busy}
            onPress={() => void signInWithGoogle()}
            variant="outline"
          />

          {__DEV__ ? (
            <Pressable onPress={preview} style={styles.demoButton}>
              <MaterialCommunityIcons color={colors.primary} name="cellphone-play" size={18} />
              <Text style={styles.demoText}>Xem nhanh bản thiết kế</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.registerRow}>
          <Text style={styles.registerText}>Chưa có tài khoản?</Text>
          <Pressable onPress={() => router.push('/register')}>
            <Text style={styles.link}>Đăng ký ngay</Text>
          </Pressable>
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  screen: { gap: spacing.xxl, justifyContent: 'center', paddingBottom: spacing.xxxl },
  brandArea: { alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  logoShell: {
    alignItems: 'center',
    backgroundColor: '#EFEAFF',
    borderRadius: 30,
    height: 104,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: 104,
  },
  logo: { height: 88, resizeMode: 'contain', width: 88 },
  trustPill: {
    alignItems: 'center',
    backgroundColor: colors.greenSoft,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  trustText: { color: '#087B5C', fontSize: 12, fontWeight: '800' },
  title: { color: colors.text, fontSize: 31, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22, maxWidth: 340, textAlign: 'center' },
  form: { gap: spacing.lg },
  forgot: { alignSelf: 'flex-end', marginTop: -6 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  divider: { backgroundColor: colors.border, flex: 1, height: 1 },
  dividerText: { color: colors.textMuted, fontSize: 13 },
  demoButton: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.sm },
  demoText: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  registerRow: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  registerText: { color: colors.textMuted, fontSize: 14 },
});
