import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { TimiAvatar } from '@/components/timi-companion';
import { InlineNotice, PrimaryButton } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import {
  askRiskCoach,
  type AssistantChatTurn,
  type AssistantRiskContext,
} from '@/services/assistant';
import { getApiErrorMessage } from '@/utils/format';

type CoachMessage = AssistantChatTurn & { id: string };

const SENSITIVE_PATTERN = /(?:mã\s*(?:otp|pin)|otp|pin|mật khẩu|password)\s*[:=-]?\s*\d{4,}/iu;

function messageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function demoCoachReply(message: string, guidedQuestion?: string | null) {
  if (guidedQuestion) {
    return `Cảm ơn bạn đã trả lời. Với thông tin “${message}”, hãy đối chiếu lại bằng một kênh độc lập: tự gọi số chính thức của người nhận hoặc ngân hàng, không dùng số/link do người lạ gửi. Nếu còn áp lực phải chuyển ngay, lựa chọn an toàn nhất là dừng giao dịch.`;
  }
  return 'Mình đã đọc các dấu hiệu của giao dịch. Thông tin người nhận có vẻ nhất quán, nhưng bạn vẫn nên xác nhận lại tên, số tài khoản và lý do chuyển tiền trước bước cuối. Timi sẽ hỏi từng câu ngắn để cùng bạn kiểm tra.';
}

