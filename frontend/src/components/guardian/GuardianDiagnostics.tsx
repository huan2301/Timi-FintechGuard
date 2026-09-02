import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useScamGuardian } from "@/components/guardian/ScamGuardianProvider";

function formatLatency(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("vi-VN")} ms`;
}

function speakerLabel(speaker: "speaker_a" | "speaker_b" | "unknown"): string {
  if (speaker === "speaker_a") return "Nguồn A";
  if (speaker === "speaker_b") return "Nguồn B";
  return "Chưa xác định";
}

function briefTranscript(text: string): string {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > 180 ? `${value.slice(0, 177).trimEnd()}…` : value;
}

/**
 * Operational diagnostics deliberately have no visible launcher. They are for
 * local support/testing only and keep normal Call Guardian UI focused on the
 * safety guidance rather than technical counters or raw speech.
 */
export default function GuardianDiagnostics() {
  const {
    transcript,
    partialText,
    transcriptionMode,
    sttTranscriptCount,
    sttAverageLatencyMs,
    sttLastLatencyMs,
    agentDecisionCount,
    agentAverageLatencyMs,
    agentLastLatencyMs,
  } = useScamGuardian();
  const [isOpen, setIsOpen] = useState(false);
  const pressedKeysRef = useRef(new Set<string>());
  const shortcutHandledRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      pressedKeysRef.current.add(key);
      const hasShortcut = pressedKeysRef.current.has("m") && pressedKeysRef.current.has("t");
      if (hasShortcut && !shortcutHandledRef.current) {
        shortcutHandledRef.current = true;
        setIsOpen((current) => !current);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressedKeysRef.current.delete(event.key.toLowerCase());
      if (!pressedKeysRef.current.has("m") || !pressedKeysRef.current.has("t")) {
        shortcutHandledRef.current = false;
      }
    };
    const onWindowBlur = () => {
      pressedKeysRef.current.clear();
      shortcutHandledRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  if (!isOpen) return null;

  const recentTranscript = transcript.slice(-3).reverse();
  return createPortal(
    <aside
      aria-label="Chẩn đoán Call Guardian"
      className="fixed bottom-4 left-4 z-[10020] max-h-[calc(100dvh-2rem)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-4 text-slate-700 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-900">Chẩn đoán Call Guardian</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            Chỉ dùng để kiểm thử. Không dùng transcript để xác minh danh tính người gọi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          Đóng
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 p-2.5">
          <p className="font-medium text-slate-500">STT · {sttTranscriptCount} đoạn</p>
          <p className="mt-1 font-bold text-slate-800">TB {formatLatency(sttAverageLatencyMs)}</p>
          <p className="mt-0.5 text-slate-500">Gần nhất {formatLatency(sttLastLatencyMs)}</p>
        </div>
        <div className="rounded-xl bg-violet-50 p-2.5">
          <p className="font-medium text-violet-600">Agent · {agentDecisionCount} lượt</p>
          <p className="mt-1 font-bold text-violet-950">TB {formatLatency(agentAverageLatencyMs)}</p>
          <p className="mt-0.5 text-violet-600">Gần nhất {formatLatency(agentLastLatencyMs)}</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">Nguồn STT: {transcriptionMode}</p>
      <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
        {partialText ? (
          <p className="rounded-lg border border-dashed border-violet-200 bg-violet-50 px-2.5 py-2 text-xs italic text-violet-700">
            Đang nhận: {briefTranscript(partialText)}
          </p>
        ) : null}
        {recentTranscript.length > 0 ? recentTranscript.map((item, index) => (
          <div key={`${item.text}-${index}`} className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs leading-5">
            <span className="mr-1 font-semibold text-slate-500">{speakerLabel(item.speaker)}:</span>
            {briefTranscript(item.text)}
          </div>
        )) : (
          <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-500">Chưa có đoạn thoại hoàn chỉnh.</p>
        )}
      </div>
    </aside>,
    document.body,
  );
}
