import { create } from "zustand";

export type TimiAssistantActivity = {
  status: "idle" | "analyzing" | "warning" | "complete";
  message?: string;
  riskLevel?: "safe" | "low" | "medium" | "high" | null;
};

type TimiAssistantState = {
  activity: TimiAssistantActivity;
  setActivity: (activity: TimiAssistantActivity) => void;
  clearActivity: () => void;
};

export const useTimiAssistantStore = create<TimiAssistantState>((set) => ({
  activity: { status: "idle" },
  setActivity: (activity) => set({ activity }),
  clearActivity: () => set({ activity: { status: "idle" } }),
}));
