import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { TimiCompanion } from '@/components/timi-companion';
import { UserAvatar } from '@/components/user-avatar';
import { AppScreen, Card, InlineNotice, PageHeader, PrimaryButton, ProgressBar, StatusPill } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { getAccountOverview } from '@/services/account';
import { apiBaseUrl } from '@/services/api';
import { getFaceEnrollmentStatus } from '@/services/face';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency } from '@/utils/format';

const menuSections = [
  {
    title: 'Bảo mật',
    items: [
      { icon: 'face-recognition', label: 'Xác minh khuôn mặt', detail: 'Thiết lập Face ID cho giao dịch', action: 'face' },
      { icon: 'dialpad', label: 'Mã PIN giao dịch', detail: 'Bảo vệ bước xác nhận cuối', action: 'pin' },
      { icon: 'devices', label: 'Thiết bị hiện tại', detail: 'Kiểm tra phiên đang dùng trên máy này', action: 'devices' },
      { icon: 'shield-account-outline', label: 'Scam Guardian', detail: 'Phân tích dấu hiệu lừa đảo trong cuộc gọi', action: 'guardian' },
    ],
  },
  {
    title: 'Cài đặt',
    items: [
      { icon: 'bell-outline', label: 'Thông báo', detail: 'Cảnh báo giao dịch và cập nhật', action: 'notifications' },
      { icon: 'help-circle-outline', label: 'Trung tâm trợ giúp', detail: 'Câu hỏi thường gặp và liên hệ', action: 'help' },
    ],
  },
] as const;

