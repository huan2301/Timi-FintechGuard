import { api } from '@/services/api';
import type {
  AssessResponse,
  DecisionResponse,
  RecentContact,
  RecipientLookupResponse,
  TransactionHistoryPage,
} from '@/types/api';

type TransactionHistoryOptions = {
  limit?: number;
  cursor?: string | null;
};

export async function getTransactionHistory(options: number | TransactionHistoryOptions = 20) {
  const { limit, cursor } = typeof options === 'number'
    ? { limit: options, cursor: undefined }
    : { limit: options.limit ?? 20, cursor: options.cursor ?? undefined };
  const response = await api.get<TransactionHistoryPage>('/v1/transactions/history', {
    params: { limit, cursor },
  });
  return response.data;
}

export async function getRecentContacts(limit = 6) {
  const response = await api.get<RecentContact[]>('/v1/transactions/recent-contacts', {
    params: { limit },
  });
  return response.data;
}

export async function lookupRecipient(accountNumber: string, bankCode: string) {
  const response = await api.post<RecipientLookupResponse>('/v1/recipients/resolve', {
    account_number: accountNumber,
    bank_code: bankCode,
  });
  return response.data;
}

export async function assessTransfer(payload: {
  accountNumber: string;
  bankCode: string;
  amount: number;
  note?: string;
  lookupToken: string;
}) {
  const response = await api.post<AssessResponse>('/v1/transactions/assess', {
    payee_account: payload.accountNumber,
    bank_code: payload.bankCode,
    amount: payload.amount,
    note: payload.note,
    currency: 'VND',
    recipient_lookup_token: payload.lookupToken,
  });
  return response.data;
}

export async function submitTransferDecision(
  transactionId: string,
  verification: { pin: string } | { faceVerificationToken: string },
) {
  const isFaceVerification = 'faceVerificationToken' in verification;
  const response = await api.post<DecisionResponse>(`/v1/transactions/${transactionId}/decision`, {
    decision: 'proceeded',
    verification_confirmed: true,
    verification_method: isFaceVerification ? 'face' : 'pin',
    verification_answers: [],
    face_verification_confirmed: isFaceVerification,
    ...(isFaceVerification
      ? { face_verification_token: verification.faceVerificationToken }
      : { pin: verification.pin }),
  });
  return response.data;
}

export async function cancelTransfer(transactionId: string) {
  const response = await api.post<DecisionResponse>(`/v1/transactions/${transactionId}/decision`, {
    decision: 'cancelled',
    verification_confirmed: false,
    verification_method: 'mobile_cancel',
    verification_answers: [],
  });
  return response.data;
}
