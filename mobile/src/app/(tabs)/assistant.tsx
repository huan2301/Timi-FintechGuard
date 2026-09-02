import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { TimiAvatar } from '@/components/timi-companion';
import { AppScreen, InlineNotice, StatusPill } from '@/components/ui';
import { colors, radius, shadows, spacing } from '@/constants/theme';
import {
  clearAssistantHistory,
  emptyAssistantTaskState,
  getAssistantHistory,
  sendAssistantMessage,
  type AssistantTaskState,
  type AssistantUiAction,
} from '@/services/assistant';
import { useAuthStore } from '@/stores/auth-store';
import { getApiErrorMessage } from '@/utils/format';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: AssistantUiAction | null;
  followUps?: string[];
  error?: boolean;
};

const SENSITIVE_PATTERN = /(?:mã\s*(?:otp|pin)|otp|pin|mật khẩu|password)\s*[:=-]?\s*\d{4,}/iu;
const SENSITIVE_REPLY = 'Bạn đừng gửi OTP, PIN hoặc mật khẩu vào chat nhé. Timi không bao giờ yêu cầu các mã này qua hội thoại.';
const DEFAULT_SUGGESTIONS = [
  'Giúp tôi kiểm tra một giao dịch có an toàn không',
  'Dấu hiệu lừa đảo nào dễ bị bỏ qua?',
  'Mở trang quét QR',
];

const mobileRouteMap: Partial<Record<string, string>> = {
  '/dashboard': '/',
  '/transfer': '/transfer',
  '/qr?mode=scan': '/scan',
  '/qr?mode=create': '/scan?mode=create',
  '/history': '/history',
  '/me': '/profile',
  '/me?open=password': '/forgot-password',
  '/me?open=pin': '/pin',
  '/setup-pin': '/pin',
  '/setup-face': '/face?mode=enroll',
  '/help': '/assistant',
  '/terms': '/info?section=terms',
  '/privacy': '/info?section=privacy',
  '/mission': '/info?section=mission',
  '/services': '/info?section=services',
  '/download': '/info?section=download',
  '/demo': '/',
  '/cookies': '/info?section=cookies',
};

