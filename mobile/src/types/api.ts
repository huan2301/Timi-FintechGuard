export interface User {
  id: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  full_name: string;
  role: 'user' | 'admin';
  is_active: boolean;
  balance: number;
  timi_bank_enabled: boolean;
  is_google_account: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  user: User;
}

export interface GooglePhoneCompletionResponse {
  phone_completion_token: string;
  email: string;
  full_name: string;
}

export interface Transaction {
  id: string;
  payee_account: string;
  payee_name: string;
  direction: 'outgoing' | 'incoming';
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
  risk_level?: 'safe' | 'low' | 'medium' | 'high' | null;
  risk_reason?: string | null;
}

export interface TransactionHistoryPage {
  items: Transaction[];
  next_cursor?: string | null;
}

export interface RecentContact {
  id: string;
  full_name: string;
  account_number: string;
  bank_code: string;
  avatar_url?: string | null;
}

export interface RecipientLookupResponse {
  account_number: string;
  bank_code: string;
  account_name: string;
  source: 'directory' | 'blacklist' | 'trusted_recipient' | 'timi';
  risk_status: 'clear' | 'caution';
  risk_message?: string | null;
  verification_token: string;
}

export interface AssessResponse {
  transaction_id: string;
  assessment_id?: string;
  risk_score: number;
  risk_level: 'safe' | 'low' | 'medium' | 'high';
  signals?: {
    signal_type: string;
    severity: string;
    score?: number | null;
    explanation: string;
  }[];
  explanation: string;
  recommendation: string;
  should_warn: boolean;
  requires_face_verification: boolean;
  face_verification_nonce?: string | null;
  face_verification_expires_at?: string | null;
  warning?: {
    id: string;
    warning_level: 'medium' | 'high';
    title: string;
    message: string;
    transparency_reason: string;
    displayed_at: string;
    countdown_seconds: number;
  } | null;
  requires_user_decision?: boolean;
}

export interface DecisionResponse {
  transaction_id: string;
  transaction_status: 'completed' | 'cancelled' | 'failed';
  warning_id?: string | null;
  decided_at: string;
}
