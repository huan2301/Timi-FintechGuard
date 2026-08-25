import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Bot,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  History,
} from "lucide-react";
import { transactionApi } from "../api/transactionApi";
import LoadingSpinner from "../components/Common/LoadingSpinner";

export default function Intervention() {
  const { txId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");

  // Bắt đầu luồng can thiệp
  useEffect(() => {
    startIntervention();
  }, [txId]);

  const startIntervention = async () => {
    setLoading(true);
    try {
      const res = await transactionApi.intervene(txId);
      setStep(res.data);
      setHistory((prev) => [...prev, res.data]);
    } catch (err) {
      setError(
        err.response?.data?.detail || "Không thể tải luồng can thiệp",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (action) => {
    if (
      action === "Hủy giao dịch" ||
      action === "❌ Hủy giao dịch để an toàn"
    ) {
      try {
        await transactionApi.decide(txId, { decision: "cancelled" });
        alert("🛡️ Giao dịch đã bị hủy để bảo vệ bạn.");
        navigate("/history");
        return;
      } catch (err) {
        setError("Không thể hủy: " + err.response?.data?.detail);
        return;
      }
    }

    if (action === "✅ Tôi chấp nhận rủi ro, tiếp tục chuyển tiền") {
      try {
        await transactionApi.decide(txId, { decision: "confirmed" });
        alert("✅ Bạn đã chấp nhận rủi ro. Giao dịch đang được xử lý.");
        navigate("/history");
        return;
      } catch (err) {
        setError("Không thể xác nhận: " + err.response?.data?.detail);
        return;
      }
    }

    // Các action khác → tiếp tục bước tiếp theo
    setLoading(true);
    try {
      const res = await transactionApi.intervene(txId, {
        user_response: action,
      });
      setStep(res.data);
      setHistory((prev) => [...prev, res.data]);
    } catch (err) {
      setError(
        err.response?.data?.detail || "Lỗi trong quá trình can thiệp",
      );
    } finally {
      setLoading(false);
    }
  };

  const getStepAccent = (stepNum) => {
    if (stepNum === 1) return "from-violet-500 to-purple-500";
    if (stepNum === 2) return "from-fuchsia-500 to-pink-500";
    if (stepNum === 3) return "from-amber-500 to-orange-500";
    if (stepNum === 4) return "from-indigo-500 to-blue-500";
    return "from-rose-600 to-red-600";
  };

  if (loading && !step) {
    return (
      <div className="min-h-screen bg-[#f5f3ff] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          <p className="text-sm font-medium text-slate-500">
            Đang tải luồng bảo vệ...
          </p>
        </div>
      </div>
    );
  }

  if (error && !step) {
    return (
      <div className="min-h-screen bg-[#f5f3ff] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl border border-rose-100">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100">
            <XCircle className="h-8 w-8 text-rose-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Có lỗi xảy ra</h2>
          <p className="mt-2 text-sm text-rose-600">{error}</p>
          <button
            onClick={() => navigate("/history")}
            className="mt-6 w-full rounded-xl bg-slate-100 py-3 font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Về lịch sử giao dịch
          </button>
        </div>
      </div>
    );
  }

  const isHighRisk = step?.current_step >= 4;

  return (
    <div className="min-h-screen bg-[#f5f3ff] w-full relative overflow-x-hidden">
      {/* Soft background blobs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] bg-violet-200/40 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-[420px] h-[420px] bg-fuchsia-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[380px] h-[380px] bg-indigo-200/25 rounded-full blur-3xl" />
      </div>

      {/* Decorative wave */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-0 h-40 sm:h-52 md:h-64 overflow-hidden opacity-30 select-none"
        aria-hidden="true"
      >
        <img
          src="/wave-footer.png"
          alt=""
          className="w-full h-full object-cover object-bottom"
        />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <button
            onClick={() => navigate("/history")}
            className="p-2.5 hover:bg-white/70 rounded-full transition-colors shrink-0 mt-0.5"
            aria-label="Quay lại"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-md shadow-violet-200">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Trung tâm bảo vệ giao dịch
              </h1>
            </div>
            <p className="mt-1.5 text-sm text-slate-500 ml-[50px]">
              HITL (Human-in-the-Loop) — Bạn kiểm soát quyết định cuối cùng
            </p>
          </div>
        </div>

        {/* Progress */}
        {step && (
          <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm border border-violet-100/80">
            <div className="flex justify-between items-center text-sm mb-3">
              <span className="font-semibold text-slate-700">
                Bước {step.current_step} / {step.total_steps}
              </span>
              <span
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  step.can_proceed
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {step.can_proceed ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Sẵn sàng quyết định
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Cần xác minh thêm
                  </>
                )}
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${getStepAccent(step.current_step)} transition-all duration-500`}
                style={{
                  width: `${(step.current_step / step.total_steps) * 100}%`,
                }}
              />
            </div>
            {/* Step dots */}
            <div className="mt-3 flex justify-between px-0.5">
              {Array.from({ length: step.total_steps }, (_, i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${
                    i + 1 <= step.current_step
                      ? "bg-violet-500"
                      : "bg-slate-200"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step content */}
        {step && (
          <div
            className={`rounded-2xl shadow-sm border overflow-hidden ${
              isHighRisk
                ? "border-rose-200 bg-white"
                : "border-violet-100/80 bg-white"
            }`}
          >
            {/* Top accent bar */}
            <div
              className={`h-1.5 bg-gradient-to-r ${
                isHighRisk
                  ? "from-rose-500 to-red-500"
                  : getStepAccent(step.current_step)
              }`}
            />

            <div className="p-5 sm:p-6">
              {/* Agent message */}
              <div className="mb-6">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md shadow-violet-200">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="flex-1 bg-slate-50 rounded-2xl rounded-tl-md p-4 sm:p-5 border border-slate-100">
                    <p className="text-slate-800 whitespace-pre-line leading-relaxed text-sm sm:text-base">
                      {step.message}
                    </p>
                  </div>
                </div>
              </div>

              {/* Risk factors */}
              {step.risk_factors?.length > 0 && (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-amber-800">
                      Yếu tố rủi ro đã phát hiện
                    </h3>
                  </div>
                  <ul className="space-y-1.5">
                    {step.risk_factors.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-amber-900/80"
                      >
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Inline error */}
              {error && (
                <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-3.5 text-sm text-rose-700 flex items-start gap-2">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-500">
                  Chọn hành động của bạn:
                </p>
                <div className="grid grid-cols-1 gap-2.5">
                  {step.actions.map((action, idx) => {
                    const isDanger =
                      action.includes("Hủy") || action.includes("hủy");
                    const isConfirm =
                      action.includes("tiếp tục") ||
                      action.includes("chấp nhận");
                    return (
                      <button
                        key={idx}
                        onClick={() => handleResponse(action)}
                        disabled={loading}
                        className={`w-full py-3.5 px-4 rounded-xl font-semibold text-left transition-all flex items-center gap-3 disabled:opacity-50 ${
                          isDanger
                            ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                            : isConfirm
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                              : "bg-white border border-slate-200 text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                        }`}
                      >
                        <span className="shrink-0">
                          {isDanger ? (
                            <XCircle className="w-5 h-5" />
                          ) : isConfirm ? (
                            <CheckCircle2 className="w-5 h-5" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-violet-500" />
                          )}
                        </span>
                        <span className="flex-1 text-sm sm:text-base">
                          {action}
                        </span>
                        {loading && (
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* History of steps */}
        {history.length > 1 && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-500">
                Lịch sử can thiệp
              </h3>
            </div>
            <div className="space-y-2">
              {history.slice(0, -1).map((h, i) => (
                <div
                  key={i}
                  className="p-3.5 bg-white rounded-xl border border-slate-100 text-sm text-slate-600 shadow-sm"
                >
                  <span className="font-semibold text-violet-600">
                    Bước {h.current_step}:
                  </span>{" "}
                  {h.message.substring(0, 120)}
                  {h.message.length > 120 ? "…" : ""}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer note */}
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
          Được bảo vệ bởi Timi Security — Quyết định cuối cùng thuộc về bạn
        </div>
      </div>
    </div>
  );
}