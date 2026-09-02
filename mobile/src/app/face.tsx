import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  AppScreen,
  Card,
  InlineNotice,
  PageHeader,
  PrimaryButton,
  ProgressBar,
  ScreenState,
  StatusPill,
} from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { checkFaceQuality, enrollFace, verifyFace } from '@/services/face';
import { useFaceStore } from '@/stores/face-store';
import { useAuthStore } from '@/stores/auth-store';
import { getApiErrorMessage } from '@/utils/format';

type FacePhase =
  | 'idle'
  | 'capturing'
  | 'quality'
  | 'processing'
  | 'success'
  | 'error';

const CAPTURE_COUNT = 3;
const CAPTURE_INTERVAL_MS = 240;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export default function FaceScreen() {
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const queryClient = useQueryClient();
  const demoMode = useAuthStore((state) => state.demoMode);
  const [cameraKey, setCameraKey] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [phase, setPhase] = useState<FacePhase>('idle');
  const [message, setMessage] = useState('Đặt khuôn mặt trong khung, nhìn thẳng và giữ điện thoại ngang tầm mắt.');
  const setVerification = useFaceStore((state) => state.setVerification);
  const params = useLocalSearchParams<{ mode?: string; transactionId?: string; nonce?: string; amount?: string }>();
  const transactionId = firstParam(params.transactionId);
  const nonce = firstParam(params.nonce);
  const amount = Number(firstParam(params.amount) || 0);
  const verificationMode = firstParam(params.mode) === 'verify' || Boolean(transactionId);
  const busy = phase === 'capturing' || phase === 'quality' || phase === 'processing';
  const cameraHeight = Math.min(420, Math.max(330, width * 1.02));

  useEffect(() => {
    if (!permission?.granted || cameraReady || cameraError) return;
    const timeout = setTimeout(() => {
      setCameraError('Camera không phản hồi trong thời gian chờ.');
      setPhase('error');
      setMessage('Camera chưa khởi động được. Hãy đóng ứng dụng khác đang dùng camera rồi bấm Quét lại.');
    }, 12_000);
    return () => clearTimeout(timeout);
  }, [cameraError, cameraReady, permission?.granted]);

  const progress = phase === 'capturing'
    ? 0.25
    : phase === 'quality'
      ? 0.65
      : phase === 'processing'
        ? 0.9
        : phase === 'success'
          ? 1
          : 0;

  const resetCapture = () => {
    if (cameraError) {
      setCameraError(null);
      setCameraReady(false);
      setCameraKey((current) => current + 1);
    }
    setPhase('idle');
    setMessage('Đặt khuôn mặt trong khung, nhìn thẳng và giữ điện thoại ngang tầm mắt.');
  };

  const captureImage = async () => {
    if (!cameraRef.current || !cameraReady || busy) return;
    if (verificationMode && (!transactionId || !nonce)) {
      setPhase('error');
      setMessage('Phiên giao dịch đã thiếu mã xác minh. Hãy quay lại Chuyển tiền và kiểm tra lại giao dịch.');
      return;
    }

    setPhase('capturing');
    setMessage('Đang chụp ảnh để kiểm tra và xác minh khuôn mặt...');

    try {
      // Chụp một burst ngắn tự động trong cùng một lần quét. Người dùng không
      // phải bấm/chụp hoặc xoay mặt theo từng bước, nhưng server vẫn nhận đủ
      // khung hình khác nhau để kiểm tra người thật.
      const frames: string[] = [];
      for (let index = 0; index < CAPTURE_COUNT; index += 1) {
        const picture = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7, skipProcessing: false });
        if (!picture?.base64) throw new Error('Camera không trả về dữ liệu ảnh.');
        frames.push(`data:image/jpeg;base64,${picture.base64}`);
        if (index < CAPTURE_COUNT - 1) await wait(CAPTURE_INTERVAL_MS);
      }
      const finalImage = frames[frames.length - 1];

      setPhase('quality');
      setMessage('Đang kiểm tra ánh sáng, khuôn mặt và chất lượng ảnh cuối...');
      if (demoMode) {
        setPhase('processing');
        setMessage(verificationMode ? 'Đã mô phỏng xác minh Face ID trong bản demo.' : 'Đã mô phỏng thiết lập Face ID trong bản demo.');
        if (verificationMode && transactionId) setVerification(transactionId, 'demo-face-token');
        setPhase('success');
        return;
      }
      const quality = await checkFaceQuality(finalImage);
      if (!quality.ready) throw new Error(quality.message);

      setPhase('processing');
      setMessage(verificationMode ? 'Đang đối chiếu khuôn mặt với tài khoản của bạn...' : 'Đang tạo mẫu Face ID được bảo vệ...');

      if (verificationMode) {
        const response = await verifyFace({
          amount: amount > 0 ? amount : undefined,
          frames,
          nonce,
          transactionId,
        });
        if (!response.matched || !response.verification_token || !transactionId) {
          throw new Error(response.message || 'Khuôn mặt chưa đủ độ khớp.');
        }
        setVerification(transactionId, response.verification_token);
        setMessage('Khuôn mặt đã khớp. Token bảo mật chỉ có hiệu lực cho giao dịch này.');
      } else {
        const response = await enrollFace(frames);
        if (!response.matched) throw new Error(response.message || 'Không thể đăng ký khuôn mặt.');
        void queryClient.invalidateQueries({ queryKey: ['mobile-face-status'] });
        void queryClient.invalidateQueries({ queryKey: ['mobile-account-overview'] });
        setMessage('Face ID đã được thiết lập và sẵn sàng bảo vệ các giao dịch rủi ro.');
      }

      setPhase('success');
    } catch (error) {
      setPhase('error');
      setMessage(getApiErrorMessage(error, 'Không thể xác minh khuôn mặt. Hãy thử lại với ánh sáng tốt hơn.'));
    }
  };

  const permissionAction = permission?.canAskAgain === false
    ? () => void Linking.openSettings()
    : () => void requestPermission();

  return (
    <AppScreen contentStyle={styles.screen}>
      <PageHeader
        action={(
          <Pressable
            accessibilityLabel="Đóng"
            disabled={busy}
            hitSlop={10}
            onPress={() => router.back()}
            style={[styles.closeButton, busy && styles.disabled]}>
            <MaterialCommunityIcons color={colors.text} name="close" size={22} />
          </Pressable>
        )}
        eyebrow={verificationMode ? 'Xác nhận giao dịch' : 'Bảo mật tài khoản'}
        subtitle={verificationMode ? 'Quét một ảnh khuôn mặt để bảo vệ bước chuyển tiền.' : 'Quét một ảnh khuôn mặt để thiết lập Face ID.'}
        title={verificationMode ? 'Xác minh Face ID' : 'Thiết lập Face ID'}
      />

      {!permission ? (
        <Card><ScreenState kind="loading" message="Timi đang kiểm tra quyền camera trên thiết bị." title="Đang chuẩn bị camera" /></Card>
      ) : !permission.granted ? (
        <Card style={styles.centerCard}>
          <ScreenState
            actionLabel={permission.canAskAgain === false ? 'Mở cài đặt thiết bị' : 'Cấp quyền camera'}
            kind="empty"
            message="Camera chỉ hoạt động khi bạn chủ động thiết lập hoặc xác minh Face ID. Ảnh không được lưu trong thư viện."
            onAction={permissionAction}
            title="Cần quyền sử dụng camera"
          />
        </Card>
      ) : phase === 'success' ? (
        <Card style={styles.successCard}>
          <View style={styles.successIcon}>
            <MaterialCommunityIcons color={colors.green} name="face-recognition" size={42} />
            <View style={styles.successCheck}>
              <MaterialCommunityIcons color={colors.white} name="check" size={14} />
            </View>
          </View>
          <Text style={styles.successTitle}>{verificationMode ? 'Xác minh thành công' : 'Đã bật Face ID'}</Text>
          <Text style={styles.successMessage}>{message}</Text>
          <ProgressBar tone="green" value={1} />
          <PrimaryButton
            icon="arrow-right"
            label={verificationMode ? 'Tiếp tục giao dịch' : 'Hoàn tất'}
            onPress={() => router.back()}
          />
        </Card>
      ) : (
        <>
          <View style={[styles.cameraShell, { height: cameraHeight }]}>
            <CameraView
              autofocus="on"
              facing="front"
              key={cameraKey}
              mirror
              mode="picture"
              onCameraReady={() => {
                setCameraError(null);
                setCameraReady(true);
              }}
              onMountError={(error) => {
                setCameraReady(false);
                setCameraError(error.message);
                setPhase('error');
                setMessage(`Không thể mở camera: ${error.message}`);
              }}
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.cameraOverlay}>
              <View style={[styles.faceFrame, phase === 'error' && styles.faceFrameError, busy && styles.faceFrameBusy]}>
                <View style={styles.frameTopMarker} />
                <View style={styles.frameBottomMarker} />
              </View>
              <View style={styles.cameraBadge}>
                <MaterialCommunityIcons color={colors.white} name="shield-lock-outline" size={16} />
                <Text style={styles.cameraBadgeText}>Không lưu ảnh trên thiết bị</Text>
              </View>
            </View>
          </View>

          <Card style={styles.instructionCard}>
            <View style={styles.statusRow}>
              <StatusPill
                label={phase === 'error'
                  ? 'Cần quét lại'
                  : phase === 'capturing'
                    ? 'Đang chụp ảnh'
                    : phase === 'quality'
                      ? 'Kiểm tra chất lượng'
                      : phase === 'processing'
                        ? 'Đang xác minh'
                        : cameraReady
                          ? 'Camera sẵn sàng'
                          : 'Đang khởi động'}
                tone={phase === 'error' ? 'red' : busy ? 'amber' : cameraReady ? 'green' : 'blue'}
              />
              {busy ? <Text style={styles.progressLabel}>{Math.round(progress * 100)}%</Text> : null}
            </View>
            <ProgressBar tone={phase === 'error' ? 'red' : 'blue'} value={progress} />
            <Text style={[styles.instructionText, phase === 'error' && styles.errorText]}>{message}</Text>
            {phase === 'error' ? (
              <InlineNotice
                message={cameraError ? 'Đóng ứng dụng khác đang dùng camera rồi thử lại.' : 'Lau camera, tăng ánh sáng và giữ một khuôn mặt duy nhất trong khung.'}
                tone="red"
              />
            ) : (
              <InlineNotice message="Bỏ khẩu trang/kính râm, giữ ánh sáng đều và chỉ để một khuôn mặt trong khung." />
            )}
            <PrimaryButton
              disabled={!cameraReady && !cameraError}
              icon={phase === 'error' ? 'refresh' : 'face-recognition'}
              label={phase === 'error' ? 'Quét lại từ đầu' : verificationMode ? 'Bắt đầu xác minh' : 'Quét khuôn mặt'}
              loading={busy}
              loadingLabel={phase === 'capturing' ? 'Đang chụp ảnh' : phase === 'quality' ? 'Đang kiểm tra ảnh' : 'Đang xác minh'}
              onPress={phase === 'error' ? resetCapture : () => void captureImage()}
            />
          </Card>
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  closeButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  disabled: { opacity: 0.45 },
  centerCard: { padding: 0 },
  cameraShell: { backgroundColor: colors.navy, borderColor: '#FFFFFF22', borderRadius: 30, borderWidth: 1, overflow: 'hidden' },
  cameraOverlay: { alignItems: 'center', backgroundColor: '#04112838', flex: 1, justifyContent: 'center' },
  faceFrame: { borderColor: colors.cyan, borderRadius: 140, borderWidth: 3, height: '70%', maxHeight: 292, maxWidth: 228, width: '58%' },
  faceFrameBusy: { borderColor: colors.white },
  faceFrameError: { borderColor: colors.red },
  frameTopMarker: { alignSelf: 'center', backgroundColor: colors.white, borderRadius: radius.pill, height: 3, marginTop: 14, opacity: 0.85, width: 26 },
  frameBottomMarker: { alignSelf: 'center', backgroundColor: colors.white, borderRadius: radius.pill, bottom: 14, height: 3, opacity: 0.85, position: 'absolute', width: 26 },
  cameraBadge: { alignItems: 'center', backgroundColor: '#061A3DDB', borderRadius: radius.pill, bottom: spacing.lg, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, position: 'absolute' },
  cameraBadgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  instructionCard: { gap: spacing.md },
  statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  instructionText: { color: colors.text, fontSize: 15, fontWeight: '800', lineHeight: 22 },
  errorText: { color: '#A92F3E' },
  successCard: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxxl },
  successIcon: { alignItems: 'center', backgroundColor: colors.greenSoft, borderRadius: 38, height: 82, justifyContent: 'center', width: 82 },
  successCheck: { alignItems: 'center', backgroundColor: colors.green, borderColor: colors.white, borderRadius: 12, borderWidth: 2, bottom: 0, height: 24, justifyContent: 'center', position: 'absolute', right: 0, width: 24 },
  successTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  successMessage: { color: colors.textMuted, fontSize: 13, lineHeight: 20, maxWidth: 340, textAlign: 'center' },
});
