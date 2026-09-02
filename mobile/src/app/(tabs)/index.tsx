import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TimiCompanion } from '@/components/timi-companion';
import { UserAvatar } from '@/components/user-avatar';
import { AppScreen, Card, InlineNotice, RoundIconButton, ScreenState, SectionHeader } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { getAccountOverview } from '@/services/account';
import { getUnreadNotificationCount } from '@/services/notifications';
import { getTransactionHistory } from '@/services/transactions';
import { useAuthStore } from '@/stores/auth-store';
import type { Transaction } from '@/types/api';
import { formatCurrency, formatShortDate } from '@/utils/format';

const demoTransactions: Transaction[] = [
  {
    id: 'demo-1', payee_account: '0912345678', payee_name: 'Trần Hoàng Nam', direction: 'outgoing',
    counterparty_name: 'Trần Hoàng Nam', counterparty_account: '0912345678', bank_code: 'Timi Bank',
    amount: 850_000, currency: 'VND', transaction_status: 'completed',
    created_at: new Date(Date.now() - 3_600_000).toISOString(), risk_level: 'safe',
  },
  {
    id: 'demo-2', payee_account: '0388899123', payee_name: 'Lê Thu Hà', direction: 'incoming',
    counterparty_name: 'Lê Thu Hà', counterparty_account: '0388899123', bank_code: 'VCB',
    amount: 2_500_000, currency: 'VND', transaction_status: 'completed',
    created_at: new Date(Date.now() - 86_400_000).toISOString(), risk_level: 'low',
  },
];

const quickActions = [
  { label: 'Chuyển tiền', detail: 'Có kiểm tra rủi ro', icon: 'bank-transfer-out', route: '/transfer', color: colors.primary, soft: colors.primarySoft },
  { label: 'Quét QR', detail: 'Kiểm tra trước khi mở', icon: 'qrcode-scan', route: '/scan', color: colors.purple, soft: colors.lavenderSoft },
  { label: 'Hỏi Timi', detail: 'Trợ lý luôn sẵn sàng', icon: 'creation', route: '/assistant', color: colors.green, soft: colors.greenSoft },
  { label: 'Guardian', detail: 'Bảo vệ cuộc gọi', icon: 'shield-account-outline', route: '/guardian', color: colors.coral, soft: colors.coralSoft },
] as const;

