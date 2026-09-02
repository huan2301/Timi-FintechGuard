/* eslint-disable react-refresh/only-export-components -- provider and hook intentionally share one module. */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";

import {
  guardianApi,
  guardianWebSocketUrl,
  type GuardianAlertEvent,
  type GuardianRiskEvent,
  type GuardianSession,
  type GuardianSpeaker,
  type GuardianTranscriptEvent,
} from "@/services/api/guardian";
import { useAuthStore } from "@/stores/authStore";

export type GuardianStatus = "idle" | "starting" | "active" | "stopped" | "error";

const VAD_RMS_THRESHOLD = 0.04;
const VAD_SILENCE_TAIL_MS = 850;
const VAD_MIN_SEGMENT_MS = 1_100;
const VAD_MAX_SEGMENT_MS = 5_000;
const FALLBACK_SEGMENT_MS = 3_000;

type LatencyMetrics = {
  count: number;
  totalMs: number;
  lastMs: number | null;
};

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

type ReadyWaiter = {
  resolve: () => void;
  reject: (reason?: unknown) => void;
  timeout: number;
};

export interface ScamGuardianContextValue {
  status: GuardianStatus;
  voiceMonitoringEnabled: boolean;
  session: GuardianSession | null;
  risk: GuardianRiskEvent;
  transcript: GuardianTranscriptEvent[];
  partialText: string;
  error: string;
  criticalAlert: GuardianAlertEvent | null;
  speechAvailable: boolean;
  transcriptionMode: string;
  audioLevel: number;
  voiceDetected: boolean;
  audioChunkCount: number;
  audioAckCount: number;
  audioRejectedCount: number;
  audioDataEventCount: number;
  audioSkippedCount: number;
  lastAudioAt: number | null;
  audioContextState: AudioContextState | "unavailable";
  mediaTrackState: "none" | "live" | "ended";
  recorderState: RecordingState | "none";
  sttTranscriptCount: number;
  sttAverageLatencyMs: number | null;
  sttLastLatencyMs: number | null;
  agentDecisionCount: number;
  agentAverageLatencyMs: number | null;
  agentLastLatencyMs: number | null;
  speaker: GuardianSpeaker;
  retainTranscript: boolean;
  setSpeaker: (speaker: GuardianSpeaker) => void;
  setRetainTranscript: (retain: boolean) => void;
  clearError: () => void;
  dismissAlert: () => void;
  startGuardian: () => Promise<void>;
  stopGuardian: () => Promise<void>;
  setVoiceMonitoringEnabled: (enabled: boolean) => Promise<void>;
  sendTranscript: (text: string, final?: boolean) => void;
}

const defaultRisk: GuardianRiskEvent = {
  type: "risk_update",
  risk_score: 0,
  risk_level: "safe",
  scenario: null,
  recommended_action: "CONTINUE",
  explanation: "Chưa có đoạn thoại nào được phân tích.",
  signals: [],
};

const GuardianContext = createContext<ScamGuardianContextValue | null>(null);

function voiceMonitoringPreferenceKey(userId: string | undefined): string {
  return userId ? `timi-guardian-voice-enabled:${userId}` : "timi-guardian-voice-enabled";
}

function readVoiceMonitoringPreference(userId: string | undefined): boolean {
  try {
    // Listening/call protection is opt-in. Keep an explicit user choice, but
    // do not request microphone access for a new account by default.
    return window.localStorage.getItem(voiceMonitoringPreferenceKey(userId)) === "true";
  } catch {
    return false;
  }
}

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const browserWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

function encodeAudioChunk(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function requestErrorMessage(cause: unknown, fallback: string): string {
  if (axios.isAxiosError(cause)) {
    const detail = cause.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => (typeof item?.msg === "string" ? item.msg : ""))
        .filter(Boolean);
      if (messages.length > 0) return messages.join("; ");
    }
  }
  return cause instanceof Error ? cause.message : fallback;
}

