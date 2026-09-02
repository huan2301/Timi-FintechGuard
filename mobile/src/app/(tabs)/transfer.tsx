import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { RiskCoach } from '@/components/risk-coach';
import { TimiCompanion } from '@/components/timi-companion';
import { UserAvatar } from '@/components/user-avatar';
import { AppScreen, Card, FormField, InlineNotice, PageHeader, PrimaryButton, ProgressBar, ScreenState } from '@/components/ui';
import { banks, getBankName } from '@/constants/banks';
import { colors, radius, spacing } from '@/constants/theme';
import type { AssistantRiskContext } from '@/services/assistant';
import { assessTransfer, getRecentContacts, lookupRecipient } from '@/services/transactions';
import { useAuthStore } from '@/stores/auth-store';
import { useFaceStore } from '@/stores/face-store';
import { useTransferStore } from '@/stores/transfer-store';
import type { AssessResponse, RecentContact, RecipientLookupResponse } from '@/types/api';
import { formatCurrency, getApiErrorMessage } from '@/utils/format';

const demoContacts: RecentContact[] = [
  { id: '1', full_name: 'Hoàng Nam', account_number: '0912345678', bank_code: 'TIMI' },
  { id: '2', full_name: 'Thu Hà', account_number: '0388899123', bank_code: 'VCB' },
  { id: '3', full_name: 'Minh Khoa', account_number: '0123456789', bank_code: 'MBB' },
];

function normalizeBankCode(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'MB') return 'MBB';
  if (normalized === 'TIMI BANK' || normalized === 'TIMI') return 'TIMI';
  return banks.find((bank) => bank.code === normalized || bank.name.toUpperCase() === normalized)?.code || normalized;
}

function recipientKey(accountNumber: string, bankCode: string) {
  return accountNumber.replace(/\D/g, '') + '|' + bankCode;
}

