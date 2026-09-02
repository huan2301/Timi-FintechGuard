import { CircleAlert, RefreshCw, ShieldOff } from "lucide-react";
import { createPortal } from "react-dom";

import { useScamGuardian } from "@/components/guardian/ScamGuardianProvider";

/** Persistent viewport notice for a Guardian interruption or automatic stop. */
export default function GuardianStatusNotice() {
  const { error, status, voiceMonitoringEnabled, setVoiceMonitoringEnabled } = useScamGuardian();
  const wasAutomaticallyStopped = error.includes("Đã tự động tắt nghe và bảo vệ cuộc gọi");
  const connectionInterrupted = status === "error" && voiceMonitoringEnabled;
  const wasStopped = status === "stopped";

  if (!wasAutomaticallyStopped && !connectionInterrupted && !wasStopped) return null;

  const title = wasAutomaticallyStopped || wasStopped
    ? "Bảo vệ cuộc gọi đã tạm dừng"
    : "Kết nối Guardian đang gián đoạn";
  const description = wasAutomaticallyStopped
    ? "Timi đã tắt microphone vì Agent không phản hồi liên tiếp. Cuộc gọi này không còn được phân tích tự động."
    : wasStopped
      ? "Timi đã dừng phân tích cuộc gọi này. Bạn có thể bật lại bảo vệ bất cứ lúc nào."
      : "Timi chưa nhận được dữ liệu mới từ cuộc gọi. Bạn có thể thử kết nối lại để tiếp tục bảo vệ.";

  return createPortal(
    <aside
      role="status"
      aria-live="assertive"
      className="fixed right-4 top-20 z-[10030] w-[min(25rem,calc(100vw-2rem))] rounded-2xl border border-amber-200 bg-amber-50/95 p-4 text-amber-950 shadow-xl shadow-amber-950/10 backdrop-blur-xl"
    >
      <div className="flex gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
          {wasAutomaticallyStopped || wasStopped ? <ShieldOff className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">{description}</p>
          <button
            type="button"
            onClick={() => void setVoiceMonitoringEnabled(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {wasAutomaticallyStopped || wasStopped ? "Bật lại bảo vệ" : "Kết nối lại"}
          </button>
        </div>
      </div>
    </aside>,
    document.body,
  );
}
