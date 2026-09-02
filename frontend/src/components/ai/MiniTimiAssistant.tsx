import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2, MessageCircle, Mic, MicOff, Minimize2, Send, Shield, ShieldAlert, Sparkles, Trash2, X, Zap } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { assistantApi, type AssistantChatTurn, type AssistantTaskState } from "@/services/api/assistant";
import TimiChibi from "@/components/ai/TimiChibi";
import { useScamGuardian } from "@/components/guardian/ScamGuardianProvider";
import type { GuardianRiskEvent } from "@/services/api/guardian";
import { useAuthStore } from "@/stores/authStore";
import { useTimiAssistantStore } from "@/stores/timiAssistantStore";

type AssistantTip = {
  title: string;
  message: string;
};

type ChatMessage = AssistantChatTurn & { id: string };

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: { transcript: string };
  }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type AssistantApiError = {
  response?: {
    status?: number;
    data?: { detail?: unknown };
  };
};

const INLINE_MARKDOWN_PATTERN = /(\*\*(.+?)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*([^*]+)\*)/g;

function renderInlineMarkdown(value: string): ReactNode[] {
  const children: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of value.matchAll(INLINE_MARKDOWN_PATTERN)) {
    const index = match.index ?? cursor;
    if (index > cursor) children.push(value.slice(cursor, index));

    const key = `${index}-${tokenIndex++}`;
    if (match[2] || match[3]) {
      children.push(
        <strong key={key} className="font-bold text-slate-900">
          {match[2] ?? match[3]}
        </strong>,
      );
    } else if (match[4]) {
      children.push(
        <code key={key} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-indigo-700">
          {match[4]}
        </code>,
      );
    } else if (match[5] && match[6]) {
      children.push(
        <a
          key={key}
          href={match[6]}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-800"
        >
          {match[5]}
        </a>,
      );
    } else if (match[7]) {
      children.push(
        <em key={key} className="italic text-slate-800">
          {match[7]}
        </em>,
      );
    } else {
      children.push(match[0]);
    }
    cursor = index + match[0].length;
  }

  if (cursor < value.length) children.push(value.slice(cursor));
  return children;
}

function renderInlineLines(lines: string[]): ReactNode[] {
  return lines.flatMap((line, index) => [
    ...(index > 0 ? [<br key={`break-${index}`} />] : []),
    ...renderInlineMarkdown(line),
  ]);
}

function normaliseAssistantContent(content: string): string {
  const cleaned = content
    .replace(/\r\n?/g, "\n")
    // Some providers use a Markdown backslash to force a line break. It is
    // not useful in the chat bubble and was previously rendered literally.
    .replace(/[ \t]*\\+[ \t]*(?=\n|$)/g, "")
    // Be defensive if a provider returns the characters "\\n" instead of a
    // real newline.
    .replace(/\\n/g, "\n");

  return cleaned
    .split("\n")
    .flatMap((line) => {
      const inlineSteps = line.match(
        /^(.*?(?:việc nên làm|bạn nên làm|cách xử lý|các bước)\s*:)\s*(\d+[.)]\s+.+)$/iu,
      );
      if (!inlineSteps) return [line];
      return [
        inlineSteps[1],
        ...inlineSteps[2].split(/\s+(?=\d+[.)]\s+)/),
      ];
    })
    .join("\n");
}

const GUARDIAN_SIGNAL_COPY: Record<string, string> = {
  otp_request: "Người gọi yêu cầu mã OTP hoặc mã xác thực.",
  credential_social_engineering: "Người gọi yêu cầu thông tin bảo mật như PIN hoặc mật khẩu.",
  money_transfer_request: "Người gọi gây áp lực để bạn chuyển tiền.",
  safe_account_scam: "Người gọi nhắc đến “tài khoản an toàn/tạm giữ” để yêu cầu chuyển tiền.",
  remote_access_request: "Người gọi yêu cầu cài ứng dụng hoặc cho phép điều khiển thiết bị từ xa.",
  screen_sharing_request: "Người gọi yêu cầu chia sẻ màn hình điện thoại.",
  bank_impersonation: "Người gọi tự xưng là nhân viên hoặc bộ phận bảo mật ngân hàng.",
  authority_impersonation: "Người gọi tự xưng là cán bộ/cơ quan có thẩm quyền.",
  account_lock_threat: "Người gọi đe dọa khóa hoặc phong tỏa tài khoản.",
  prevent_external_verification: "Người gọi ngăn bạn tự gọi tổng đài hoặc kiểm tra qua kênh chính thức.",
  urgency: "Người gọi thúc giục bạn phải làm ngay.",
  secrecy_request: "Người gọi yêu cầu bạn giữ bí mật hoặc không hỏi người khác.",
};

