import { describe, expect, it } from "vitest";
import { gramsFor, kcalToKj, kjToKcal, nutritionFor, scaleNutrition, sumNutrition } from "./nutrition";
import type { Food } from "../types";

const food: Food = {
  id: "test",
  name: "测试食品",
  emoji: "🥣",
  per100g: { energyKj: 1000, proteinG: 10, carbsG: 20, fatG: 5, sodiumMg: 500 },
  servingG: 45,
  packageG: 90,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  archived: false
};

describe("nutrition calculations", () => {
  it("converts between kJ and kcal", () => {
    expect(kjToKcal(418.4)).toBeCloseTo(100);
    expect(kcalToKj(100)).toBeCloseTo(418.4);
  });

  it("calculates grams for serving, package and gram input", () => {
    expect(gramsFor(food, "serving", 1.5)).toBe(67.5);
    expect(gramsFor(food, "package", 0.5)).toBe(45);
    expect(gramsFor(food, "gram", 65)).toBe(65);
  });

  it("scales every nutrient from the per-100g label", () => {
    expect(nutritionFor(food.per100g, 65)).toEqual({ energyKj: 650, proteinG: 6.5, carbsG: 13, fatG: 3.25, sodiumMg: 325 });
  });

  it("scales optional nutrients without turning missing label values into zero", () => {
    const nutrition = nutritionFor({ ...food.per100g, fiberG: 8, sugarsG: 4 }, 50);
    expect(nutrition.fiberG).toBe(4);
    expect(nutrition.sugarsG).toBe(2);
    expect(nutrition.calciumMg).toBeUndefined();
  });

  it("keeps an optional nutrient unknown until at least one record contains it", () => {
    const unknown = sumNutrition([food.per100g]);
    const known = sumNutrition([food.per100g, { ...food.per100g, fiberG: 3 }]);
    expect(unknown.fiberG).toBeUndefined();
    expect(known.fiberG).toBe(3);
  });

  it("rescales a saved nutrition snapshot when an entry quantity changes", () => {
    const original = nutritionFor({ ...food.per100g, fiberG: 4 }, 50);
    expect(scaleNutrition(original, 1.5)).toEqual(nutritionFor({ ...food.per100g, fiberG: 4 }, 75));
  });

  it("rejects invalid and negative quantities", () => {
    expect(gramsFor(food, "gram", -10)).toBe(0);
    expect(gramsFor(food, "gram", Number.NaN)).toBe(0);
  });
});
