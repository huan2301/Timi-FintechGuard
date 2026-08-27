import { create } from "zustand";

export type TimiAssistantActivity = {
  status: "idle" | "analyzing" | "warning" | "complete";
  message?: string;
  riskLevel?: "safe" | "low" | "medium" | "high" | null;
};

export type TimiRiskCoachContext = {
  transaction_id: string;
  recipient_name: string | null;
  recipient_account_masked: string | null;
  bank_name: string | null;
  amount: number | null;
  note: string | null;
  risk_level: "low" | "medium" | "high";
  risk_score: number;
  signals: string[];
  warning_message: string | null;
};

type TimiAssistantState = {
  activity: TimiAssistantActivity;
  riskContext: TimiRiskCoachContext | null;
  setActivity: (activity: TimiAssistantActivity) => void;
  setRiskContext: (context: TimiRiskCoachContext) => void;
  clearRiskContext: () => void;
  clearActivity: () => void;
};

export const useTimiAssistantStore = create<TimiAssistantState>((set) => ({
  activity: { status: "idle" },
  riskContext: null,
  setActivity: (activity) => set({ activity }),
  setRiskContext: (riskContext) => set({ riskContext }),
  clearRiskContext: () => set({ riskContext: null }),
  clearActivity: () => set({ activity: { status: "idle" } }),
}));
