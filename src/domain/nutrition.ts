import type { Food, InputMode, Nutrients } from "../types";

export const KJ_PER_KCAL = 4.184;

export function kjToKcal(kj: number): number {
  return kj / KJ_PER_KCAL;
}

export function kcalToKj(kcal: number): number {
  return kcal * KJ_PER_KCAL;
}

export function gramsFor(food: Food, mode: InputMode, quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (mode === "gram") return quantity;
  if (mode === "package") return quantity * (food.packageG ?? food.servingG ?? 100);
  return quantity * (food.servingG ?? food.packageG ?? 100);
}

export function nutritionFor(per100g: Nutrients, grams: number): Nutrients {
  const ratio = Math.max(0, grams) / 100;
  const scaled: Nutrients = {
    energyKj: per100g.energyKj * ratio,
    proteinG: per100g.proteinG * ratio,
    carbsG: per100g.carbsG * ratio,
    fatG: per100g.fatG * ratio,
    sodiumMg: per100g.sodiumMg * ratio
  };
  const optionalKeys: (keyof Nutrients)[] = ["fiberG", "sugarsG", "saturatedFatG", "transFatG", "cholesterolMg", "potassiumMg", "calciumMg", "ironMg", "vitaminDMcg"];
  optionalKeys.forEach((key) => {
    const value = per100g[key];
    if (value !== undefined) scaled[key] = value * ratio;
  });
  return scaled;
}

export function scaleNutrition(nutrition: Nutrients, ratio: number): Nutrients {
  return nutritionFor(nutrition, Math.max(0, ratio) * 100);
}

export function sumNutrition(items: Nutrients[]): Nutrients {
  const totals = items.reduce(
    (sum, item) => ({
      energyKj: sum.energyKj + item.energyKj,
      proteinG: sum.proteinG + item.proteinG,
      carbsG: sum.carbsG + item.carbsG,
      fatG: sum.fatG + item.fatG,
      sodiumMg: sum.sodiumMg + item.sodiumMg
    }),
    { energyKj: 0, proteinG: 0, carbsG: 0, fatG: 0, sodiumMg: 0 }
  );
  const optionalKeys: (keyof Nutrients)[] = ["fiberG", "sugarsG", "saturatedFatG", "transFatG", "cholesterolMg", "potassiumMg", "calciumMg", "ironMg", "vitaminDMcg"];
  optionalKeys.forEach((key) => {
    const knownValues = items.map((item) => item[key]).filter((value): value is number => value !== undefined);
    if (knownValues.length > 0) totals[key] = knownValues.reduce((sum, value) => sum + value, 0);
  });
  return totals;
}
