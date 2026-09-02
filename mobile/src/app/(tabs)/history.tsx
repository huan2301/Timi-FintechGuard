import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TimiCompanion } from '@/components/timi-companion';
import { AppScreen, Card, PageHeader, ScreenState, StatusPill } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { getTransactionHistory } from '@/services/transactions';
import { useAuthStore } from '@/stores/auth-store';
import type { Transaction } from '@/types/api';
import { formatCurrency, formatShortDate, initials } from '@/utils/format';

type Filter = 'all' | 'incoming' | 'outgoing';

const demoHistory: Transaction[] = [
  {
    id: 'h1', payee_account: '0912345678', payee_name: 'Trần Hoàng Nam', direction: 'outgoing',
    counterparty_name: 'Trần Hoàng Nam', counterparty_account: '0912345678', bank_code: 'Timi',
    amount: 850_000, currency: 'VND', transaction_status: 'completed', risk_level: 'safe',
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: 'h2', payee_account: '0388899123', payee_name: 'Lê Thu Hà', direction: 'incoming',
    counterparty_name: 'Lê Thu Hà', counterparty_account: '0388899123', bank_code: 'VCB',
    amount: 2_500_000, currency: 'VND', transaction_status: 'completed', risk_level: 'low',
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
  },
  {
    id: 'h3', payee_account: '0123456789', payee_name: 'Cửa hàng An Nhiên', direction: 'outgoing',
    counterparty_name: 'Cửa hàng An Nhiên', counterparty_account: '0123456789', bank_code: 'MB',
    amount: 320_000, currency: 'VND', transaction_status: 'completed', risk_level: 'medium',
    created_at: new Date(Date.now() - 172_800_000).toISOString(),
  },
  {
    id: 'h4', payee_account: '0988777666', payee_name: 'Nguyễn Minh Khoa', direction: 'incoming',
    counterparty_name: 'Nguyễn Minh Khoa', counterparty_account: '0988777666', bank_code: 'ACB',
    amount: 1_200_000, currency: 'VND', transaction_status: 'completed', risk_level: 'safe',
    created_at: new Date(Date.now() - 259_200_000).toISOString(),
  },
];

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'incoming', label: 'Tiền vào' },
  { key: 'outgoing', label: 'Tiền ra' },
];

