export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "user" | "admin";
  is_active: boolean;
  balance: number;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  full_name: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type UserDecision = "pending" | "proceeded" | "cancelled";

export interface RiskSignal {
  code: string;
  label: string;
  weight: number;
  detail?: string;
}

export interface AssessRequest {
  payee_account: string;
  payee_name: string;
  bank_code?: string;
  amount: number;
  note?: string;
}

export interface AssessResponse {
  transaction_id: string;
  risk_score: number;
  risk_level: RiskLevel;
  signals: RiskSignal[];
  explanation: string;
  recommendation: string;
  verification_questions: string[];
  requires_user_decision: boolean;
}

export interface DecisionRequest {
  decision: "proceeded" | "cancelled";
  verification_answers: string[];
}

export interface TransactionOut {
  id: string;
  payee_account: string;
  payee_name: string;
  amount: number;
  note?: string;
  risk_score: number;
  risk_level: RiskLevel;
  user_decision: UserDecision;
  created_at: string;
}

export interface InterventionResponse {
  transaction_id: string;
  current_step: number;
  total_steps: number;
  message: string;
  actions: string[];
  can_proceed: boolean;
  risk_factors: string[];
  requires_decision: boolean;
}

export interface BlacklistEntry {
  id: string;
  account_number: string;
  account_name?: string;
  bank_code?: string;
  reason: string;
  source?: string;
  report_count: number;
  created_at: string;
}

export interface ScamScenario {
  id: string;
  title: string;
  content: string;
  category: string;
  source?: string;
  created_at: string;
}

export interface StatsOut {
  total_transactions: number;
  by_risk_level: { low: number; medium: number; high: number };
  high_risk_count: number;
  high_risk_cancelled: number;
  recommendation_compliance_rate: number | null;
  blacklist_size: number;
  scenario_count: number;
}