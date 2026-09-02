import { api } from '@/services/api';

export type SecurityCheck = {
  label: string;
  detail: string;
  score: number;
  completed: boolean;
};

export type AccountOverview = {
  balance: number;
  transactions_today: number;
  transactions_this_month: number;
  security_score: number;
  security_grade: string;
  transaction_pin_configured: boolean;
  phone_configured: boolean;
  security_checks: SecurityCheck[];
};

export async function getAccountOverview() {
  const response = await api.get<AccountOverview>('/v1/auth/overview');
  return response.data;
}

export async function getTransactionPinStatus() {
  const response = await api.get<{ configured: boolean }>('/v1/auth/transaction-pin/status');
  return response.data.configured;
}

export async function setTransactionPin(pin: string, currentPin?: string) {
  const response = await api.put<{ configured: boolean }>('/v1/auth/transaction-pin', {
    pin,
    current_pin: currentPin || null,
  });
  return response.data;
}
