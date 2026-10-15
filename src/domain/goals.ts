import type { DailyGoal } from "../types";

export function selectGoalForDate(goals: DailyGoal[], date: string): DailyGoal {
  return goals
    .filter((goal) => goal.effectiveDate <= date)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]
    ?? { effectiveDate: date, energyKcal: 2000, waterMl: 2000 };
}