function guardianAlertMessage(risk: GuardianRiskEvent): string {
  const reasons = [...new Set(
    risk.signals
      .map((signal) => GUARDIAN_SIGNAL_COPY[signal.type])
      .filter((value): value is string => Boolean(value)),
  )].slice(0, 2);
  const reasonLines = reasons.length > 0
    ? reasons.map((reason) => `• ${reason}`).join("\n")
    : "• Cuộc gọi có yêu cầu thao tác bảo mật hoặc chuyển tiền bất thường.";

  return [
    "🚨 Timi khuyên bạn dừng lại vì cuộc gọi này có dấu hiệu lừa đảo nghiêm trọng.",
    `Mức cảnh báo hiện tại: ${risk.risk_score}/100.`,
    `Timi nhận thấy:\n${reasonLines}`,
    "Bạn nên làm ngay:\n• Dừng cuộc gọi. Không chuyển tiền, không đọc OTP và không cung cấp PIN/mật khẩu.\n• Nếu cần kiểm tra, tự gọi số tổng đài chính thức hoặc liên hệ người quen qua số bạn đã lưu.",
  ].join("\n\n");
}

function AssistantRichText({ content }: { content: string }) {
  const lines = normaliseAssistantContent(content).split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let unordered: string[] = [];
  let ordered: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={`paragraph-${blocks.length}`} className="whitespace-normal">
          {renderInlineLines(paragraph)}
        </p>,
      );
      paragraph = [];
    }
    if (unordered.length) {
      blocks.push(
        <ul key={`unordered-${blocks.length}`} className="list-disc space-y-1 pl-5 marker:text-indigo-400">
          {unordered.map((item, index) => (
            <li key={`unordered-item-${index}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      unordered = [];
    }
    if (ordered.length) {
      blocks.push(
        <ol key={`ordered-${blocks.length}`} className="list-decimal space-y-1 pl-5 marker:font-semibold marker:text-indigo-500">
          {ordered.map((item, index) => (
            <li key={`ordered-item-${index}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>,
      );
      ordered = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }

    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flush();
      blocks.push(
        <h4 key={`heading-${blocks.length}`} className="pt-1 text-[13px] font-extrabold text-slate-900">
          {renderInlineMarkdown(heading[1])}
        </h4>,
      );
      continue;
    }

    if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) {
      flush();
      blocks.push(<hr key={`rule-${blocks.length}`} className="border-slate-100" />);
      continue;
    }

    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      if (ordered.length) flush();
      unordered.push(bullet[1]);
      continue;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      if (unordered.length) flush();
      ordered.push(numbered[1]);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flush();
      blocks.push(
        <blockquote key={`quote-${blocks.length}`} className="rounded-xl border-l-2 border-indigo-300 bg-indigo-50/70 px-3 py-2 text-indigo-900">
          {renderInlineMarkdown(quote[1])}
        </blockquote>,
      );
      continue;
    }

    paragraph.push(trimmed);
  }
  flush();

  return <div className="space-y-2.5">{blocks}</div>;
}

function assistantErrorMessage(error: unknown): string {
  const apiError = error as AssistantApiError;
  const detail = apiError.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (apiError.response?.status === 503) {
    return "Chat Agent đang tạm hết quota hoặc chưa được cấu hình. Bạn thử lại sau nhé.";
  }
  return "Timi chưa thể kết nối để trả lời lúc này. Bạn thử lại sau một chút nhé.";
}

const SENSITIVE_CREDENTIAL_PATTERN = /(?:mã\s*(?:otp|pin)|otp|pin|mật khẩu|password)\s*[:=-]?\s*\d{4,}/iu;
const SENSITIVE_CREDENTIAL_MESSAGE = "Bạn đừng gửi OTP, PIN hoặc mật khẩu vào chat nhé. Timi không bao giờ yêu cầu các mã này qua hội thoại.";
const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Chào bạn! Mình có thể mở Chuyển tiền, QR, Lịch sử, Hồ sơ, đổi mật khẩu, PIN, Face ID và bật/tắt bảo vệ cuộc gọi của Timi.",
};
const EMPTY_TASK_STATE: AssistantTaskState = {
  task: "none",
  transfer: {
    recipient_name: null,
    recipient_account: null,
    bank_code: null,
    amount: null,
    note: null,
  },
  last_recipient: null,
};

