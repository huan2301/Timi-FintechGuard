import { AlertOctagon, ShieldAlert, X } from "lucide-react";

import { useScamGuardian } from "@/components/guardian/ScamGuardianProvider";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

/** Render nothing during normal operation; appear only after a critical signal. */
export default function ScamGuardianAlert() {
  const { criticalAlert, dismissAlert, stopGuardian } = useScamGuardian();
  useBodyScrollLock(criticalAlert !== null, "guardian-critical-alert");

  if (!criticalAlert) return null;

  return (
    <div className="fixed inset-0 z-[90] flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-red-950/75 p-4 sm:items-center" role="alertdialog" aria-modal="true">
      <div className="my-4 w-full max-w-lg rounded-3xl border-4 border-red-500 bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 text-red-600">
            <AlertOctagon size={30} />
            <h2 className="text-2xl font-black">{criticalAlert.title}</h2>
          </div>
          <button onClick={dismissAlert} aria-label="Đóng cảnh báo" className="text-slate-400 hover:text-slate-700">
            <X size={22} />
          </button>
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-800">
          <ShieldAlert className="mt-0.5 shrink-0" size={19} />
          <p>{criticalAlert.message}</p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">Không chuyển tiền</div>
          <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">Không cung cấp OTP/PIN</div>
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={dismissAlert} className="flex-1 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
            Đã hiểu
          </button>
          <button
            onClick={() => {
              dismissAlert();
              void stopGuardian();
            }}
            className="flex-1 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700"
          >
            Dừng bảo vệ
          </button>
        </div>
      </div>
    </div>
  );
}