export default function HomeScreen() {
  const user = useAuthStore((state) => state.user)!;
  const demoMode = useAuthStore((state) => state.demoMode);
  const [balanceVisible, setBalanceVisible] = useState(false);
  const overviewQuery = useQuery({
    queryKey: ['mobile-account-overview'],
    queryFn: getAccountOverview,
    enabled: !demoMode,
  });
  const historyQuery = useQuery({
    queryKey: ['mobile-history-preview'],
    queryFn: () => getTransactionHistory(3),
    enabled: !demoMode,
  });
  const unreadQuery = useQuery({
    queryKey: ['mobile-unread-notifications'],
    queryFn: getUnreadNotificationCount,
    enabled: !demoMode,
  });

  const overview = overviewQuery.data;
  const transactions = demoMode ? demoTransactions : (historyQuery.data?.items ?? []);
  const firstName = user.full_name.trim().split(/\s+/).at(-1) || 'bạn';
  const balance = overview?.balance ?? user.balance;
  const securityScore = demoMode ? 92 : overview?.security_score;
  const transactionsToday = demoMode ? 2 : (overview?.transactions_today ?? 0);
  const companionMessage = securityScore === undefined
    ? 'Mình đang đồng bộ để chuẩn bị bản tóm tắt tài chính cho bạn.'
    : securityScore < 80
      ? `Điểm bảo mật đang là ${securityScore}/100. Mình có thể giúp bạn hoàn thiện từng bước.`
      : transactionsToday > 0
        ? `Mình đã theo dõi ${transactionsToday} giao dịch hôm nay. Chưa có điều gì cần bạn xử lý gấp.`
        : 'Mọi lớp bảo vệ đang sẵn sàng. Cứ hỏi mình trước khi bạn thấy một giao dịch chưa chắc chắn.';

  return (
    <AppScreen>
      <View style={styles.topBar}>
        <View style={styles.identity}>
          <UserAvatar dark name={user.full_name} size={46} uri={user.avatar_url} />
          <View style={styles.greetingBox}>
            <Text style={styles.greeting}>Chào {firstName},</Text>
            <Text style={styles.hello}>Hôm nay bạn cần làm gì?</Text>
          </View>
        </View>
        <RoundIconButton
          badge={demoMode || Boolean(unreadQuery.data)}
          icon="bell-outline"
          onPress={() => router.push('/notifications' as Href)}
        />
      </View>

      <View style={styles.balanceCard}>
        <View style={styles.balanceOrbLarge} />
        <View style={styles.balanceOrbSmall} />
        <View style={styles.balanceTop}>
          <View style={styles.balanceTextBox}>
            <Text style={styles.balanceLabel}>Số dư khả dụng</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.balance}>
              {balanceVisible ? formatCurrency(balance) : '••••••••'}
            </Text>
          </View>
          <Pressable accessibilityLabel={balanceVisible ? 'Ẩn số dư' : 'Hiện số dư'} onPress={() => setBalanceVisible((visible) => !visible)} style={styles.eyeButton}>
            <MaterialCommunityIcons color={colors.white} name={balanceVisible ? 'eye-off-outline' : 'eye-outline'} size={20} />
          </Pressable>
        </View>
        <View style={styles.balanceDivider} />
        <View style={styles.balanceStats}>
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatValue}>{transactionsToday}</Text>
            <Text style={styles.balanceStatLabel}>Giao dịch hôm nay</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.balanceStat}>
            <View style={styles.scoreRow}>
              <MaterialCommunityIcons color={colors.cyan} name="shield-check" size={16} />
              <Text style={styles.balanceStatValue}>{securityScore ?? '—'}/100</Text>
            </View>
            <Text style={styles.balanceStatLabel}>Điểm bảo mật</Text>
          </View>
        </View>
      </View>

      {overviewQuery.isError && !demoMode ? (
        <Pressable onPress={() => void overviewQuery.refetch()}>
          <InlineNotice message="Chưa đồng bộ được số dư và điểm bảo mật. Chạm để thử lại." tone="red" />
        </Pressable>
      ) : null}

      <TimiCompanion
        context="Timi hôm nay"
        defaultPrompt={`Hãy tóm tắt tình hình tài chính và bảo mật hiện tại của tôi. Điểm bảo mật đang là ${securityScore ?? 'chưa đồng bộ'}/100.`}
        message={companionMessage}
        suggestions={securityScore !== undefined && securityScore < 80
          ? [
              'Tôi nên bật lớp bảo mật nào trước?',
              'Vì sao Face ID giúp giao dịch an toàn hơn?',
            ]
          : [
              'Dấu hiệu lừa đảo nào tôi nên để ý hôm nay?',
              'Giúp tôi chuẩn bị một giao dịch an toàn',
            ]}
      />

      <View style={styles.actionsSection}>
        <SectionHeader title="Lối tắt của bạn" />
        <View style={styles.actionGrid}>
          {quickActions.map((action) => (
            <Pressable
              accessibilityRole="button"
              key={action.label}
              onPress={() => router.push(action.route as Href)}
              style={({ pressed }) => [styles.actionItem, pressed && styles.pressed]}>
              <View style={[styles.actionIcon, { backgroundColor: action.soft }]}>
                <MaterialCommunityIcons color={action.color} name={action.icon} size={24} />
              </View>
              <View style={styles.actionTextBox}>
                <Text style={styles.actionLabel}>{action.label}</Text>
                <Text numberOfLines={2} style={styles.actionDetail}>{action.detail}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.transactionsSection}>
        <SectionHeader actionLabel="Xem tất cả" onAction={() => router.push('/history')} title="Giao dịch gần đây" />
        <Card style={styles.transactionCard}>
          {historyQuery.isLoading && !demoMode ? (
            <ScreenState compact kind="loading" title="Đang tải giao dịch" />
          ) : historyQuery.isError && !demoMode ? (
            <ScreenState actionLabel="Thử lại" kind="error" message="Không thể lấy giao dịch gần đây." onAction={() => void historyQuery.refetch()} title="Chưa tải được dữ liệu" />
          ) : transactions.length ? (
            transactions.map((transaction, index) => (
              <View key={transaction.id}>
                <TransactionRow transaction={transaction} />
                {index < transactions.length - 1 ? <View style={styles.rowDivider} /> : null}
              </View>
            ))
          ) : (
            <ScreenState compact kind="empty" title="Chưa có giao dịch nào" />
          )}
        </Card>
      </View>
    </AppScreen>
  );
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const incoming = transaction.direction === 'incoming';
  const name = transaction.counterparty_name || transaction.payee_name;
  return (
    <View style={styles.transactionRow}>
      <View style={[styles.transactionAvatar, incoming ? styles.avatarIncoming : styles.avatarOutgoing]}>
        <MaterialCommunityIcons color={incoming ? colors.green : colors.primary} name={incoming ? 'arrow-down-left' : 'arrow-up-right'} size={20} />
      </View>
      <View style={styles.transactionText}>
        <Text numberOfLines={1} style={styles.transactionName}>{name}</Text>
        <Text style={styles.transactionMeta}>{transaction.bank_code || 'Timi'} · {formatShortDate(transaction.created_at)}</Text>
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.transactionAmount, incoming && styles.amountIncoming]}>
        {incoming ? '+' : '-'}{formatCurrency(transaction.amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  identity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md },
  greetingBox: { flex: 1, gap: 2 },
  greeting: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  hello: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.55 },
  balanceCard: { backgroundColor: colors.navy, borderRadius: 30, minHeight: 220, overflow: 'hidden', padding: spacing.xxl },
  balanceOrbLarge: { backgroundColor: colors.primary, borderRadius: 120, height: 220, opacity: 0.34, position: 'absolute', right: -68, top: -105, width: 220 },
  balanceOrbSmall: { backgroundColor: colors.cyan, borderRadius: 70, bottom: -80, height: 150, opacity: 0.17, position: 'absolute', right: 66, width: 150 },
  balanceTop: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  balanceTextBox: { flex: 1, gap: spacing.sm },
  balanceLabel: { color: '#B7C0DA', fontSize: 12, fontWeight: '700' },
  balance: { color: colors.white, fontSize: 31, fontWeight: '900', letterSpacing: -1 },
  eyeButton: { alignItems: 'center', backgroundColor: '#FFFFFF16', borderRadius: 14, height: 42, justifyContent: 'center', width: 42 },
  balanceDivider: { backgroundColor: '#FFFFFF17', height: 1, marginVertical: spacing.xl },
  balanceStats: { alignItems: 'center', flexDirection: 'row' },
  balanceStat: { flex: 1, gap: 5 },
  statDivider: { backgroundColor: '#FFFFFF1F', height: 42, marginHorizontal: spacing.lg, width: 1 },
  scoreRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  balanceStatValue: { color: colors.white, fontSize: 15, fontWeight: '900' },
  balanceStatLabel: { color: '#AAB5D0', fontSize: 10, fontWeight: '600' },
  actionsSection: { gap: spacing.md },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  actionItem: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 88, padding: spacing.md, width: '47.8%' },
  actionIcon: { alignItems: 'center', borderRadius: 16, height: 44, justifyContent: 'center', width: 44 },
  actionTextBox: { flex: 1, gap: 3 },
  actionLabel: { color: colors.text, fontSize: 13, fontWeight: '900' },
  actionDetail: { color: colors.textMuted, fontSize: 9, lineHeight: 13 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  transactionsSection: { gap: spacing.md },
  transactionCard: { paddingVertical: spacing.xs },
  transactionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  transactionAvatar: { alignItems: 'center', borderRadius: 16, height: 46, justifyContent: 'center', width: 46 },
  avatarIncoming: { backgroundColor: colors.greenSoft },
  avatarOutgoing: { backgroundColor: colors.primarySoft },
  transactionText: { flex: 1, gap: 4 },
  transactionName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  transactionMeta: { color: colors.textMuted, fontSize: 10 },
  transactionAmount: { color: colors.text, fontSize: 12, fontWeight: '900', maxWidth: '38%', textAlign: 'right' },
  amountIncoming: { color: colors.green },
  rowDivider: { backgroundColor: colors.border, height: 1, marginLeft: 58 },
});
