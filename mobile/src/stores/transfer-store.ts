import { create } from 'zustand';

import type { AssessResponse, RecipientLookupResponse } from '@/types/api';

export type TransferVerificationFlow = {
  accountNumber: string;
  bankCode: string;
  amount: number;
  note: string;
  recipient: RecipientLookupResponse;
  assessment: AssessResponse;
};

type TransferState = {
  flow: TransferVerificationFlow | null;
  prepare: (flow: TransferVerificationFlow) => void;
  clear: () => void;
};

export const useTransferStore = create<TransferState>((set) => ({
  flow: null,
  prepare: (flow) => set({ flow }),
  clear: () => set({ flow: null }),
}));
