import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppScreen, Card, PageHeader, PrimaryButton, StatusPill } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { apiBaseUrl } from '@/services/api';
import { useAuthStore } from '@/stores/auth-store';

export default function DevicesScreen() {
  const logout = useAuthStore((state) => state.logout);
  const busy = useAuthStore((state) => state.busy);
  const signOut = () => Alert.alert('Đăng xuất thiết bị này', 'Bạn có muốn kết thúc phiên Timi trên thiết bị hiện tại?', [
    { text: 'Ở lại', style: 'cancel' },
    { text: 'Đăng xuất', style: 'destructive', onPress: () => void logout().then(() => router.replace('/')) },
  ]);

  return (
    <AppScreen>
      <PageHeader eyebrow="Bảo mật" subtitle="Thông tin phiên đang dùng trên thiết bị Android này." title="Thiết bị hiện tại" />
      <Card style={styles.heroCard}>
        <View style={styles.deviceIcon}><MaterialCommunityIcons color={colors.primary} name="cellphone-check" size={34} /></View>
        <View style={styles.deviceText}>
          <Text style={styles.deviceName}>{Device.deviceName || Device.modelName || 'Thiết bị Android'}</Text>
          <Text style={styles.deviceMeta}>{Device.osName || 'Android'} {Device.osVersion || ''}</Text>
          <StatusPill label="Phiên đang hoạt động" tone="green" />
        </View>
      </Card>
      <Card style={styles.infoCard}>
        <InfoRow label="Model" value={Device.modelName || 'Không xác định'} />
        <InfoRow label="Phiên bản app" value={Constants.expoConfig?.version || '1.0.0'} />
        <InfoRow label="Máy chủ" value={apiBaseUrl} />
      </Card>
      <View style={styles.notice}>
        <MaterialCommunityIcons color={colors.primary} name="information-outline" size={20} />
        <Text style={styles.noticeText}>Phiên đăng nhập này được lưu bảo mật trên thiết bị. Nếu bạn dùng máy lạ, hãy đăng xuất ngay sau khi hoàn tất.</Text>
      </View>
      <PrimaryButton label="Đăng xuất thiết bị này" loading={busy} loadingLabel="Đang kết thúc phiên" onPress={signOut} variant="outline" />
    </AppScreen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text numberOfLines={1} style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  heroCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.lg },
  deviceIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 22, height: 70, justifyContent: 'center', width: 70 },
  deviceText: { flex: 1, gap: 5 },
  deviceName: { color: colors.text, fontSize: 18, fontWeight: '900' },
  deviceMeta: { color: colors.textMuted, fontSize: 13 },
  infoCard: { gap: spacing.lg },
  infoRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  infoLabel: { color: colors.textMuted, fontSize: 13 },
  infoValue: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  notice: { alignItems: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: radius.medium, flexDirection: 'row', gap: spacing.sm, padding: spacing.lg },
  noticeText: { color: colors.primaryDark, flex: 1, fontSize: 12, lineHeight: 18 },
});
