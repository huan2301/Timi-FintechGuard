import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { TimiCompanion } from '@/components/timi-companion';
import { AppScreen, Card, InlineNotice, PageHeader, PrimaryButton, ProgressBar, ScreenState, StatusPill } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { apiBaseUrl } from '@/services/api';
import { createGuardianSession, finishGuardianSession, getActiveGuardianSession, type GuardianSession } from '@/services/guardian';
import { useAuthStore } from '@/stores/auth-store';
import { getApiErrorMessage } from '@/utils/format';

type ConnectionState = 'idle' | 'starting' | 'connected' | 'stopping' | 'error';

function websocketUrl(sessionId: string) {
  const apiRoot = apiBaseUrl.replace(/\/api\/?$/, '');
  const wsRoot = apiRoot.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  return `${wsRoot}/api/v1/scam-guardian/ws/${sessionId}`;
}

export default function GuardianScreen() {
  const demoMode = useAuthStore((state) => state.demoMode);
  const token = useAuthStore((state) => state.token);
  const socketRef = useRef<WebSocket | null>(null);
  const intentionalSocketsRef = useRef(new WeakSet<WebSocket>());
  const connectionRef = useRef<ConnectionState>('idle');
  const [session, setSession] = useState<GuardianSession | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [draft, setDraft] = useState('');
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [riskMessage, setRiskMessage] = useState('Chưa có tín hiệu rủi ro nào được phân tích.');
  const [riskLevel, setRiskLevel] = useState('safe');
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const activeQuery = useQuery({
    queryKey: ['mobile-guardian-active'],
    queryFn: getActiveGuardianSession,
    enabled: !demoMode,
  });
  const visibleSession = session ?? activeQuery.data ?? null;

  const updateConnection = (next: ConnectionState) => {
    connectionRef.current = next;
    setConnection(next);
  };

  useEffect(() => () => {
    if (socketRef.current) intentionalSocketsRef.current.add(socketRef.current);
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const connect = (nextSession: GuardianSession) => {
    if (!token) {
      updateConnection('error');
      setConnectionMessage('Phiên đăng nhập không có access token. Hãy đăng nhập lại rồi bật Guardian.');
      return;
    }
    if (socketRef.current) intentionalSocketsRef.current.add(socketRef.current);
    socketRef.current?.close();
    updateConnection('starting');
    setConnectionMessage('Đang xác thực và mở kênh bảo vệ thời gian thực...');
    const socket = new WebSocket(websocketUrl(nextSession.id));
    socketRef.current = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'auth', token }));
    };
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as Record<string, unknown>;
        if (payload.type === 'ready') {
          updateConnection('connected');
          setConnectionMessage(null);
          return;
        }
        if (payload.type === 'transcript' && payload.status === 'final' && typeof payload.text === 'string') {
          setTranscripts((current) => [...current.slice(-7), payload.text as string]);
          return;
        }
        if (payload.type === 'risk_update') {
          if (typeof payload.risk_level === 'string') setRiskLevel(payload.risk_level);
          if (typeof payload.explanation === 'string') setRiskMessage(payload.explanation);
          if (payload.recommended_action === 'STOP') {
            Alert.alert('Guardian khuyến nghị dừng', 'Không chuyển tiền, không cung cấp OTP/PIN và hãy kết thúc cuộc gọi.');
          }
          return;
        }
        if (payload.type === 'alert' && typeof payload.message === 'string') {
          Alert.alert(typeof payload.title === 'string' ? payload.title : 'Cảnh báo cuộc gọi', payload.message);
          return;
        }
        if (payload.type === 'session_finished') {
          updateConnection('idle');
          setConnectionMessage('Phiên Guardian đã kết thúc an toàn.');
          setSession((current) => current ? { ...current, status: 'completed' } : current);
        }
      } catch {
        updateConnection('error');
        setConnectionMessage('Máy chủ trả về dữ liệu không hợp lệ. Hãy kết nối lại phiên Guardian.');
      }
    };
    socket.onerror = () => {
      updateConnection('error');
      setConnectionMessage('Mất kết nối tới Guardian. Kiểm tra mạng hoặc URL API rồi thử lại.');
    };
    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null;
      if (intentionalSocketsRef.current.has(socket)) return;
      if (connectionRef.current !== 'error') {
        updateConnection('error');
        setConnectionMessage('Kênh bảo vệ đã đóng ngoài dự kiến. Hãy bật lại Guardian.');
      }
    };
  };

  const start = async () => {
    if (demoMode) {
      updateConnection('connected');
      setRiskMessage('Bản xem trước không gửi transcript lên máy chủ.');
      return;
    }
    updateConnection('starting');
    setConnectionMessage('Đang tạo phiên Guardian...');
    try {
      const nextSession = visibleSession?.status === 'active' ? visibleSession : await createGuardianSession();
      setSession(nextSession);
      connect(nextSession);
    } catch (error) {
      updateConnection('error');
      setConnectionMessage(getApiErrorMessage(error, 'Không thể bật Guardian. Vui lòng thử lại sau.'));
    }
  };

  const sendTranscript = () => {
    const text = draft.trim();
    if (!text) return;
    if (demoMode) {
      setTranscripts((current) => [...current.slice(-7), text]);
      setRiskMessage('Bản xem trước chỉ hiển thị transcript, chưa gọi Groq.');
      setDraft('');
      return;
    }
    if (!socketRef.current || socketRef.current.readyState !== 1) {
      Alert.alert('Guardian chưa kết nối', 'Hãy bật phiên Guardian trước.');
      return;
    }
    socketRef.current.send(JSON.stringify({ type: 'transcript', status: 'final', speaker: 'unknown', source: 'manual', text }));
    setDraft('');
  };

  const stop = async () => {
    const current = visibleSession;
    if (!current) return;
    if (demoMode) {
      updateConnection('idle');
      return;
    }
    updateConnection('stopping');
    setConnectionMessage('Đang kết thúc phiên và đóng kênh bảo vệ...');
    try {
      if (socketRef.current?.readyState === 1) {
        intentionalSocketsRef.current.add(socketRef.current);
        socketRef.current.send(JSON.stringify({ type: 'stop' }));
        socketRef.current.close();
      } else {
        await finishGuardianSession(current.id, 'completed');
      }
      updateConnection('idle');
      setConnectionMessage('Phiên Guardian đã kết thúc an toàn.');
    } catch (error) {
      updateConnection('error');
      setConnectionMessage(getApiErrorMessage(error, 'Không thể kết thúc Guardian. Vui lòng thử lại.'));
    }
  };

  const statusLabel = connection === 'connected' ? 'Đang bảo vệ' : connection === 'starting' ? 'Đang kết nối' : connection === 'stopping' ? 'Đang kết thúc' : connection === 'error' ? 'Cần thử lại' : 'Chưa bật';
  const statusTone = connection === 'connected' ? 'green' : connection === 'error' ? 'red' : 'amber';
  const riskTone = riskLevel === 'safe' ? 'green' : riskLevel === 'critical' || riskLevel === 'high' ? 'red' : 'amber';

  return (
    <AppScreen>
      <PageHeader
        action={<Pressable accessibilityLabel="Đóng" hitSlop={10} onPress={() => router.back()} style={styles.closeButton}><MaterialCommunityIcons color={colors.text} name="close" size={22} /></Pressable>}
        eyebrow="Scam Guardian"
        subtitle="Timi phân tích transcript cuộc gọi và báo sớm dấu hiệu lừa đảo bằng AI."
        title="Bảo vệ cuộc gọi"
      />
      <Card style={styles.heroCard}>
        <View style={styles.guardianIcon}><MaterialCommunityIcons color={colors.green} name="shield-account" size={34} /></View>
        <View style={styles.heroText}><Text style={styles.heroTitle}>Trợ lý cảnh giác</Text><Text style={styles.heroDescription}>Không lưu audio thô. Chỉ gửi nội dung bạn chủ động đưa vào phiên để phân tích.</Text><StatusPill label={statusLabel} tone={statusTone} /></View>
      </Card>
      {activeQuery.isLoading && !demoMode ? (
        <Card style={styles.compactState}><ScreenState compact kind="loading" title="Đang kiểm tra phiên Guardian" /></Card>
      ) : activeQuery.isError && !demoMode ? (
        <InlineNotice message="Không kiểm tra được phiên Guardian đang hoạt động. Bạn vẫn có thể nhấn thử lại bên dưới." tone="red" />
      ) : null}
      {connectionMessage ? <InlineNotice message={connectionMessage} tone={connection === 'error' ? 'red' : connection === 'idle' ? 'green' : 'blue'} /> : null}
      <Card style={styles.riskCard}>
        <View style={styles.riskHeader}><Text style={styles.sectionTitle}>Trạng thái phân tích</Text><StatusPill label={riskLevel === 'safe' ? 'An toàn' : riskLevel} tone={riskTone} /></View>
        <ProgressBar tone={riskTone} value={riskLevel === 'critical' ? 1 : riskLevel === 'high' ? 0.82 : riskLevel === 'medium' ? 0.56 : riskLevel === 'low' ? 0.28 : 0.08} />
        <Text style={styles.riskMessage}>{riskMessage}</Text>
      </Card>
      <TimiCompanion
        compact
        context="Timi theo dõi cùng bạn"
        defaultPrompt={`Guardian đang ở mức ${riskLevel}. Hãy giải thích mức này và cho tôi biết hành động an toàn tiếp theo mà không yêu cầu tôi gửi OTP, PIN hay mật khẩu.`}
        message={connection === 'connected'
          ? 'Mình đang theo dõi transcript bạn chủ động gửi. Nếu có dấu hiệu lạ, bạn có thể hỏi ngay.'
          : 'Bật Guardian khi cuộc gọi có nội dung thúc giục chuyển tiền hoặc yêu cầu cung cấp mã bí mật.'}
        suggestions={riskTone === 'red'
          ? ['Tôi nên kết thúc cuộc gọi thế nào?', 'Nếu đã cung cấp OTP thì cần làm gì ngay?']
          : ['Các câu nói lừa đảo thường gặp là gì?', 'Khi nào tôi nên bật Guardian?']}
      />
      <Card style={styles.transcriptCard}>
        <Text style={styles.sectionTitle}>Transcript trong phiên</Text>
        <Text style={styles.helper}>Bản mobile hiện cho phép gửi transcript thủ công. Khi thêm module microphone native, cùng WebSocket này sẽ nhận audio để Groq Whisper chuyển thành chữ.</Text>
        {transcripts.length ? transcripts.map((item, index) => <View key={`${item}-${index}`} style={styles.transcriptRow}><MaterialCommunityIcons color={colors.primary} name="message-text-outline" size={17} /><Text style={styles.transcriptText}>{item}</Text></View>) : <Text style={styles.emptyText}>Chưa có transcript.</Text>}
        <View style={styles.composer}><TextInput editable={connection === 'connected' || demoMode} multiline onChangeText={setDraft} onSubmitEditing={sendTranscript} placeholder="Dán nội dung đáng ngờ trong cuộc gọi..." placeholderTextColor="#909BB0" style={styles.input} value={draft} /><Pressable disabled={!draft.trim() || (connection !== 'connected' && !demoMode)} onPress={sendTranscript} style={styles.sendButton}><MaterialCommunityIcons color={colors.white} name="send" size={20} /></Pressable></View>
      </Card>
      {connection === 'connected' || connection === 'stopping' ? <PrimaryButton icon="stop-circle-outline" label="Kết thúc phiên bảo vệ" loading={connection === 'stopping'} loadingLabel="Đang kết thúc phiên" onPress={() => void stop()} variant="danger" /> : <PrimaryButton icon="shield-check" label={connection === 'error' ? 'Thử kết nối lại' : visibleSession?.status === 'active' ? 'Kết nối phiên đang hoạt động' : 'Bật Scam Guardian'} loading={connection === 'starting'} loadingLabel="Đang kết nối Guardian" onPress={() => void start()} />}
      <Text style={styles.safetyText}>Nếu Guardian báo STOP: dừng cuộc gọi, không chuyển tiền và không cung cấp OTP/PIN. AI chỉ hỗ trợ cảnh báo, quyết định cuối cùng vẫn thuộc về bạn.</Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  closeButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  heroCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.lg },
  compactState: { padding: 0 },
  guardianIcon: { alignItems: 'center', backgroundColor: colors.greenSoft, borderRadius: 22, height: 70, justifyContent: 'center', width: 70 },
  heroText: { flex: 1, gap: 5 },
  heroTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  heroDescription: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  riskCard: { gap: spacing.md },
  riskHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  riskMessage: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  transcriptCard: { gap: spacing.md },
  helper: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  transcriptRow: { alignItems: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: radius.small, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  transcriptText: { color: colors.text, flex: 1, fontSize: 13, lineHeight: 19 },
  emptyText: { color: colors.textMuted, fontSize: 13, paddingVertical: spacing.md, textAlign: 'center' },
  composer: { alignItems: 'flex-end', borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', minHeight: 54, padding: spacing.sm },
  input: { color: colors.text, flex: 1, fontSize: 14, maxHeight: 100, minHeight: 42, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, textAlignVertical: 'top' },
  sendButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 19, height: 38, justifyContent: 'center', width: 38 },
  safetyText: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
