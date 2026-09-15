export interface RunBudget {
  maxDurationMs: number;
  maxToolCalls: number;
  maxCostUsd: number;
}

export interface RunUsage {
  startedAt: number;
  toolCalls: number;
  costUsd: number;
}

export type BudgetReason = "duration" | "toolCalls" | "cost" | null;

export const defaultBudget = (): RunBudget => ({
  maxDurationMs: 15 * 60 * 1000,
  maxToolCalls: 80,
  maxCostUsd: 2,
});

export function budgetExceeded(budget: RunBudget, usage: RunUsage, now = Date.now()): BudgetReason {
  if (now - usage.startedAt > budget.maxDurationMs) return "duration";
  if (usage.toolCalls > budget.maxToolCalls) return "toolCalls";
  if (usage.costUsd > budget.maxCostUsd) return "cost";
  return null;
}
