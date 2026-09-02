import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppScreen, Card, FormField, PageHeader, PrimaryButton, RoundIconButton, ScreenState, StatusPill } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { getTransactionPinStatus, setTransactionPin } from '@/services/account';
import { useAuthStore } from '@/stores/auth-store';
import { getApiErrorMessage } from '@/utils/format';

export default function PinScreen() {
  const demoMode = useAuthStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const statusQuery = useQuery({
    queryKey: ['mobile-pin-status'],
    queryFn: getTransactionPinStatus,
    enabled: !demoMode,
  });

  const saveMutation = useMutation({
    mutationFn: () => setTransactionPin(pin, currentPin || undefined),
    onSuccess: () => {
      queryClient.setQueryData(['mobile-pin-status'], true);
      void queryClient.invalidateQueries({ queryKey: ['mobile-account-overview'] });
      setCurrentPin('');
      setPin('');
      setConfirmPin('');
      Alert.alert('Đã lưu PIN', 'Mã PIN giao dịch đã được cập nhật an toàn.', [
        { text: 'Xong', onPress: () => router.back() },
      ]);
    },
    onError: (error) => {
      Alert.alert('Không thể lưu PIN', getApiErrorMessage(error, 'Vui lòng thử lại sau.'));
    },
  });

  const submit = () => {
    if (demoMode) {
      Alert.alert('Bản xem trước', 'Đăng nhập tài khoản thật để thiết lập PIN giao dịch.');
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      Alert.alert('PIN chưa hợp lệ', 'Mã PIN phải gồm từ 4 đến 6 chữ số.');
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert('PIN không khớp', 'Vui lòng nhập lại đúng mã PIN mới.');
      return;
    }
    if (statusQuery.data && !/^\d{4,6}$/.test(currentPin)) {
      Alert.alert('Thiếu PIN hiện tại', 'Nhập PIN hiện tại để thay đổi mã bảo mật.');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <AppScreen>
      <PageHeader
        action={<RoundIconButton icon="close" onPress={() => router.back()} />}
        eyebrow="Bảo mật giao dịch"
        subtitle="PIN chỉ được gửi khi xác nhận giao dịch và không bao giờ được lưu trên thiết bị."
        title={statusQuery.data ? 'Đổi mã PIN' : 'Thiết lập mã PIN'}
      />

      {statusQuery.isLoading && !demoMode ? (
        <Card><ScreenState kind="loading" message="Đang kiểm tra cấu hình bảo mật hiện tại." title="Đang tải trạng thái PIN" /></Card>
      ) : statusQuery.isError && !demoMode ? (
        <Card><ScreenState actionLabel="Thử lại" kind="error" message="Không thể kiểm tra PIN nên Timi chưa cho phép thay đổi để tránh ghi đè sai." onAction={() => void statusQuery.refetch()} title="Không tải được trạng thái PIN" /></Card>
      ) : (
      <>
      <Card style={styles.statusCard}>
        <View style={styles.shieldIcon}>
          <MaterialCommunityIcons color={colors.primary} name="shield-key-outline" size={29} />
        </View>
        <View style={styles.statusText}>
          <Text style={styles.statusTitle}>Lớp xác nhận cuối</Text>
          <Text style={styles.statusDescription}>Timi yêu cầu PIN cho giao dịch không cần Face ID.</Text>
        </View>
        <StatusPill label={statusQuery.data ? 'Đã bật' : 'Chưa bật'} tone={statusQuery.data ? 'green' : 'amber'} />
      </Card>

      <Card style={styles.formCard}>
        {statusQuery.data ? (
          <FormField
            icon="lock-outline"
            keyboardType="number-pad"
            label="PIN hiện tại"
            maxLength={6}
            onChangeText={(value) => setCurrentPin(value.replace(/\D/g, ''))}
            placeholder="••••"
            secureTextEntry
            value={currentPin}
          />
        ) : null}
        <FormField
          icon="dialpad"
          keyboardType="number-pad"
          label="PIN mới"
          maxLength={6}
          onChangeText={(value) => setPin(value.replace(/\D/g, ''))}
          placeholder="4–6 chữ số"
          secureTextEntry
          value={pin}
        />
        <FormField
          icon="check-decagram-outline"
          keyboardType="number-pad"
          label="Nhập lại PIN mới"
          maxLength={6}
          onChangeText={(value) => setConfirmPin(value.replace(/\D/g, ''))}
          placeholder="Nhập lại PIN"
          secureTextEntry
          value={confirmPin}
        />
        <PrimaryButton
          icon="shield-check"
          label={statusQuery.data ? 'Cập nhật PIN' : 'Lưu mã PIN'}
          loading={saveMutation.isPending}
          loadingLabel="Đang lưu PIN an toàn"
          onPress={submit}
        />
      </Card>
      </>
      )}

      <View style={styles.noteBox}>
        <MaterialCommunityIcons color={colors.amber} name="alert-outline" size={20} />
        <Text style={styles.noteText}>Không dùng ngày sinh hoặc dãy số dễ đoán. Timi không bao giờ hỏi PIN qua chat.</Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  statusCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  shieldIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.medium, height: 54, justifyContent: 'center', width: 54 },
  statusText: { flex: 1, gap: 4 },
  statusTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  statusDescription: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  formCard: { gap: spacing.lg },
  noteBox: { alignItems: 'flex-start', backgroundColor: colors.amberSoft, borderRadius: radius.medium, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  noteText: { color: '#7D5208', flex: 1, fontSize: 12, lineHeight: 18 },
});
