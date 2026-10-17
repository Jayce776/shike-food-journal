export interface NutritionOcrDraft {
  energy?: number;
  energyUnit: "kJ" | "kcal";
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  sodiumMg?: number;
  looksLikePer100g: boolean;
}

function normalizedLines(text: string) {
  return text
    .replace(/[，,]/g, ".")
    .replace(/[：:]/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ""))
    .filter(Boolean);
}

function valueAfterLabel(lines: string[], labels: RegExp[]) {
  for (const line of lines) {
    for (const label of labels) {
      const match = line.match(label);
      if (!match || match.index === undefined) continue;
      const tail = line.slice(match.index + match[0].length);
      const value = tail.match(/(\d+(?:\.\d+)?)/)?.[1];
      if (value !== undefined) return Number(value);
    }
  }
  return undefined;
}

export function parseNutritionText(text: string): NutritionOcrDraft {
  const lines = normalizedLines(text);
  const energyLine = lines.find((line) => /能量|energy/i.test(line)) ?? "";
  return {
    energy: valueAfterLabel(lines, [/能量/, /energy/i]),
    energyUnit: /kcal|千卡|大卡/i.test(energyLine) ? "kcal" : "kJ",
    proteinG: valueAfterLabel(lines, [/蛋白质/, /protein/i]),
    carbsG: valueAfterLabel(lines, [/碳水化合物/, /碳水/, /carbohydrate/i]),
    fatG: valueAfterLabel(lines, [/脂肪/, /\bfat/i]),
    sodiumMg: valueAfterLabel(lines, [/钠/, /sodium/i]),
    looksLikePer100g: /每?100(?:g|克)|per100g/i.test(lines.join(""))
  };
}

export function detectedNutritionCount(draft: NutritionOcrDraft) {
  return [draft.energy, draft.proteinG, draft.carbsG, draft.fatG, draft.sodiumMg]
    .filter((value) => value !== undefined).length;
}