export default function HistoryScreen() {
  const demoMode = useAuthStore((state) => state.demoMode);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const historyQuery = useInfiniteQuery({
    queryKey: ['mobile-history'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getTransactionHistory({ limit: 20, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
    enabled: !demoMode,
  });
  const loadedTransactions = historyQuery.data?.pages.flatMap((page) => page.items);
  const source = useMemo(
    () => demoMode ? demoHistory : (loadedTransactions ?? []),
    [demoMode, loadedTransactions],
  );
  const transactions = useMemo(
    () => filter === 'all' ? source : source.filter((item) => item.direction === filter),
    [filter, source],
  );

  const incoming = source.filter((item) => item.direction === 'incoming').reduce((sum, item) => sum + item.amount, 0);
  const outgoing = source.filter((item) => item.direction === 'outgoing').reduce((sum, item) => sum + item.amount, 0);
  const flaggedCount = source.filter((item) => item.risk_level === 'medium' || item.risk_level === 'high').length;
  const cashFlowPrompt = `Giúp tôi nhìn lại dòng tiền: tổng tiền vào ${formatCurrency(incoming)}, tiền ra ${formatCurrency(outgoing)}, có ${flaggedCount} giao dịch từng được đánh dấu cần kiểm tra. Tôi nên chú ý điều gì?`;

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Dòng tiền"
        subtitle="Theo dõi giao dịch và mức độ an toàn theo thời gian."
        title="Lịch sử giao dịch"
      />

      <View style={styles.summaryRow}>
        <Card style={styles.summaryCard}>
          <View style={[styles.summaryIcon, styles.incomingIcon]}>
            <MaterialCommunityIcons color={colors.green} name="arrow-down-left" size={22} />
          </View>
          <Text style={styles.summaryLabel}>Tiền vào</Text>
          <Text numberOfLines={1} style={[styles.summaryValue, styles.incomingValue]}>{formatCurrency(incoming)}</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <View style={[styles.summaryIcon, styles.outgoingIcon]}>
            <MaterialCommunityIcons color={colors.primary} name="arrow-up-right" size={22} />
          </View>
          <Text style={styles.summaryLabel}>Tiền ra</Text>
          <Text numberOfLines={1} style={styles.summaryValue}>{formatCurrency(outgoing)}</Text>
        </Card>
      </View>

      {!historyQuery.isLoading || demoMode ? (
        <TimiCompanion
          compact
          context="Timi đọc dòng tiền"
          defaultPrompt={cashFlowPrompt}
          message={flaggedCount > 0
            ? `Có ${flaggedCount} giao dịch cần bạn xem kỹ hơn. Mình có thể cùng bạn rà từng dấu hiệu.`
            : incoming || outgoing
              ? `Dòng tiền ròng hiện là ${formatCurrency(incoming - outgoing)}. Mình có thể giúp bạn hiểu con số này.`
              : 'Khi có giao dịch, mình sẽ giúp bạn nhận ra biến động đáng chú ý.'}
          suggestions={[
            { label: 'Phân tích dòng tiền của tôi', prompt: cashFlowPrompt },
            'Làm sao nhận biết một giao dịch bất thường?',
          ]}
        />
      ) : null}

      <View style={styles.filters}>
        {filters.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setFilter(item.key)}
            style={[styles.filter, filter === item.key && styles.filterActive]}>
            <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <Card style={styles.listCard}>
        {historyQuery.isLoading && !demoMode ? (
          <ScreenState kind="loading" message="Đang đồng bộ các giao dịch mới nhất." title="Đang tải lịch sử" />
        ) : historyQuery.isError && !demoMode ? (
          <ScreenState
            actionLabel="Thử lại"
            kind="error"
            message="Kiểm tra kết nối mạng hoặc URL API rồi tải lại."
            onAction={() => void historyQuery.refetch()}
            title="Không tải được lịch sử"
          />
        ) : transactions.length ? (
          transactions.map((transaction, index) => (
            <View key={transaction.id}>
              <HistoryRow onPress={() => setSelectedTransaction(transaction)} transaction={transaction} />
              {index < transactions.length - 1 ? <View style={styles.divider} /> : null}
            </View>
          ))
        ) : (
          <ScreenState kind="empty" message="Thử chọn bộ lọc khác hoặc thực hiện giao dịch đầu tiên." title="Không có giao dịch phù hợp" />
        )}
      </Card>

      {!demoMode && historyQuery.hasNextPage && !historyQuery.isError ? (
        <LoadMoreButton
          loading={historyQuery.isFetchingNextPage}
          onPress={() => void historyQuery.fetchNextPage()}
        />
      ) : null}

      <TransactionDetailModal onClose={() => setSelectedTransaction(null)} transaction={selectedTransaction} />
    </AppScreen>
  );
}

function HistoryRow({ transaction, onPress }: { transaction: Transaction; onPress: () => void }) {
  const incoming = transaction.direction === 'incoming';
  const name = transaction.counterparty_name || transaction.payee_name;
  const riskTone = transaction.risk_level === 'high'
    ? 'red'
    : transaction.risk_level === 'medium'
      ? 'amber'
      : 'green';

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={[styles.avatar, incoming ? styles.avatarIncoming : styles.avatarOutgoing]}>
        <Text style={[styles.avatarText, incoming && styles.avatarTextIncoming]}>{initials(name)}</Text>
      </View>
      <View style={styles.rowCenter}>
        <Text numberOfLines={1} style={styles.name}>{name}</Text>
        <Text style={styles.meta}>{transaction.bank_code || 'Timi'} · {formatShortDate(transaction.created_at)}</Text>
        <StatusPill label={riskTone === 'green' ? 'An toàn' : 'Đã kiểm tra'} tone={riskTone} />
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.amount, incoming && styles.amountIncoming]}>
        {incoming ? '+' : '-'}{formatCurrency(transaction.amount)}
      </Text>
    </Pressable>
  );
}

function LoadMoreButton({ loading, onPress }: { loading: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [styles.loadMoreButton, (pressed || loading) && styles.loadMoreButtonPressed]}>
      <MaterialCommunityIcons color={colors.primary} name="history" size={19} />
      <Text style={styles.loadMoreText}>{loading ? 'Đang tải thêm giao dịch...' : 'Tải thêm giao dịch'}</Text>
    </Pressable>
  );
}

