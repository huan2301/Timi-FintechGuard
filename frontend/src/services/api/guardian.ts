import axiosInstance from "@/services/api/axios";

export type GuardianRiskLevel = "safe" | "warning" | "high" | "critical";
export type GuardianSpeaker = "speaker_a" | "speaker_b" | "unknown";

export interface GuardianSession {
  id: string;
  status: "active" | "completed" | "cancelled" | "interrupted";
  started_at: string;
  ended_at: string | null;
  max_risk_score: number;
  final_risk_score: number | null;
  risk_level: GuardianRiskLevel;
  scam_type: string | null;
  agent_action: "CONTINUE" | "MONITOR" | "PAUSE" | "STOP";
  final_recommendation: string | null;
  retain_transcript: boolean;
}

export interface GuardianSignal {
  type: string;
  weight: number;
  confidence: number;
}

export interface GuardianTranscriptEvent {
  type: "transcript";
  status: "partial" | "final";
  speaker: GuardianSpeaker;
  text: string;
}

export interface GuardianRiskEvent {
  type: "risk_update";
  decision_source?: "guardian_agent" | "fail_closed";
  risk_score: number;
  risk_level: GuardianRiskLevel;
  scenario: string | null;
  recommended_action: "CONTINUE" | "MONITOR" | "PAUSE" | "STOP";
  explanation: string;
  signals: GuardianSignal[];
}

export interface GuardianAlertEvent {
  type: "alert";
  severity: "critical";
  title: string;
  message: string;
}

export const guardianApi = {
  createSession: async (retainTranscript: boolean) => {
    const response = await axiosInstance.post<GuardianSession>("/v1/scam-guardian/sessions", {
      retain_transcript: retainTranscript,
    });
    return response.data;
  },
  getActiveSession: async () => {
    const response = await axiosInstance.get<GuardianSession | null>("/v1/scam-guardian/sessions/active");
    return response.data;
  },
  finishSession: async (sessionId: string, status: "completed" | "cancelled" = "completed") => {
    const response = await axiosInstance.post<GuardianSession>(
      "/v1/scam-guardian/sessions/" + sessionId + "/finish",
      { status },
    );
    return response.data;
  },
};

export function guardianWebSocketUrl(sessionId: string): string {
  // Keep the WebSocket endpoint aligned with axios. In local Vite runs the
  // REST client defaults to port 8000, so the socket must use that backend
  // too; in Docker/production VITE_API_URL is normally /api or an absolute
  // backend URL.
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
  const url = new URL(apiBase, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = url.pathname.replace(/\/$/, "") + "/v1/scam-guardian/ws/" + sessionId;
  url.search = "";
  return url.toString();
}