function taskStorageKey(userId: string): string {
  return `timi-assistant-task:${userId}`;
}

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const browserWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

function readTaskState(userId: string): AssistantTaskState {
  try {
    const stored = window.sessionStorage.getItem(taskStorageKey(userId));
    if (!stored) return EMPTY_TASK_STATE;
    const candidate = JSON.parse(stored) as Partial<AssistantTaskState>;
    const rawLastRecipient = candidate.last_recipient;
    const lastRecipient = rawLastRecipient?.recipient_account && rawLastRecipient.bank_code
      ? {
          ...EMPTY_TASK_STATE.transfer,
          ...rawLastRecipient,
          amount: null,
          note: null,
        }
      : null;
    if (candidate.task === "transfer" && candidate.transfer) {
      return {
        task: "transfer",
        transfer: { ...EMPTY_TASK_STATE.transfer, ...candidate.transfer },
        last_recipient: lastRecipient,
      };
    }
    if (candidate.task === "none") {
      return {
        task: "none",
        transfer: { ...EMPTY_TASK_STATE.transfer },
        last_recipient: lastRecipient,
      };
    }
    return EMPTY_TASK_STATE;
  } catch {
    return EMPTY_TASK_STATE;
  }
}

function firstName(fullName?: string | null): string {
  return fullName?.trim().split(/\s+/)[0] || "bạn";
}