let messageSequence = 0;
function messageId(prefix: string) {
  messageSequence += 1;
  return `${prefix}-${Date.now()}-${messageSequence}`;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function followUpsFor(message: string, answer: string, action?: AssistantUiAction | null) {
  const text = `${message} ${answer}`.toLocaleLowerCase('vi-VN');
  if (action?.type === 'navigate_transfer_review' || text.includes('chuyển tiền')) {
    return ['Tôi cần kiểm tra gì trước khi chuyển?', 'Vì sao giao dịch có thể bị yêu cầu Face ID?', 'Mở trang chuyển tiền'];
  }
  if (text.includes('qr') || text.includes('liên kết')) {
    return ['QR nào tôi không nên mở?', 'Nếu đã bấm vào link lạ thì làm gì?', 'Mở máy quét QR'];
  }
  if (text.includes('lừa đảo') || text.includes('otp') || text.includes('cuộc gọi')) {
    return ['Dấu hiệu nào nguy hiểm nhất?', 'Nếu đã lỡ cung cấp thông tin thì làm gì?', 'Bật Guardian như thế nào?'];
  }
  if (text.includes('face id') || text.includes('pin') || text.includes('bảo mật')) {
    return ['Tôi nên bật PIN hay Face ID trước?', 'Mở phần thiết lập bảo mật', 'Giải thích ngắn gọn hơn'];
  }
  return ['Tôi nên làm gì tiếp theo?', 'Giải thích ngắn gọn hơn', 'Có lưu ý an toàn nào không?'];
}

function demoReply(message: string): { answer: string; action?: AssistantUiAction; followUps: string[] } {
  const normalized = message.toLocaleLowerCase('vi-VN');
  if (normalized.includes('qr') && (normalized.includes('tạo') || normalized.includes('nhận tiền') || normalized.includes('của tôi'))) {
    return {
      answer: 'Mình sẽ mở phần QR nhận tiền. Mã được tạo từ đúng tài khoản Timi của bạn và có thể kèm số tiền hoặc nội dung.',
      action: { type: 'navigate_app', route: '/qr?mode=create' },
      followUps: ['Mở phần tạo QR nhận tiền', 'Chia sẻ QR thế nào để tránh bị giả mạo?'],
    };
  }
  if (normalized.includes('qr')) {
    return {
      answer: 'Mình đã chuẩn bị lối tắt mở camera quét QR. Timi sẽ kiểm tra liên kết trước khi cho phép bạn mở.',
      action: { type: 'navigate_app', route: '/qr?mode=scan' },
      followUps: ['QR nào tôi không nên mở?', 'Mở máy quét QR'],
    };
  }
  if (normalized.includes('lịch sử') || normalized.includes('dòng tiền')) {
    return {
      answer: 'Bạn có thể mở Lịch sử để xem tiền vào, tiền ra và trạng thái an toàn của từng giao dịch.',
      action: { type: 'navigate_app', route: '/history' },
      followUps: ['Mở lịch sử giao dịch', 'Giúp tôi hiểu dòng tiền tháng này'],
    };
  }
  if (normalized.includes('chuyển tiền') || normalized.includes('giao dịch')) {
    return {
      answer: 'Mình sẽ đồng hành trong luồng Chuyển tiền: xác minh người nhận, giải thích rủi ro rồi mới cho phép xác nhận bằng PIN hoặc Face ID.',
      action: { type: 'navigate_app', route: '/transfer' },
      followUps: ['Mở trang chuyển tiền', 'Tôi cần kiểm tra gì trước khi chuyển?'],
    };
  }
  return {
    answer: 'Ở bản xem trước, mình vẫn có thể dẫn bạn đến đúng tính năng và hướng dẫn các bước an toàn. Đăng nhập tài khoản thật để nhận câu trả lời từ Chat Agent.',
    followUps: DEFAULT_SUGGESTIONS,
  };
}

function actionLabel(action: AssistantUiAction) {
  if (action.type === 'navigate_transfer_review') return 'Xem giao dịch đã chuẩn bị';
  if (action.type === 'set_guardian_voice_monitoring') return 'Mở Scam Guardian';
  if (action.route === '/qr?mode=create') return 'Tạo QR nhận tiền';
  if (action.route?.includes('qr')) return 'Mở máy quét QR';
  if (action.route === '/history') return 'Xem lịch sử';
  if (action.route === '/setup-face') return 'Thiết lập Face ID';
  if (action.route === '/setup-pin' || action.route === '/me?open=pin') return 'Thiết lập PIN';
  return 'Mở tính năng';
}

export default function AssistantScreen() {
  const demoMode = useAuthStore((state) => state.demoMode);
  const user = useAuthStore((state) => state.user)!;
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const handledPromptRef = useRef<string | null>(null);
  const sendRef = useRef<(message: string) => void>(() => undefined);
  const params = useLocalSearchParams<{ prompt?: string; context?: string; source?: string; requestId?: string }>();
  const routePrompt = firstParam(params.prompt);
  const routeContext = firstParam(params.context);
  const requestId = firstParam(params.requestId);
  const [draft, setDraft] = useState('');
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>([]);
  const [taskState, setTaskState] = useState<AssistantTaskState>(() => emptyAssistantTaskState());
  const firstName = user.full_name.trim().split(/\s+/).at(-1) || 'bạn';

  const welcomeMessage = useMemo<ChatMessage>(() => ({
    id: 'welcome',
    role: 'assistant',
    content: `Chào ${firstName}, mình là Timi. Mình có thể cùng bạn kiểm tra giao dịch, nhận diện lừa đảo và mở đúng tính năng khi bạn cần.`,
    followUps: DEFAULT_SUGGESTIONS,
  }), [firstName]);

  const historyQuery = useQuery({
    queryKey: ['mobile-assistant-history', user.id],
    queryFn: getAssistantHistory,
    enabled: !demoMode,
  });

  const historyMessages = useMemo(
    () => (demoMode ? [] : (historyQuery.data?.items ?? []).flatMap<ChatMessage>((item) => [
      { id: `history-user-${item.id}`, role: 'user', content: item.question },
      { id: `history-assistant-${item.id}`, role: 'assistant', content: item.answer },
    ])),
    [demoMode, historyQuery.data?.items],
  );
  const messages = useMemo(
    () => [welcomeMessage, ...historyMessages, ...sessionMessages],
    [historyMessages, sessionMessages, welcomeMessage],
  );
  const activeSuggestions = useMemo(
    () => [...messages].reverse().find((item) => item.role === 'assistant' && item.followUps?.length)?.followUps ?? DEFAULT_SUGGESTIONS,
    [messages],
  );

  const chatMutation = useMutation({
    mutationFn: ({ message, state }: { message: string; state: AssistantTaskState }) => sendAssistantMessage(message, state),
    onSuccess: (response, request) => {
      setTaskState(response.task_state);
      setSessionMessages((current) => [
        ...current,
        {
          id: messageId('assistant'), role: 'assistant', content: response.answer,
          action: response.action, followUps: followUpsFor(request.message, response.answer, response.action),
        },
      ]);
    },
    onError: (error, request) => {
      setSessionMessages((current) => [
        ...current,
        {
          id: messageId('assistant-error'), role: 'assistant', error: true,
          content: getApiErrorMessage(error, 'Timi chưa thể trả lời lúc này. Bạn thử lại sau một chút nhé.'),
          followUps: [request.message, 'Kiểm tra kết nối API giúp tôi'],
        },
      ]);
    },
  });

  const clearMutation = useMutation({
    mutationFn: clearAssistantHistory,
    onSuccess: () => {
      setSessionMessages([]);
      setTaskState(emptyAssistantTaskState());
      queryClient.setQueryData(['mobile-assistant-history', user.id], { items: [] });
    },
    onError: (error) => Alert.alert('Không thể xóa lịch sử', getApiErrorMessage(error, 'Vui lòng thử lại sau.')),
  });

  const send = (rawMessage = draft) => {
    const message = rawMessage.trim();
    if (!message || chatMutation.isPending) return;
    setDraft('');
    setSessionMessages((current) => [...current, { id: messageId('user'), role: 'user', content: message }]);

    if (SENSITIVE_PATTERN.test(message)) {
      setSessionMessages((current) => [
        ...current,
        { id: messageId('assistant-safe'), role: 'assistant', content: SENSITIVE_REPLY, followUps: ['Timi bảo vệ dữ liệu của tôi thế nào?', 'Tôi nên làm gì nếu đã lộ OTP?'] },
      ]);
      return;
    }

    if (demoMode) {
      const response = demoReply(message);
      setSessionMessages((current) => [
        ...current,
        { id: messageId('assistant-demo'), role: 'assistant', content: response.answer, action: response.action, followUps: response.followUps },
      ]);
      return;
    }

    chatMutation.mutate({ message, state: taskState });
  };
  useEffect(() => {
    sendRef.current = send;
  });

  useEffect(() => {
    if (!routePrompt) return;
    const key = requestId || `${routeContext || 'Timi'}:${routePrompt}`;
    if (handledPromptRef.current === key) return;
    handledPromptRef.current = key;
    const timer = setTimeout(() => sendRef.current(routePrompt), 180);
    return () => clearTimeout(timer);
  }, [requestId, routeContext, routePrompt]);

  const executeAction = (action: AssistantUiAction) => {
    if (action.type === 'navigate_transfer_review') {
      const transfer = action.transfer;
      if (!transfer?.recipient_account || !transfer.bank_code || !transfer.amount) {
        Alert.alert('Thiếu thông tin', 'Timi cần đủ tài khoản, ngân hàng và số tiền trước khi mở bước kiểm tra.');
        return;
      }
      router.push({
        pathname: '/transfer',
        params: { accountNumber: transfer.recipient_account, bankCode: transfer.bank_code, amount: String(transfer.amount), note: transfer.note || '' },
      });
      return;
    }
    if (action.type === 'set_guardian_voice_monitoring') {
      router.push('/guardian' as Href);
      return;
    }
    const target = action.route ? mobileRouteMap[action.route] : undefined;
    if (target) router.push(target as Href);
    else Alert.alert('Chưa thể mở tính năng', 'Timi chưa tìm thấy màn hình phù hợp trên phiên bản ứng dụng này.');
  };

  const confirmClear = () => {
    if (demoMode) {
      setSessionMessages([]);
      setTaskState(emptyAssistantTaskState());
      return;
    }
    Alert.alert('Xóa hội thoại', 'Xóa toàn bộ lịch sử chat riêng của tài khoản này?', [
      { text: 'Giữ lại', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => clearMutation.mutate() },
    ]);
  };

  const pending = chatMutation.isPending;

  return (
    <AppScreen contentStyle={styles.screen} scroll={false}>
      <View style={styles.header}>
        <TimiAvatar online size={52} />
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Timi của {firstName}</Text>
            <StatusPill label={demoMode ? 'Demo' : 'Online'} tone={demoMode ? 'blue' : 'green'} />
          </View>
          <Text style={styles.subtitle}>Cùng bạn hiểu rõ trước khi quyết định</Text>
        </View>
        <Pressable accessibilityLabel="Xóa lịch sử chat" disabled={clearMutation.isPending} onPress={confirmClear} style={styles.headerButton}>
          {clearMutation.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <MaterialCommunityIcons color={colors.textMuted} name="trash-can-outline" size={20} />}
        </Pressable>
      </View>

      {routeContext ? (
        <View style={styles.contextBanner}>
          <MaterialCommunityIcons color={colors.primary} name="map-marker-radius-outline" size={17} />
          <Text style={styles.contextText}>Đang tiếp tục từ: <Text style={styles.contextStrong}>{routeContext}</Text></Text>
        </View>
      ) : null}

      {historyQuery.isError && !demoMode ? (
        <Pressable onPress={() => void historyQuery.refetch()}>
          <InlineNotice message="Không tải được lịch sử cũ. Chạm để thử lại; bạn vẫn có thể hỏi câu mới." tone="red" />
        </Pressable>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatShell}>
        <FlatList
          ref={listRef}
          contentContainerStyle={styles.messageList}
          data={messages}
          keyExtractor={(item) => item.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={[styles.messageRow, item.role === 'user' && styles.userMessageRow]}>
              {item.role === 'assistant' ? <TimiAvatar size={30} /> : null}
              <View style={styles.bubbleColumn}>
                <View style={[
                  styles.messageBubble,
                  item.role === 'user' ? styles.userBubble : styles.assistantBubble,
                  item.error && styles.errorBubble,
                ]}>
                  <Text style={[styles.messageText, item.role === 'user' && styles.userMessageText]}>{item.content}</Text>
                  {item.action ? (
                    <Pressable onPress={() => executeAction(item.action!)} style={styles.actionButton}>
                      <Text style={styles.actionButtonText}>{actionLabel(item.action)}</Text>
                      <MaterialCommunityIcons color={colors.primary} name="arrow-right" size={17} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />

        {pending ? (
          <View style={styles.thinkingRow}>
            <TimiAvatar size={28} />
            <View style={styles.thinkingBubble}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.thinkingText}>Timi đang suy nghĩ cùng bạn...</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.followUpArea}>
          <View style={styles.followUpTitleRow}>
            <MaterialCommunityIcons color={colors.primary} name="creation-outline" size={15} />
            <Text style={styles.followUpTitle}>Bạn có thể hỏi tiếp</Text>
          </View>
          <ScrollView contentContainerStyle={styles.suggestions} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
            {activeSuggestions.map((suggestion) => (
              <Pressable disabled={pending} key={suggestion} onPress={() => send(suggestion)} style={({ pressed }) => [styles.suggestionChip, pressed && styles.pressed]}>
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.composer}>
          <TextInput
            blurOnSubmit={false}
            editable={!pending}
            maxLength={800}
            multiline
            onChangeText={setDraft}
            onSubmitEditing={() => send()}
            placeholder="Hỏi Timi bất cứ điều gì..."
            placeholderTextColor="#969BB0"
            returnKeyType="send"
            selectionColor={colors.primary}
            style={styles.input}
            value={draft}
          />
          <Pressable accessibilityLabel="Gửi tin nhắn" disabled={!draft.trim() || pending} onPress={() => send()} style={[styles.sendButton, (!draft.trim() || pending) && styles.sendButtonDisabled]}>
            <MaterialCommunityIcons color={colors.white} name="arrow-up" size={21} />
          </Pressable>
        </View>
        <Text style={styles.safetyText}>Không gửi OTP, PIN, mật khẩu hoặc số thẻ vào hội thoại.</Text>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md, paddingBottom: 82 },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  headerText: { flex: 1, gap: 3 },
  titleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  title: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, fontSize: 11 },
  headerButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 15, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  contextBanner: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.medium, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  contextText: { color: colors.textMuted, flex: 1, fontSize: 11 },
  contextStrong: { color: colors.primaryDark, fontWeight: '900' },
  chatShell: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, flex: 1, minHeight: 0, overflow: 'hidden', ...shadows },
  messageList: { flexGrow: 1, gap: spacing.md, padding: spacing.lg },
  messageRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  userMessageRow: { justifyContent: 'flex-end' },
  bubbleColumn: { maxWidth: '84%' },
  messageBubble: { borderRadius: 20, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  assistantBubble: { backgroundColor: colors.surfaceMuted, borderBottomLeftRadius: 6 },
  userBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  errorBubble: { backgroundColor: colors.redSoft, borderColor: '#F3C6CD', borderWidth: 1 },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  userMessageText: { color: colors.white },
  actionButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.white, borderColor: '#DEDDFC', borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: 5, marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionButtonText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  thinkingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  thinkingBubble: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.medium, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  thinkingText: { color: colors.primaryDark, fontSize: 11, fontWeight: '700' },
  followUpArea: { borderTopColor: colors.border, borderTopWidth: 1, gap: 6, paddingTop: spacing.sm },
  followUpTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: spacing.md },
  followUpTitle: { color: colors.primaryDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  suggestions: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 5 },
  suggestionChip: { backgroundColor: colors.lavenderSoft, borderColor: '#E1DDFD', borderRadius: radius.pill, borderWidth: 1, maxWidth: 230, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  suggestionText: { color: colors.primaryDark, fontSize: 11, fontWeight: '700' },
  composer: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 20, borderWidth: 1, color: colors.text, flex: 1, fontSize: 14, maxHeight: 100, minHeight: 48, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sendButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 18, height: 48, justifyContent: 'center', width: 48 },
  sendButtonDisabled: { opacity: 0.4 },
  safetyText: { color: colors.textMuted, fontSize: 9, paddingBottom: spacing.sm, paddingHorizontal: spacing.lg, textAlign: 'center' },
  pressed: { opacity: 0.68 },
});
