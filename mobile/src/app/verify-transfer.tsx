import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, Redirect, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { RiskCoach } from '@/components/risk-coach';
import { TimiCompanion } from '@/components/timi-companion';
import { AppScreen, Card, FormField, InlineNotice, PageHeader, PrimaryButton, ProgressBar, StatusPill } from '@/components/ui';
import { getBankName } from '@/constants/banks';
import { colors, radius, spacing } from '@/constants/theme';
import { getTransactionPinStatus } from '@/services/account';
import type { AssistantRiskContext } from '@/services/assistant';
import { cancelTransfer, submitTransferDecision } from '@/services/transactions';
import { useAuthStore } from '@/stores/auth-store';
import { useFaceStore } from '@/stores/face-store';
import { useTransferStore } from '@/stores/transfer-store';
import { getApiErrorMessage } from '@/utils/format';

type ResultModal = {
  kind: 'success' | 'error';
  title: string;
  message: string;
};

export default function VerifyTransferScreen() {
  const flow = useTransferStore((state) => state.flow);
  const clearFlow = useTransferStore((state) => state.clear);
  const demoMode = useAuthStore((state) => state.demoMode);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const queryClient = useQueryClient();
  const faceToken = useFaceStore((state) => state.token);
  const faceTransactionId = useFaceStore((state) => state.transactionId);
  const clearFaceVerification = useFaceStore((state) => state.clearVerification);
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [resultModal, setResultModal] = useState<ResultModal | null>(null);
  const pinStatusQuery = useQuery({
    queryKey: ['mobile-pin-status'],
    queryFn: getTransactionPinStatus,
    enabled: Boolean(flow) && !demoMode,
  });

  const warning = flow?.assessment.warning;
  useEffect(() => {
    if (!warning) {
      const resetTimer = setTimeout(() => setRemainingSeconds(0), 0);
      return () => clearTimeout(resetTimer);
    }
    const availableAt = new Date(warning.displayed_at).getTime() + warning.countdown_seconds * 1000;
    const update = () => setRemainingSeconds(Math.max(0, Math.ceil((availableAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [warning]);

  const faceVerified = Boolean(
    flow?.assessment.requires_face_verification &&
      faceToken &&
      faceTransactionId === flow.assessment.transaction_id,
  );
  const riskTone = flow?.assessment.risk_level === 'high'
    ? 'red'
    : flow?.assessment.risk_level === 'medium' || flow?.recipient.risk_status === 'caution'
      ? 'amber'
      : 'green';
  const riskScore = flow ? Math.round(flow.assessment.risk_score <= 1 ? flow.assessment.risk_score * 100 : flow.assessment.risk_score) : 0;
  const riskContext = useMemo<AssistantRiskContext | null>(() => {
    if (!flow?.assessment.should_warn) return null;
    const compactAccount = flow.recipient.account_number.replace(/\s/g, '');
    return {
      transaction_id: flow.assessment.transaction_id,
      recipient_name: flow.recipient.account_name,
      recipient_account_masked: compactAccount.length > 4 ? '***' + compactAccount.slice(-4) : '[đã ẩn]',
      bank_name: getBankName(flow.recipient.bank_code),
      amount: flow.amount,
      note: flow.note || null,
      risk_level: flow.assessment.risk_level === 'high' || flow.assessment.risk_level === 'medium' ? flow.assessment.risk_level : 'low',
      risk_score: Math.min(1, flow.assessment.risk_score > 1 ? flow.assessment.risk_score / 100 : flow.assessment.risk_score),
      signals: (flow.assessment.signals ?? []).map((signal) => signal.explanation).filter(Boolean).slice(0, 8),
      warning_message: flow.assessment.warning?.message || flow.assessment.explanation,
    };
  }, [flow]);

  if (!flow) return <Redirect href="/transfer" />;

  const openFaceVerification = () => {
    clearFaceVerification();
    router.push(
      ('/face?mode=verify&transactionId=' + encodeURIComponent(flow.assessment.transaction_id) + '&amount=' + encodeURIComponent(flow.amount) + '&nonce=' + encodeURIComponent(flow.assessment.face_verification_nonce || '')) as Href,
    );
  };

  const finish = () => {
    clearFlow();
    clearFaceVerification();
    router.replace('/(tabs)');
  };

  const submit = async () => {
    if (remainingSeconds > 0) {
      setResultModal({ kind: 'error', title: 'Chưa thể xác nhận', message: 'Vui lòng đọc cảnh báo thêm ' + remainingSeconds + ' giây trước khi tiếp tục.' });
      return;
    }
    if (flow.assessment.requires_face_verification) {
      if (!faceVerified) {
        openFaceVerification();
        return;
      }
    } else if (!/^\d{4,6}$/.test(pin)) {
      setResultModal({ kind: 'error', title: 'PIN chưa hợp lệ', message: 'Hãy nhập đúng mã PIN giao dịch gồm 4 đến 6 chữ số.' });
      return;
    }

    setSubmitting(true);
    try {
      const response = demoMode
        ? { transaction_status: 'completed' as const }
        : await submitTransferDecision(
            flow.assessment.transaction_id,
            flow.assessment.requires_face_verification
              ? { faceVerificationToken: faceToken as string }
              : { pin },
          );
      if (response.transaction_status !== 'completed') {
        throw new Error('Giao dịch chưa hoàn tất. Trạng thái hiện tại: ' + response.transaction_status);
      }
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['mobile-history'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-history-preview'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-account-overview'] }),
        refreshUser(),
      ]);
      setResultModal({
        kind: 'success',
        title: 'Chuyển tiền thành công',
        message: 'Giao dịch đã được ghi nhận. Bạn có thể xem lại tại mục Lịch sử.',
      });
    } catch (error) {
      setResultModal({
        kind: 'error',
        title: 'Chuyển tiền thất bại',
        message: getApiErrorMessage(error, 'Không thể hoàn tất giao dịch. Tiền chưa được xác nhận chuyển. Hãy kiểm tra lại và thử lại.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const requestCancel = () => {
    Alert.alert('Dừng giao dịch?', 'Giao dịch đang chờ xác minh sẽ được hủy và không trừ tiền.', [
      { text: 'Tiếp tục kiểm tra', style: 'cancel' },
      {
        text: 'Hủy giao dịch',
        style: 'destructive',
        onPress: () => {
          setCancelling(true);
          const request = demoMode ? Promise.resolve() : cancelTransfer(flow.assessment.transaction_id);
          void request
            .then(() => {
              clearFlow();
              clearFaceVerification();
              router.replace('/transfer');
            })
            .catch((error) => setResultModal({
              kind: 'error',
              title: 'Không thể hủy giao dịch',
              message: getApiErrorMessage(error, 'Vui lòng thử lại sau.'),
            }))
            .finally(() => setCancelling(false));
        },
      },
    ]);
  };

  return (
    <>
      <AppScreen>
        <PageHeader
          action={(
            <Pressable accessibilityLabel="Quay lại chuyển tiền" disabled={submitting || cancelling} hitSlop={10} onPress={() => router.back()} style={styles.backButton}>
              <MaterialCommunityIcons color={colors.text} name="arrow-left" size={21} />
            </Pressable>
          )}
          eyebrow="BƯỚC CUỐI · TIMI GUARD"
          subtitle="Kiểm tra lại người nhận rồi xác minh để hoàn tất."
          title="Xác minh giao dịch"
        />

        <View style={styles.progressHeader}>
          <View style={styles.progressStepDone}><MaterialCommunityIcons color={colors.white} name="check" size={15} /></View>
          <View style={styles.progressLineDone} />
          <View style={styles.progressStepActive}><MaterialCommunityIcons color={colors.white} name={flow.assessment.requires_face_verification ? 'face-recognition' : 'shield-key-outline'} size={16} /></View>
          <View style={styles.progressLine} />
          <View style={styles.progressStep}><MaterialCommunityIcons color={colors.textMuted} name="check-decagram-outline" size={16} /></View>
        </View>
        <View style={styles.progressLabels}><Text style={styles.progressLabelDone}>Đã kiểm tra</Text><Text style={styles.progressLabelActive}>Xác minh</Text><Text style={styles.progressLabel}>Hoàn tất</Text></View>

        <Card style={styles.recipientCard}>
          <View style={styles.cardHeading}>
            <View style={styles.headingIcon}><MaterialCommunityIcons color={colors.primary} name="account-check-outline" size={24} /></View>
            <View style={styles.headingText}><Text style={styles.eyebrow}>NGƯỜI NHẬN ĐÃ ĐỐI CHIẾU</Text><Text style={styles.recipientName}>{flow.recipient.account_name}</Text></View>
            <StatusPill label={flow.recipient.risk_status === 'caution' ? 'Cẩn thận' : 'Đã khớp'} tone={flow.recipient.risk_status === 'caution' ? 'amber' : 'green'} />
          </View>
          <View style={styles.details}>
            <View><Text style={styles.detailLabel}>Ngân hàng</Text><Text style={styles.detailValue}>{getBankName(flow.bankCode)}</Text></View>
            <View><Text style={styles.detailLabel}>Số tài khoản</Text><Text style={styles.detailValue}>{flow.accountNumber}</Text></View>
            <View><Text style={styles.detailLabel}>Số tiền</Text><Text style={styles.amount}>{new Intl.NumberFormat('vi-VN').format(flow.amount)} ₫</Text></View>
          </View>
          {flow.note ? <View style={styles.note}><MaterialCommunityIcons color={colors.primary} name="message-text-outline" size={17} /><Text style={styles.noteText}>{flow.note}</Text></View> : null}
        </Card>

        <Card style={[styles.securityCard, riskTone === 'red' && styles.securityCardDanger]}>
          <View style={styles.securityHeader}>
            <View style={[styles.securityIcon, { backgroundColor: riskTone === 'red' ? colors.redSoft : riskTone === 'amber' ? colors.amberSoft : colors.greenSoft }]}>
              <MaterialCommunityIcons color={riskTone === 'red' ? colors.red : riskTone === 'amber' ? colors.amber : colors.green} name={riskTone === 'red' ? 'alert-octagon-outline' : 'shield-check'} size={27} />
            </View>
            <View style={styles.securityText}><Text style={styles.securityTitle}>{flow.assessment.warning?.title || 'Kiểm tra an toàn hoàn tất'}</Text><Text style={styles.securityDescription}>Mức đánh giá: {flow.assessment.risk_level === 'safe' ? 'An toàn' : 'Cần xem xét'} · {riskScore}/100</Text></View>
          </View>
          <Text style={styles.explanation}>{flow.assessment.explanation}</Text>
          <View style={styles.recommendation}><MaterialCommunityIcons color={colors.primary} name="lightbulb-on-outline" size={18} /><Text style={styles.recommendationText}>{flow.assessment.recommendation}</Text></View>
          {warning ? <View style={styles.warningBox}><MaterialCommunityIcons color={colors.red} name="timer-alert-outline" size={21} /><View style={styles.warningTextBox}><Text style={styles.warningTitle}>{warning.title}</Text><Text style={styles.warningText}>{warning.message}</Text><Text style={styles.countdown}>{remainingSeconds > 0 ? 'Đọc cảnh báo thêm ' + remainingSeconds + 's' : 'Đã đọc xong cảnh báo'}</Text></View></View> : null}
        </Card>

        {riskContext ? <RiskCoach context={riskContext} demoMode={demoMode} /> : null}
        <TimiCompanion
          compact
          context="Timi ở cạnh bạn"
          defaultPrompt={'Hãy giúp tôi kiểm tra lần cuối giao dịch ' + new Intl.NumberFormat('vi-VN').format(flow.amount) + ' đồng tới ' + flow.recipient.account_name + '.'}
          message="Nếu còn bất kỳ nghi ngờ nào, bạn có thể hỏi Timi trước khi xác minh."
          suggestions={['Tôi cần tự kiểm tra gì lần cuối?', 'Nếu người nhận thúc giục thì tôi nên làm gì?']}
        />

        <Card style={styles.verifyCard}>
          <View style={styles.verifyTitleRow}>
            <MaterialCommunityIcons color={colors.primary} name={flow.assessment.requires_face_verification ? 'face-recognition' : 'shield-key-outline'} size={23} />
            <View style={styles.verifyTitleText}><Text style={styles.verifyTitle}>{flow.assessment.requires_face_verification ? 'Xác minh bằng khuôn mặt' : 'Xác nhận bằng PIN giao dịch'}</Text><Text style={styles.verifySubtitle}>{flow.assessment.requires_face_verification ? 'Token chỉ có hiệu lực cho giao dịch này.' : 'PIN không được lưu trên thiết bị.'}</Text></View>
          </View>
          {flow.assessment.requires_face_verification ? (
            <View style={[styles.faceStatus, faceVerified && styles.faceStatusDone]}><MaterialCommunityIcons color={faceVerified ? colors.green : colors.primary} name={faceVerified ? 'check-decagram' : 'face-recognition'} size={22} /><Text style={styles.faceStatusText}>{faceVerified ? 'Face ID đã khớp, sẵn sàng hoàn tất.' : 'Chưa xác minh khuôn mặt cho giao dịch này.'}</Text></View>
          ) : (
            <FormField autoCapitalize="none" icon="dialpad" keyboardType="number-pad" label="Mã PIN giao dịch" maxLength={6} onChangeText={(value) => setPin(value.replace(/\D/g, ''))} placeholder="••••" secureTextEntry value={pin} />
          )}
          {!flow.assessment.requires_face_verification && pinStatusQuery.isError ? <Pressable onPress={() => void pinStatusQuery.refetch()}><InlineNotice message="Không kiểm tra được trạng thái PIN. Chạm để thử lại." tone="red" /></Pressable> : null}
          {!flow.assessment.requires_face_verification && pinStatusQuery.data === false ? <InlineNotice message="Bạn chưa thiết lập PIN giao dịch. Hãy thiết lập PIN trước khi chuyển tiền." tone="amber" /> : null}
          <PrimaryButton
            disabled={remainingSeconds > 0 || submitting || cancelling || pinStatusQuery.isLoading || (!flow.assessment.requires_face_verification && pinStatusQuery.data === false)}
            icon={flow.assessment.requires_face_verification ? 'face-recognition' : 'check-decagram'}
            label={flow.assessment.requires_face_verification ? (faceVerified ? 'Hoàn tất chuyển tiền' : 'Mở xác minh Face ID') : 'Xác nhận chuyển tiền'}
            loading={submitting}
            loadingLabel="Đang xác nhận giao dịch"
            onPress={() => void submit()}
            variant={riskTone === 'red' ? 'danger' : 'dark'}
          />
          {remainingSeconds > 0 ? <ProgressBar tone="amber" value={warning ? 1 - remainingSeconds / Math.max(1, warning.countdown_seconds) : 0} /> : null}
          <PrimaryButton disabled={submitting || cancelling} label="Hủy giao dịch" onPress={requestCancel} variant="outline" />
        </Card>
      </AppScreen>

      <Modal animationType="fade" onRequestClose={() => resultModal?.kind !== 'success' && setResultModal(null)} transparent visible={Boolean(resultModal)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.resultModal}>
            <View style={[styles.resultIcon, resultModal?.kind === 'success' ? styles.resultIconSuccess : styles.resultIconError]}>
              <MaterialCommunityIcons color={resultModal?.kind === 'success' ? colors.green : colors.red} name={resultModal?.kind === 'success' ? 'check-decagram' : 'alert-circle'} size={34} />
            </View>
            <Text style={styles.resultTitle}>{resultModal?.title}</Text>
            <Text style={styles.resultMessage}>{resultModal?.message}</Text>
            {resultModal?.kind === 'success' ? (
              <PrimaryButton icon="home-outline" label="Về trang chính" onPress={finish} />
            ) : (
              <PrimaryButton label="Đóng và kiểm tra lại" onPress={() => setResultModal(null)} variant="outline" />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 21, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  progressHeader: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: spacing.xl },
  progressStepDone: { alignItems: 'center', backgroundColor: colors.green, borderRadius: 16, height: 31, justifyContent: 'center', width: 31 },
  progressStepActive: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 16, height: 31, justifyContent: 'center', width: 31 },
  progressStep: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 16, height: 31, justifyContent: 'center', width: 31 },
  progressLineDone: { backgroundColor: colors.green, flex: 1, height: 3 },
  progressLine: { backgroundColor: colors.border, flex: 1, height: 3 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  progressLabelDone: { color: colors.green, fontSize: 10, fontWeight: '900' },
  progressLabelActive: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  recipientCard: { backgroundColor: colors.navy, borderColor: colors.navy, gap: spacing.lg },
  cardHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  headingIcon: { alignItems: 'center', backgroundColor: '#FFFFFF1C', borderRadius: 15, height: 48, justifyContent: 'center', width: 48 },
  headingText: { flex: 1, gap: 4 },
  eyebrow: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 0.65 },
  recipientName: { color: colors.white, fontSize: 18, fontWeight: '900' },
  details: { borderColor: '#FFFFFF24', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.lg },
  detailLabel: { color: '#AEB7D0', fontSize: 10, marginBottom: 4 },
  detailValue: { color: colors.white, fontSize: 12, fontWeight: '800', maxWidth: 130 },
  amount: { color: colors.cyan, fontSize: 14, fontWeight: '900' },
  note: { alignItems: 'center', backgroundColor: '#FFFFFF12', borderRadius: radius.medium, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  noteText: { color: '#D7DDF0', flex: 1, fontSize: 12 },
  securityCard: { borderColor: '#BFEBDD', gap: spacing.md },
  securityCardDanger: { borderColor: '#F5BCC3' },
  securityHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  securityIcon: { alignItems: 'center', borderRadius: 18, height: 54, justifyContent: 'center', width: 54 },
  securityText: { flex: 1, gap: 4 },
  securityTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  securityDescription: { color: colors.textMuted, fontSize: 12 },
  explanation: { color: colors.text, fontSize: 13, lineHeight: 20 },
  recommendation: { alignItems: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: radius.medium, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  recommendationText: { color: colors.primaryDark, flex: 1, fontSize: 12, lineHeight: 18 },
  warningBox: { alignItems: 'flex-start', backgroundColor: colors.redSoft, borderColor: '#F5BCC3', borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  warningTextBox: { flex: 1, gap: 4 },
  warningTitle: { color: '#A82F40', fontSize: 13, fontWeight: '900' },
  warningText: { color: '#963143', fontSize: 12, lineHeight: 18 },
  countdown: { color: colors.red, fontSize: 11, fontWeight: '900' },
  verifyCard: { gap: spacing.lg },
  verifyTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  verifyTitleText: { flex: 1, gap: 3 },
  verifyTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  verifySubtitle: { color: colors.textMuted, fontSize: 11 },
  faceStatus: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.medium, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  faceStatusDone: { backgroundColor: colors.greenSoft },
  faceStatusText: { color: colors.primaryDark, flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  modalBackdrop: { alignItems: 'center', backgroundColor: '#071A3DB8', flex: 1, justifyContent: 'center', padding: spacing.xl },
  resultModal: { alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.large, gap: spacing.lg, maxWidth: 420, padding: spacing.xxl, width: '100%' },
  resultIcon: { alignItems: 'center', borderRadius: 36, height: 72, justifyContent: 'center', width: 72 },
  resultIconSuccess: { backgroundColor: colors.greenSoft },
  resultIconError: { backgroundColor: colors.redSoft },
  resultTitle: { color: colors.text, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  resultMessage: { color: colors.textMuted, fontSize: 13, lineHeight: 21, textAlign: 'center' },
});
