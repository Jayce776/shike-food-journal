import Dexie, { type EntityTable } from "dexie";
import type { AppSettings, DailyGoal, Food, MealEntry, WaterEntry } from "./types";
import { selectGoalForDate } from "./domain/goals";

class ShikeDatabase extends Dexie {
  foods!: EntityTable<Food, "id">;
  mealEntries!: EntityTable<MealEntry, "id">;
  dailyGoals!: EntityTable<DailyGoal, "effectiveDate">;
  waterEntries!: EntityTable<WaterEntry, "id">;
  settings!: EntityTable<AppSettings, "id">;

  constructor() {
    super("shike-nutrition");
    this.version(1).stores({
      foods: "id, name, updatedAt",
      mealEntries: "id, date, eatenAt, foodId",
      dailyGoals: "effectiveDate",
      waterEntries: "id, date, createdAt",
      settings: "id"
    });
  }
}

export const db = new ShikeDatabase();

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function ensureSeedData(): Promise<void> {
  await db.transaction("rw", db.foods, db.mealEntries, db.dailyGoals, db.waterEntries, db.settings, async () => {
    if ((await db.foods.count()) > 0) return;

    const today = localDateKey();
    const now = new Date().toISOString();
    const foods: Food[] = [
      {
        id: "food-noodles",
        name: "番茄牛肉方便面",
        brand: "示例品牌",
        category: "方便速食",
        emoji: "🍜",
        per100g: { energyKj: 1840, proteinG: 9.5, carbsG: 62, fatG: 17, sodiumMg: 2100, fiberG: 3, sugarsG: 6, saturatedFatG: 8 },
        servingG: 105,
        packageG: 105,
        createdAt: now,
        updatedAt: now,
        archived: false
      },
      {
        id: "food-chicken",
        name: "原味即食鸡胸",
        brand: "示例品牌",
        category: "肉蛋奶",
        emoji: "🥩",
        per100g: { energyKj: 510, proteinG: 24, carbsG: 2.5, fatG: 2.2, sodiumMg: 730, sugarsG: 1, saturatedFatG: 0.7 },
        servingG: 100,
        packageG: 100,
        createdAt: now,
        updatedAt: now,
        archived: false
      },
      {
        id: "food-dumplings",
        name: "荠菜猪肉水饺",
        brand: "示例品牌",
        category: "方便速食",
        emoji: "🥟",
        per100g: { energyKj: 850, proteinG: 8.8, carbsG: 29, fatG: 6.2, sodiumMg: 610, fiberG: 2, sugarsG: 2, saturatedFatG: 2.5 },
        servingG: 130,
        packageG: 520,
        createdAt: now,
        updatedAt: now,
        archived: false
      }
    ];

    await db.foods.bulkAdd(foods);
    await db.dailyGoals.add({ effectiveDate: today, energyKcal: 2000, proteinG: 100, carbsG: 250, fatG: 65, waterMl: 2000 });
    await db.settings.add({ id: "main", energyUnit: "kcal", theme: "system", colorTheme: "sage", homeMetrics: ["proteinG", "carbsG", "fatG", "waterMl"] });
  });
}

export async function goalForDate(date: string): Promise<DailyGoal> {
  const goals = await db.dailyGoals.toArray();
  return selectGoalForDate(goals, date);
}
