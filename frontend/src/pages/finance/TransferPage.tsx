import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  User,
  Building2,
  ChevronRight,
  Loader2,
  Shield,
  Lock,
  Eye,
  EyeOff,
  Star,
  QrCode,
  Search,
  Home,
  CreditCard as CardIcon,
  HandCoins,
  ScanLine,
  Bookmark,
  BookmarkCheck,
  Trash2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { transactionsApi, type SavedRecipient } from "@/services/api/transactions";
import { authApi } from "@/services/api/auth";
import AIRiskModal, { type RiskAssessment } from "@/components/ai/AIRiskModal";
import TransactionAnalysisScreen from "@/components/ai/TransactionAnalysisScreen";
import FaceVerificationModal, { type FaceMatchResult } from "@/components/auth/FaceVerificationModal";
import Modal from "@/components/ui/Modal";
import { collectRiskClientContext } from "@/utils/riskTelemetry";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useAuthStore } from "@/stores/authStore";
import { useTimiAssistantStore } from "@/stores/timiAssistantStore";
import UserAvatar from "@/components/profile/UserAvatar";
import { ProfileNotificationBell } from "@/pages/account/ProfilePage";
import { parsePaymentQrSearch } from "@/utils/paymentQr";

interface TransferForm {
  recipient_account: string;
  recipient_name: string;
  recipient_lookup_token: string;
  bank_code: string;
  amount: string;
  note: string;
}

type RecipientLookupState =
  | { status: "idle"; message?: string }
  | { status: "loading" }
  | {
      status: "success";
      riskStatus: "clear" | "caution";
      riskMessage?: string;
    }
  | { status: "error"; message: string };

const banks = [
  { code: "TIMI", name: "Timi Bank" },
];

const amountInputFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

function normalizeAmountInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.replace(/^0+(?=\d)/, "");
}

function formatProtectionCount(value: number): string {
  if (value < 1_000) return String(value);
  const thousands = Math.floor(value / 1_000);
  const hundredPart = Math.floor((value % 1_000) / 100);
  return hundredPart > 0 ? `${thousands}k${hundredPart}` : `${thousands}k`;
}

function maskRecipientAccount(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : "••••";
}

