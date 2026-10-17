import { describe, expect, it } from "vitest";
import { detectedNutritionCount, parseNutritionText } from "./ocr";

describe("nutrition OCR parser", () => {
  it("parses a typical Chinese per-100g nutrition table", () => {
    const draft = parseNutritionText(`每100克\n能量 1680 kJ 20%\n蛋白质 8.5 g 14%\n脂肪 18.2 g 30%\n碳水化合物 52.3 g 17%\n钠 860 mg 43%`);
    expect(draft).toMatchObject({ energy: 1680, energyUnit: "kJ", proteinG: 8.5, fatG: 18.2, carbsG: 52.3, sodiumMg: 860, looksLikePer100g: true });
    expect(detectedNutritionCount(draft)).toBe(5);
  });

  it("recognizes kcal and tolerates compact English rows", () => {
    const draft = parseNutritionText("Per 100g\nEnergy: 320 kcal\nProtein 12g\nFat 9g\nCarbohydrate 48g\nSodium 520mg");
    expect(draft.energyUnit).toBe("kcal");
    expect(draft.energy).toBe(320);
    expect(draft.looksLikePer100g).toBe(true);
  });
});
