import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, Card, PageHeader, RoundIconButton, ScreenState, StatusPill } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/services/notifications';
import { useAuthStore } from '@/stores/auth-store';
import { formatShortDate, getApiErrorMessage } from '@/utils/format';

const demoNotifications: AppNotification[] = [
  {
    id: 'demo-notification',
    title: 'Timi đang bảo vệ tài khoản của bạn',
    body: 'Hãy kiểm tra kỹ tên người nhận và không chia sẻ OTP hoặc PIN với bất kỳ ai.',
    kind: 'security',
    version: null,
    is_read: false,
    created_at: new Date().toISOString(),
  },
];

export default function NotificationsScreen() {
  const demoMode = useAuthStore((state) => state.demoMode);
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ['mobile-notifications'],
    queryFn: () => getNotifications(30),
    enabled: !demoMode,
  });
  const notifications = demoMode ? demoNotifications : (notificationsQuery.data ?? []);

  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-unread-notifications'] });
    },
  });
  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-unread-notifications'] });
    },
  });

  return (
    <AppScreen>
      <PageHeader
        action={<RoundIconButton icon="close" onPress={() => router.back()} />}
        eyebrow="Trung tâm cập nhật"
        subtitle="Cảnh báo bảo mật và thông báo sản phẩm từ Timi."
        title="Thông báo"
      />

      {notifications.some((item) => !item.is_read) && !demoMode ? (
        <Pressable
          disabled={readAllMutation.isPending}
          onPress={() => readAllMutation.mutate()}
          style={styles.readAllButton}>
          {readAllMutation.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <MaterialCommunityIcons color={colors.primary} name="check-all" size={19} />}
          <Text style={styles.readAllText}>{readAllMutation.isPending ? 'Đang cập nhật...' : 'Đánh dấu tất cả đã đọc'}</Text>
        </Pressable>
      ) : null}

      {readMutation.isError || readAllMutation.isError ? (
        <ScreenState
          compact
          kind="error"
          message={getApiErrorMessage(readMutation.error || readAllMutation.error, 'Không thể cập nhật trạng thái thông báo.')}
          title="Cập nhật chưa thành công"
        />
      ) : null}

      {notificationsQuery.isLoading && !demoMode ? (
        <Card><ScreenState kind="loading" message="Đang đồng bộ cảnh báo mới nhất." title="Đang tải thông báo" /></Card>
      ) : notificationsQuery.isError && !demoMode ? (
        <Card style={styles.stateCard}><ScreenState actionLabel="Thử lại" kind="error" message="Kiểm tra kết nối mạng rồi tải lại." onAction={() => void notificationsQuery.refetch()} title="Không tải được thông báo" /></Card>
      ) : notifications.length ? (
        <View style={styles.list}>
          {notifications.map((item) => (
            <Pressable
              key={item.id}
              disabled={item.is_read || demoMode || readMutation.isPending}
              onPress={() => readMutation.mutate(item.id)}>
              <Card style={[styles.notificationCard, !item.is_read && styles.unreadCard]}>
                <View style={[styles.iconBox, !item.is_read && styles.unreadIconBox]}>
                  <MaterialCommunityIcons
                    color={!item.is_read ? colors.primary : colors.textMuted}
                    name={item.kind === 'security' ? 'shield-alert-outline' : 'bell-outline'}
                    size={23}
                  />
                </View>
                <View style={styles.notificationText}>
                  <View style={styles.notificationTitleRow}>
                    <Text style={styles.notificationTitle}>{item.title}</Text>
                    {!item.is_read ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <Text style={styles.notificationBody}>{item.body}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.date}>{formatShortDate(item.created_at)}</Text>
                    {item.version ? <StatusPill label={`v${item.version}`} tone="blue" /> : null}
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : (
        <Card style={styles.stateCard}><ScreenState kind="success" message="Cảnh báo mới sẽ xuất hiện tại đây." title="Bạn đã xem hết thông báo" /></Card>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  readAllButton: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  readAllText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  list: { gap: spacing.md },
  notificationCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  unreadCard: { backgroundColor: '#F9FBFF', borderColor: '#BFD0FF' },
  iconBox: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.medium, height: 48, justifyContent: 'center', width: 48 },
  unreadIconBox: { backgroundColor: colors.primarySoft },
  notificationText: { flex: 1, gap: spacing.sm },
  notificationTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  notificationTitle: { color: colors.text, flex: 1, fontSize: 15, fontWeight: '900' },
  unreadDot: { backgroundColor: colors.primary, borderRadius: 5, height: 9, width: 9 },
  notificationBody: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  metaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  date: { color: colors.textMuted, fontSize: 11 },
  stateCard: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
  stateText: { color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
});
