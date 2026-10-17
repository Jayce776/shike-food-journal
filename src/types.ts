export type EnergyUnit = "kcal" | "kJ";
export type InputMode = "serving" | "package" | "gram";
export type ColorTheme = "sage" | "sky" | "peach" | "lavender" | "graphite";
export type DashboardMetricKey = "proteinG" | "carbsG" | "fatG" | "fiberG" | "sugarsG" | "saturatedFatG" | "sodiumMg" | "waterMl";

export interface Nutrients {
  energyKj: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sodiumMg: number;
  fiberG?: number;
  sugarsG?: number;
  saturatedFatG?: number;
  transFatG?: number;
  cholesterolMg?: number;
  potassiumMg?: number;
  calciumMg?: number;
  ironMg?: number;
  vitaminDMcg?: number;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  emoji: string;
  per100g: Nutrients;
  servingG?: number;
  packageG?: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface MealEntry {
  id: string;
  foodId: string;
  foodName: string;
  foodEmoji: string;
  eatenAt: string;
  date: string;
  inputMode: InputMode;
  inputQuantity: number;
  amountGrams: number;
  nutrition: Nutrients;
  createdAt: string;
  updatedAt: string;
}

export interface DailyGoal {
  effectiveDate: string;
  energyKcal: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  waterMl: number;
}

export interface WaterEntry {
  id: string;
  date: string;
  amountMl: number;
  createdAt: string;
}

export interface AppSettings {
  id: "main";
  energyUnit: EnergyUnit;
  theme: "system" | "light" | "dark";
  colorTheme?: ColorTheme;
  homeMetrics?: DashboardMetricKey[];
  customCategories?: string[];
  lastBackupAt?: string;
}