export function RiskCoach({ context, demoMode }: { context: AssistantRiskContext; demoMode: boolean }) {
  const inputRef = useRef<TextInput>(null);
  const lastRequestRef = useRef<{ message: string; selectedQuestion: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [guidedQuestion, setGuidedQuestion] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCoach = async ({
    message,
    selectedQuestion = null,
    showUser = true,
  }: {
    message: string;
    selectedQuestion?: string | null;
    showUser?: boolean;
  }) => {
    if (busy) return;
    lastRequestRef.current = { message, selectedQuestion };
    const userMessage: CoachMessage = { id: messageId('coach-user'), role: 'user', content: message };
    const nextMessages = showUser ? [...messages, userMessage] : messages;
    if (showUser) setMessages(nextMessages);
    setBusy(true);
    setError(null);
    setQuestions([]);
    try {
      if (demoMode) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        setMessages((current) => [
          ...current,
          { id: messageId('coach-timi'), role: 'assistant', content: demoCoachReply(message, selectedQuestion) },
        ]);
        setQuestions(selectedQuestion ? [
          'Bạn có đang bị thúc giục phải chuyển ngay không?',
          'Bạn đã tự gọi lại người nhận để xác minh chưa?',
        ] : [
          'Bạn biết người nhận qua kênh nào?',
          'Bạn có đang bị thúc giục phải chuyển ngay không?',
          'Bạn đã tự gọi lại người nhận để xác minh chưa?',
        ]);
      } else {
        const response = await askRiskCoach({
          message,
          context,
          history: nextMessages.slice(-6).map(({ role, content }) => ({ role, content })),
          guided_question: selectedQuestion,
        });
        setMessages((current) => [
          ...current,
          { id: messageId('coach-timi'), role: 'assistant', content: response.answer },
        ]);
        setQuestions(response.questions.filter((question) => question !== selectedQuestion));
      }
      setGuidedQuestion(null);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Timi chưa thể giải thích cảnh báo lúc này. Bạn có thể thử lại.'));
    } finally {
      setBusy(false);
    }
  };

  const openCoach = () => {
    setOpen(true);
    if (!messages.length && !busy) {
      void requestCoach({
        message: 'Hãy giải thích cảnh báo giao dịch này và giúp tôi tự kiểm tra an toàn.',
        showUser: false,
      });
    }
  };

  const askGuidedQuestion = (question: string) => {
    if (busy) return;
    setGuidedQuestion(question);
    setQuestions([]);
    setMessages((current) => [
      ...current,
      { id: messageId('coach-question'), role: 'assistant', content: question },
    ]);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const send = () => {
    const message = draft.trim();
    if (!message || busy) return;
    setDraft('');
    if (SENSITIVE_PATTERN.test(message)) {
      setMessages((current) => [
        ...current,
        { id: messageId('coach-safe'), role: 'assistant', content: 'Đừng gửi OTP, PIN hoặc mật khẩu cho Timi. Hãy giữ kín các mã này và chỉ xác nhận trong màn giao dịch chính thức.' },
      ]);
      return;
    }
    void requestCoach({ message, selectedQuestion: guidedQuestion });
  };

  if (!open) {
    return (
      <View style={styles.preview}>
        <View style={styles.previewTop}>
          <TimiAvatar online size={46} />
          <View style={styles.previewText}>
            <Text style={styles.eyebrow}>Timi đồng hành</Text>
            <Text style={styles.previewTitle}>Bạn chưa cần quyết định một mình</Text>
            <Text style={styles.previewDescription}>Timi có thể giải thích dấu hiệu và hỏi từng câu để bạn tự kiểm tra.</Text>
          </View>
        </View>
        <PrimaryButton icon="message-question-outline" label="Giải thích cùng Timi" onPress={openCoach} variant="soft" />
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <TimiAvatar online size={42} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Timi đang cùng bạn kiểm tra</Text>
          <Text style={styles.subtitle}>Chỉ giải thích · không tự thực hiện giao dịch</Text>
        </View>
        <Pressable accessibilityLabel="Thu gọn Timi" onPress={() => setOpen(false)} style={styles.closeButton}>
          <MaterialCommunityIcons color={colors.textMuted} name="chevron-up" size={21} />
        </Pressable>
      </View>

      <View style={styles.messages}>
        {messages.map((item) => (
          <View key={item.id} style={[styles.messageRow, item.role === 'user' && styles.userMessageRow]}>
            {item.role === 'assistant' ? <TimiAvatar size={26} /> : null}
            <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
              <Text style={[styles.bubbleText, item.role === 'user' && styles.userBubbleText]}>{item.content}</Text>
            </View>
          </View>
        ))}
        {busy ? (
          <View style={styles.thinking}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.thinkingText}>Timi đang đọc dấu hiệu giao dịch...</Text>
          </View>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorArea}>
          <InlineNotice message={error} tone="red" />
          <PrimaryButton
            label="Thử lại"
            onPress={() => {
              const request = lastRequestRef.current;
              if (request) void requestCoach({ ...request, showUser: false });
            }}
            variant="outline"
          />
        </View>
      ) : null}

      {questions.length && !busy ? (
        <View style={styles.questionArea}>
          <Text style={styles.questionTitle}>Timi muốn hỏi bạn</Text>
          {questions.slice(0, 3).map((question) => (
            <Pressable key={question} onPress={() => askGuidedQuestion(question)} style={styles.question}>
              <Text style={styles.questionText}>{question}</Text>
              <MaterialCommunityIcons color={colors.primary} name="chevron-right" size={18} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {guidedQuestion ? (
        <View style={styles.guidedHint}>
          <MaterialCommunityIcons color={colors.primary} name="reply-outline" size={16} />
          <Text style={styles.guidedHintText}>Hãy trả lời câu hỏi trên bằng thông tin bạn biết.</Text>
        </View>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          editable={!busy}
          maxLength={800}
          multiline
          onChangeText={setDraft}
          onSubmitEditing={send}
          placeholder={guidedQuestion ? 'Nhập câu trả lời của bạn...' : 'Hỏi thêm về cảnh báo...'}
          placeholderTextColor="#969BB0"
          ref={inputRef}
          returnKeyType="send"
          style={styles.input}
          value={draft}
        />
        <Pressable accessibilityLabel="Gửi cho Timi" disabled={!draft.trim() || busy} onPress={send} style={[styles.send, (!draft.trim() || busy) && styles.sendDisabled]}>
          <MaterialCommunityIcons color={colors.white} name="arrow-up" size={20} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { backgroundColor: colors.lavenderSoft, borderColor: '#DED9FF', borderRadius: radius.large, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  previewTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  previewText: { flex: 1, gap: 4 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  previewTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  previewDescription: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  panel: { backgroundColor: colors.lavenderSoft, borderColor: '#DED9FF', borderRadius: radius.large, borderWidth: 1, gap: spacing.md, overflow: 'hidden', padding: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  headerText: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 14, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 9 },
  closeButton: { alignItems: 'center', backgroundColor: '#FFFFFFA8', borderRadius: 12, height: 34, justifyContent: 'center', width: 34 },
  messages: { gap: spacing.sm },
  messageRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 6 },
  userMessageRow: { justifyContent: 'flex-end' },
  bubble: { borderRadius: 16, maxWidth: '84%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  assistantBubble: { backgroundColor: colors.white, borderBottomLeftRadius: 5 },
  userBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 5 },
  bubbleText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  userBubbleText: { color: colors.white },
  thinking: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm },
  thinkingText: { color: colors.primaryDark, fontSize: 11, fontWeight: '700' },
  errorArea: { gap: spacing.sm },
  questionArea: { gap: spacing.sm },
  questionTitle: { color: colors.primaryDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  question: { alignItems: 'center', backgroundColor: '#FFFFFFB8', borderColor: '#E2DEFC', borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 42, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  questionText: { color: colors.primaryDark, flex: 1, fontSize: 11, fontWeight: '700', lineHeight: 16 },
  guidedHint: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 4 },
  guidedHintText: { color: colors.primaryDark, flex: 1, fontSize: 10 },
  composer: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  input: { backgroundColor: colors.white, borderColor: '#DED9FA', borderRadius: 18, borderWidth: 1, color: colors.text, flex: 1, fontSize: 12, maxHeight: 96, minHeight: 46, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  send: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 16, height: 46, justifyContent: 'center', width: 46 },
  sendDisabled: { opacity: 0.4 },
});
