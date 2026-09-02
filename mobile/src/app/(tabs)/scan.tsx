import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cacheDirectory, EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { TimiCompanion } from '@/components/timi-companion';
import { AppScreen, Card, FormField, InlineNotice, PageHeader, PrimaryButton, ProgressBar, ScreenState, StatusPill } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { checkUrlSafety, type UrlSafetyResult } from '@/services/url-safety';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency } from '@/utils/format';
import { createPaymentQr, parsePaymentQr } from '@/utils/payment-qr';

type Mode = 'scan' | 'create';
type QrCodeHandle = { toDataURL: (callback: (data: string) => void) => void };

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ScanScreen() {
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ mode?: string }>();
  const requestedMode = firstParam(params.mode) === 'create' ? 'create' : 'scan';
  const mode: Mode = requestedMode;
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedValue, setScannedValue] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [safetyResult, setSafetyResult] = useState<UrlSafetyResult | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [generatedPayload, setGeneratedPayload] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const qrRef = useRef<QrCodeHandle | null>(null);
  const demoMode = useAuthStore((state) => state.demoMode);
  const user = useAuthStore((state) => state.user)!;
  const ownAccount = (user.phone || (demoMode ? '0901234567' : '')).replace(/\D/g, '');
  const canCreate = ownAccount.length === 10 && (demoMode || user.timi_bank_enabled);
  const isUrl = scannedValue ? /^https?:\/\//i.test(scannedValue) : false;

  useEffect(() => {
    let active = true;
    if (!scannedValue || !isUrl) return () => { active = false; };
    const run = async () => {
      try {
        const result = demoMode
          ? { blocked: false, hostname: new URL(scannedValue).hostname, reason: null }
          : await checkUrlSafety(scannedValue);
        if (active) setSafetyResult(result);
      } catch {
        if (active) setCheckFailed(true);
      } finally {
        if (active) setChecking(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [checkAttempt, demoMode, isUrl, scannedValue]);

  const switchMode = (nextMode: Mode) => {
    if (nextMode === 'create') {
      setScannedValue(null);
      setSafetyResult(null);
      setCheckFailed(false);
      setChecking(false);
      setCameraError(null);
    }
    router.setParams({ mode: nextMode });
  };

  const handleScanned = (data: string) => {
    setScannedValue(data);
    setSafetyResult(null);
    setCheckFailed(false);
    const payment = parsePaymentQr(data);
    if (payment) {
      router.push({
        pathname: '/transfer',
        params: {
          accountNumber: payment.accountNumber,
          bankCode: payment.bankCode,
          amount: payment.amount ? String(payment.amount) : '',
          note: payment.note || '',
        },
      });
      return;
    }
    setChecking(/^https?:\/\//i.test(data));
  };

  const resetScanner = () => {
    setScannedValue(null);
    setSafetyResult(null);
    setCheckFailed(false);
  };

  const retrySafetyCheck = () => {
    setCheckFailed(false);
    setSafetyResult(null);
    setChecking(true);
    setCheckAttempt((current) => current + 1);
  };

  const createQr = async () => {
    const numericAmount = amount ? Number(amount.replace(/\D/g, '')) : undefined;
    if (!canCreate) {
      Alert.alert('Chưa thể tạo QR', 'Tài khoản cần số điện thoại 10 chữ số và Timi Bank đang hoạt động.');
      return;
    }
    const payload = createPaymentQr({
      accountNumber: ownAccount,
      bankCode: 'TIMI',
      ...(numericAmount ? { amount: numericAmount } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      accountName: user.full_name,
    });
    if (!payload) {
      Alert.alert('Thông tin chưa hợp lệ', 'Số tiền phải lớn hơn 0 và nội dung không dài quá 500 ký tự.');
      return;
    }
    setCreating(true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    setGeneratedPayload(payload);
    setCreating(false);
  };

  const shareQr = async () => {
    if (!generatedPayload || sharing) return;
    setSharing(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        if (!qrRef.current) {
          reject(new Error('QR chưa sẵn sàng'));
          return;
        }
        qrRef.current.toDataURL(resolve);
      });
      if (cacheDirectory && await Sharing.isAvailableAsync()) {
        const fileUri = `${cacheDirectory}timi-qr-${Date.now()}.png`;
        await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });
        await Sharing.shareAsync(fileUri, { dialogTitle: 'Chia sẻ mã QR nhận tiền Timi', mimeType: 'image/png' });
      } else {
        await Share.share({ message: `Mã nhận tiền Timi của ${user.full_name}:\n${generatedPayload}` });
      }
    } catch (error) {
      const cancelled = error instanceof Error && /cancel/i.test(error.message);
      if (!cancelled) Alert.alert('Không thể chia sẻ QR', 'Hãy thử lại sau một chút.');
    } finally {
      setSharing(false);
    }
  };

  const permissionAction = permission?.canAskAgain === false
    ? () => void Linking.openSettings()
    : () => void requestPermission();
  const resultTone = safetyResult?.blocked || checkFailed ? 'red' : safetyResult ? 'green' : 'blue';
  const resultLabel = checking ? 'Đang kiểm tra' : checkFailed ? 'Không thể xác minh' : safetyResult?.blocked ? 'Đã chặn' : safetyResult ? 'Không có trong blacklist' : 'Đã đọc nội dung';
  const scannedHostname = scannedValue && isUrl
    ? (() => { try { return new URL(scannedValue).hostname; } catch { return 'liên kết vừa quét'; } })()
    : null;

  return (
    <AppScreen>
      <PageHeader
        eyebrow="QR thông minh"
        subtitle={mode === 'scan' ? 'Timi đọc và kiểm tra trước khi mở hoặc chuyển tiền.' : 'Tạo mã nhận tiền đúng tài khoản Timi của bạn.'}
        title={mode === 'scan' ? 'Quét QR an toàn' : 'Mã QR của tôi'}
      />

      <View accessibilityRole="tablist" style={styles.modeTabs}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'scan' }} onPress={() => switchMode('scan')} style={[styles.modeTab, mode === 'scan' && styles.modeTabActive]}>
          <MaterialCommunityIcons color={mode === 'scan' ? colors.white : colors.textMuted} name="qrcode-scan" size={19} />
          <Text style={[styles.modeText, mode === 'scan' && styles.modeTextActive]}>Quét QR</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'create' }} onPress={() => switchMode('create')} style={[styles.modeTab, mode === 'create' && styles.modeTabActive]}>
          <MaterialCommunityIcons color={mode === 'create' ? colors.white : colors.textMuted} name="qrcode-plus" size={19} />
          <Text style={[styles.modeText, mode === 'create' && styles.modeTextActive]}>QR nhận tiền</Text>
        </Pressable>
      </View>

      {mode === 'create' ? (
        generatedPayload ? (
          <Card style={styles.generatedCard}>
            <View style={styles.qrHeader}>
              <StatusPill label="Sẵn sàng nhận tiền" tone="green" />
              <Text style={styles.qrTitle}>Đưa mã này cho người gửi</Text>
              <Text style={styles.qrSubtitle}>Họ sẽ được chuyển tới bước kiểm tra giao dịch trước khi xác nhận.</Text>
            </View>
            <View style={styles.qrShell}>
              <QRCode backgroundColor={colors.white} color={colors.navy} getRef={(reference) => { qrRef.current = reference as QrCodeHandle; }} size={Math.min(245, width - 108)} value={generatedPayload} />
            </View>
            <View style={styles.paymentDetails}>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Người nhận</Text><Text style={styles.detailValue}>{user.full_name}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Tài khoản</Text><Text style={styles.detailValue}>Timi · {ownAccount}</Text></View>
              {amount ? <View style={styles.detailRow}><Text style={styles.detailLabel}>Số tiền</Text><Text style={styles.detailValue}>{formatCurrency(Number(amount))}</Text></View> : null}
              {note ? <View style={styles.detailRow}><Text style={styles.detailLabel}>Nội dung</Text><Text numberOfLines={2} style={styles.detailValue}>{note}</Text></View> : null}
            </View>
            <PrimaryButton icon="share-variant-outline" label="Chia sẻ ảnh QR" loading={sharing} loadingLabel="Đang chuẩn bị ảnh QR" onPress={() => void shareQr()} />
            <PrimaryButton label="Tạo mã QR khác" onPress={() => setGeneratedPayload(null)} variant="outline" />
          </Card>
        ) : (
          <>
            <Card style={styles.accountCard}>
              <View style={styles.accountIcon}><MaterialCommunityIcons color={colors.primary} name="bank-outline" size={25} /></View>
              <View style={styles.accountText}>
                <Text style={styles.accountLabel}>Tài khoản nhận tiền</Text><Text style={styles.accountName}>{user.full_name}</Text>
                <Text style={styles.accountNumber}>{canCreate ? `Timi Bank · ${ownAccount}` : 'Tài khoản chưa đủ điều kiện tạo QR'}</Text>
              </View>
              <StatusPill label={canCreate ? 'Đã xác thực' : 'Chưa sẵn sàng'} tone={canCreate ? 'green' : 'amber'} />
            </Card>
            {!canCreate ? <InlineNotice message="Hãy cập nhật số điện thoại 10 chữ số và kích hoạt tài khoản Timi Bank trước khi tạo QR." tone="amber" /> : null}
            <Card style={styles.createForm}>
              <FormField icon="cash-multiple" keyboardType="number-pad" label="Số tiền (không bắt buộc)" onChangeText={(value) => setAmount(value.replace(/\D/g, ''))} placeholder="0 ₫" value={amount ? formatCurrency(Number(amount)).replace(' ₫', '') : ''} />
              <FormField icon="message-text-outline" label="Nội dung (không bắt buộc)" maxLength={500} onChangeText={setNote} placeholder="Ví dụ: Tiền ăn trưa" value={note} />
              <PrimaryButton disabled={!canCreate} icon="qrcode-plus" label="Tạo mã QR nhận tiền" loading={creating} loadingLabel="Đang tạo mã QR" onPress={() => void createQr()} />
            </Card>
            <TimiCompanion compact context="Timi nhận tiền an toàn" defaultPrompt="Tôi nên chia sẻ mã QR nhận tiền như thế nào để tránh bị giả mạo?" message="Mã QR chỉ chứa thông tin nhận tiền của bạn. Timi không bao giờ nhúng OTP, PIN hay mật khẩu." suggestions={['Làm sao nhận biết QR của tôi bị thay thế?', 'Tôi có nên ghi sẵn số tiền trong QR không?']} />
          </>
        )
      ) : (
        <>
          {!permission ? (
            <Card><ScreenState kind="loading" message="Đang kiểm tra quyền camera trên thiết bị." title="Đang chuẩn bị máy quét" /></Card>
          ) : !permission.granted ? (
            <Card style={styles.permissionCard}><ScreenState actionLabel={permission.canAskAgain === false ? 'Mở cài đặt thiết bị' : 'Cấp quyền camera'} kind="empty" message="Camera chỉ được dùng để đọc QR khi bạn chủ động mở tính năng." onAction={permissionAction} title="Cần quyền sử dụng camera" /></Card>
          ) : cameraError ? (
            <Card style={styles.permissionCard}><ScreenState actionLabel="Thử mở lại" kind="error" message={cameraError} onAction={() => setCameraError(null)} title="Không mở được camera" /></Card>
          ) : (
            <View style={[styles.scannerShell, { height: Math.min(410, Math.max(330, width * 0.96)) }]}>
              <CameraView barcodeScannerSettings={{ barcodeTypes: ['qr'] }} facing="back" onBarcodeScanned={scannedValue ? undefined : ({ data }) => handleScanned(data)} onMountError={(error) => setCameraError(error.message)} style={StyleSheet.absoluteFill} />
              <View pointerEvents="none" style={styles.overlay}>
                <View style={styles.scanFrame}><View style={[styles.corner, styles.cornerTopLeft]} /><View style={[styles.corner, styles.cornerTopRight]} /><View style={[styles.corner, styles.cornerBottomLeft]} /><View style={[styles.corner, styles.cornerBottomRight]} /><View style={styles.scanLine} /></View>
                <View style={styles.cameraHint}><MaterialCommunityIcons color={colors.white} name="shield-check" size={16} /><Text style={styles.cameraHintText}>Timi kiểm tra trước khi mở</Text></View>
              </View>
            </View>
          )}

          {scannedValue ? (
            <Card style={styles.resultCard}>
              <View style={styles.resultHeader}><View style={[styles.resultIcon, resultTone === 'red' && styles.resultIconDanger]}><MaterialCommunityIcons color={resultTone === 'red' ? colors.red : colors.green} name={resultTone === 'red' ? 'alert-octagon' : 'qrcode-scan'} size={28} /></View><View style={styles.resultTitleBox}><Text style={styles.resultTitle}>Đã đọc mã QR</Text><StatusPill label={resultLabel} tone={resultTone} /></View></View>
              <Text numberOfLines={3} style={styles.resultValue}>{scannedValue}</Text>
              {checking ? <View style={styles.checkingBox}><ProgressBar value={0.68} /><Text style={styles.checkingText}>Đang đối chiếu liên kết với dữ liệu cảnh báo...</Text></View> : null}
              {safetyResult?.blocked || checkFailed ? <View style={styles.blockedBox}><MaterialCommunityIcons color={colors.red} name="shield-alert" size={20} /><Text style={styles.blockedText}>{safetyResult?.reason || 'Timi không thể đối chiếu blacklist nên sẽ không mở liên kết này.'}</Text></View> : null}
              <View style={styles.resultActions}><Pressable onPress={resetScanner} style={styles.resetButton}><MaterialCommunityIcons color={colors.primary} name="refresh" size={20} /><Text style={styles.resetText}>Quét lại</Text></Pressable>{isUrl && safetyResult && !safetyResult.blocked ? <PrimaryButton label="Mở liên kết" onPress={() => void Linking.openURL(scannedValue)} variant="dark" /> : null}</View>
              {checkFailed ? <PrimaryButton icon="refresh" label="Kiểm tra lại liên kết" onPress={retrySafetyCheck} variant="outline" /> : null}
            </Card>
          ) : null}

          <TimiCompanion compact context={scannedValue ? 'Timi sau khi quét' : 'Timi bảo vệ bạn'} defaultPrompt={safetyResult?.blocked ? `QR từ tên miền ${scannedHostname} đã bị chặn với lý do: ${safetyResult.reason || 'có dấu hiệu nguy hiểm'}. Tôi nên làm gì tiếp theo?` : scannedHostname ? `Tôi vừa quét QR dẫn tới tên miền ${scannedHostname}. Hãy hướng dẫn tôi tự kiểm tra trước khi mở.` : 'Hãy chỉ cho tôi cách nhận biết một mã QR lừa đảo trước khi quét.'} message={safetyResult?.blocked ? 'Mình khuyên bạn không mở QR này. Bạn có thể hỏi để hiểu dấu hiệu vừa phát hiện.' : scannedValue ? 'Đã đọc xong. Nếu còn phân vân, hãy hỏi mình trước khi mở nội dung.' : 'Mình ở đây để cùng bạn kiểm tra QR lạ trước khi bạn hành động.'} suggestions={safetyResult?.blocked ? ['Tôi cần làm gì nếu đã mở liên kết này?', 'Cách báo cáo một QR lừa đảo'] : ['Những QR nào tuyệt đối không nên mở?', 'Nếu QR yêu cầu OTP thì tôi nên làm gì?']} />
          <InlineNotice message="Không mở QR lạ yêu cầu nhập mật khẩu, mã OTP hoặc tải ứng dụng ngoài cửa hàng chính thức." tone="amber" />
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  modeTabs: { backgroundColor: colors.surfaceMuted, borderRadius: radius.medium, flexDirection: 'row', padding: 4 },
  modeTab: { alignItems: 'center', borderRadius: 15, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 46 },
  modeTabActive: { backgroundColor: colors.primary },
  modeText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  modeTextActive: { color: colors.white },
  accountCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  accountIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 17, height: 50, justifyContent: 'center', width: 50 },
  accountText: { flex: 1, gap: 3 },
  accountLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  accountName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  accountNumber: { color: colors.textMuted, fontSize: 11 },
  createForm: { gap: spacing.lg },
  generatedCard: { alignItems: 'stretch', gap: spacing.lg },
  qrHeader: { alignItems: 'center', gap: 6 },
  qrTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: spacing.sm },
  qrSubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  qrShell: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.white, borderColor: colors.border, borderRadius: 24, borderWidth: 1, padding: spacing.lg },
  paymentDetails: { backgroundColor: colors.surfaceMuted, borderRadius: radius.medium, gap: spacing.sm, padding: spacing.md },
  detailRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  detailLabel: { color: colors.textMuted, fontSize: 11 },
  detailValue: { color: colors.text, flex: 1, fontSize: 11, fontWeight: '800', textAlign: 'right' },
  permissionCard: { alignItems: 'center', paddingVertical: spacing.xxxl },
  scannerShell: { backgroundColor: colors.navy, borderRadius: 28, overflow: 'hidden' },
  overlay: { alignItems: 'center', backgroundColor: '#0411284A', flex: 1, justifyContent: 'center' },
  scanFrame: { height: 225, width: 225 },
  corner: { borderColor: colors.cyan, height: 42, position: 'absolute', width: 42 },
  cornerTopLeft: { borderLeftWidth: 4, borderTopLeftRadius: 16, borderTopWidth: 4, left: 0, top: 0 },
  cornerTopRight: { borderRightWidth: 4, borderTopRightRadius: 16, borderTopWidth: 4, right: 0, top: 0 },
  cornerBottomLeft: { borderBottomLeftRadius: 16, borderBottomWidth: 4, borderLeftWidth: 4, bottom: 0, left: 0 },
  cornerBottomRight: { borderBottomRightRadius: 16, borderBottomWidth: 4, borderRightWidth: 4, bottom: 0, right: 0 },
  scanLine: { backgroundColor: colors.cyan, height: 2, left: 12, opacity: 0.8, position: 'absolute', right: 12, top: '50%' },
  cameraHint: { alignItems: 'center', backgroundColor: '#061A3DCC', borderRadius: radius.pill, bottom: 28, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, position: 'absolute' },
  cameraHintText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  resultCard: { gap: spacing.lg },
  resultHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  resultIcon: { alignItems: 'center', backgroundColor: colors.greenSoft, borderRadius: radius.medium, height: 52, justifyContent: 'center', width: 52 },
  resultIconDanger: { backgroundColor: colors.redSoft },
  resultTitleBox: { flex: 1, gap: 6 },
  resultTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  resultValue: { backgroundColor: colors.surfaceMuted, borderRadius: radius.small, color: colors.text, fontSize: 12, lineHeight: 18, padding: spacing.md },
  checkingBox: { gap: spacing.sm },
  checkingText: { color: colors.primaryDark, fontSize: 12, lineHeight: 18 },
  blockedBox: { alignItems: 'flex-start', backgroundColor: colors.redSoft, borderRadius: radius.small, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  blockedText: { color: '#A92F3E', flex: 1, fontSize: 12, lineHeight: 18 },
  resultActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  resetButton: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: spacing.sm },
  resetText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
});