export function ScamGuardianProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.user?.id);
  const [voiceMonitoringEnabled, setVoiceMonitoringEnabledState] = useState(() => readVoiceMonitoringPreference(userId));
  const [status, setStatus] = useState<GuardianStatus>("idle");
  const [session, setSession] = useState<GuardianSession | null>(null);
  const [risk, setRisk] = useState<GuardianRiskEvent>(defaultRisk);
  const [transcript, setTranscript] = useState<GuardianTranscriptEvent[]>([]);
  const [partialText, setPartialText] = useState("");
  const [error, setError] = useState("");
  const [criticalAlert, setCriticalAlert] = useState<GuardianAlertEvent | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [speaker, setSpeaker] = useState<GuardianSpeaker>("speaker_b");
  const [retainTranscript, setRetainTranscript] = useState(false);
  const [transcriptionMode, setTranscriptionMode] = useState("đang chờ kết nối");
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceDetected, setVoiceDetected] = useState(false);
  const [audioChunkCount, setAudioChunkCount] = useState(0);
  const [audioAckCount, setAudioAckCount] = useState(0);
  const [audioRejectedCount, setAudioRejectedCount] = useState(0);
  const [audioDataEventCount, setAudioDataEventCount] = useState(0);
  const [audioSkippedCount, setAudioSkippedCount] = useState(0);
  const [lastAudioAt, setLastAudioAt] = useState<number | null>(null);
  const [audioContextState, setAudioContextState] = useState<AudioContextState | "unavailable">("unavailable");
  const [mediaTrackState, setMediaTrackState] = useState<"none" | "live" | "ended">("none");
  const [recorderState, setRecorderState] = useState<RecordingState | "none">("none");
  const [sttMetrics, setSttMetrics] = useState<LatencyMetrics>({ count: 0, totalMs: 0, lastMs: null });
  const [agentMetrics, setAgentMetrics] = useState<LatencyMetrics>({ count: 0, totalMs: 0, lastMs: null });
  const socketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const speechFallbackRef = useRef<() => void>(() => undefined);
  const disableForAgentFailureRef = useRef<(message: string) => void>(() => undefined);
  const browserFallbackStartedRef = useRef(false);
  const finishResolverRef = useRef<(() => void) | null>(null);
  const readyResolverRef = useRef<ReadyWaiter | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const recorderTimerRef = useRef<number | null>(null);
  const transcriptionModeRef = useRef("browser_speech_recognition");
  const audioContextRef = useRef<AudioContext | null>(null);
  const vadTimerRef = useRef<number | null>(null);
  const captureWatchdogRef = useRef<number | null>(null);
  const autoRetryTimerRef = useRef<number | null>(null);
  const autoStartTimerRef = useRef<number | null>(null);
  const startupRetryCountRef = useRef(0);
  const captureStartedAtRef = useRef<number | null>(null);
  const segmentStartedAtRef = useRef<number | null>(null);
  const lastSpeechAtRef = useRef<number | null>(null);
  const vadAvailableRef = useRef(false);
  const audioChunkCountRef = useRef(0);
  const voiceDetectedRef = useRef(false);
  const segmentRestartPendingRef = useRef(false);
  const segmentSpeechDetectedRef = useRef(true);
  const statusRef = useRef<GuardianStatus>("idle");
  const autoStartRef = useRef(false);
  const guardianRunIdRef = useRef(0);
  const stoppingRef = useRef(false);
  const agentFailureShutdownRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    setVoiceMonitoringEnabledState(readVoiceMonitoringPreference(userId));
  }, [userId]);

  useEffect(() => {
    setSpeechAvailable(Boolean(speechRecognitionConstructor()));
  }, []);

  useEffect(() => {
    // Browsers may suspend WebAudio when Guardian starts from an auth effect
    // instead of a click. Resume it on the first normal user interaction.
    const resumeAudio = () => {
      const context = audioContextRef.current;
      if (context?.state === "suspended") void context.resume();
    };
    window.addEventListener("pointerdown", resumeAudio);
    window.addEventListener("keydown", resumeAudio);
    return () => {
      window.removeEventListener("pointerdown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
    };
  }, []);

  const cleanupMedia = useCallback(() => {
    if (recorderTimerRef.current !== null) {
      window.clearTimeout(recorderTimerRef.current);
      recorderTimerRef.current = null;
    }
    if (vadTimerRef.current !== null) {
      window.clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    if (captureWatchdogRef.current !== null) {
      window.clearInterval(captureWatchdogRef.current);
      captureWatchdogRef.current = null;
    }
    if (autoRetryTimerRef.current !== null) {
      window.clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setAudioContextState("unavailable");
    setAudioLevel(0);
    setVoiceDetected(false);
    speechRef.current?.stop();
    speechRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecorderState("none");
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setMediaTrackState("none");
    segmentSpeechDetectedRef.current = false;
    captureStartedAtRef.current = null;
    segmentStartedAtRef.current = null;
    lastSpeechAtRef.current = null;
    vadAvailableRef.current = false;
    voiceDetectedRef.current = false;
    segmentRestartPendingRef.current = false;
  }, []);

  const closeSocket = useCallback(() => {
    if (heartbeatRef.current !== null) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    const readyWaiter = readyResolverRef.current;
    if (readyWaiter) {
      window.clearTimeout(readyWaiter.timeout);
      readyResolverRef.current = null;
      readyWaiter.reject(new Error("Realtime gateway đã đóng kết nối."));
    }
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const handleSocketEvent = useCallback((event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as {
        type?: string;
        message?: string;
        code?: string;
        status?: string;
        consecutive_failures?: number;
        decision_source?: string;
        scenario?: string | null;
        explanation?: string;
        transcription_mode?: string;
        accepted?: boolean;
      };
      const disableForUnavailableAgent = (reason?: string) => {
        if (agentFailureShutdownRef.current) return;
        agentFailureShutdownRef.current = true;
        const cause = (reason?.trim() || "Không thể gọi Guardian risk agent").replace(
          /[.!?]+$/,
          "",
        );
        const shutdownMessage = `${cause}. Đã tự động tắt nghe và bảo vệ cuộc gọi.`;
        setError(shutdownMessage);
        disableForAgentFailureRef.current(shutdownMessage);
      };
      if (payload.type === "ready") {
        transcriptionModeRef.current = payload.transcription_mode ?? "browser_speech_recognition";
        setTranscriptionMode(transcriptionModeRef.current);
        const readyWaiter = readyResolverRef.current;
        if (readyWaiter) {
          window.clearTimeout(readyWaiter.timeout);
          readyResolverRef.current = null;
          readyWaiter.resolve();
        }
      } else if (payload.type === "transcript") {
        const transcriptEvent = payload as GuardianTranscriptEvent;
        if (transcriptEvent.status === "partial") {
          setPartialText(transcriptEvent.text);
        } else {
          setPartialText("");
          setTranscript((current) => [...current.slice(-49), transcriptEvent]);
          const sttLatencyMs = transcriptEvent.stt_latency_ms;
          if (typeof sttLatencyMs === "number") {
            setSttMetrics((current) => ({
              count: current.count + 1,
              totalMs: current.totalMs + sttLatencyMs,
              lastMs: sttLatencyMs,
            }));
          }
        }
      } else if (payload.type === "risk_update") {
        const riskEvent = payload as GuardianRiskEvent;
        setRisk(riskEvent);
        const agentLatencyMs = riskEvent.agent_latency_ms;
        if (typeof agentLatencyMs === "number") {
          setAgentMetrics((current) => ({
            count: current.count + 1,
            totalMs: current.totalMs + agentLatencyMs,
            lastMs: agentLatencyMs,
          }));
        }
        // Fallback for a server version that emits the fail-closed decision
        // without the preceding agent_status event.
        if (
          riskEvent.decision_source === "fail_closed"
          && riskEvent.scenario === "agent_unavailable"
        ) {
          disableForUnavailableAgent(riskEvent.explanation);
        }
      } else if (payload.type === "alert") {
        setCriticalAlert(payload as GuardianAlertEvent);
      } else if (payload.type === "session_finished") {
        finishResolverRef.current?.();
        finishResolverRef.current = null;
      } else if (payload.type === "audio_ack") {
        if (payload.accepted) setAudioAckCount((current) => current + 1);
        else setAudioRejectedCount((current) => current + 1);
      } else if (payload.type === "audio_stt_empty" || payload.code === "audio_stt_failed") {
        // If server STT cannot decode a browser codec, continue protection
        // with browser transcript text instead of silently losing the call.
        speechFallbackRef.current();
      } else if (payload.type === "agent_status" && payload.status === "blocked") {
        // A blocked state means the backend has reached its consecutive-failure
        // threshold. Persist the switch as off and release all microphone
        // resources rather than silently pretending that protection is active.
        disableForUnavailableAgent(payload.message);
      } else if (payload.type === "agent_status" && payload.status === "degraded") {
        // Keep listening after one temporary provider failure: local direct
        // evidence checks remain active and the backend retries after backoff.
        setError(`${payload.message ?? "Guardian Risk Agent tạm thời chậm phản hồi"}. Vẫn tiếp tục bảo vệ bằng tín hiệu trực tiếp.`);
      } else if (payload.type === "error") {
        setError(payload.message ?? "Guardian không thể xử lý sự kiện.");
      }
    } catch {
      setError("Phản hồi realtime không hợp lệ.");
    }
  }, []);

  const sendTranscript = useCallback((text: string, final = true) => {
    const value = text.trim();
    if (!value || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({
      type: "transcript",
      status: final ? "final" : "partial",
      text: value,
      speaker,
      source: "browser",
    }));
  }, [speaker]);

  const startSpeechRecognition = useCallback(() => {
    if (speechRef.current || browserFallbackStartedRef.current) return;
    const Constructor = speechRecognitionConstructor();
    if (!Constructor) {
      setError("Server STT không trả transcript và trình duyệt không có SpeechRecognition fallback.");
      return;
    }
    browserFallbackStartedRef.current = true;
    transcriptionModeRef.current = "browser_speech_recognition_fallback";
    setTranscriptionMode(transcriptionModeRef.current);
    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "vi-VN";
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0]?.transcript ?? "";
        if (event.results[index].isFinal) sendTranscript(text);
        else interim += text;
      }
      if (interim) {
        setPartialText(interim);
        sendTranscript(interim, false);
      }
    };
    recognition.onerror = (event) => {
      if (event.error !== "no-speech") {
        setError("Nhận dạng giọng nói: " + (event.error ?? "không xác định"));
      }
    };
    recognition.onend = () => {
      if (speechRef.current === recognition && !stoppingRef.current) {
        try {
          recognition.start();
        } catch {
          // The browser may still be transitioning between recognition states.
        }
      }
    };
    speechRef.current = recognition;
    try {
      recognition.start();
    } catch {
      speechRef.current = null;
      browserFallbackStartedRef.current = false;
      setError("Không thể bật SpeechRecognition fallback của trình duyệt.");
    }
  }, [sendTranscript]);

  useEffect(() => {
    speechFallbackRef.current = startSpeechRecognition;
  }, [startSpeechRecognition]);

  const startGuardian = useCallback(async () => {
    if (!token || statusRef.current === "active" || statusRef.current === "starting") return;
    agentFailureShutdownRef.current = false;
    const runId = guardianRunIdRef.current + 1;
    guardianRunIdRef.current = runId;
    statusRef.current = "starting";
    setStatus("starting");
    setError("");
    setTranscript([]);
    setPartialText("");
    setCriticalAlert(null);
    stoppingRef.current = false;
    browserFallbackStartedRef.current = false;
    transcriptionModeRef.current = "browser_speech_recognition";
    setTranscriptionMode("đang kết nối");
    setAudioLevel(0);
    setVoiceDetected(false);
    setAudioChunkCount(0);
    audioChunkCountRef.current = 0;
    setAudioAckCount(0);
    setAudioRejectedCount(0);
    setAudioDataEventCount(0);
    setAudioSkippedCount(0);
    setLastAudioAt(null);
    setAudioContextState("unavailable");
    setMediaTrackState("none");
    setRecorderState("none");
    setSttMetrics({ count: 0, totalMs: 0, lastMs: null });
    setAgentMetrics({ count: 0, totalMs: 0, lastMs: null });
    captureStartedAtRef.current = null;
    segmentStartedAtRef.current = null;
    lastSpeechAtRef.current = null;
    vadAvailableRef.current = false;
    voiceDetectedRef.current = false;
    segmentRestartPendingRef.current = false;
    let createdSession: GuardianSession | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Trình duyệt không hỗ trợ microphone realtime.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // These are preference constraints, not mandatory hardware
          // requirements, so browsers can gracefully use what they support.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 16_000 },
        },
      });
      if (runId !== guardianRunIdRef.current || stoppingRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      const audioTrack = stream.getAudioTracks()[0];
      setMediaTrackState(audioTrack?.readyState === "live" ? "live" : "ended");
      if (audioTrack) {
        audioTrack.onended = () => {
          setMediaTrackState("ended");
          setError("Microphone đã bị ngắt trong lúc Guardian đang chạy.");
        };
      }
      const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
      const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;
      let vadAvailable = false;
      if (AudioContextConstructor) {
        const audioContext = new AudioContextConstructor();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        // Keep the analyser in the audio graph without feeding microphone
        // audio back to the speakers. This makes VAD work consistently across
        // browsers that suspend unconnected Web Audio nodes.
        const silentSink = audioContext.createGain();
        silentSink.gain.value = 0;
        analyser.connect(silentSink);
        silentSink.connect(audioContext.destination);
        void audioContext.resume();
        setAudioContextState(audioContext.state);
        vadAvailable = audioContext.state === "running";
        vadAvailableRef.current = vadAvailable;
        audioContext.onstatechange = () => {
          vadAvailableRef.current = audioContext.state === "running";
          setAudioContextState(audioContext.state);
        };
        const samples = new Uint8Array(analyser.fftSize);
        audioContextRef.current = audioContext;
        segmentSpeechDetectedRef.current = false;
        vadTimerRef.current = window.setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          let squared = 0;
          for (const sample of samples) {
            const normalized = (sample - 128) / 128;
            squared += normalized * normalized;
          }
          // A small RMS threshold filters silence while retaining normal speech.
          const level = Math.min(1, Math.sqrt(squared / samples.length) * 4);
          const detected = level >= VAD_RMS_THRESHOLD;
          const now = Date.now();
          setAudioLevel(level);
          setVoiceDetected(detected);
          voiceDetectedRef.current = detected;
          if (detected) {
            segmentSpeechDetectedRef.current = true;
            lastSpeechAtRef.current = now;
            return;
          }

          // Send a completed phrase shortly after the speaker pauses instead
          // of waiting for a fixed three-second window. The minimum duration
          // prevents tiny fragments; the recorder timer remains a hard cap.
          const recorder = recorderRef.current;
          const segmentStartedAt = segmentStartedAtRef.current;
          const lastSpeechAt = lastSpeechAtRef.current;
          if (
            recorder?.state === "recording"
            && segmentSpeechDetectedRef.current
            && segmentStartedAt !== null
            && lastSpeechAt !== null
            && now - segmentStartedAt >= VAD_MIN_SEGMENT_MS
            && now - lastSpeechAt >= VAD_SILENCE_TAIL_MS
          ) {
            try {
              recorder.stop();
            } catch {
              // The existing recorder watchdog will recover this segment.
            }
          }
        }, 100);
      }
      let created: GuardianSession;
      try {
        created = await guardianApi.createSession(retainTranscript);
      } catch (cause) {
        // A refreshed tab can leave a valid active session briefly behind.
        // Resume it instead of showing a duplicate-session error to the user.
        if (!axios.isAxiosError(cause) || cause.response?.status !== 409) throw cause;
        const active = await guardianApi.getActiveSession();
        if (!active) throw cause;
        created = active;
      }
      createdSession = created;
      if (runId !== guardianRunIdRef.current || stoppingRef.current) {
        try {
          await guardianApi.finishSession(created.id, "cancelled");
        } catch {
          // The session may already have been closed by the active run.
        }
        return;
      }
      setSession(created);
      const socket = new WebSocket(guardianWebSocketUrl(created.id));
      socketRef.current = socket;
      socket.onmessage = handleSocketEvent;
      socket.onclose = () => {
        const readyWaiter = readyResolverRef.current;
        if (readyWaiter) {
          window.clearTimeout(readyWaiter.timeout);
          readyResolverRef.current = null;
          readyWaiter.reject(new Error("Realtime gateway đã đóng kết nối trước khi xác thực."));
        }
        if (!stoppingRef.current && statusRef.current === "active") setStatus("error");
      };
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error("Realtime gateway không phản hồi sau 10 giây."));
          socket.close();
        }, 10_000);
        socket.onopen = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        socket.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("Không thể kết nối realtime gateway."));
        };
      });
      socket.onerror = () => {
        const readyWaiter = readyResolverRef.current;
        if (readyWaiter) {
          window.clearTimeout(readyWaiter.timeout);
          readyResolverRef.current = null;
          readyWaiter.reject(new Error("Realtime gateway không thể xác thực kết nối."));
        }
      };
      const ready = new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          readyResolverRef.current = null;
          reject(new Error("Realtime gateway không gửi tín hiệu ready sau 4 giây."));
          socket.close();
        }, 4_000);
        readyResolverRef.current = { resolve, reject, timeout };
      });
      socket.send(JSON.stringify({ type: "auth", token }));
      await ready;
      if (runId !== guardianRunIdRef.current || stoppingRef.current) return;
      if (socket.readyState !== WebSocket.OPEN) {
        throw new Error("Realtime gateway đã đóng trước khi bắt đầu ghi audio.");
      }
      heartbeatRef.current = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "heartbeat" }));
        }
      }, 20_000);

      if (typeof MediaRecorder === "undefined") {
        throw new Error("Trình duyệt không hỗ trợ MediaRecorder để ghi microphone.");
      }
      const mimeType = typeof MediaRecorder.isTypeSupported === "function"
        ? [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/mp4",
          ].find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ""
        : "";
      const sendRecordedSegment = async (
        chunks: Blob[],
        recorderMimeType: string,
        hasSpeech: boolean,
        durationMs = FALLBACK_SEGMENT_MS,
      ) => {
        if (!hasSpeech || chunks.length === 0 || socket.readyState !== WebSocket.OPEN) {
          setAudioSkippedCount((current) => current + 1);
          return;
        }
        const blob = new Blob(chunks, { type: recorderMimeType || "audio/webm" });
        if (!blob.size || socket.readyState !== WebSocket.OPEN) {
          setAudioSkippedCount((current) => current + 1);
          return;
        }
        try {
          const data = await encodeAudioChunk(blob);
          if (socket.readyState !== WebSocket.OPEN) {
            setAudioSkippedCount((current) => current + 1);
            return;
          }
          socket.send(JSON.stringify({
            type: "audio_chunk",
            data,
            mime_type: blob.type || "audio/webm",
            duration_ms: durationMs,
            speech_detected: hasSpeech,
          }));
          audioChunkCountRef.current += 1;
          setAudioChunkCount((current) => current + 1);
          setLastAudioAt(Date.now());
        } catch {
          setAudioSkippedCount((current) => current + 1);
          setError("Không thể mã hóa audio chunk để gửi lên gateway.");
          speechFallbackRef.current();
        }
      };
      const startAudioSegment = () => {
        if (
          stoppingRef.current
          || socket.readyState !== WebSocket.OPEN
          || recorderRef.current !== null
          || segmentRestartPendingRef.current
        ) return;
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        const segmentChunks: Blob[] = [];
        captureStartedAtRef.current ??= Date.now();
        segmentStartedAtRef.current = Date.now();
        lastSpeechAtRef.current = null;
        setRecorderState(recorder.state);
        recorder.onstart = () => setRecorderState("recording");
        recorder.ondataavailable = (event) => {
          setAudioDataEventCount((current) => current + 1);
          if (!event.data.size) return;
          segmentChunks.push(event.data);
        };
        recorder.onstop = () => {
          setRecorderState("inactive");
          if (recorderRef.current === recorder) recorderRef.current = null;
          segmentRestartPendingRef.current = true;
          const hasSpeech = segmentSpeechDetectedRef.current || voiceDetectedRef.current;
          const startedAt = segmentStartedAtRef.current;
          const durationMs = startedAt === null
            ? FALLBACK_SEGMENT_MS
            : Math.max(1, Math.min(VAD_MAX_SEGMENT_MS, Date.now() - startedAt));
          segmentSpeechDetectedRef.current = false;
          segmentStartedAtRef.current = null;
          lastSpeechAtRef.current = null;
          void sendRecordedSegment(segmentChunks, recorder.mimeType || mimeType, hasSpeech, durationMs).finally(() => {
            segmentRestartPendingRef.current = false;
            // Yield one tick before recreating MediaRecorder. Some Chromium
            // versions reject a new recorder while the previous stop event is
            // still being dispatched.
            window.setTimeout(() => {
              if (!stoppingRef.current && audioTrack?.readyState === "live") startAudioSegment();
            }, 0);
          });
        };
        recorder.onerror = () => {
          setError("MediaRecorder không tạo được audio từ microphone.");
          speechFallbackRef.current();
          setRecorderState("inactive");
          try {
            if (recorder.state === "recording") recorder.stop();
          } catch {
            if (!stoppingRef.current) window.setTimeout(startAudioSegment, 250);
          }
        };
        // A one-second timeslice makes the diagnostic data-event counter
        // observable while the recorder is running. The events are combined
        // on stop so each uploaded WebM segment remains self-contained.
        recorder.start(1000);
        recorderRef.current = recorder;
        recorderTimerRef.current = window.setTimeout(() => {
          recorderTimerRef.current = null;
          if (recorder.state === "recording") recorder.stop();
        }, vadAvailableRef.current ? VAD_MAX_SEGMENT_MS : FALLBACK_SEGMENT_MS);
      };
      // Without WebAudio there is no local VAD, so keep the conservative
      // server-STT fallback. When WebAudio exists but needs a user gesture to
      // resume, wait for VAD rather than uploading a silent first segment.
      segmentSpeechDetectedRef.current = !AudioContextConstructor;
      startAudioSegment();
      captureWatchdogRef.current = window.setInterval(() => {
        if (stoppingRef.current || socket.readyState !== WebSocket.OPEN) return;
        const recorder = recorderRef.current;
        if (!recorder && !segmentRestartPendingRef.current) {
          // Auto-start can run before a browser user gesture. If the first
          // recorder did not initialize, retry without requiring logout/login.
          startAudioSegment();
          return;
        }
        if (recorder && recorder.state !== "recording") {
          // Recover from browsers that transition to inactive without
          // dispatching onstop (the previous implementation then stayed at
          // zero until the whole Guardian session was restarted).
          if (recorderRef.current === recorder) recorderRef.current = null;
          segmentRestartPendingRef.current = false;
          startAudioSegment();
          return;
        }
        if (!recorder) return;
        const startedAt = captureStartedAtRef.current;
        if (
          startedAt !== null
          && voiceDetectedRef.current
          && audioChunkCountRef.current === 0
          && Date.now() - startedAt > 8_000
        ) {
          try {
            recorder.stop();
          } catch {
            // onerror/onstop will recreate the recorder on the next tick.
          }
        }
      }, 2_000);
      statusRef.current = "active";
      setStatus("active");
      startupRetryCountRef.current = 0;
      if (transcriptionModeRef.current === "browser_speech_recognition") {
        startSpeechRecognition();
      }
    } catch (cause) {
      // React StrictMode and route changes can cancel an in-flight startup.
      // Never let that stale run clean up the newer socket/recorder.
      if (runId !== guardianRunIdRef.current) return;
      guardianRunIdRef.current += 1;
      stoppingRef.current = true;
      cleanupMedia();
      closeSocket();
      if (createdSession) {
        try {
          await guardianApi.finishSession(createdSession.id, "cancelled");
        } catch {
          // Keep the original microphone/WebSocket error visible.
        }
      }
      statusRef.current = "error";
      setStatus("error");
      setError(requestErrorMessage(cause, "Không thể bật bảo vệ cuộc gọi."));
      if (autoStartRef.current && token && startupRetryCountRef.current < 3) {
        startupRetryCountRef.current += 1;
        const retryDelay = startupRetryCountRef.current * 2_000;
        autoRetryTimerRef.current = window.setTimeout(() => {
          autoRetryTimerRef.current = null;
          if (statusRef.current === "error" && token) void startGuardian();
        }, retryDelay);
      }
    }
  }, [cleanupMedia, closeSocket, handleSocketEvent, retainTranscript, startSpeechRecognition, token]);

  const stopGuardian = useCallback(async () => {
    guardianRunIdRef.current += 1;
    stoppingRef.current = true;
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      const finishAck = new Promise<void>((resolve) => {
        finishResolverRef.current = resolve;
        window.setTimeout(() => {
          finishResolverRef.current = null;
          resolve();
        }, 1000);
      });
      socket.send(JSON.stringify({ type: "stop" }));
      await finishAck;
    }
    cleanupMedia();
    closeSocket();
    if (session) {
      try {
        const finished = await guardianApi.finishSession(session.id);
        setSession(finished);
      } catch {
        setError("Không thể lưu trạng thái kết thúc phiên.");
      }
    }
    statusRef.current = "stopped";
    setStatus("stopped");
  }, [cleanupMedia, closeSocket, session]);

  useEffect(() => {
    if (!token) {
      autoStartRef.current = false;
      if (autoStartTimerRef.current !== null) {
        window.clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
      return;
    }
    if (!voiceMonitoringEnabled) {
      autoStartRef.current = false;
      if (autoStartTimerRef.current !== null) {
        window.clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
      return;
    }
    if (!autoStartRef.current) {
      autoStartRef.current = true;
      // StrictMode performs an intentional setup/cleanup/setup cycle in dev.
      // Reset the cancelled startup before launching the second setup.
      stoppingRef.current = false;
      if (statusRef.current === "starting") {
        statusRef.current = "idle";
        setStatus("idle");
      }
      // Defer one tick so React StrictMode's setup/cleanup/setup cycle can
      // cancel the first effect before it opens a duplicate session/socket.
      autoStartTimerRef.current = window.setTimeout(() => {
        autoStartTimerRef.current = null;
        if (autoStartRef.current && token) void startGuardian();
      }, 0);
    }
    return () => {
      if (autoStartTimerRef.current !== null) {
        window.clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
      autoStartRef.current = false;
    };
  }, [startGuardian, token, voiceMonitoringEnabled]);

  useEffect(() => {
    if (!token || !voiceMonitoringEnabled) return undefined;
    // Some browsers only allow getUserMedia after a user gesture. The hidden
    // Guardian normally starts after login, so retry once the user clicks or
    // presses a key anywhere in the authenticated layout. This keeps the
    // protection background-only without requiring a separate demo page.
    const retryAfterGesture = () => {
      if (statusRef.current === "error" || statusRef.current === "idle") {
        void startGuardian();
      }
    };
    window.addEventListener("pointerdown", retryAfterGesture);
    window.addEventListener("keydown", retryAfterGesture);
    return () => {
      window.removeEventListener("pointerdown", retryAfterGesture);
      window.removeEventListener("keydown", retryAfterGesture);
    };
  }, [startGuardian, token, voiceMonitoringEnabled]);

  useEffect(() => () => {
    guardianRunIdRef.current += 1;
    if (autoStartTimerRef.current !== null) {
      window.clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }
    autoStartRef.current = false;
    stoppingRef.current = true;
    cleanupMedia();
    closeSocket();
  }, [cleanupMedia, closeSocket]);

  const setVoiceMonitoringEnabled = useCallback(async (enabled: boolean) => {
    try {
      window.localStorage.setItem(voiceMonitoringPreferenceKey(userId), String(enabled));
    } catch {
      // The preference is best-effort; microphone control still applies now.
    }
    setVoiceMonitoringEnabledState(enabled);
    if (!enabled) {
      await stopGuardian();
      return;
    }
    if (token && statusRef.current !== "active" && statusRef.current !== "starting") {
      await startGuardian();
    }
  }, [startGuardian, stopGuardian, token, userId]);

  useEffect(() => {
    disableForAgentFailureRef.current = (message: string) => {
      void setVoiceMonitoringEnabled(false).finally(() => {
        // stopGuardian may report a session-finalisation error. The actionable
        // cause for this automatic shutdown remains the unavailable agent.
        setError(message);
      });
    };
    return () => {
      disableForAgentFailureRef.current = () => undefined;
    };
  }, [setVoiceMonitoringEnabled]);

  const value: ScamGuardianContextValue = {
    status,
    voiceMonitoringEnabled,
    session,
    risk,
    transcript,
    partialText,
    error,
    criticalAlert,
    speechAvailable,
    transcriptionMode,
    audioLevel,
    voiceDetected,
    audioChunkCount,
    audioAckCount,
    audioRejectedCount,
    audioDataEventCount,
    audioSkippedCount,
    lastAudioAt,
    audioContextState,
    mediaTrackState,
    recorderState,
    sttTranscriptCount: sttMetrics.count,
    sttAverageLatencyMs: sttMetrics.count > 0 ? Math.round(sttMetrics.totalMs / sttMetrics.count) : null,
    sttLastLatencyMs: sttMetrics.lastMs,
    agentDecisionCount: agentMetrics.count,
    agentAverageLatencyMs: agentMetrics.count > 0 ? Math.round(agentMetrics.totalMs / agentMetrics.count) : null,
    agentLastLatencyMs: agentMetrics.lastMs,
    speaker,
    retainTranscript,
    setSpeaker,
    setRetainTranscript,
    clearError: () => setError(""),
    dismissAlert: () => setCriticalAlert(null),
    startGuardian,
    stopGuardian,
    setVoiceMonitoringEnabled,
    sendTranscript,
  };

  return <GuardianContext.Provider value={value}>{children}</GuardianContext.Provider>;
}

export function useScamGuardian(): ScamGuardianContextValue {
  const context = useContext(GuardianContext);
  if (!context) throw new Error("useScamGuardian must be used inside ScamGuardianProvider");
  return context;
}
