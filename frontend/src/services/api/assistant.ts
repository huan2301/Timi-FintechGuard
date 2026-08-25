import axiosInstance from "./axios";

export type AssistantChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantTransferDraft = {
  recipient_name: string | null;
  recipient_account: string | null;
  bank_code: string | null;
  amount: number | null;
  note: string | null;
};

export type AssistantTaskState = {
  task: "none" | "transfer";
  transfer: AssistantTransferDraft;
  last_recipient: AssistantTransferDraft | null;
};

export type AssistantUiAction =
  | {
      type: "navigate_transfer_review";
      transfer: AssistantTransferDraft | null;
      voice_monitoring_enabled: boolean | null;
    }
  | {
      type: "set_guardian_voice_monitoring";
      transfer: AssistantTransferDraft | null;
      voice_monitoring_enabled: boolean | null;
      route: null;
    }
  | {
      type: "navigate_app";
      transfer: AssistantTransferDraft | null;
      voice_monitoring_enabled: boolean | null;
      route:
        | "/dashboard"
        | "/transfer"
        | "/qr?mode=scan"
        | "/qr?mode=create"
        | "/history"
        | "/me"
        | "/me?open=password"
        | "/me?open=pin"
        | "/setup-pin"
        | "/setup-face"
        | "/terms"
        | "/privacy"
        | "/mission"
        | "/help"
        | null;
    };

export type AssistantChatResponse = {
  answer: string;
  out_of_scope: boolean;
  cache_hit: boolean;
  task_state: AssistantTaskState;
  action: AssistantUiAction | null;
};

export type AssistantChatHistoryItem = {
  id: string;
  question: string;
  answer: string;
  created_at: string;
};

export type AssistantChatHistoryResponse = {
  items: AssistantChatHistoryItem[];
};

export const assistantApi = {
  chat: async (data: { message: string; task_state: AssistantTaskState }): Promise<AssistantChatResponse> => {
    const response = await axiosInstance.post<AssistantChatResponse>("/v1/assistant/chat", data);
    return response.data;
  },
  history: async (): Promise<AssistantChatHistoryResponse> => {
    const response = await axiosInstance.get<AssistantChatHistoryResponse>("/v1/assistant/history");
    return response.data;
  },
  clearHistory: async (): Promise<void> => {
    await axiosInstance.delete("/v1/assistant/history");
  },
};