function formatVnd(value: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(Math.max(0, Math.round(value)))} đ`;
}

function getApiErrorDetail(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const response = (error as { response?: { data?: { detail?: unknown } } }).response;
  return typeof response?.data?.detail === "string" ? response.data.detail : "";
}

function isInsufficientBalanceDetail(detail: string): boolean {
  const normalized = detail.toLocaleLowerCase("vi-VN");
  return normalized.includes("số dư không đủ") || normalized.includes("insufficient balance");
}

export default function TransferPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const fetchMe = useAuthStore((state) => state.fetchMe);
  const setAssistantActivity = useTimiAssistantStore((state) => state.setActivity);
  const setRiskContext = useTimiAssistantStore((state) => state.setRiskContext);
  const clearRiskContext = useTimiAssistantStore((state) => state.clearRiskContext);
  const dailySummaryQuery = useQuery({
    queryKey: ["transaction-history-summary"],
    queryFn: () => transactionsApi.getHistorySummary(),
    staleTime: 30_000,
  });
  const securitySummaryQuery = useQuery({
    queryKey: ["transaction-security-summary"],
    queryFn: () => transactionsApi.getSecuritySummary(),
    staleTime: 30_000,
  });
  const displayedBlockedTransactions = securitySummaryQuery.data?.blocked_transactions ?? 0;
  const displayedBlockedTransactionsLabel = formatProtectionCount(
    displayedBlockedTransactions,
  );
  const pinStatus = useQuery({
    queryKey: ["transaction-pin-status"],
    queryFn: authApi.transactionPinStatus,
    staleTime: 0,
  });

  const savedRecipientsQueryKey = ["saved-recipients", user?.id] as const;
  const savedRecipientsQuery = useQuery({
    queryKey: savedRecipientsQueryKey,
    queryFn: () => transactionsApi.getSavedRecipients(20),
    staleTime: 60_000,
  });
  const [isSavedRecipientsOpen, setSavedRecipientsOpen] = useState(false);
  const savedRecipients = savedRecipientsQuery.data ?? [];

  const visibleSavedRecipients = savedRecipients.slice(0, 4);

  const completedToday = dailySummaryQuery.data?.completed_outgoing_today ?? 0;
  const dailyTransferLimit = dailySummaryQuery.data?.daily_limit ?? 100_000_000;
  const remainingDailyLimit = dailySummaryQuery.data?.remaining_daily_limit
    ?? Math.max(0, dailyTransferLimit - completedToday);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => () => clearRiskContext(), [clearRiskContext]);

  const [step, setStep] = useState<
    "form" | "review" | "analyzing" | "ai-check" | "pin" | "face" | "success"
  >("form");
  const [pin, setPin] = useState("");
  const [isPinVisible, setIsPinVisible] = useState(false);
  const pinVisibilityTimer = useRef<number | null>(null);
  const savedRecipientSelectionRef = useRef<{
    accountNumber: string;
    bankCode: string;
  } | null>(null);
  const [form, setForm] = useState<TransferForm>({
    recipient_account: "",
    recipient_name: "",
    recipient_lookup_token: "",
    bank_code: "",
    amount: "",
    note: "",
  });
  const [riskData, setRiskData] = useState<RiskAssessment | null>(null);
  const [txId, setTxId] = useState<string>("");
  const [recipientLookupState, setRecipientLookupState] =
    useState<RecipientLookupState>({ status: "idle" });
  const [isRecipientRiskInfoOpen, setRecipientRiskInfoOpen] = useState(false);
  const [isBankPickerOpen, setBankPickerOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [bankActiveIndex, setBankActiveIndex] = useState(0);
  const [assistantReviewRequested, setAssistantReviewRequested] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [balanceCheckAttempted, setBalanceCheckAttempted] = useState(false);
  useBodyScrollLock(
    step === "face"
      || (step === "ai-check" && riskData !== null),
    "transfer-modal",
  );
  const selectedBank = banks.find((bank) => bank.code === form.bank_code);
  const availableBalance = typeof user?.balance === "number" && Number.isFinite(user.balance)
    ? user.balance
    : null;
  const requestedAmount = Number(form.amount || 0);
  const isInsufficientBalance = availableBalance !== null && requestedAmount > availableBalance;
  const isOverDailyLimit = dailySummaryQuery.isSuccess && requestedAmount > remainingDailyLimit;
  const balanceShortfall = isInsufficientBalance
    ? requestedAmount - (availableBalance ?? 0)
    : 0;
  const normalizedBankSearch = bankSearch.trim().toLocaleLowerCase("vi-VN");
  const filteredBanks = banks.filter((bank) =>
    `${bank.name} ${bank.code}`
      .toLocaleLowerCase("vi-VN")
      .includes(normalizedBankSearch),
  );
  const savedRecipientForCurrentForm = savedRecipients.find(
    (recipient) =>
      recipient.account_number.replace(/\D/g, "") ===
        form.recipient_account.replace(/\D/g, "") &&
      recipient.bank_code === form.bank_code,
  );

  const saveRecipientMutation = useMutation({
    mutationFn: () =>
      transactionsApi.saveRecipient({
        account_number: form.recipient_account.replace(/\D/g, ""),
        bank_code: form.bank_code,
        recipient_lookup_token: form.recipient_lookup_token,
      }),
    onMutate: async () => {
      const accountNumber = form.recipient_account.replace(/\D/g, "");
      const bankCode = form.bank_code;
      const optimisticRecipient: SavedRecipient = {
        id: `pending:${accountNumber}:${bankCode}`,
        recipient_name: form.recipient_name,
        account_number: accountNumber,
        bank_code: bankCode,
        saved_at: new Date().toISOString(),
      };
      await queryClient.cancelQueries({ queryKey: savedRecipientsQueryKey });
      const previousRecipients = queryClient.getQueryData<SavedRecipient[]>(
        savedRecipientsQueryKey,
      );
      queryClient.setQueryData<SavedRecipient[]>(savedRecipientsQueryKey, (current = []) => [
        optimisticRecipient,
        ...current.filter(
          (recipient) =>
            recipient.account_number.replace(/\D/g, "") !== accountNumber ||
            recipient.bank_code !== bankCode,
        ),
      ]);
      return { previousRecipients };
    },
    onSuccess: (savedRecipient) => {
      queryClient.setQueryData<SavedRecipient[]>(savedRecipientsQueryKey, (current = []) => [
        savedRecipient,
        ...current.filter(
          (recipient) =>
            recipient.account_number.replace(/\D/g, "") !==
              savedRecipient.account_number.replace(/\D/g, "") ||
            recipient.bank_code !== savedRecipient.bank_code,
        ),
      ]);
    },
    onError: (error: unknown, _variables, context) => {
      if (context?.previousRecipients !== undefined) {
        queryClient.setQueryData(savedRecipientsQueryKey, context.previousRecipients);
      }
      alert(getApiErrorDetail(error) || "Không thể lưu người nhận. Vui lòng tra cứu lại rồi thử lại.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: savedRecipientsQueryKey });
    },
  });
  const removeSavedRecipientMutation = useMutation({
    mutationFn: (recipientId: string) => transactionsApi.removeSavedRecipient(recipientId),
    onMutate: async (recipientId) => {
      await queryClient.cancelQueries({ queryKey: savedRecipientsQueryKey });
      const previousRecipients = queryClient.getQueryData<SavedRecipient[]>(
        savedRecipientsQueryKey,
      );
      queryClient.setQueryData<SavedRecipient[]>(savedRecipientsQueryKey, (current = []) =>
        current.filter((recipient) => recipient.id !== recipientId),
      );
      return { previousRecipients };
    },
    onError: (error: unknown, _recipientId, context) => {
      if (context?.previousRecipients !== undefined) {
        queryClient.setQueryData(savedRecipientsQueryKey, context.previousRecipients);
      }
      alert(getApiErrorDetail(error) || "Không thể bỏ lưu người nhận.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: savedRecipientsQueryKey });
    },
  });

  useEffect(() => {
    const incomingState = (
      location.state as {
        QrPayment?: Partial<{
          accountNumber: string;
          bankCode: string;
          amount: number;
          note: string;
        }>;
        AssistantTransfer?: Partial<{
          accountNumber: string;
          bankCode: string;
          amount: number;
          note: string;
        }>;
      } | null
    );
    const assistantTransfer = incomingState?.AssistantTransfer;
    const payment = assistantTransfer
      ?? incomingState?.QrPayment
      ?? parsePaymentQrSearch(location.search);
    if (
      !payment ||
      typeof payment.accountNumber !== "string" ||
      typeof payment.bankCode !== "string"
    )
      return;

    const bankCode = payment.bankCode;
    const accountNumber = payment.accountNumber.replace(/\s+/g, "");
    const isKnownBank = banks.some((bank) => bank.code === bankCode);
    if (!/^\d{6,19}$/.test(accountNumber) || !isKnownBank) return;

    // A chat/QR prefill can arrive while this component is still showing a
    // previous review or risk step. Reset that stale flow first; the fresh
    // recipient lookup below must complete before the review screen is shown.
    setStep("form");
    setRiskData(null);
    setTxId("");
    setPin("");
    setTransferError(null);
    setBalanceCheckAttempted(false);
    setForm((current) => ({
      ...current,
      recipient_account: accountNumber,
      bank_code: bankCode,
      // A QR value is not trusted as a recipient identity. The existing lookup
      // effect below will obtain a fresh name and signed verification token.
      recipient_name: "",
      recipient_lookup_token: "",
      ...(Number.isSafeInteger(payment.amount) && payment.amount! > 0
        ? { amount: String(payment.amount) }
        : {}),
      ...(typeof payment.note === "string" && payment.note.length <= 500
        ? { note: payment.note }
        : {}),
    }));
    setBankSearch(banks.find((bank) => bank.code === bankCode)?.name ?? "");
    setRecipientLookupState({ status: "idle" });
    setAssistantReviewRequested(Boolean(assistantTransfer));
    navigate("/transfer", { replace: true, state: null });
  }, [location.search, location.state, navigate]);

  const decisionMutation = useMutation({
    mutationFn: async ({
      transactionId,
      decision,
      verified = false,
      pin: transactionPin,
      faceVerified = false,
      verificationMethod,
      faceVerificationToken,
    }: {
      transactionId: string;
      decision: "proceeded" | "cancelled";
      verified?: boolean;
      pin?: string;
      faceVerified?: boolean;
      verificationMethod?: string;
      faceVerificationToken?: string;
    }) =>
      transactionsApi.decide(transactionId, decision, {
        verificationConfirmed: verified,
        verificationMethod: verificationMethod ?? (verified
          ? "user_confirmed_independent_check"
          : undefined),
        pin: transactionPin,
        faceVerificationConfirmed: faceVerified,
        faceVerificationToken,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history-summary"] });
      void fetchMe();
      if (data.transaction_status === "completed") {
        clearRiskContext();
        setTransferError(null);
        setAssistantActivity({ status: "complete", message: "Giao dịch đã hoàn tất. Timi vui vì có thể đồng hành cùng bạn!" });
        setStep("success");
      }
      else if (data.transaction_status === "cancelled") {
        clearRiskContext();
        setTransferError(null);
        setAssistantActivity({ status: "complete", message: "Bạn đã dừng giao dịch an toàn. Khi cần, Timi luôn ở đây nhé!" });
        setStep("review");
        setRiskData(null);
      }
    },
    onError: (err: unknown) => {
      const detail = getApiErrorDetail(err);
      if (isInsufficientBalanceDetail(detail)) {
        clearRiskContext();
        setRiskData(null);
        setTxId("");
        setTransferError(
          "Số dư hiện tại không đủ để hoàn tất giao dịch. Hãy giảm số tiền rồi thử lại.",
        );
        void fetchMe();
        setStep("review");
        return;
      }
      alert(detail || "Không thể ghi nhận quyết định giao dịch");
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (data: TransferForm) =>
      transactionsApi.assess({
        payee_account: data.recipient_account,
        bank_code: data.bank_code,
        recipient_lookup_token: data.recipient_lookup_token,
        amount: Math.round(Number(data.amount)),
        note: data.note || undefined,
        currency: "VND",
        client_context: await collectRiskClientContext(),
      }),
    onSuccess: (data) => {
      setTxId(data.transaction_id);
      setRiskData(data);
      if (data.should_warn && data.warning) {
        setRiskContext({
          transaction_id: data.transaction_id,
          recipient_name: form.recipient_name || null,
          recipient_account_masked: maskRecipientAccount(form.recipient_account),
          bank_name: selectedBank?.name ?? form.bank_code,
          amount: Math.round(Number(form.amount)),
          note: form.note || null,
          risk_level: data.risk_level === "high" ? "high" : data.risk_level === "low" ? "low" : "medium",
          risk_score: data.risk_score,
          signals: data.signals.filter((signal) => (signal.score ?? 0) > 0).map((signal) => signal.explanation).slice(0, 8),
          warning_message: data.warning.message,
        });
        setAssistantActivity({ status: "warning", riskLevel: data.risk_level });
        setStep("ai-check");
        return;
      }
      clearRiskContext();
      setAssistantActivity({ status: "complete", message: "Timi đã kiểm tra xong. Bạn có thể tiếp tục xác thực giao dịch nhé!" });
      if (data.requires_face_verification) {
        setStep("face");
      } else {
        setStep("pin");
      }
    },
    onError: (err: unknown) => {
      clearRiskContext();
      setAssistantActivity({ status: "idle" });
      setStep("review");
      const detail = getApiErrorDetail(err);
      if (isInsufficientBalanceDetail(detail)) {
        setTransferError(
          "Số dư hiện tại không đủ để thực hiện giao dịch. Hãy giảm số tiền rồi thử lại.",
        );
        return;
      }
      alert(detail || "Có lỗi xảy ra khi phân tích rủi ro");
    },
  });

  useEffect(() => {
    const accountNumber = form.recipient_account.replace(/\s/g, "");
    const bankCode = form.bank_code;
    const releaseSavedRecipientSelection = () => {
      if (
        savedRecipientSelectionRef.current?.accountNumber === accountNumber &&
        savedRecipientSelectionRef.current?.bankCode === bankCode
      ) {
        savedRecipientSelectionRef.current = null;
      }
    };
    if (!bankCode || !accountNumber) {
      setRecipientLookupState({ status: "idle" });
      return;
    }
    if (!/^\d{6,19}$/.test(accountNumber)) {
      setRecipientLookupState({
        status: "idle",
        message: "Số tài khoản cần từ 6 đến 19 chữ số",
      });
      return;
    }
    if (bankCode === "TIMI" && !/^\d{10}$/.test(accountNumber)) {
      setRecipientLookupState({
        status: "idle",
        message: "Số tài khoản Timi Bank chính là số điện thoại gồm đúng 10 chữ số.",
      });
      return;
    }

    let cancelled = false;
    setRecipientLookupState({ status: "loading" });
    const timeoutId = window.setTimeout(() => {
      void transactionsApi
        .lookupRecipient({
          account_number: accountNumber,
          bank_code: bankCode,
        })
        .then((result) => {
          if (cancelled) return;
          setForm((current) =>
            current.recipient_account.replace(/\s/g, "") === accountNumber &&
            current.bank_code === bankCode
              ? {
                  ...current,
                  recipient_name: result.account_name,
                  recipient_lookup_token: result.verification_token,
                }
              : current,
          );
          setRecipientLookupState({
            status: "success",
            riskStatus: result.risk_status,
            riskMessage: result.risk_message ?? undefined,
          });
          releaseSavedRecipientSelection();
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setRecipientLookupState({
            status: "error",
            message:
              getApiErrorDetail(error) ||
              "Không thể tra cứu tên tài khoản. Vui lòng thử lại.",
          });
          releaseSavedRecipientSelection();
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [form.recipient_account, form.bank_code]);

  const handleAccountChange = (recipient_account: string) => {
    setRecipientRiskInfoOpen(false);
    savedRecipientSelectionRef.current = null;
    setForm((current) => ({
      ...current,
      recipient_account: recipient_account.replace(/\D/g, "").slice(0, 19),
      recipient_name: "",
      recipient_lookup_token: "",
    }));
  };

  const handleSelectSavedRecipient = (recipient: SavedRecipient) => {
    const accountNumber = recipient.account_number.replace(/\D/g, "").slice(0, 19);
    const bankCode = recipient.bank_code;
    if (
      form.recipient_account.replace(/\D/g, "") === accountNumber &&
      form.bank_code === bankCode
    ) {
      setSavedRecipientsOpen(false);
      return;
    }
    if (
      savedRecipientSelectionRef.current?.accountNumber === accountNumber &&
      savedRecipientSelectionRef.current?.bankCode === bankCode
    ) {
      return;
    }
    savedRecipientSelectionRef.current = { accountNumber, bankCode };
    setSavedRecipientsOpen(false);
    setForm((current) => ({
      ...current,
      recipient_account: accountNumber,
      bank_code: bankCode,
      // Clear name + token so the existing lookup effect fetches a fresh
      // signed verification token (security requirement of the original flow).
      recipient_name: "",
      recipient_lookup_token: "",
    }));
    setBankSearch(
      banks.find((bank) => bank.code === recipient.bank_code)?.name ?? recipient.bank_code,
    );
    setBankPickerOpen(false);
  };

  const handleSavedRecipientToggle = () => {
    if (saveRecipientMutation.isPending || removeSavedRecipientMutation.isPending) {
      return;
    }
    if (savedRecipientForCurrentForm) {
      removeSavedRecipientMutation.mutate(savedRecipientForCurrentForm.id);
      return;
    }
    if (
      recipientLookupState.status !== "success" ||
      !form.recipient_name ||
      !form.recipient_lookup_token
    ) {
      return;
    }
    saveRecipientMutation.mutate();
  };

  const handleBankChange = (bank_code: string) => {
    setRecipientRiskInfoOpen(false);
    savedRecipientSelectionRef.current = null;
    setForm((current) => ({
      ...current,
      bank_code,
      recipient_name: "",
      recipient_lookup_token: "",
    }));
    setBankSearch(banks.find((bank) => bank.code === bank_code)?.name ?? "");
    setBankPickerOpen(false);
  };

  const handleBankSearchChange = (value: string) => {
    setRecipientRiskInfoOpen(false);
    setBankSearch(value);
    setBankActiveIndex(0);
    setBankPickerOpen(true);
    if (form.bank_code) {
      setForm((current) => ({
        ...current,
        bank_code: "",
        recipient_name: "",
        recipient_lookup_token: "",
      }));
    }
  };

  const handleBankFocus = () => {
    setBankPickerOpen(true);
    setBankActiveIndex(0);
    if (form.bank_code) {
      setBankSearch("");
    }
  };

  const handleBankKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setBankPickerOpen(false);
      return;
    }
    if (!isBankPickerOpen || filteredBanks.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setBankActiveIndex((current) => (current + 1) % filteredBanks.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setBankActiveIndex((current) => (current - 1 + filteredBanks.length) % filteredBanks.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      handleBankChange(filteredBanks[bankActiveIndex]?.code ?? filteredBanks[0].code);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    if (isOverDailyLimit) {
      setTransferError(`Số tiền vượt hạn mức còn lại hôm nay (${formatVnd(remainingDailyLimit)}).`);
      return;
    }
    setTransferError(null);
    setBalanceCheckAttempted(false);
    setStep("review");
  };
  const handleRiskCheck = () => {
    setBalanceCheckAttempted(true);
    if (isOverDailyLimit) {
      setTransferError(`Số tiền vượt hạn mức còn lại hôm nay (${formatVnd(remainingDailyLimit)}).`);
      return;
    }
    if (isInsufficientBalance) {
      setTransferError(
        "Số dư khả dụng không đủ cho số tiền đã nhập. Hãy giảm số tiền để tiếp tục.",
      );
      return;
    }
    setTransferError(null);
    clearRiskContext();
    setAssistantActivity({ status: "analyzing" });
    setStep("analyzing");
    analyzeMutation.mutate(form);
  };
  const handleProceed = (transactionPin: string) => {
    if (!txId) return;
    if (requiresFaceVerification) {
      setStep("face");
      return;
    }
    decisionMutation.mutate({
      transactionId: txId,
      decision: "proceeded",
      verified: true,
      pin: transactionPin,
    });
  };
  const handleFaceVerified = async (imageData: string | string[]) => {
    if (!txId) throw new Error("Không tìm thấy giao dịch cần xác thực");
    const amount = Number(form.amount || 0);
    const result = await authApi.verifyFace(
      imageData,
      txId,
      riskData?.face_verification_nonce ?? undefined,
      Number.isFinite(amount) ? amount : undefined,
    );
    return result;
  };
  const completeFaceVerification = async (result: FaceMatchResult) => {
    if (!txId || !result.verification_token) {
      throw new Error("Thiếu dữ liệu xác nhận Face ID cho giao dịch.");
    }
    await decisionMutation.mutateAsync({
      transactionId: txId,
      decision: "proceeded",
      verified: true,
      faceVerified: true,
      verificationMethod: "face_liveness_camera",
      faceVerificationToken: result.verification_token,
    });
  };
  const handleCancel = () => {
    if (!txId) return;
    decisionMutation.mutate({ transactionId: txId, decision: "cancelled" });
  };
  const formatMoney = (amount: string) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return "0 đ";
    return new Intl.NumberFormat("vi-VN").format(num) + " đ";
  };
  const isFormValid = Boolean(
    form.recipient_account &&
    form.recipient_name &&
    form.recipient_lookup_token &&
    form.amount &&
    form.bank_code && !isOverDailyLimit,
  );
  const recipientNeedsCaution =
    recipientLookupState.status === "success" &&
    recipientLookupState.riskStatus === "caution";
  const amountRequiresFaceVerification = Number(form.amount || 0) >= 10_000_000;
  const blacklistRequiresFaceVerification = Boolean(
    riskData?.risk_level === "high"
      && riskData.signals.some((signal) => signal.signal_type === "blacklist_exact_match"),
  );
  const requiresFaceVerification = Boolean(
    riskData?.requires_face_verification
      || amountRequiresFaceVerification
      || blacklistRequiresFaceVerification,
  );

  useEffect(() => {
    // The Task Navigation Agent is allowed to prefill only.  Wait until the
    // existing recipient lookup produces a fresh signed proof, then show the
    // user the review screen.  It never starts risk analysis or a transfer.
    if (!assistantReviewRequested || !isFormValid || recipientLookupState.status !== "success") return;
    setAssistantReviewRequested(false);
    setStep("review");
  }, [assistantReviewRequested, isFormValid, recipientLookupState.status]);

  if (pinStatus.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f3ff] text-sm text-slate-500">
        Đang kiểm tra mã PIN...
      </div>
    );
  }

  if (pinStatus.isError || !pinStatus.data?.configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f3ff] p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl border border-violet-100">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-100">
            <Lock className="h-8 w-8 text-violet-600" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-900">Bạn chưa cài mã PIN</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Bạn cần tạo mã PIN giao dịch trước khi thực hiện chuyển tiền.
          </p>
          <button
            onClick={() => navigate("/setup-pin")}
            className="mt-6 w-full rounded-xl bg-violet-600 py-3 font-bold text-white hover:bg-violet-700 transition-colors"
          >
            Đăng ký mã PIN
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="mt-3 w-full rounded-xl bg-slate-100 py-3 font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Quay lại Dashboard
          </button>
        </div>
      </div>
    );
  }

  /* ===================== FORM STEP – UI khớp ảnh 1:1 ===================== */
  if (step === "form") {
    return (
      <div className="min-h-screen bg-[#f5f3ff] w-full relative">
        {/* Soft background blobs matching the image mood */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-[480px] h-[480px] bg-violet-200/40 rounded-full blur-3xl" />
          <div className="absolute top-1/3 -right-24 w-[420px] h-[420px] bg-fuchsia-200/30 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-[380px] h-[380px] bg-indigo-200/25 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-[1400px] mx-auto">
          {/* ===== TOP HEADER ===== */}
          <header style={{ marginLeft: "calc((100% - 100vw) / 2)" }} className="sticky top-16 z-40 flex w-screen max-w-none flex-col gap-2 border-b border-violet-100/60 bg-[#f5f3ff]/75 px-4 py-2 shadow-sm shadow-violet-100/20 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/dashboard")}
                className="p-2 hover:bg-white/70 rounded-full transition-colors"
                aria-label="Quay lại"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Chuyển tiền
                </h1>
                <p className="sr-only">
                  Gửi tiền an toàn đến người nhận của bạn
                </p>
              </div>
            </div>

            <div className="flex self-end items-center gap-3 sm:self-auto">
              <ProfileNotificationBell />
              <UserAvatar
                avatarUrl={user?.avatar_url}
                name={user?.full_name}
                className="h-10 w-10 border border-white shadow-md"
              />
            </div>
          </header>

          <div role="note" className="mx-4 mb-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 sm:mx-6 lg:mx-8">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Chuyển tiền hiện chỉ khả dụng giữa hai tài khoản Timi. Liên ngân hàng bị khóa cho đến khi có cổng quyết toán thật.
          </div>

          {/* ===== PROGRESS STEPS ===== */}
          {(() => {
            const hasRecipient = Boolean(
              form.recipient_name &&
                form.recipient_lookup_token &&
                form.bank_code,
            );
            const hasAmount = Boolean(
              form.amount && Number(form.amount) > 0,
            );
            // Step 1: recipient · Step 2: amount entered
            const formProgress = hasAmount && hasRecipient ? 2 : 1;
            return (
              <div className="px-4 sm:px-6 lg:px-8 mb-6">
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl px-4 sm:px-6 py-4 shadow-sm border border-violet-100/80">
                  <div className="flex items-center justify-between max-w-2xl mx-auto">
                    {[
                      { num: 1, label: "Người nhận" },
                      { num: 2, label: "Số tiền" },
                      { num: 3, label: "Xem lại" },
                      { num: 4, label: "Xác nhận" },
                    ].map((s, idx) => {
                      const completed = s.num < formProgress;
                      const active = s.num === formProgress;
                      return (
                        <div
                          key={s.num}
                          className="flex items-center flex-1 last:flex-none"
                        >
                          <div className="flex flex-col items-center gap-1.5">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                                completed || active
                                  ? "bg-violet-600 text-white shadow-md shadow-violet-200"
                                  : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {completed ? (
                                <CheckCircle2 className="w-4 h-4" />
                              ) : (
                                s.num
                              )}
                            </div>
                            <span
                              className={`text-xs font-medium hidden sm:block ${
                                completed || active
                                  ? "text-violet-700"
                                  : "text-slate-400"
                              }`}
                            >
                              {s.label}
                            </span>
                          </div>
                          {idx < 3 && (
                            <div
                              className={`flex-1 h-0.5 mx-2 sm:mx-3 rounded-full transition-colors ${
                                completed ? "bg-violet-500" : "bg-slate-200"
                              }`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ===== MAIN 3-COLUMN GRID ===== */}
          <div className="px-4 sm:px-6 lg:px-8 pb-10">
            <div className="lg:sticky lg:top-[10rem] lg:z-20 lg:self-start">
              <div className="grid grid-cols-1 items-start lg:grid-cols-12 gap-5 lg:gap-6">
              {/* ---------- LEFT: Select Recipient ---------- */}
              <div id="transfer-recipient" className="lg:col-span-4 space-y-4">
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-violet-100/80">
                  <h2 className="text-base font-bold text-slate-900 mb-4">
                    Chọn người nhận
                  </h2>

                  {/* Search / Account input */}
                  <div className="relative mb-5">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Tìm theo số tài khoản..."
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-xl border border-transparent text-slate-800 text-sm focus:ring-2 focus:ring-violet-400 focus:border-violet-300 outline-none transition-all"
                      value={form.recipient_account}
                      onChange={(e) => handleAccountChange(e.target.value)}
                    />
                  </div>

                  {/* QR shortcut */}
                  <button
                    type="button"
                    onClick={() => navigate("/qr?mode=scan")}
                    className="w-full mb-5 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-violet-300 text-violet-600 text-sm font-semibold hover:bg-violet-50 transition-colors"
                  >
                    <QrCode className="w-4 h-4" />
                    Quét mã QR
                  </button>

                  {/* ===== Người nhận đã lưu ===== */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-slate-800">
                        Người nhận đã lưu
                      </span>
                      <button
                        type="button"
                        onClick={() => setSavedRecipientsOpen(true)}
                        className="text-xs font-semibold text-violet-600 hover:text-violet-700 transition-colors"
                      >
                        Xem tất cả
                      </button>
                    </div>

                    <div className="scrollbar-hide flex items-start gap-4 overflow-x-auto pb-1">
                      {/* Loading skeleton */}
                      {savedRecipientsQuery.isLoading &&
                        Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className="flex-shrink-0 flex flex-col items-center gap-1.5"
                          >
                            <div className="w-14 h-14 rounded-full bg-slate-200 animate-pulse" />
                            <div className="h-3 w-12 rounded bg-slate-200 animate-pulse" />
                          </div>
                        ))}

                      {/* Personal address book from DB */}
                      {!savedRecipientsQuery.isLoading &&
                        visibleSavedRecipients.map((recipient) => {
                          const isSelected = savedRecipientForCurrentForm?.id === recipient.id;
                          const initials = recipient.recipient_name
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase();
                          const shortName =
                            recipient.recipient_name.length > 12
                              ? recipient.recipient_name.split(" ").slice(0, 2).join(" ")
                              : recipient.recipient_name;

                          return (
                            <button
                              key={recipient.id}
                              type="button"
                              onClick={() => handleSelectSavedRecipient(recipient)}
                              className="flex-shrink-0 flex flex-col items-center gap-1.5 group"
                            >
                              <div className="relative">
                                <div
                                  className={`w-14 h-14 rounded-full overflow-hidden transition-all ${
                                    isSelected
                                      ? "ring-2 ring-violet-500 ring-offset-2"
                                      : "ring-0 group-hover:ring-2 group-hover:ring-violet-200 group-hover:ring-offset-1"
                                  }`}
                                >
                                  {recipient.avatar_url ? (
                                    <img
                                      src={recipient.avatar_url}
                                      alt={recipient.recipient_name}
                                      className="h-full w-full object-cover"
                                      onError={(event) => {
                                        event.currentTarget.classList.add("hidden");
                                        event.currentTarget.nextElementSibling?.classList.remove("hidden");
                                      }}
                                    />
                                  ) : null}
                                  <div
                                    className={`w-full h-full items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-violet-500 to-fuchsia-500 ${
                                      recipient.avatar_url ? "hidden" : "flex"
                                    }`}
                                  >
                                    {initials}
                                  </div>
                                </div>

                                {/* Green check badge when selected */}
                                {isSelected && (
                                  <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-sm">
                                    <CheckCircle2
                                      className="w-3 h-3 text-white"
                                      strokeWidth={3}
                                    />
                                  </div>
                                )}
                              </div>
                              <span
                                className={`text-xs font-medium max-w-[64px] truncate text-center ${
                                  isSelected
                                    ? "text-violet-700"
                                    : "text-slate-600"
                                }`}
                              >
                                {shortName}
                              </span>
                            </button>
                          );
                        })}

                      {/* Empty state */}
                      {!savedRecipientsQuery.isLoading &&
                        savedRecipients.length === 0 && (
                          <div className="flex-1 flex items-center justify-center py-3 text-xs text-slate-400">
                            Chưa có người nhận đã lưu
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Bank picker */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                      Ngân hàng
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-controls="recipient-bank-options"
                        aria-expanded={isBankPickerOpen}
                        aria-activedescendant={
                          isBankPickerOpen && filteredBanks[bankActiveIndex]
                            ? `bank-option-${filteredBanks[bankActiveIndex].code}`
                            : undefined
                        }
                        placeholder="Nhập tên hoặc mã ngân hàng"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-50 rounded-xl border border-transparent text-slate-800 text-sm focus:ring-2 focus:ring-violet-400 outline-none transition-all"
                        value={
                          isBankPickerOpen || !form.bank_code
                            ? bankSearch
                            : (selectedBank?.name ?? "")
                        }
                        onFocus={handleBankFocus}
                        onKeyDown={handleBankKeyDown}
                        onBlur={() => setBankPickerOpen(false)}
                        onChange={(e) => handleBankSearchChange(e.target.value)}
                      />
                      <ChevronRight className="absolute right-3.5 top-3 w-4 h-4 text-slate-400 rotate-90 pointer-events-none" />
                      {isBankPickerOpen && (
                        <div
                          id="recipient-bank-options"
                          role="listbox"
                          className="absolute left-0 top-full z-30 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-violet-100 bg-white p-1.5 shadow-xl"
                        >
                          {filteredBanks.length === 0 ? (
                            <p className="px-3 py-2 text-sm text-slate-500">
                              Không tìm thấy ngân hàng phù hợp.
                            </p>
                          ) : (
                            filteredBanks.map((bank) => (
                              <button
                                key={bank.code}
                                id={`bank-option-${bank.code}`}
                                type="button"
                                role="option"
                                aria-selected={bank.code === form.bank_code}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  handleBankChange(bank.code);
                                }}
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-violet-50 ${
                                  filteredBanks[bankActiveIndex]?.code === bank.code
                                    ? "bg-violet-50"
                                    : ""
                                }`}
                              >
                                <span className="font-medium text-slate-800 text-sm">
                                  {bank.name}
                                </span>
                                <span className="text-xs font-semibold text-slate-400">
                                  {bank.code}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Account name (lookup result) */}
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                      Tên chủ tài khoản
                    </label>
                    <div
                      className={`relative min-h-[42px] flex items-center pl-10 pr-10 py-2.5 rounded-xl text-slate-800 transition-colors ${
                        recipientNeedsCaution
                          ? "border border-amber-200 bg-amber-50/70"
                          : "bg-slate-50"
                      }`}
                    >
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      {recipientLookupState.status === "loading" ? (
                        <span className="flex items-center gap-2 text-sm text-slate-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Đang tra cứu...
                        </span>
                      ) : form.recipient_name ? (
                        <span className="font-semibold text-sm">{form.recipient_name}</span>
                      ) : (
                        <span className="text-sm text-slate-400">Tên tài khoản</span>
                      )}
                      {recipientLookupState.status === "success" && (
                        recipientNeedsCaution ? (
                          <AlertTriangle
                            aria-label="Người nhận cần thận trọng"
                            className="absolute right-3.5 h-5 w-5 text-amber-500"
                          />
                        ) : (
                          <CheckCircle2 className="absolute right-3.5 w-5 h-5 text-emerald-500" />
                        )
                      )}
                    </div>
                    {recipientNeedsCaution && (
                      <button
                        type="button"
                        onClick={() => setRecipientRiskInfoOpen(true)}
                        aria-haspopup="dialog"
                        className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        <span className="flex min-w-0 items-center gap-1.5 font-medium text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          <span>{recipientLookupState.riskMessage || "Người nhận có dấu hiệu rủi ro."}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-violet-600">
                          <Shield className="h-3 w-3" />
                          Bảo mật bởi AI
                        </span>
                      </button>
                    )}
                    {recipientLookupState.status === "error" && (
                      <p className="mt-1.5 text-xs text-rose-600">
                        {recipientLookupState.message}
                      </p>
                    )}
                    {recipientLookupState.status === "idle" &&
                      recipientLookupState.message && (
                        <p className="mt-1.5 text-xs text-slate-500">
                          {recipientLookupState.message}
                        </p>
                      )}
                  </div>
                </div>
              </div>

              {/* ---------- CENTER: Amount + Message + Continue ---------- */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-violet-100/80">
                  {recipientLookupState.status === "success" && form.recipient_name && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(savedRecipientForCurrentForm)}
                      aria-busy={saveRecipientMutation.isPending || removeSavedRecipientMutation.isPending}
                      onClick={handleSavedRecipientToggle}
                      className="-mx-2 mb-4 flex w-[calc(100%+1rem)] items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:bg-violet-50 sm:-mx-3 sm:w-[calc(100%+1.5rem)]"
                    >
                      <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        {savedRecipientForCurrentForm ? (
                          <BookmarkCheck className="h-4 w-4 text-violet-600" />
                        ) : (
                          <Bookmark className="h-4 w-4 text-slate-400" />
                        )}
                        Lưu người nhận
                      </span>
                      <span
                        aria-hidden="true"
                        className={`relative h-5 w-9 rounded-full transition-colors ${
                          savedRecipientForCurrentForm ? "bg-violet-600" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                            savedRecipientForCurrentForm ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </span>
                    </button>
                  )}
                  <p className="text-sm text-slate-500 mb-1">Bạn đang chuyển</p>
                  <div className="flex items-end gap-2 mb-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label="Số tiền chuyển"
                      placeholder="0"
                      className="w-full text-3xl sm:text-4xl font-bold tabular-nums text-slate-900 bg-transparent border-0 focus:ring-0 outline-none placeholder-slate-300"
                      value={
                        form.amount
                          ? amountInputFormatter.format(Number(form.amount))
                          : ""
                      }
                      onChange={(e) => {
                        const amount = normalizeAmountInput(e.target.value);
                        setTransferError(null);
                        setBalanceCheckAttempted(false);
                        setForm((current) => ({ ...current, amount }));
                      }}
                    />
                    <span className="text-lg font-semibold text-slate-500 pb-1 shrink-0">
                      VND
                    </span>
                  </div>

                  {/* Quick amount chips */}
                  <div className="flex flex-wrap gap-2 mt-4 mb-6">
                    {["50000", "100000", "200000", "500000", "1000000", "10000000"].map(
                      (amount) => (
                        <button
                      key={amount}
                      type="button"
                      onClick={() => {
                        setTransferError(null);
                        setBalanceCheckAttempted(false);
                        setForm({ ...form, amount });
                      }}
                          className="px-3.5 py-1.5 bg-slate-100 hover:bg-violet-100 hover:text-violet-700 rounded-full text-xs font-semibold text-slate-600 transition-colors"
                        >
                          {new Intl.NumberFormat("vi-VN").format(parseInt(amount))}
                        </button>
                      ),
                    )}
                  </div>
                  {isOverDailyLimit && (
                    <p className="-mt-3 mb-5 text-sm font-medium text-rose-600" role="alert">
                      Số tiền vượt hạn mức còn lại hôm nay ({formatVnd(remainingDailyLimit)}).
                    </p>
                  )}

                  {/* Message */}
                  <div className="mb-6">
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                      Nội dung (tuỳ chọn)
                    </label>
                    <textarea
                      placeholder="Ví dụ: Thanh toán dịch vụ..."
                      className="w-full p-3.5 bg-slate-50 rounded-xl border border-transparent text-slate-800 text-sm focus:ring-2 focus:ring-violet-400 outline-none resize-none transition-all"
                      rows={2}
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                    />
                  </div>

                  {/* Continue button */}
                  <button
                    onClick={handleSubmit}
                    disabled={!isFormValid}
                    className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold rounded-xl shadow-lg shadow-violet-200 hover:shadow-xl hover:from-violet-700 hover:to-fuchsia-700 active:scale-[0.98] transition-all disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                  >
                    Tiếp tục
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
                    <Lock className="w-3.5 h-3.5 text-violet-500" />
                    Giao dịch của bạn được bảo vệ bởi Timi Security
                  </div>
                </div>
                <div className="rounded-2xl border border-violet-100/80 bg-white/85 p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Mẹo chuyển tiền an toàn
                    </h3>
                  </div>
                  <div className="space-y-2.5 text-xs leading-relaxed text-slate-500">
                    <p className="flex gap-2">
                      <span className="font-bold text-violet-500">1.</span>
                      Kiểm tra đúng tên người nhận trước khi tiếp tục.
                    </p>
                    <p className="flex gap-2">
                      <span className="font-bold text-violet-500">2.</span>
                      Không chia sẻ mã PIN hoặc mã OTP cho bất kỳ ai.
                    </p>
                    <p className="flex gap-2">
                      <span className="font-bold text-violet-500">3.</span>
                      Ghi nội dung rõ ràng để dễ đối chiếu giao dịch.
                    </p>
                  </div>
                </div>
              </div>

              {/* ---------- RIGHT: AI + Balance + Quick Actions ---------- */}
              <div className="lg:col-span-3 space-y-4">
                {/* AI Protection */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-violet-100/80">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">
                        AI Protection
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Timi phân tích tín hiệu rủi ro trước khi bạn xác nhận.
                      </p>
                      <p className="mt-2 text-xs font-semibold text-emerald-600">
                        Đã dừng {displayedBlockedTransactionsLabel} giao dịch rủi ro cao
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate("/history")}
                        className="mt-2 text-xs font-semibold text-violet-600 hover:text-violet-700"
                      >
                        Tìm hiểu thêm
                      </button>
                    </div>
                  </div>
                </div>

                {/* Account Balance */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-violet-100/80">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Số dư khả dụng
                  </p>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">
                    {new Intl.NumberFormat("vi-VN").format(user?.balance ?? 0)}{" "}
                    <span className="text-base font-semibold text-slate-500">đ</span>
                  </p>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-500">Hạn mức còn lại</span>
                    <span className="text-xs font-bold text-slate-800 tabular-nums">
                      {new Intl.NumberFormat("vi-VN").format(remainingDailyLimit)} đ
                    </span>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-violet-100/80">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Thao tác nhanh
                  </h3>
                  <div className="space-y-1">
                    {[
                      {
                        icon: Home,
                        label: "Chuyển đến ngân hàng",
                        sub: "Chuyển khoản liên ngân hàng",
                        action: () => document.getElementById("transfer-recipient")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                      },
                      {
                        icon: CardIcon,
                        label: "Chuyển đến thẻ",
                        sub: "Thẻ ghi nợ / tín dụng",
                        action: () => navigate("/me"),
                      },
                      {
                        icon: HandCoins,
                        label: "Yêu cầu tiền",
                        sub: "Yêu cầu từ danh bạ",
                        action: () => navigate("/qr?mode=create"),
                      },
                      {
                        icon: ScanLine,
                        label: "Quét mã QR",
                        sub: "Thanh toán tức thì",
                        action: () => navigate("/qr?mode=scan"),
                      },
                    ].map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={item.action}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-violet-50 transition-colors group"
                      >
                        <div className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-violet-100 flex items-center justify-center transition-colors">
                          <item.icon className="w-4 h-4 text-slate-600 group-hover:text-violet-600" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {item.label}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {item.sub}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-violet-400" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bottom promo card */}
                <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-2xl p-5 text-white shadow-lg shadow-violet-200/60 relative overflow-hidden">
                  <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/10 rounded-full" />
                  <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full -translate-x-1/2 translate-y-1/2" />
                  <Star className="w-5 h-5 text-white/50 mb-2" />
                  <p className="text-sm font-bold mb-1">Timi bảo vệ bạn</p>
                  <p className="text-xs text-violet-100 leading-relaxed">
                    Đã dừng {displayedBlockedTransactionsLabel} giao dịch rủi ro cao
                  </p>
                </div>
              </div>
            </div>
            </div>
          </div>

          <Modal
            open={isSavedRecipientsOpen}
            onClose={() => setSavedRecipientsOpen(false)}
            ariaLabel="Tất cả người nhận đã lưu"
            className="max-w-xl"
            showCloseButton
          >
            <div className="pr-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                Danh sách người nhận
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                Người nhận đã lưu
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Danh bạ riêng của bạn. Khi chọn, Timi vẫn tra cứu và kiểm tra rủi ro lại.
              </p>
            </div>
            <div className="mt-5 space-y-2 pr-1">
              {savedRecipients.map((recipient) => {
                const initials = recipient.recipient_name
                  .split(" ")
                  .map((word) => word[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <div
                    key={recipient.id}
                    className="flex w-full items-center gap-2 rounded-2xl p-1 transition-colors hover:bg-violet-50"
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectSavedRecipient(recipient)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white">
                        {recipient.avatar_url ? (
                          <img
                            src={recipient.avatar_url}
                            alt={recipient.recipient_name}
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.classList.add("hidden");
                              event.currentTarget.nextElementSibling?.classList.remove("hidden");
                            }}
                          />
                        ) : null}
                        <span className={recipient.avatar_url ? "hidden" : undefined}>
                          {initials}
                        </span>
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">
                          {recipient.recipient_name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {recipient.account_number} · {banks.find((bank) => bank.code === recipient.bank_code)?.name ?? recipient.bank_code}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Bỏ lưu ${recipient.recipient_name}`}
                      onClick={() => removeSavedRecipientMutation.mutate(recipient.id)}
                      disabled={removeSavedRecipientMutation.isPending}
                      className="shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              {!savedRecipientsQuery.isLoading && savedRecipients.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">
                  Chưa có người nhận đã lưu. Tra cứu một tài khoản, rồi bật “Lưu người nhận”.
                </p>
              )}
            </div>
          </Modal>

          <Modal
            open={isRecipientRiskInfoOpen}
            onClose={() => setRecipientRiskInfoOpen(false)}
            ariaLabel="Thông tin cảnh báo rủi ro người nhận"
            className="max-w-md"
            showCloseButton
          >
            <div className="pr-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                Cảnh báo rủi ro
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                Timi dựa vào đâu để cảnh báo?
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Số tài khoản và ngân hàng này trùng với một cảnh báo trong dữ liệu đối chiếu của Timi.
              </p>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-3.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                  <Shield className="h-4 w-4 text-violet-600" />
                  Báo cáo từ cộng đồng
                </div>
                <p className="mt-1.5 text-xs leading-5 text-violet-800">
                  Timi tổng hợp các báo cáo cần thận trọng để phát hiện sớm những tài khoản có dấu hiệu bất thường.
                </p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-sky-900">
                  <Shield className="h-4 w-4 text-sky-600" />
                  Nguồn đối chiếu công khai
                </div>
                <p className="mt-1.5 text-xs leading-5 text-sky-800">
                  Dữ liệu đối chiếu có thể bao gồm các cảnh báo công khai từ chongluadao.vn.
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-6 text-amber-900">
                Hãy gọi hoặc liên hệ người nhận qua một kênh độc lập và xem xét kỹ trước khi giao dịch.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setRecipientRiskInfoOpen(false)}
              className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Đã hiểu, tôi sẽ kiểm tra kỹ
            </button>
          </Modal>

          {/* Footer */}
          <footer className="relative z-10 px-4 sm:px-6 lg:px-8 pb-8 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
            <p>© 2024 Timi. All rights reserved.</p>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <button onClick={() => navigate("/privacy")} className="hover:text-slate-600 transition-colors">
                Privacy Policy
              </button>
              <button onClick={() => navigate("/terms")} className="hover:text-slate-600 transition-colors">
                Terms of Service
              </button>
              <button onClick={() => navigate("/help")} className="hover:text-slate-600 transition-colors">
                Help Center
              </button>
            </div>
          </footer>
        </div>

        {/* Decorative wave — fixed full-width at bottom of viewport */}
        <div
          className="pointer-events-none fixed bottom-0 left-0 right-0 z-0 h-48 sm:h-56 md:h-72 overflow-hidden opacity-30 select-none"
          aria-hidden="true"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-[#f5f3ff] via-[#f5f3ff]/80 to-transparent" />
          <img
            src="/wave-footer.png"
            alt=""
            className="w-full h-full object-cover object-bottom"
            style={{ WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 34%, black 100%)", maskImage: "linear-gradient(to bottom, transparent 0%, black 34%, black 100%)" }}
          />
        </div>
      </div>
    );
  }

  /* ===================== REVIEW STEP ===================== */
  if (step === "review") {
    return (
      <div className="min-h-screen w-full relative overflow-x-clip bg-[#f5f3ff]">
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-[420px] h-[420px] bg-violet-200/40 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[380px] h-[380px] bg-fuchsia-200/30 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <header style={{ marginLeft: "calc((100% - 100vw) / 2)" }} className="sticky top-16 z-40 flex w-screen max-w-none items-center gap-3 border-b border-violet-100/60 bg-[#f5f3ff]/75 px-4 py-2 shadow-sm shadow-violet-100/20 backdrop-blur-md sm:px-6">
            <button
              onClick={() => setStep("form")}
              className="p-2 hover:bg-white/70 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Xác nhận giao dịch</h1>
              <p className="sr-only">Kiểm tra lại thông tin trước khi tiếp tục</p>
            </div>
          </header>

          {/* Progress */}
          <div className="px-4 sm:px-6 mb-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl px-4 sm:px-6 py-4 shadow-sm border border-violet-100/80">
              <div className="flex items-center justify-between max-w-md mx-auto">
                {[
                  { num: 1, label: "Người nhận" },
                  { num: 2, label: "Số tiền" },
                  { num: 3, label: "Xem lại" },
                  { num: 4, label: "Xác nhận" },
                ].map((s, idx) => (
                  <div key={s.num} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          s.num <= 3
                            ? "bg-violet-600 text-white shadow-md shadow-violet-200"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {s.num <= 3 ? (
                          s.num < 3 ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            s.num
                          )
                        ) : (
                          s.num
                        )}
                      </div>
                      <span
                        className={`text-xs font-medium hidden sm:block ${
                          s.num === 3 ? "text-violet-700" : "text-slate-400"
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                    {idx < 3 && (
                      <div
                        className={`flex-1 h-0.5 mx-2 rounded-full ${
                          s.num < 3 ? "bg-violet-500" : "bg-slate-200"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
              </div>
            </div>

          <div className="px-4 sm:px-6 pb-10">
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-violet-100/80 space-y-1">
              <div className="flex justify-between items-center py-3">
                <span className="text-slate-500 text-sm">Người nhận</span>
                <span className="font-bold text-slate-900">{form.recipient_name}</span>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-slate-500 text-sm">Số tài khoản</span>
                <span className="font-bold text-slate-900 font-mono tracking-wide">
                  {form.recipient_account}
                </span>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-slate-500 text-sm">Ngân hàng</span>
                <span className="font-bold text-slate-900">
                  {banks.find((b) => b.code === form.bank_code)?.name || form.bank_code}
                </span>
              </div>
              <hr className="border-slate-100 my-1" />
              <div className="flex justify-between items-center py-3">
                <span className="text-slate-500 text-sm">Số tiền</span>
                <span className="text-2xl font-bold text-violet-600">
                  {formatMoney(form.amount)}
                </span>
              </div>
              {form.note && (
                <div className="flex justify-between items-start py-3">
                  <span className="text-slate-500 text-sm">Nội dung</span>
                  <span className="text-slate-800 text-right max-w-[60%] font-medium text-sm">
                    {form.note}
                  </span>
                </div>
              )}
            </div>

            {((balanceCheckAttempted && isInsufficientBalance) || transferError) && (
              <div
                role="alert"
                aria-live="assertive"
                className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-rose-700"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                <div className="min-w-0">
                  <p className="text-sm font-bold">Không thể tiếp tục với số tiền này</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-rose-600">
                    {transferError || `Bạn đang thiếu ${formatVnd(balanceShortfall)} so với số dư khả dụng.`}
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={handleRiskCheck}
              disabled={analyzeMutation.isPending || Boolean(transferError)}
              title={transferError ? "Hãy giảm số tiền để tiếp tục" : undefined}
              className="w-full mt-5 py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold rounded-xl shadow-lg shadow-violet-200 hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  AI đang kiểm tra...
                </>
              ) : (
                <>
                  <ShieldAlert className="w-5 h-5" />
                  Kiểm tra & Xác nhận
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ===================== AI-CHECK ===================== */
  if (step === "ai-check" && riskData) {
    return (
      <div className="min-h-screen bg-[#f5f3ff] w-full flex items-center justify-center p-4 relative overflow-visible">
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-violet-200/30 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-fuchsia-200/25 rounded-full blur-3xl" />
        </div>
        <AIRiskModal
          riskData={riskData}
          onProceed={handleProceed}
          onCancel={handleCancel}
          isLoading={decisionMutation.isPending}
          requiresFaceVerification={requiresFaceVerification}
        />
      </div>
    );
  }

  if (step === "analyzing") {
    return <TransactionAnalysisScreen />;
  }

  if (step === "face") {
    return (
      <FaceVerificationModal
        onVerified={handleFaceVerified}
        onVerificationComplete={completeFaceVerification}
        onCancel={handleCancel}
        onSetupFace={() => navigate("/setup-face")}
        isLoading={decisionMutation.isPending}
      />
    );
  }

  /* ===================== PIN ===================== */
  if (step === "pin") {
    return (
      <div className="min-h-screen bg-[#f5f3ff] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl border border-violet-100">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-violet-100">
            <Lock className="h-8 w-8 text-violet-600" />
          </div>
          <h2 className="text-center text-2xl font-bold text-slate-900">
            Xác nhận mã PIN
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500">
            Kiểm tra rủi ro đã hoàn tất. Nhập PIN giao dịch để tiếp tục.
          </p>
          <div className="relative mt-6">
            <input
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              type={isPinVisible ? "text" : "password"}
              autoComplete="off"
              placeholder="PIN 4–6 chữ số"
              className="w-full rounded-xl border border-violet-200 p-4 pr-12 text-center text-xl tracking-[0.5em] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={isPinVisible ? "Ẩn mã PIN" : "Hiện mã PIN"}
              onClick={() => {
                if (pinVisibilityTimer.current !== null) {
                  window.clearTimeout(pinVisibilityTimer.current);
                }
                setIsPinVisible(true);
                pinVisibilityTimer.current = window.setTimeout(() => {
                  setIsPinVisible(false);
                  pinVisibilityTimer.current = null;
                }, 200);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-violet-50 hover:text-violet-600"
            >
              {isPinVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          <button
            disabled={!/^\d{4,6}$/.test(pin) || decisionMutation.isPending}
            onClick={() =>
              decisionMutation.mutate({
                transactionId: txId,
                decision: "proceeded",
                pin,
              })
            }
            className="mt-4 w-full rounded-xl bg-violet-600 py-3 font-bold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
          >
            {decisionMutation.isPending ? "Đang xử lý..." : "Xác nhận chuyển tiền"}
          </button>
          <button
            onClick={handleCancel}
            disabled={decisionMutation.isPending}
            className="mt-2 w-full rounded-xl bg-slate-100 py-3 font-medium text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Hủy giao dịch
          </button>
        </div>
      </div>
    );
  }

  /* ===================== SUCCESS ===================== */
  if (step === "success") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-x-clip bg-[#f5f3ff]">
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-emerald-200/30 rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 right-1/3 w-[350px] h-[350px] bg-violet-200/25 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 w-full max-w-md">
          {/* Full progress — all 4 steps complete */}
          <div className="mb-5 bg-white/80 backdrop-blur-sm rounded-2xl px-4 sm:px-6 py-4 shadow-sm border border-violet-100/80">
            <div className="flex items-center justify-between">
              {[
                { num: 1, label: "Người nhận" },
                { num: 2, label: "Số tiền" },
                { num: 3, label: "Xem lại" },
                { num: 4, label: "Xác nhận" },
              ].map((s, idx) => (
                <div
                  key={s.num}
                  className="flex items-center flex-1 last:flex-none"
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-violet-600 text-white shadow-md shadow-violet-200">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-medium hidden sm:block text-violet-700">
                      {s.label}
                    </span>
                  </div>
                  {idx < 3 && (
                    <div className="flex-1 h-0.5 mx-2 sm:mx-3 rounded-full bg-violet-500" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-8 text-center border border-violet-100">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Chuyển tiền nội bộ thành công!
          </h2>
          <p className="text-slate-500 mb-6">
            {`${formatMoney(form.amount)} đã được ghi có cho ${form.recipient_name}.`}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate("/history")}
              className="w-full py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all active:scale-[0.98]"
            >
              Xem lịch sử
            </button>
            <button
              onClick={() => {
                setStep("form");
                setTransferError(null);
                setBalanceCheckAttempted(false);
                setForm({
                  recipient_account: "",
                  recipient_name: "",
                  recipient_lookup_token: "",
                  bank_code: "",
                  amount: "",
                  note: "",
                });
                setBankSearch("");
                setBankPickerOpen(false);
                setRecipientLookupState({ status: "idle" });
                setRiskData(null);
                setTxId("");
              }}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold rounded-xl hover:shadow-lg transition-all active:scale-[0.98]"
            >
              Chuyển tiền khác
            </button>
          </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
