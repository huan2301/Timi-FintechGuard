import axiosInstance from "./axios";

export type RiskLevel = "safe" | "low" | "medium" | "high";
export type SignalSeverity = "info" | "low" | "medium" | "high";
export type TransactionStatus = "completed" | "cancelled" | "failed";

export interface RiskSignal {
  signal_type: string;
  severity: SignalSeverity;
  score?: number | null;
  explanation: string;
  evidence?: Record<string, unknown>;
}

export interface TransactionWarning {
  id: string;
  warning_level: "medium" | "high";
  title: string;
  message: string;
  transparency_reason: string;
  displayed_at: string;
  countdown_seconds: number;
}

export interface AssessRequest {
  payee_account: string;
  bank_code?: string;
  recipient_lookup_token: string;
  amount: number;
  note?: string;
  currency?: string;
  client_context?: {
    device_id?: string;
    geo_latitude?: number;
    geo_longitude?: number;
    geo_accuracy_m?: number;
  };
}

export interface RecipientLookupResponse {
  account_number: string;
  bank_code: string;
  account_name: string;
  source: "directory" | "blacklist" | "trusted_recipient" | "timi";
  risk_status: "clear" | "caution";
  risk_message?: string | null;
  verification_token: string;
}

export interface AssessResponse {
  transaction_id: string;
  assessment_id: string;
  risk_score: number;
  risk_level: RiskLevel;
  signals: RiskSignal[];
  explanation: string;
  recommendation: string;
  should_warn: boolean;
  requires_face_verification: boolean;
  face_verification_nonce?: string | null;
  face_verification_expires_at?: string | null;
  warning?: TransactionWarning | null;
  requires_user_decision: boolean;
  intervention?: InterventionResponse | null;
}

export interface InterventionResponse {
  transaction_id: string;
  warning_id?: string | null;
  step: number;
  total_steps: number;
  node_name: string;
  message: string;
  question?: string | null;
  suggested_actions: string[];
  risk_factors: string[];
  decision_ready: boolean;
  can_proceed: boolean;
}

export interface DecisionResponse {
  transaction_id: string;
  transaction_status: TransactionStatus;
  warning_id?: string | null;
  decided_at: string;
}

export interface Transaction {
  id: string;
  payee_account: string;
  payee_name: string;
  direction: "outgoing" | "incoming";
  counterparty_name: string;
  counterparty_account: string;
  bank_code?: string | null;
  amount: number;
  currency: string;
  note?: string | null;
  transaction_status: string;
  created_at: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
  risk_level?: "safe" | "low" | "medium" | "high" | null;
  risk_reason?: string | null;
}

export interface TransactionHistoryPage {
  items: Transaction[];
  next_cursor?: string | null;
}

export interface TransactionHistorySummary {
  completed_outgoing_today: number;
  total_transactions: number;
}

export interface TransactionSecuritySummary {
  blocked_transactions: number;
}

export interface RecentContact {
  id: string;
  full_name: string;
  account_number: string;
  bank_code: string;
  role?: "user" | "admin" | null;
  avatar_url?: string | null;
  last_transferred_at?: string;
}

export const transactionsApi = {
  lookupRecipient: async (data: {
    account_number: string;
    bank_code: string;
  }): Promise<RecipientLookupResponse> => {
    const response = await axiosInstance.post<RecipientLookupResponse>(
      "/v1/recipients/resolve",
      data,
    );
    return response.data;
  },

  assess: async (data: AssessRequest): Promise<AssessResponse> => {
    const response = await axiosInstance.post<AssessResponse>("/v1/transactions/assess", data);
    return response.data;
  },

  decide: async (
    transactionId: string,
    decision: "proceeded" | "cancelled",
    options?: {
      verificationConfirmed?: boolean;
      verificationMethod?: string;
      verificationAnswers?: string[];
      pin?: string;
      faceVerificationConfirmed?: boolean;
      faceVerificationToken?: string;
    },
  ): Promise<DecisionResponse> => {
    const response = await axiosInstance.post<DecisionResponse>(
      `/v1/transactions/${transactionId}/decision`,
      {
        decision,
        verification_confirmed: options?.verificationConfirmed,
        verification_method: options?.verificationMethod,
        verification_answers: options?.verificationAnswers ?? [],
        pin: options?.pin,
        face_verification_confirmed: options?.faceVerificationConfirmed ?? false,
        face_verification_token: options?.faceVerificationToken,
      },
    );
    return response.data;
  },

  intervention: async (
    transactionId: string,
    action: "start" | "verify" | "continue" | "trust_recipient" | "cancel" | "proceed",
    response?: string,
  ): Promise<InterventionResponse> => {
    const result = await axiosInstance.post<InterventionResponse>(
      `/v1/transactions/${transactionId}/intervention`,
      { action, response },
    );
    return result.data;
  },

  reportScam: async (
    transactionId: string,
    data: { report_type: "false_positive" | "new_scam" | "bypass"; description: string },
  ) => {
    const result = await axiosInstance.post(`/v1/transactions/${transactionId}/scam-report`, data);
    return result.data;
  },

  getHistory: async ({
    limit = 20,
    cursor,
  }: {
    limit?: number;
    cursor?: string | null;
  } = {}): Promise<TransactionHistoryPage> => {
    const response = await axiosInstance.get<TransactionHistoryPage>("/v1/transactions/history", {
      params: { limit, cursor: cursor ?? undefined },
    });
    return response.data;
  },

  getHistorySummary: async (): Promise<TransactionHistorySummary> => {
    const response = await axiosInstance.get<TransactionHistorySummary>(
      "/v1/transactions/history/summary",
    );
    return response.data;
  },

  getSecuritySummary: async (): Promise<TransactionSecuritySummary> => {
    const response = await axiosInstance.get<TransactionSecuritySummary>(
      "/v1/transactions/security-summary",
    );
    return response.data;
  },

  getRecentContacts: async (limit = 8): Promise<RecentContact[]> => {
    const response = await axiosInstance.get<RecentContact[]>("/v1/transactions/recent-contacts", {
      params: { limit },
    });
    return response.data;
  },
};