export default function ProfileScreen() {
  const assistantRequestRef = useRef(0);
  const user = useAuthStore((state) => state.user)!;
  const demoMode = useAuthStore((state) => state.demoMode);
  const logout = useAuthStore((state) => state.logout);
  const overviewQuery = useQuery({
    queryKey: ['mobile-account-overview'],
    queryFn: getAccountOverview,
    enabled: !demoMode,
  });
  const overview = overviewQuery.data;
  const faceQuery = useQuery({
    queryKey: ['mobile-face-status'],
    queryFn: getFaceEnrollmentStatus,
    enabled: !demoMode,
  });

  const signOut = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn kết thúc phiên trên thiết bị này?', [
      { text: 'Ở lại', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: () => void logout().then(() => router.replace('/')),
      },
    ]);
  };

  const openItem = (action: string) => {
    if (action === 'pin') {
      router.push('/pin' as Href);
      return;
    }
    if (action === 'notifications') {
      router.push('/notifications' as Href);
      return;
    }
    if (action === 'help') {
      assistantRequestRef.current += 1;
      router.push({
        pathname: '/assistant',
        params: {
          context: 'Trung tâm trợ giúp',
          prompt: 'Timi hãy giúp tôi sử dụng ứng dụng và bảo vệ tài khoản.',
          requestId: `profile-help-${assistantRequestRef.current}`,
        },
      });
      return;
    }
    if (action === 'face') {
      router.push('/face?mode=enroll' as Href);
      return;
    }
    if (action === 'guardian') {
      router.push('/guardian' as Href);
      return;
    }
    router.push('/devices' as Href);
  };

  const securityScore = demoMode ? 92 : overview?.security_score;
  const faceConfigured = demoMode || Boolean(faceQuery.data?.configured);
  const securityPrompt = `Điểm bảo mật của tôi đang là ${securityScore ?? 'chưa đồng bộ'}/100, Face ID ${faceConfigured ? 'đã bật' : 'chưa bật'}. Hãy hướng dẫn tôi bước ưu tiên tiếp theo mà không yêu cầu OTP, PIN hay mật khẩu.`;

  return (
    <AppScreen>
      <PageHeader eyebrow="Tài khoản" title="Hồ sơ của bạn" />

      <Card style={styles.profileCard}>
        <UserAvatar dark name={user.full_name} size={68} uri={user.avatar_url} />
        <View style={styles.profileText}>
          <Text style={styles.name}>{user.full_name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <StatusPill label={demoMode ? 'Bản xem trước' : 'Đã xác thực'} tone={demoMode ? 'blue' : 'green'} />
        </View>
      </Card>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <MaterialCommunityIcons color={colors.primary} name="wallet-outline" size={22} />
          <Text style={styles.statLabel}>Số dư</Text>
          <Text numberOfLines={1} style={styles.statValue}>{formatCurrency(overview?.balance ?? user.balance)}</Text>
        </Card>
        <Card style={styles.statCard}>
          <MaterialCommunityIcons color={colors.green} name="shield-star-outline" size={22} />
          <Text style={styles.statLabel}>Bảo mật</Text>
          <Text style={styles.statValue}>
            {demoMode ? '92/100' : overview ? `${overview.security_score}/100` : overviewQuery.isError ? 'Chưa tải' : 'Đang tải'}
          </Text>
          {securityScore !== undefined ? <ProgressBar tone={securityScore >= 80 ? 'green' : 'amber'} value={securityScore / 100} /> : null}
        </Card>
      </View>

      {overviewQuery.isError && !demoMode ? (
        <Pressable onPress={() => void overviewQuery.refetch()}>
          <InlineNotice message="Không đồng bộ được điểm bảo mật. Chạm để thử lại." tone="red" />
        </Pressable>
      ) : null}

      <TimiCompanion
        compact
        context="Timi bảo vệ tài khoản"
        defaultPrompt={securityPrompt}
        message={securityScore === undefined
          ? 'Mình đang đồng bộ các lớp bảo vệ của bạn.'
          : securityScore >= 90
            ? 'Các lớp bảo vệ đang ở trạng thái tốt. Mình vẫn luôn sẵn sàng khi bạn cần.'
            : `Bạn đang ở ${securityScore}/100. Mình có thể hướng dẫn từng bước để tăng độ an toàn.`}
        suggestions={faceConfigured
          ? ['Tôi còn nên bật thêm lớp bảo vệ nào?', 'Thiết bị lạ đăng nhập thì tôi nên làm gì?']
          : [
              { label: 'Vì sao nên bật Face ID?', prompt: `${securityPrompt} Trước tiên hãy giải thích lợi ích của Face ID.` },
              'Hướng dẫn tôi bảo vệ tài khoản theo từng bước',
            ]}
      />

      {menuSections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Card style={styles.menuCard}>
            {section.items.map((item, index) => (
              <View key={item.label}>
                <Pressable onPress={() => openItem(item.action)} style={styles.menuRow}>
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons color={colors.primary} name={item.icon} size={23} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Text style={styles.menuDetail}>
                      {item.action === 'face' && !demoMode
                        ? faceQuery.isLoading
                          ? 'Đang kiểm tra trạng thái Face ID'
                          : faceQuery.isError
                            ? 'Chưa kiểm tra được Face ID'
                            : faceQuery.data?.configured
                              ? 'Đã thiết lập, chạm để chụp mẫu mới'
                              : 'Chưa thiết lập, chạm để bắt đầu'
                        : item.detail}
                    </Text>
                  </View>
                  {item.action === 'face' && faceQuery.data && !demoMode ? (
                    <StatusPill label={faceQuery.data.configured ? 'Đã bật' : 'Chưa bật'} tone={faceQuery.data.configured ? 'green' : 'amber'} />
                  ) : null}
                  <MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={23} />
                </Pressable>
                {index < section.items.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))}
          </Card>
        </View>
      ))}

      <View style={styles.serverBox}>
        <MaterialCommunityIcons color={colors.textMuted} name="server-network" size={16} />
        <Text numberOfLines={1} style={styles.serverText}>API: {apiBaseUrl}</Text>
      </View>

      <PrimaryButton label="Đăng xuất" onPress={signOut} variant="outline" />
      <Text style={styles.version}>Timi Mobile 1.0.0 · Made for safer money</Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  profileCard: { alignItems: 'center', backgroundColor: colors.navy, borderColor: colors.navy, flexDirection: 'row', gap: spacing.lg },
  profileText: { flex: 1, gap: 5 },
  name: { color: colors.white, fontSize: 18, fontWeight: '900' },
  email: { color: '#AEB7D0', fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: { flex: 1, gap: spacing.sm, minWidth: 0, padding: spacing.lg },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '900' },
  section: { gap: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  menuCard: { paddingVertical: spacing.xs },
  menuRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  menuIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.small, height: 42, justifyContent: 'center', width: 42 },
  menuText: { flex: 1, gap: 3 },
  menuLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  menuDetail: { color: colors.textMuted, fontSize: 11 },
  divider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginLeft: 54 },
  serverBox: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  serverText: { color: colors.textMuted, fontSize: 10, maxWidth: '85%' },
  version: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
});
