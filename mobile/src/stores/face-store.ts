import { create } from 'zustand';

interface FaceVerificationState {
  transactionId: string | null;
  token: string | null;
  setVerification: (transactionId: string, token: string) => void;
  clearVerification: () => void;
}

export const useFaceStore = create<FaceVerificationState>((set) => ({
  transactionId: null,
  token: null,
  setVerification: (transactionId, token) => set({ transactionId, token }),
  clearVerification: () => set({ transactionId: null, token: null }),
}));