function TransactionDetailModal({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  if (!transaction) return null;

  const incoming = transaction.direction === 'incoming';
  const status = getStatus(transaction.transaction_status);
  const risk = getRisk(transaction.risk_level);
  const counterpartyName = transaction.counterparty_name || transaction.payee_name || 'Chưa xác định';
  const counterpartyAccount = transaction.counterparty_account || transaction.payee_account || 'Không có';

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.modalBackdrop}>
        <Pressable accessibilityLabel="Đóng chi tiết giao dịch" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={styles.modalEyebrow}>CHI TIẾT GIAO DỊCH</Text>
              <Text numberOfLines={1} style={styles.modalTitle}>{counterpartyName}</Text>
            </View>
            <Pressable accessibilityLabel="Đóng" hitSlop={10} onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons color={colors.textMuted} name="close" size={21} />
            </Pressable>
          </View>

          <View style={styles.modalAmountBox}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.modalAmount, incoming && styles.amountIncoming]}>
              {incoming ? '+' : '-'}{formatCurrency(transaction.amount)}
            </Text>
            <StatusPill label={status.label} tone={status.tone} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
            <DetailRow label="Đối tác" value={counterpartyName} />
            <DetailRow label="Tài khoản" mono value={counterpartyAccount} />
            <DetailRow label="Ngân hàng" value={transaction.bank_code || 'Timi Bank'} />
            <DetailRow label="Loại giao dịch" value={incoming ? 'Nhận tiền' : 'Chuyển tiền'} />
            <DetailRow label="Nội dung" value={transaction.note || 'Không có nội dung'} />
            <DetailRow label="Thời gian" value={formatFullDate(transaction.created_at)} />
            <DetailRow label="Trạng thái" value={status.label} />
            <DetailRow label="Mức độ rủi ro" value={risk.label} />
            {transaction.risk_reason ? <DetailRow label="Nhận xét an toàn" value={transaction.risk_reason} /> : null}
            <DetailRow label="Mã giao dịch" mono value={transaction.id} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={[styles.detailValue, mono && styles.detailValueMono]}>{value}</Text>
    </View>
  );
}

function getStatus(status: string) {
  if (status === 'completed') return { label: 'Hoàn tất', tone: 'green' as const };
  if (status === 'cancelled') return { label: 'Đã hủy', tone: 'amber' as const };
  if (status === 'failed') return { label: 'Không thành công', tone: 'red' as const };
  return { label: status || 'Đang xử lý', tone: 'blue' as const };
}

function getRisk(level: Transaction['risk_level']) {
  if (level === 'high') return { label: 'Cao' };
  if (level === 'medium') return { label: 'Cần kiểm tra' };
  if (level === 'low') return { label: 'Thấp' };
  return { label: 'An toàn' };
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: spacing.md },
  summaryCard: { flex: 1, gap: spacing.sm, minWidth: 0, padding: spacing.lg },
  summaryIcon: { alignItems: 'center', borderRadius: radius.small, height: 38, justifyContent: 'center', width: 38 },
  incomingIcon: { backgroundColor: colors.greenSoft },
  outgoingIcon: { backgroundColor: colors.primarySoft },
  summaryLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  summaryValue: { color: colors.text, fontSize: 15, fontWeight: '900' },
  incomingValue: { color: colors.green },
  filters: { backgroundColor: colors.surfaceMuted, borderRadius: radius.medium, flexDirection: 'row', padding: 4 },
  filter: { alignItems: 'center', borderRadius: 12, flex: 1, paddingVertical: 10 },
  filterActive: { backgroundColor: colors.white },
  filterText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: colors.primary, fontWeight: '900' },
  listCard: { paddingVertical: spacing.sm },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  avatar: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 16, height: 48, justifyContent: 'center', width: 48 },
  avatarIncoming: { backgroundColor: colors.greenSoft },
  avatarOutgoing: { backgroundColor: colors.primarySoft },
  avatarText: { color: colors.primaryDark, fontSize: 13, fontWeight: '900' },
  avatarTextIncoming: { color: '#087B5C' },
  rowCenter: { flex: 1, gap: 4 },
  name: { color: colors.text, fontSize: 14, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 10 },
  amount: { color: colors.text, fontSize: 12, fontWeight: '900', maxWidth: '38%', textAlign: 'right' },
  amountIncoming: { color: colors.green },
  divider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginLeft: 60 },
  loadMoreButton: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  loadMoreButtonPressed: { opacity: 0.62 },
  loadMoreText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  modalBackdrop: { backgroundColor: '#07112680', flex: 1, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: '88%', paddingBottom: spacing.xxxl, paddingHorizontal: spacing.xl },
  modalHandle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: 2, height: 4, marginBottom: spacing.lg, marginTop: spacing.md, width: 42 },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  modalHeaderText: { flex: 1 },
  modalEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 4 },
  closeButton: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, height: 38, justifyContent: 'center', width: 38 },
  modalAmountBox: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.medium, gap: spacing.sm, marginVertical: spacing.lg, padding: spacing.lg },
  modalAmount: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  modalScroll: { flexGrow: 0 },
  detailRow: { alignItems: 'flex-start', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: 13 },
  detailLabel: { color: colors.textMuted, flex: 0.8, fontSize: 12, lineHeight: 18 },
  detailValue: { color: colors.text, flex: 1.2, fontSize: 12, fontWeight: '700', lineHeight: 18, textAlign: 'right' },
  detailValueMono: { fontFamily: 'monospace', fontSize: 11 },
  emptyBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
  empty: { color: colors.textMuted, fontSize: 13, paddingVertical: spacing.xl, textAlign: 'center' },
});