export default function TransferScreen() {
  const demoMode = useAuthStore((state) => state.demoMode);
  const params = useLocalSearchParams<{
    accountNumber?: string;
    bankCode?: string;
    amount?: string;
    note?: string;
  }>();
  const prepareVerification = useTransferStore((state) => state.prepare);
  const clearFaceVerification = useFaceStore((state) => state.clearVerification);
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('TIMI');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [recipient, setRecipient] = useState<RecipientLookupResponse | null>(null);
  const [resolvedKey, setResolvedKey] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<AssessResponse | null>(null);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [checkProgress, setCheckProgress] = useState(0);
  const [flowNotice, setFlowNotice] = useState<{ tone: 'blue' | 'green' | 'red'; message: string } | null>(null);
  const contactsQuery = useQuery({
    queryKey: ['mobile-recent-contacts'],
    queryFn: () => getRecentContacts(6),
    enabled: !demoMode,
  });
  const contacts = demoMode ? demoContacts : (contactsQuery.data ?? []);
  const selectedBank = banks.find((bank) => bank.code === bankCode);
  const filteredBanks = useMemo(() => {
    const search = bankSearch.trim().toLowerCase();
    if (!search) return banks;
    return banks.filter((bank) => (bank.code + ' ' + bank.name).toLowerCase().includes(search));
  }, [bankSearch]);

  useEffect(() => {
    if (!params.accountNumber || !params.bankCode) return;
    const timer = setTimeout(() => {
      setAccountNumber(params.accountNumber!.replace(/\D/g, ''));
      setBankCode(normalizeBankCode(params.bankCode!));
      setAmount(params.amount ? params.amount.replace(/\D/g, '') : '');
      setNote(params.note || '');
      setRecipient(null);
      setResolvedKey('');
      setLookupError(null);
      setAssessment(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [params.accountNumber, params.amount, params.bankCode, params.note]);

  useEffect(() => {
    const digits = accountNumber.replace(/\D/g, '');
    const key = recipientKey(accountNumber, bankCode);
    const minimumLookupLength = bankCode === 'TIMI' ? 10 : 8;
    if (demoMode || digits.length < minimumLookupLength || !bankCode) {
      const resetTimer = setTimeout(() => {
        setLookupBusy(false);
        if (digits.length < minimumLookupLength) setLookupError(null);
      }, 0);
      return () => clearTimeout(resetTimer);
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setLookupBusy(true);
      setLookupError(null);
      void lookupRecipient(digits, bankCode)
        .then((resolved) => {
          if (cancelled) return;
          setRecipient(resolved);
          setResolvedKey(key);
        })
        .catch((error) => {
          if (cancelled) return;
          setRecipient(null);
          setResolvedKey('');
          setLookupError(getApiErrorMessage(error, 'Không tìm thấy tên người nhận cho tài khoản này.'));
        })
        .finally(() => {
          if (!cancelled) setLookupBusy(false);
        });
    }, 550);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accountNumber, bankCode, demoMode]);

  const chooseContact = (contact: RecentContact) => {
    setAccountNumber(contact.account_number.replace(/\D/g, ''));
    setBankCode(normalizeBankCode(contact.bank_code));
    setRecipient(null);
    setResolvedKey('');
    setLookupError(null);
    setAssessment(null);
  };

  const chooseBank = (code: string) => {
    setBankCode(code);
    setBankPickerOpen(false);
    setBankSearch('');
    setRecipient(null);
    setResolvedKey('');
    setLookupError(null);
    setAssessment(null);
  };

  const checkTransfer = async () => {
    const digits = accountNumber.replace(/\D/g, '');
    const numericAmount = Number(amount.replace(/\D/g, ''));
    if (!digits || !bankCode || numericAmount <= 0) {
      setFlowNotice({ tone: 'red', message: 'Nhập đủ ngân hàng, tài khoản người nhận và số tiền lớn hơn 0.' });
      return;
    }

    setBusy(true);
    setCheckProgress(0.25);
    setFlowNotice({ tone: 'blue', message: 'Đang đối chiếu tài khoản và tên người nhận...' });
    setAssessment(null);
    clearFaceVerification();

    try {
      let resolved: RecipientLookupResponse;
      if (demoMode) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        resolved = {
          account_number: digits,
          account_name: 'TRẦN HOÀNG NAM',
          bank_code: bankCode,
          source: 'trusted_recipient',
          risk_status: 'clear',
          risk_message: null,
          verification_token: 'demo-token',
        };
      } else if (recipient && resolvedKey === recipientKey(accountNumber, bankCode)) {
        resolved = recipient;
      } else {
        resolved = await lookupRecipient(digits, bankCode);
      }

      setRecipient(resolved);
      setResolvedKey(recipientKey(digits, bankCode));
      setCheckProgress(0.65);
      setFlowNotice({ tone: 'blue', message: 'Đã tìm thấy ' + resolved.account_name + '. Đang đánh giá an toàn giao dịch...' });
      const result = demoMode
        ? {
            transaction_id: 'demo-transaction',
            risk_score: 0.08,
            risk_level: 'safe' as const,
            explanation: 'Người nhận quen thuộc, thông tin tài khoản nhất quán và chưa có cảnh báo.',
            recommendation: 'Bạn có thể tiếp tục nhưng vẫn nên kiểm tra lại tên người nhận.',
            should_warn: false,
            requires_face_verification: false,
          }
        : await assessTransfer({
            accountNumber: digits,
            bankCode,
            amount: numericAmount,
            note: note.trim() || undefined,
            lookupToken: resolved.verification_token,
          });

      setAssessment(result);
      setCheckProgress(1);
      setFlowNotice(null);
      prepareVerification({
        accountNumber: digits,
        bankCode,
        amount: numericAmount,
        note: note.trim(),
        recipient: resolved,
        assessment: result,
      });
      router.push('/verify-transfer' as Href);
    } catch (error) {
      setCheckProgress(0);
      setFlowNotice({ tone: 'red', message: getApiErrorMessage(error, 'Không thể kiểm tra giao dịch. Vui lòng kiểm tra lại người nhận.') });
    } finally {
      setBusy(false);
    }
  };

  const riskContext = useMemo<AssistantRiskContext | null>(() => {
    if (!assessment?.should_warn || !recipient) return null;
    const compactAccount = recipient.account_number.replace(/\s/g, '');
    return {
      transaction_id: assessment.transaction_id,
      recipient_name: recipient.account_name,
      recipient_account_masked: compactAccount.length > 4 ? '***' + compactAccount.slice(-4) : '[đã ẩn]',
      bank_name: getBankName(recipient.bank_code),
      amount: Number(amount.replace(/\D/g, '')) || null,
      note: note.trim() || null,
      risk_level: assessment.risk_level === 'high' || assessment.risk_level === 'medium' ? assessment.risk_level : 'low',
      risk_score: Math.min(1, assessment.risk_score > 1 ? assessment.risk_score / 100 : assessment.risk_score),
      signals: (assessment.signals ?? []).map((signal) => signal.explanation).filter(Boolean).slice(0, 8),
      warning_message: assessment.warning?.message || assessment.explanation,
    };
  }, [amount, assessment, note, recipient]);

  return (
    <>
      <AppScreen>
        <PageHeader eyebrow="TIMI GUARD" subtitle="Đối chiếu tên người nhận trước, xác minh giao dịch sau." title="Chuyển tiền an toàn" />

        <View style={styles.steps}>
          {[
            { label: 'Thông tin', icon: 'account-edit-outline' as const },
            { label: 'Kiểm tra', icon: 'shield-search' as const },
            { label: 'Xác minh', icon: 'check-decagram-outline' as const },
          ].map((step, index) => (
            <View key={step.label} style={styles.stepItem}>
              <View style={[styles.stepIcon, index === 0 && styles.stepIconActive]}>
                <MaterialCommunityIcons color={index === 0 ? colors.white : colors.textMuted} name={step.icon} size={16} />
              </View>
              <Text style={[styles.stepLabel, index === 0 && styles.stepLabelActive]}>{step.label}</Text>
              {index < 2 ? <View style={styles.stepLine} /> : null}
            </View>
          ))}
        </View>

        {flowNotice ? <InlineNotice message={flowNotice.message} tone={flowNotice.tone} /> : null}

        {contactsQuery.isLoading && !demoMode ? (
          <Card style={styles.contactsLoading}><ScreenState compact kind="loading" title="Đang tải người nhận gần đây" /></Card>
        ) : contactsQuery.isError && !demoMode ? (
          <Pressable onPress={() => void contactsQuery.refetch()}><InlineNotice message="Không tải được người nhận gần đây. Chạm để thử lại." tone="red" /></Pressable>
        ) : contacts.length ? (
          <View style={styles.contactsSection}>
            <Text style={styles.label}>Người nhận gần đây</Text>
            <View style={styles.contactsRow}>
              {contacts.slice(0, 4).map((contact) => (
                <Pressable key={contact.id} onPress={() => chooseContact(contact)} style={styles.contact}>
                  <UserAvatar name={contact.full_name} size={52} uri={contact.avatar_url} />
                  <Text numberOfLines={1} style={styles.contactName}>{contact.full_name.split(' ').at(-1)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <Card style={styles.formCard}>
          <Text style={styles.label}>Ngân hàng nhận</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Chọn ngân hàng nhận" onPress={() => setBankPickerOpen(true)} style={styles.bankPicker}>
            <View style={styles.bankPickerIcon}><MaterialCommunityIcons color={colors.primary} name="bank-outline" size={21} /></View>
            <View style={styles.bankPickerText}>
              <Text style={styles.bankName}>{selectedBank?.name || getBankName(bankCode)}</Text>
              <Text style={styles.bankCode}>{bankCode}</Text>
            </View>
            <MaterialCommunityIcons color={colors.textMuted} name="chevron-down" size={22} />
          </Pressable>

          <FormField
            icon="credit-card-outline"
            keyboardType="number-pad"
            label="Số tài khoản / số điện thoại"
            onChangeText={(value) => {
              setAccountNumber(value.replace(/\D/g, ''));
              setRecipient(null);
              setResolvedKey('');
              setLookupError(null);
              setAssessment(null);
            }}
            placeholder="Nhập thông tin người nhận"
            value={accountNumber}
          />

          {lookupBusy ? (
            <View style={styles.lookupNotice}><ActivityIndicator color={colors.primary} size="small" /><Text style={styles.lookupText}>Đang đối chiếu tên người nhận...</Text></View>
          ) : recipient && resolvedKey === recipientKey(accountNumber, bankCode) ? (
            <View style={styles.lookupSuccess}>
              <View style={styles.lookupSuccessIcon}><MaterialCommunityIcons color={colors.green} name="check" size={17} /></View>
              <View style={styles.lookupTextBox}>
                <Text style={styles.lookupCaption}>Đã đối chiếu người nhận</Text>
                <Text style={styles.lookupName}>{recipient.account_name}</Text>
                <Text style={styles.lookupMeta}>{getBankName(recipient.bank_code)} · {recipient.account_number}</Text>
              </View>
            </View>
          ) : lookupError ? (
            <InlineNotice message={lookupError} tone="red" />
          ) : accountNumber.replace(/\D/g, '').length >= (bankCode === 'TIMI' ? 10 : 8) ? (
            <InlineNotice message="Đang chờ kết quả đối chiếu tên người nhận." tone="blue" />
          ) : null}

          <FormField
            icon="cash-multiple"
            keyboardType="number-pad"
            label="Số tiền"
            onChangeText={(value) => { setAmount(value.replace(/\D/g, '')); setAssessment(null); }}
            placeholder="0 ₫"
            value={amount ? formatCurrency(Number(amount)).replace(' ₫', '') : ''}
          />
          <FormField
            icon="message-text-outline"
            label="Nội dung"
            onChangeText={(value) => { setNote(value); setAssessment(null); }}
            placeholder="Nhập lời nhắn (không bắt buộc)"
            value={note}
          />
          <PrimaryButton icon="shield-search" label="Kiểm tra an toàn" loading={busy} loadingLabel={checkProgress < 0.6 ? 'Đang xác minh người nhận' : 'Đang đánh giá rủi ro'} onPress={() => void checkTransfer()} />
          {busy ? <ProgressBar value={checkProgress} /> : null}
        </Card>

        {riskContext && !demoMode ? <RiskCoach context={riskContext} demoMode={false} /> : null}
        <TimiCompanion
          compact
          context="Timi đồng hành"
          defaultPrompt="Hãy hướng dẫn tôi kiểm tra tên người nhận và dấu hiệu lừa đảo trước khi chuyển tiền."
          message="Bạn sẽ luôn thấy tên người nhận trước khi sang bước xác minh. Nếu còn nghi ngờ, hãy hỏi Timi trước khi tiếp tục."
          suggestions={['Tôi nên kiểm tra gì trước khi chuyển?', 'Dấu hiệu nào cho thấy tài khoản có thể giả mạo?']}
        />
      </AppScreen>

      <Modal animationType="slide" onRequestClose={() => setBankPickerOpen(false)} transparent visible={bankPickerOpen}>
        <View style={styles.modalBackdrop}>
          <View style={styles.bankModal}>
            <View style={styles.modalHeader}>
              <View><Text style={styles.modalTitle}>Chọn ngân hàng</Text><Text style={styles.modalSubtitle}>Danh sách ngân hàng giống trên bản web</Text></View>
              <Pressable accessibilityLabel="Đóng danh sách ngân hàng" hitSlop={10} onPress={() => setBankPickerOpen(false)} style={styles.closeButton}><MaterialCommunityIcons color={colors.text} name="close" size={21} /></Pressable>
            </View>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons color={colors.textMuted} name="magnify" size={20} />
              <TextInput autoCapitalize="characters" onChangeText={setBankSearch} placeholder="Tìm theo tên hoặc mã ngân hàng" placeholderTextColor="#9AA5B8" style={styles.searchInput} value={bankSearch} />
            </View>
            <View style={styles.bankListContainer}>
              <FlatList
                data={filteredBanks}
                keyExtractor={(item) => item.code}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const selected = item.code === bankCode;
                  return (
                    <Pressable onPress={() => chooseBank(item.code)} style={[styles.bankRow, selected && styles.bankRowSelected]}>
                      <View style={[styles.bankLogo, selected && styles.bankLogoSelected]}><Text style={[styles.bankLogoText, selected && styles.bankLogoTextSelected]}>{item.code.slice(0, 3)}</Text></View>
                      <View style={styles.bankRowText}><Text style={styles.bankRowName}>{item.name}</Text><Text style={styles.bankRowCode}>{item.code}</Text></View>
                      {selected ? <MaterialCommunityIcons color={colors.primary} name="check-circle" size={22} /> : null}
                    </Pressable>
                  );
                }}
                showsVerticalScrollIndicator={false}
                style={styles.bankList}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  steps: { alignItems: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.lg },
  stepItem: { alignItems: 'center', flex: 1, gap: 6, position: 'relative' },
  stepIcon: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 15, height: 30, justifyContent: 'center', width: 30, zIndex: 2 },
  stepIconActive: { backgroundColor: colors.primary },
  stepLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  stepLabelActive: { color: colors.text, fontWeight: '900' },
  stepLine: { backgroundColor: colors.border, height: 2, left: '66%', position: 'absolute', top: 14, width: '68%', zIndex: 1 },
  contactsSection: { gap: spacing.md },
  contactsLoading: { padding: 0 },
  label: { color: colors.text, fontSize: 14, fontWeight: '800' },
  contactsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  contact: { alignItems: 'center', gap: 6, width: '23%' },
  contactName: { color: colors.textMuted, fontSize: 11, maxWidth: 64 },
  formCard: { gap: spacing.lg },
  bankPicker: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 64, paddingHorizontal: spacing.md },
  bankPickerIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.small, height: 38, justifyContent: 'center', width: 38 },
  bankPickerText: { flex: 1, gap: 3 },
  bankName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  bankCode: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  lookupNotice: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.medium, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  lookupText: { color: colors.primaryDark, flex: 1, fontSize: 12, fontWeight: '700' },
  lookupSuccess: { alignItems: 'center', backgroundColor: colors.greenSoft, borderColor: '#BFEBDD', borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  lookupSuccessIcon: { alignItems: 'center', backgroundColor: colors.white, borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
  lookupTextBox: { flex: 1, gap: 2 },
  lookupCaption: { color: '#087B5C', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  lookupName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  lookupMeta: { color: colors.textMuted, fontSize: 11 },
  modalBackdrop: { backgroundColor: '#071A3DB8', flex: 1, justifyContent: 'flex-end' },
  bankModal: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, height: '78%', maxHeight: '88%', padding: spacing.xl },
  modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  modalTitle: { color: colors.text, fontSize: 21, fontWeight: '900' },
  modalSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  closeButton: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  searchBox: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
  searchInput: { color: colors.text, flex: 1, fontSize: 14, minHeight: 48 },
  bankListContainer: { flex: 1, minHeight: 0 },
  bankList: { flex: 1, marginTop: spacing.md, minHeight: 0 },
  bankRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  bankRowSelected: { backgroundColor: colors.primarySoft, borderRadius: radius.medium, paddingHorizontal: spacing.sm },
  bankLogo: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  bankLogoSelected: { backgroundColor: colors.primary },
  bankLogoText: { color: colors.primaryDark, fontSize: 10, fontWeight: '900' },
  bankLogoTextSelected: { color: colors.white },
  bankRowText: { flex: 1, gap: 3 },
  bankRowName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  bankRowCode: { color: colors.textMuted, fontSize: 11 },
});
