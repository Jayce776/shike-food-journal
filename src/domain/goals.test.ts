import { describe, expect, it } from "vitest";
import { selectGoalForDate } from "./goals";
import type { DailyGoal } from "../types";

const goals: DailyGoal[] = [
  { effectiveDate: "2026-01-01", energyKcal: 2000, proteinG: 100, carbsG: 250, fatG: 65, waterMl: 2000 },
  { effectiveDate: "2026-06-01", energyKcal: 1800, proteinG: 110, carbsG: 210, fatG: 60, waterMl: 2300 }
];

describe("goal history", () => {
  it("uses the latest goal version effective on a date", () => {
    expect(selectGoalForDate(goals, "2026-05-31").energyKcal).toBe(2000);
    expect(selectGoalForDate(goals, "2026-06-01").energyKcal).toBe(1800);
    expect(selectGoalForDate(goals, "2026-10-15").waterMl).toBe(2300);
  });

  it("does not apply a future goal to an earlier date", () => {
    expect(selectGoalForDate(goals, "2025-12-31")).toEqual({ effectiveDate: "2025-12-31", energyKcal: 2000, waterMl: 2000 });
  });
});
