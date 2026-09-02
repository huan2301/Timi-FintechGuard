import { api } from '@/services/api';

export type GuardianSession = {
  id: string;
  status: string;
  started_at: string;
  ended_at?: string | null;
  max_risk_score: number;
  final_risk_score?: number | null;
  risk_level: string;
  scam_type?: string | null;
  agent_action: 'CONTINUE' | 'MONITOR' | 'PAUSE' | 'STOP';
  final_recommendation?: string | null;
  retain_transcript: boolean;
};

export async function getActiveGuardianSession() {
  const response = await api.get<GuardianSession | null>('/v1/scam-guardian/sessions/active');
  return response.data;
}

export async function createGuardianSession() {
  const response = await api.post<GuardianSession>('/v1/scam-guardian/sessions', {
    retain_transcript: false,
  });
  return response.data;
}

export async function finishGuardianSession(sessionId: string, status: 'completed' | 'cancelled' = 'completed') {
  const response = await api.post<GuardianSession>(`/v1/scam-guardian/sessions/${sessionId}/finish`, { status });
  return response.data;
}
