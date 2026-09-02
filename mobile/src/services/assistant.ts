import { api } from '@/services/api';

export type AssistantTransferDraft = {
  recipient_name: string | null;
  recipient_account: string | null;
  bank_code: string | null;
  amount: number | null;
  note: string | null;
};

export type AssistantTaskState = {
  task: 'none' | 'transfer';
  transfer: AssistantTransferDraft;
  last_recipient: AssistantTransferDraft | null;
};

export type AssistantRoute =
  | '/dashboard'
  | '/transfer'
  | '/qr?mode=scan'
  | '/qr?mode=create'
  | '/history'
  | '/me'
  | '/me?open=password'
  | '/me?open=pin'
  | '/setup-pin'
  | '/setup-face'
  | '/terms'
  | '/privacy'
  | '/mission'
  | '/help'
  | '/services'
  | '/download'
  | '/demo'
  | '/cookies';

export type AssistantUiAction = {
  type: 'navigate_transfer_review' | 'set_guardian_voice_monitoring' | 'navigate_app';
  transfer?: AssistantTransferDraft | null;
  voice_monitoring_enabled?: boolean | null;
  route?: AssistantRoute | null;
};

export type AssistantChatResponse = {
  answer: string;
  out_of_scope: boolean;
  cache_hit: boolean;
  task_state: AssistantTaskState;
  action: AssistantUiAction | null;
};

export type AssistantHistoryItem = {
  id: string;
  question: string;
  answer: string;
  created_at: string;
};

export type AssistantHistoryResponse = {
  items: AssistantHistoryItem[];
};

export type AssistantChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type AssistantRiskContext = {
  transaction_id: string | null;
  recipient_name: string | null;
  recipient_account_masked: string | null;
  bank_name: string | null;
  amount: number | null;
  note: string | null;
  risk_level: 'low' | 'medium' | 'high';
  risk_score: number;
  signals: string[];
  warning_message: string | null;
};

export type AssistantRiskCoachResponse = {
  answer: string;
  questions: string[];
};

export type AssistantRiskCoachRequest = {
  message: string;
  context: AssistantRiskContext;
  history: AssistantChatTurn[];
  guided_question?: string | null;
};

export function emptyAssistantTaskState(): AssistantTaskState {
  return {
    task: 'none',
    transfer: {
      recipient_name: null,
      recipient_account: null,
      bank_code: null,
      amount: null,
      note: null,
    },
    last_recipient: null,
  };
}

export async function sendAssistantMessage(message: string, taskState: AssistantTaskState) {
  const response = await api.post<AssistantChatResponse>('/v1/assistant/chat', {
    message,
    task_state: taskState,
  }, {
    // The backend may classify intent and then call Groq. Keep the chat
    // request alive long enough for both operations on a cold Render worker.
    timeout: 90_000,
  });
  return response.data;
}

export async function getAssistantHistory() {
  const response = await api.get<AssistantHistoryResponse>('/v1/assistant/history');
  return response.data;
}

export async function clearAssistantHistory() {
  await api.delete('/v1/assistant/history');
}

export async function askRiskCoach(payload: AssistantRiskCoachRequest) {
  const response = await api.post<AssistantRiskCoachResponse>('/v1/assistant/risk-coach', payload, {
    timeout: 60_000,
  });
  return response.data;
}