function formatRiskAmount(value: number | null): string {
  if (value == null) return "Chưa có số tiền";
  return `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
}

function tipsForPath(pathname: string, name: string): AssistantTip[] {
  if (pathname === "/transfer") {
    return [
      { title: `Chào ${name}!`, message: "Timi ở đây cùng bạn. Nhớ kiểm tra tên người nhận trước khi chuyển nhé." },
      { title: "Mẹo nhỏ từ Timi", message: "Đừng chia sẻ OTP, mã PIN hay ảnh khuôn mặt cho bất kỳ ai." },
      { title: "Đang cần hỗ trợ?", message: "Khi phân tích giao dịch, Timi sẽ báo rõ các dấu hiệu cần lưu ý." },
    ];
  }
  if (pathname === "/qr") {
    return [
      { title: "Timi cùng quét QR", message: "QR chứa đường dẫn sẽ được kiểm tra blacklist trước khi bạn mở." },
      { title: "Nhắc bạn nè", message: "Chỉ quét QR từ nguồn bạn tin tưởng và xem kỹ nội dung trước khi tiếp tục." },
    ];
  }
  if (pathname === "/history") {
    return [
      { title: "Lịch sử giao dịch", message: "Bạn có thể xem lại giao dịch gần đây để phát hiện điều bất thường." },
      { title: "Timi luôn bên bạn", message: "Thấy giao dịch lạ? Hãy báo ngay để hệ thống hỗ trợ kiểm tra." },
    ];
  }
  if (pathname === "/confirm-location") {
    return [
      { title: `Chào ${name}!`, message: "Cấp vị trí gần đúng giúp Timi nhận ra đăng nhập bất thường và bảo vệ tài khoản tốt hơn." },
    ];
  }
  if (pathname === "/setup-pin" || pathname === "/setup-face") {
    return [
      { title: "Cùng hoàn thiện bảo mật nhé", message: "Thêm PIN và Face ID giúp Timi bảo vệ giao dịch của bạn tốt hơn." },
    ];
  }
  return [
    { title: `Chào ${name}!`, message: "Timi đã online. Mình sẽ đồng hành để mỗi giao dịch của bạn an toàn hơn." },
    { title: "Mẹo bảo mật", message: "Không chuyển tiền vội khi người lạ tạo cảm giác khẩn cấp hoặc thúc ép bạn." },
  ];
}

export default function MiniTimiAssistant() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const activity = useTimiAssistantStore((state) => state.activity);
  const riskContext = useTimiAssistantStore((state) => state.riskContext);
  const clearActivity = useTimiAssistantStore((state) => state.clearActivity);
  const { criticalAlert, risk, setVoiceMonitoringEnabled } = useScamGuardian();
  const [isOpen, setOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [widgetPosition, setWidgetPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    WELCOME_MESSAGE,
  ]);
  const [riskCoachMessages, setRiskCoachMessages] = useState<ChatMessage[]>([]);
  const [riskCoachQuestions, setRiskCoachQuestions] = useState<string[]>([]);
  const [riskCoachGuidedMode, setRiskCoachGuidedMode] = useState(false);
  const [activeRiskCoachQuestion, setActiveRiskCoachQuestion] = useState<string | null>(null);
  const [taskState, setTaskState] = useState<AssistantTaskState>(EMPTY_TASK_STATE);
  const [isListening, setListening] = useState(false);
  const [voiceInputAvailable, setVoiceInputAvailable] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const handledGuardianAlertRef = useRef<unknown>(null);
  const hydratedHistoryUserRef = useRef<string | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechTranscriptRef = useRef("");
  const submitSpeechOnEndRef = useRef(false);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const riskCoachRequestRef = useRef<string | null>(null);
  const name = firstName(user?.full_name);
  const tips = useMemo(() => tipsForPath(location.pathname, name), [location.pathname, name]);
  const tip = tips[tipIndex % tips.length];

  const activityTip: AssistantTip | null = activity.status === "analyzing"
    ? { title: "Timi đang kiểm tra nè", message: "Ráng chờ mình một xíu nhé. Timi đang đối chiếu giao dịch để bảo vệ bạn." }
    : activity.status === "warning"
      ? {
          title: "Timi thấy điều cần lưu ý",
          message: activity.riskLevel === "high"
            ? "Đừng vội chuyển tiền nhé! Hãy dừng lại và kiểm tra kỹ cảnh báo của Timi."
            : "Giao dịch này cần được kiểm tra thêm. Mình cùng xem kỹ trước khi tiếp tục nhé.",
        }
      : activity.status === "complete"
        ? { title: "Timi đã kiểm tra xong", message: activity.message ?? "Mình đã hoàn tất kiểm tra. Cảm ơn bạn đã kiên nhẫn nhé!" }
        : null;

  const displayedTip = activityTip ?? tip;

  const historyQuery = useQuery({
    queryKey: ["assistant-chat-history", user?.id],
    queryFn: assistantApi.history,
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  const chatMutation = useMutation({
    mutationFn: assistantApi.chat,
    onSuccess: async (response) => {
      setTaskState(response.task_state);
      setChatMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response.answer }]);
      if (response.action?.type === "set_guardian_voice_monitoring") {
        try {
          await setVoiceMonitoringEnabled(Boolean(response.action.voice_monitoring_enabled));
        } catch {
          setChatMessages((current) => [...current, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Timi chưa thể thay đổi trạng thái bảo vệ cuộc gọi. Bạn hãy thử lại trong phần Hồ sơ.",
          }]);
        }
        return;
      }
      if (response.action?.type === "navigate_app" && response.action.route) {
        setChatOpen(false);
        navigate(response.action.route);
        return;
      }
      if (response.action?.type === "navigate_transfer_review") {
        const transfer = response.action.transfer;
        if (transfer?.recipient_account && transfer.bank_code && transfer.amount) {
          setTaskState({
            task: "none",
            transfer: { ...EMPTY_TASK_STATE.transfer },
            last_recipient: {
              ...EMPTY_TASK_STATE.transfer,
              recipient_name: transfer.recipient_name ?? null,
              recipient_account: transfer.recipient_account,
              bank_code: transfer.bank_code,
              amount: null,
              note: null,
            },
          });
          setChatOpen(false);
          navigate("/transfer", {
            state: {
              AssistantTransfer: {
                accountNumber: transfer.recipient_account,
                bankCode: transfer.bank_code,
                amount: transfer.amount,
                note: transfer.note ?? "",
              },
            },
          });
        }
      }
    },
    onError: (error) => {
      setChatMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantErrorMessage(error),
      }]);
    },
  });

  const riskCoachMutation = useMutation({
    mutationFn: assistantApi.riskCoach,
    onSuccess: (response, request) => {
      if (request.guided_question) setActiveRiskCoachQuestion(null);
      if (!riskCoachGuidedMode) setRiskCoachQuestions(response.questions);
      setRiskCoachMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", content: response.answer },
      ]);
    },
    onError: (error) => {
      setRiskCoachMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", content: assistantErrorMessage(error) },
      ]);
    },
  });
  const isAssistantPending = chatMutation.isPending || riskCoachMutation.isPending;
  const requestRiskCoach = riskCoachMutation.mutate;

  const clearHistoryMutation = useMutation({
    mutationFn: assistantApi.clearHistory,
    onSuccess: () => {
      setChatMessages([WELCOME_MESSAGE]);
      setTaskState(EMPTY_TASK_STATE);
      queryClient.setQueryData(["assistant-chat-history", user?.id], { items: [] });
    },
  });

  useEffect(() => { setTipIndex(0); }, [location.pathname]);

  useEffect(() => {
    setVoiceInputAvailable(Boolean(speechRecognitionConstructor()));
    return () => {
      const recognition = speechRecognitionRef.current;
      if (recognition) {
        recognition.onend = null;
        submitSpeechOnEndRef.current = false;
        recognition.stop();
      }
    };
  }, []);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (hydratedHistoryUserRef.current === userId) return;
    hydratedHistoryUserRef.current = null;
    setChatMessages([WELCOME_MESSAGE]);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setTaskState(EMPTY_TASK_STATE);
      return;
    }
    setTaskState(readTaskState(user.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    try {
      if (taskState.task === "none" && !taskState.last_recipient) {
        window.sessionStorage.removeItem(taskStorageKey(user.id));
      } else {
        window.sessionStorage.setItem(taskStorageKey(user.id), JSON.stringify(taskState));
      }
    } catch {
      // The task is still usable during this browser session without storage.
    }
  }, [taskState, user?.id]);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (!userId || !historyQuery.data || hydratedHistoryUserRef.current === userId) return;
    const storedMessages: ChatMessage[] = historyQuery.data.items.flatMap((item) => [
      { id: `history-user-${item.id}`, role: "user" as const, content: item.question },
      { id: `history-assistant-${item.id}`, role: "assistant" as const, content: item.answer },
    ]);
    setChatMessages([WELCOME_MESSAGE, ...storedMessages]);
    hydratedHistoryUserRef.current = userId;
  }, [historyQuery.data, user?.id]);

  useEffect(() => {
    if (!chatOpen) return undefined;
    // The panel is conditionally rendered. Waiting for the next frame means
    // its scroll height includes both restored history and the newest message.
    const frame = window.requestAnimationFrame(() => {
      const messages = messagesScrollRef.current;
      if (messages) messages.scrollTop = messages.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chatOpen, chatMessages.length, riskCoachMessages.length, chatMutation.isPending, riskCoachMutation.isPending]);

  useEffect(() => {
    if (!isOpen || tips.length <= 1) return undefined;
    const timer = window.setInterval(() => setTipIndex((current) => (current + 1) % tips.length), 9000);
    return () => window.clearInterval(timer);
  }, [isOpen, tips.length]);

  useEffect(() => { if (activity.status !== "idle") setOpen(true); }, [activity.status]);

  useEffect(() => {
    if (!riskContext) {
      setRiskCoachMessages([]);
      setRiskCoachQuestions([]);
      setRiskCoachGuidedMode(false);
      setActiveRiskCoachQuestion(null);
      riskCoachRequestRef.current = null;
      return;
    }
    // A risk context represents one transaction. Keep the automatic coach
    // request idempotent so React re-renders cannot send the same prompt again.
    if (riskCoachRequestRef.current === riskContext.transaction_id) return;
    riskCoachRequestRef.current = riskContext.transaction_id;
    setOpen(true);
    setChatOpen(true);
    setWidgetPosition(null);
    setRiskCoachMessages([]);
    setRiskCoachQuestions([]);
    setRiskCoachGuidedMode(false);
    setActiveRiskCoachQuestion(null);
    requestRiskCoach({
      message: "Hãy giải thích cảnh báo giao dịch này và giúp tôi tự kiểm tra an toàn.",
      context: riskContext,
      history: [],
      guided_question: null,
    });
  }, [riskContext, requestRiskCoach]);

  useEffect(() => {
    if (activity.status !== "complete") return undefined;
    const timer = window.setTimeout(clearActivity, 5000);
    return () => window.clearTimeout(timer);
  }, [activity.status, clearActivity]);

  useEffect(() => {
    if (!criticalAlert) return;
    if (handledGuardianAlertRef.current === criticalAlert) return;
    handledGuardianAlertRef.current = criticalAlert;
    const message = guardianAlertMessage(risk);
    setChatMessages((current) => [...current, { id: `guardian-alert-${Date.now()}`, role: "assistant", content: message }]);
    setOpen(true);
    setWidgetPosition(null);
    setChatOpen(true);
  }, [criticalAlert, risk]);

  if (activity.status === "analyzing" && !criticalAlert) return null;

  const sendChat = (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || isAssistantPending) return;
    setDraft("");
    if (SENSITIVE_CREDENTIAL_PATTERN.test(message)) {
      const safeReply = { id: crypto.randomUUID(), role: "assistant" as const, content: SENSITIVE_CREDENTIAL_MESSAGE };
      if (riskContext) setRiskCoachMessages((current) => [...current, safeReply]);
      else setChatMessages((current) => [...current, safeReply]);
      return;
    }
    if (riskContext) {
      const userMessage = { id: crypto.randomUUID(), role: "user" as const, content: message };
      const nextMessages = [...riskCoachMessages, userMessage];
      const guidedQuestion = activeRiskCoachQuestion;
      setRiskCoachMessages(nextMessages);
      setRiskCoachQuestions([]);
      requestRiskCoach({
        message,
        context: riskContext,
        history: nextMessages.slice(-6).map(({ role, content }) => ({ role, content })),
        guided_question: guidedQuestion,
      });
      return;
    }
    setChatMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: message }]);
    chatMutation.mutate({ message, task_state: taskState });
  };
  const toggleVoiceInput = () => {
    if (isListening) {
      speechRecognitionRef.current?.stop();
      return;
    }
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      setVoiceError("Trình duyệt này chưa hỗ trợ nhập bằng giọng nói. Hãy dùng Chrome hoặc Edge.");
      return;
    }
    if (isAssistantPending) return;

    setVoiceError("");
    speechTranscriptRef.current = "";
    submitSpeechOnEndRef.current = true;
    const recognition = new Recognition();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = speechTranscriptRef.current;
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      speechTranscriptRef.current = finalText;
      setDraft(`${finalText}${interimText}`.trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        submitSpeechOnEndRef.current = false;
        setVoiceError(
          event.error === "not-allowed"
            ? "Timi cần quyền micro để nhận giọng nói."
            : "Không thể nhận giọng nói lúc này. Hãy thử lại.",
        );
      }
    };
    recognition.onend = () => {
      const transcript = speechTranscriptRef.current.trim();
      speechRecognitionRef.current = null;
      setListening(false);
      if (!submitSpeechOnEndRef.current || !transcript || isAssistantPending) return;
      // Voice input never sends automatically: let the user inspect or amend
      // the transcript, especially names and payment details, then tap Gửi.
      setDraft(transcript);
    };
    speechRecognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      speechRecognitionRef.current = null;
      setVoiceError("Không thể khởi động micro. Hãy thử lại.");
    }
  };

  const submitChat = (event: React.FormEvent) => {
    event.preventDefault();
    sendChat(draft);
  };

  const askRiskCoachQuestion = (question: string) => {
    if (isAssistantPending) return;
    setRiskCoachGuidedMode(true);
    setRiskCoachQuestions([]);
    setActiveRiskCoachQuestion(question);
    setDraft("");
    setRiskCoachMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "assistant", content: question },
    ]);
    window.requestAnimationFrame(() => chatInputRef.current?.focus());
  };

  // Render via a portal straight onto <body>. This is the key fix: if any
  // ancestor in the app tree has `transform`, `filter`, `perspective`, or
  // `will-change`, `position: fixed` inside it stops being fixed to the
  // viewport and instead "fixes" to that ancestor — which is what makes a
  // fixed widget appear to drift while scrolling. Mounting outside the
  // normal DOM tree (on document.body) guarantees the widget always stays
  // pinned to the screen regardless of what any parent component does.
  const visibleMessages = riskContext ? riskCoachMessages : chatMessages;

  const widget = (
    <aside
      className={`fixed ${widgetPosition ? "" : "bottom-20 right-4 sm:bottom-6 sm:right-6"} ${riskContext ? "z-[10001]" : criticalAlert ? "z-[100]" : "z-40"}`}
      style={widgetPosition ? { left: widgetPosition.x, top: widgetPosition.y } : undefined}
      aria-label="Trợ lý Timi"
    >
      {/* Tip Card */}
      {isOpen && !chatOpen && !riskContext && (
        <div className="absolute bottom-24 right-0 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-blue-100/60 bg-white/80 backdrop-blur-xl shadow-2xl shadow-blue-200/30 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Top glow line */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 via-indigo-500 to-violet-500" />
          <div className="relative flex gap-4 p-5">
            <TimiChibi compact walking />
            <div className="min-w-0 flex-1 pr-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex items-center gap-1.5">
                  <p className="truncate text-sm font-extrabold text-slate-900">{displayedTip.title}</p>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-600 border border-blue-100">
                    <Zap className="h-2.5 w-2.5" />AI
                  </span>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" aria-label="Thu nhỏ trợ lý Timi">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{displayedTip.message}</p>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-500">
                  <Shield className="h-3.5 w-3.5" />Timi AI Anti-Scam
                </span>
                <button type="button" onClick={() => { setWidgetPosition(null); setChatOpen(true); }} className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 transition-all hover:-translate-y-0.5">
                  <MessageCircle className="h-3.5 w-3.5" />Trò chuyện
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat Panel */}
      {isOpen && chatOpen && (
        <section className="absolute bottom-24 right-0 flex h-[min(34rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-blue-100/60 bg-white/90 backdrop-blur-xl shadow-2xl shadow-blue-200/30 animate-in zoom-in-95 duration-200" aria-label="Trò chuyện với trợ lý Timi">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-blue-50 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 px-5 py-4">
            <TimiChibi compact walking />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-extrabold text-slate-900">
                  {riskContext ? "Timi cảnh báo giao dịch" : "Trò chuyện với Timi"}
                </p>
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
                <p className="truncate text-[11px] text-indigo-500 font-medium">
                {riskContext ? "Timi đang đọc các dấu hiệu để giúp bạn tự kiểm tra" : "Lịch sử chỉ thuộc về tài khoản của bạn"}
              </p>
            </div>
            {!riskContext && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Xóa toàn bộ lịch sử trò chuyện của bạn?")) clearHistoryMutation.mutate();
                }}
                disabled={clearHistoryMutation.isPending}
                className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-rose-500 transition-colors disabled:opacity-40"
                aria-label="Xóa lịch sử trò chuyện"
                title="Xóa lịch sử trò chuyện"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={() => setChatOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-slate-600 transition-colors" aria-label="Quay lại trợ lý Timi">
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={messagesScrollRef}
            className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-4"
          >
            {riskContext && (
              <div className="mb-1 rounded-2xl border border-rose-100 bg-rose-50/80 p-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-rose-700">Đang phân tích giao dịch</p>
                    <p className="text-[11px] font-semibold text-rose-900">
                      {riskContext.risk_level === "high" ? "Rủi ro cao" : riskContext.risk_level === "medium" ? "Cần kiểm tra thêm" : "Có dấu hiệu cần lưu ý"}
                      {riskContext.risk_score > 0 ? ` · ${Math.round(riskContext.risk_score * 100)}%` : ""}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-700">
                  {riskContext.recipient_name || "Người nhận chưa có tên"} · {riskContext.bank_name || "Chưa rõ ngân hàng"} · {formatRiskAmount(riskContext.amount)}
                </p>
                {riskContext.note ? (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">Nội dung: {riskContext.note}</p>
                ) : (
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Không có nội dung chuyển khoản; Timi dựa vào cảnh báo và các dấu hiệu khác.</p>
                )}
              </div>
            )}
            {visibleMessages.map((chatMessage) => (
              <div key={chatMessage.id} className={`flex ${chatMessage.role === "user" ? "justify-end" : "justify-start"}`}>
                {chatMessage.role === "assistant" && (
                  <div className="mr-2 mt-1 shrink-0">
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <Sparkles className="h-3 w-3 text-white" />
                    </div>
                  </div>
                )}
                <div className={`max-w-[86%] break-words rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm ${
                  chatMessage.role === "user"
                    ? "whitespace-pre-wrap rounded-br-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                    : "rounded-bl-md border border-slate-100 bg-white text-slate-700"
                }`}>
                  {chatMessage.role === "assistant" ? (
                    <AssistantRichText content={chatMessage.content} />
                  ) : (
                    chatMessage.content
                  )}
                </div>
              </div>
            ))}
            {riskContext && !riskCoachMutation.isPending && riskCoachQuestions.length > 0 && (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/80 p-3">
                <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-indigo-700">Câu hỏi Timi muốn hỏi bạn</p>
                <div className="flex flex-wrap gap-2">
                  {riskCoachQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => askRiskCoachQuestion(question)}
                      className="rounded-xl border border-indigo-200 bg-white px-2.5 py-1.5 text-left text-[11px] font-semibold text-indigo-700 transition-colors hover:border-indigo-400 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isAssistantPending}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isAssistantPending && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Sparkles className="h-3 w-3 text-white animate-pulse" />
                </div>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{riskContext ? "Timi đang giải thích cảnh báo…" : "Timi đang soạn câu trả lời…"}</span>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={submitChat} className="border-t border-slate-100 bg-white/80 backdrop-blur-sm p-4">
            {isListening && (
              <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-rose-600">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                Đang nghe tiếng Việt… Timi sẽ soạn câu, bạn bấm Gửi khi muốn gửi.
              </p>
            )}
            {voiceError && (
              <p className="mb-2.5 text-[10px] leading-relaxed text-rose-600">{voiceError}</p>
            )}
            <p className="mb-2.5 text-[10px] leading-relaxed text-slate-400 flex items-center gap-1">
              <Shield className="h-3 w-3 text-amber-400" />
              Không nhập OTP, PIN, mật khẩu, số thẻ hoặc ảnh khuôn mặt.
            </p>
            <div className="flex gap-2">
              <input
                value={draft}
                ref={chatInputRef}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={800}
                disabled={isAssistantPending || isListening}
                placeholder={isListening ? "Đang nhận giọng nói…" : riskContext ? (riskCoachGuidedMode ? "Trả lời câu hỏi của Timi…" : "Hỏi thêm về cảnh báo…") : "Hỏi Timi về ứng dụng…"}
                className="min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-blue-400/30 focus:bg-white transition-all disabled:opacity-60 border border-transparent focus:border-blue-200"
              />
              <button
                type="button"
                onClick={toggleVoiceInput}
                disabled={!voiceInputAvailable || isAssistantPending}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  isListening
                    ? "bg-rose-500 text-white shadow-md shadow-rose-200 hover:bg-rose-600"
                    : "border border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100"
                }`}
                aria-label={isListening ? "Dừng nhập giọng nói" : "Nhập bằng giọng nói"}
                aria-pressed={isListening}
                title={voiceInputAvailable ? "Nhập bằng giọng nói" : "Trình duyệt chưa hỗ trợ nhập giọng nói"}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                type="submit"
                disabled={!draft.trim() || isAssistantPending || isListening}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                aria-label="Gửi tin nhắn"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Toggle Button */}
      <button
        type="button"
        onPointerDown={(event) => {
          const rect = event.currentTarget.parentElement?.getBoundingClientRect();
          if (!rect) return;
          dragRef.current = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const nextX = Math.min(Math.max(event.clientX - drag.offsetX, 8), window.innerWidth - 72);
          const nextY = Math.min(Math.max(event.clientY - drag.offsetY, 8), window.innerHeight - 72);
          if (Math.abs(nextX - (widgetPosition?.x ?? nextX)) > 2 || Math.abs(nextY - (widgetPosition?.y ?? nextY)) > 2) {
            drag.moved = true;
          }
          setWidgetPosition({ x: nextX, y: nextY });
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          if (drag.moved) suppressClickRef.current = true;
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          // A warning has no tip card. After the user minimizes Risk Coach,
          // the floating button must restore that same warning conversation
          // instead of only toggling an otherwise empty widget shell.
          if (riskContext) {
            if (isOpen && chatOpen) {
              setChatOpen(false);
              setOpen(false);
            } else {
              setOpen(true);
              setChatOpen(true);
            }
            return;
          }
          setOpen((value) => !value);
          if (isOpen) setChatOpen(false);
        }}
        className="group relative ml-auto grid h-16 w-16 cursor-grab touch-none place-items-center rounded-full bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-[2px] shadow-xl shadow-blue-900/30 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-blue-900/40 focus:outline-none focus:ring-4 focus:ring-blue-300/30 active:cursor-grabbing"
        aria-label={riskContext
          ? (isOpen && chatOpen ? "Thu nhỏ trò chuyện cảnh báo" : "Mở lại trò chuyện cảnh báo")
          : (isOpen ? "Đóng trợ lý Timi" : "Mở trợ lý Timi")}
        aria-expanded={isOpen}
        title="Kéo để di chuyển Timi"
      >
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/20 via-indigo-500/20 to-violet-500/20 blur-md animate-pulse" />
        <span className="grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-slate-900 to-blue-950 relative overflow-hidden">
          <TimiChibi compact walking />
        </span>
        {!isOpen && (
          <span className="absolute -left-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md animate-bounce">
            <MessageCircle className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
    </aside>
  );

  return createPortal(widget, document.body);
}
