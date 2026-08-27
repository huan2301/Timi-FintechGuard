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
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { transactionsApi, type RecentContact } from "@/services/api/transactions";
import { authApi } from "@/services/api/auth";
import AIRiskModal, { type RiskAssessment } from "@/components/ai/AIRiskModal";
import TransactionAnalysisScreen from "@/components/ai/TransactionAnalysisScreen";
import FaceVerificationModal, { type FaceMatchResult } from "@/components/auth/FaceVerificationModal";
import Modal from "@/components/ui/Modal";
import { collectRiskClientContext } from "@/utils/riskTelemetry";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useAuthStore } from "@/stores/authStore";
import { useTimiAssistantStore } from "@/stores/timiAssistantStore";
import { ProfileNotificationBell } from "@/pages/account/ProfilePage";

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
  | { status: "success" }
  | { status: "error"; message: string };

const banks = [
  { code: "ABB", name: "ABBank" },
  { code: "ACB", name: "ACB" },
  { code: "AGRIBANK", name: "Agribank" },
  { code: "BAB", name: "Bac A Bank" },
  { code: "VPB", name: "VPBank" },
  { code: "BIDV", name: "BIDV" },
  { code: "BVB", name: "BaoViet Bank" },
  { code: "CAKE", name: "Cake by VPBank" },
  { code: "CIMB", name: "CIMB Vietnam" },
  { code: "CTG", name: "VietinBank" },
  { code: "EIB", name: "Eximbank" },
  { code: "GPB", name: "GPBank" },
  { code: "HDB", name: "HDBank" },
  { code: "HSBC", name: "HSBC Vietnam" },
  { code: "IVB", name: "Indovina Bank" },
  { code: "KBANK", name: "Kasikornbank" },
  { code: "KLB", name: "KienlongBank" },
  { code: "LPB", name: "LPBank" },
  { code: "MBB", name: "MB Bank" },
  { code: "MSB", name: "MSB" },
  { code: "NAB", name: "Nam A Bank" },
  { code: "OCB", name: "OCB" },
  { code: "PGB", name: "PGBank" },
  { code: "PVCB", name: "PVcomBank" },
  { code: "SCB", name: "SCB" },
  { code: "SCVN", name: "Standard Chartered Vietnam" },
  { code: "SEAB", name: "SeABank" },
  { code: "SGB", name: "Saigonbank" },
  { code: "SHB", name: "SHB" },
  { code: "SHINHAN", name: "Shinhan Bank" },
  { code: "STB", name: "Sacombank" },
  { code: "TCB", name: "Techcombank" },
  { code: "TIMO", name: "Timo" },
  { code: "TIMI", name: "Timi Bank" },
  { code: "TPB", name: "TPBank" },
  { code: "UBANK", name: "Ubank by VPBank" },
  { code: "UOB", name: "UOB Vietnam" },
  { code: "VAB", name: "Viet A Bank" },
  { code: "VCB", name: "Vietcombank" },
  { code: "VIB", name: "VIB" },
  { code: "WOORI", name: "Woori Bank Vietnam" },
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
  const displayedBlockedTransactions =
    (securitySummaryQuery.data?.blocked_transactions ?? 0) * 100;
  const displayedBlockedTransactionsLabel = formatProtectionCount(
    displayedBlockedTransactions,
  );
  const pinStatus = useQuery({
    queryKey: ["transaction-pin-status"],
    queryFn: authApi.transactionPinStatus,
    staleTime: 0,
  });

  // Chỉ hiển thị tài khoản người dùng hợp lệ; admin không phải người nhận.
  const recentContactsQuery = useQuery({
    queryKey: ["recent-contacts", user?.id],
    queryFn: () => transactionsApi.getRecentContacts(10),
    select: (contacts) => {
      const ownPhone = user?.phone?.replace(/\D/g, "");
      const ownName = user?.full_name.trim().toLocaleLowerCase("vi-VN");
      return contacts.filter((contact) => {
        const account = contact.account_number.replace(/\D/g, "");
        const name = contact.full_name.trim().toLocaleLowerCase("vi-VN");
        return (
          contact.id !== user?.id &&
          contact.role !== "admin" &&
          (!ownPhone || account !== ownPhone) &&
          (!ownName || name !== ownName)
        );
      });
    },
    staleTime: 60_000,
  });
  const [isRecentContactsOpen, setRecentContactsOpen] = useState(false);
  const recentContacts = recentContactsQuery.data ?? [];
  const visibleRecentContacts = recentContacts.slice(0, 4);

  const dailyTransferLimit = 100_000_000;
  const completedToday = dailySummaryQuery.data?.completed_outgoing_today ?? 0;
  const remainingDailyLimit = Math.max(0, dailyTransferLimit - completedToday);

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
  const [isBankPickerOpen, setBankPickerOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [bankActiveIndex, setBankActiveIndex] = useState(0);
  const [selectedRecentId, setSelectedRecentId] = useState<string | null>(null);
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
  const balanceShortfall = isInsufficientBalance
    ? requestedAmount - (availableBalance ?? 0)
    : 0;
  const normalizedBankSearch = bankSearch.trim().toLocaleLowerCase("vi-VN");
  const filteredBanks = banks.filter((bank) =>
    `${bank.name} ${bank.code}`
      .toLocaleLowerCase("vi-VN")
      .includes(normalizedBankSearch),
  );

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
    const payment = assistantTransfer ?? incomingState?.QrPayment;
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
    setSelectedRecentId(null);
    setAssistantReviewRequested(Boolean(assistantTransfer));
    navigate("/transfer", { replace: true, state: null });
  }, [location.state, navigate]);

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
      queryClient.invalidateQueries({ queryKey: ["recent-contacts"] });
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
    if (!form.bank_code || !accountNumber) {
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
    if (form.bank_code === "TIMI" && !/^\d{10}$/.test(accountNumber)) {
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
          bank_code: form.bank_code,
        })
        .then((result) => {
          if (cancelled) return;
          setForm((current) =>
            current.recipient_account.replace(/\s/g, "") === accountNumber &&
            current.bank_code === form.bank_code
              ? {
                  ...current,
                  recipient_name: result.account_name,
                  recipient_lookup_token: result.verification_token,
                }
              : current,
          );
          setRecipientLookupState({ status: "success" });
        })
        .catch((error: any) => {
          if (cancelled) return;
          setRecipientLookupState({
            status: "error",
            message:
              error.response?.data?.detail ||
              "Không thể tra cứu tên tài khoản. Vui lòng thử lại.",
          });
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [form.recipient_account, form.bank_code]);

  const handleAccountChange = (recipient_account: string) => {
    setSelectedRecentId(null);
    setForm((current) => ({
      ...current,
      recipient_account: recipient_account.replace(/\D/g, "").slice(0, 19),
      recipient_name: "",
      recipient_lookup_token: "",
    }));
  };

  const handleSelectRecentContact = (contact: RecentContact) => {
    setRecentContactsOpen(false);
    setSelectedRecentId(contact.id);
    setForm((current) => ({
      ...current,
      recipient_account: contact.account_number.replace(/\D/g, "").slice(0, 19),
      bank_code: contact.bank_code,
      // Clear name + token so the existing lookup effect fetches a fresh
      // signed verification token (security requirement of the original flow).
      recipient_name: "",
      recipient_lookup_token: "",
    }));
    setBankSearch(banks.find((b) => b.code === contact.bank_code)?.name ?? contact.bank_code);
    setBankPickerOpen(false);
  };

  const handleBankChange = (bank_code: string) => {
    setSelectedRecentId(null);
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
    setTransferError(null);
    setBalanceCheckAttempted(false);
    setStep("review");
  };
  const handleRiskCheck = () => {
    setBalanceCheckAttempted(true);
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
    form.bank_code,
  );
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
          <header className="px-4 sm:px-6 lg:px-8 pt-5 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
                <p className="text-sm text-slate-500 mt-0.5">
                  Gửi tiền an toàn đến người nhận của bạn
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ProfileNotificationBell />
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-semibold text-sm shadow-md">
                {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
            </div>
          </header>

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

                  {/* ===== Người nhận gần đây ===== */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-slate-800">
                        Người nhận gần đây
                      </span>
                      <button
                        type="button"
                        onClick={() => setRecentContactsOpen(true)}
                        className="text-xs font-semibold text-violet-600 hover:text-violet-700 transition-colors"
                      >
                        Xem tất cả
                      </button>
                    </div>

                    <div className="flex items-start gap-4 overflow-x-clip pb-1">
                      {/* Loading skeleton */}
                      {recentContactsQuery.isLoading &&
                        Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className="flex-shrink-0 flex flex-col items-center gap-1.5"
                          >
                            <div className="w-14 h-14 rounded-full bg-slate-200 animate-pulse" />
                            <div className="h-3 w-12 rounded bg-slate-200 animate-pulse" />
                          </div>
                        ))}

                      {/* Real contacts from DB */}
                      {!recentContactsQuery.isLoading &&
                        visibleRecentContacts.map((contact) => {
                          const isSelected = selectedRecentId === contact.id;
                          const initials = contact.full_name
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase();
                          const shortName =
                            contact.full_name.length > 12
                              ? contact.full_name.split(" ").slice(0, 2).join(" ")
                              : contact.full_name;

                          return (
                            <button
                              key={contact.id}
                              type="button"
                              onClick={() => handleSelectRecentContact(contact)}
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
                                  {contact.avatar_url ? (
                                    <img
                                      src={contact.avatar_url}
                                      alt={contact.full_name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        // Fallback to initials if image fails
                                        (e.target as HTMLImageElement).style.display =
                                          "none";
                                        (
                                          e.target as HTMLImageElement
                                        ).nextElementSibling?.classList.remove(
                                          "hidden",
                                        );
                                      }}
                                    />
                                  ) : null}
                                  <div
                                    className={`w-full h-full flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-violet-500 to-fuchsia-500 ${
                                      contact.avatar_url ? "hidden" : ""
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
                      {!recentContactsQuery.isLoading &&
                        (recentContactsQuery.data ?? []).length === 0 && (
                          <div className="flex-1 flex items-center justify-center py-3 text-xs text-slate-400">
                            Chưa có liên hệ gần đây
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
                    <div className="relative min-h-[42px] flex items-center pl-10 pr-10 py-2.5 bg-slate-50 rounded-xl text-slate-800">
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
                        <CheckCircle2 className="absolute right-3.5 w-5 h-5 text-emerald-500" />
                      )}
                    </div>
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
                        Giao dịch của bạn được bảo vệ bằng công nghệ AI tiên tiến.
                      </p>
                      <p className="mt-2 text-xs font-semibold text-emerald-600">
                        Đã chặn {displayedBlockedTransactionsLabel} giao dịch rủi ro cao
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
                    Đã chặn {displayedBlockedTransactionsLabel} giao dịch rủi ro cao
                  </p>
                </div>
              </div>
            </div>
            </div>
          </div>

          <Modal
            open={isRecentContactsOpen}
            onClose={() => setRecentContactsOpen(false)}
            ariaLabel="Tất cả người nhận gần đây"
            className="max-w-xl"
            showCloseButton
          >
            <div className="pr-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                Danh sách người nhận
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                Tất cả người nhận gần đây
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Chọn người nhận để điền nhanh thông tin chuyển tiền.
              </p>
            </div>
            <div className="mt-5 space-y-2 pr-1">
              {recentContacts.map((contact) => {
                const initials = contact.full_name
                  .split(" ")
                  .map((word) => word[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleSelectRecentContact(contact)}
                    className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-violet-50"
                  >
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white">
                      {contact.avatar_url ? (
                        <img
                          src={contact.avatar_url}
                          alt={contact.full_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          {initials}
                        </span>
                      )}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {contact.full_name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {contact.account_number} · {banks.find((bank) => bank.code === contact.bank_code)?.name ?? contact.bank_code}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                );
              })}
              {!recentContactsQuery.isLoading && recentContacts.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">
                  Chưa có người nhận gần đây.
                </p>
              )}
            </div>
          </Modal>

          {/* Footer */}
          <footer className="relative z-10 px-4 sm:px-6 lg:px-8 pb-8 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
            <p>© 2024 Timi. All rights reserved.</p>
            <div className="flex items-center gap-4">
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
      <div className="min-h-screen bg-[#f5f3ff] w-full relative overflow-hidden">
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-[420px] h-[420px] bg-violet-200/40 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[380px] h-[380px] bg-fuchsia-200/30 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <header className="px-4 sm:px-6 pt-5 pb-4 flex items-center gap-3">
            <button
              onClick={() => setStep("form")}
              className="p-2 hover:bg-white/70 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Xác nhận giao dịch</h1>
              <p className="text-sm text-slate-500">Kiểm tra lại thông tin trước khi tiếp tục</p>
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
      <div className="min-h-screen bg-[#f5f3ff] w-full flex items-center justify-center p-4 relative overflow-hidden">
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
            Chuyển tiền thành công!
          </h2>
          <p className="text-slate-500 mb-6">
            {formatMoney(form.amount)} đã được chuyển đến {form.recipient_name}
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
                setSelectedRecentId(null);
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
