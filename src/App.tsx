import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, goalForDate, localDateKey } from "./db";
import { gramsFor, kcalToKj, kjToKcal, nutritionFor, scaleNutrition, sumNutrition } from "./domain/nutrition";
import { selectGoalForDate } from "./domain/goals";
import type { AppSettings, ColorTheme, DailyGoal, DashboardMetricKey, EnergyUnit, Food, InputMode, MealEntry, Nutrients, WaterEntry } from "./types";

type View = "today" | "calendar" | "foods" | "settings";
type FoodSort = "recent" | "updated" | "name";
type UndoNotice = { message: string; action: () => Promise<void> };
const APP_VERSION = "0.8.0";

const round = (value: number, digits = 0) => Number(value.toFixed(digits));
const formatDate = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("zh-CN", options).format(new Date(`${date}T12:00:00`));

const defaultHomeMetrics: DashboardMetricKey[] = ["proteinG", "carbsG", "fatG", "waterMl"];
const foodCategories = ["方便速食", "主食", "肉蛋奶", "饮品", "零食", "其他"] as const;
const metricOptions: { id: DashboardMetricKey; label: string; unit: "g" | "mg" | "ml"; note: string }[] = [
  { id: "proteinG", label: "蛋白质", unit: "g", note: "三大营养素" },
  { id: "carbsG", label: "碳水", unit: "g", note: "三大营养素" },
  { id: "fatG", label: "脂肪", unit: "g", note: "三大营养素" },
  { id: "fiberG", label: "膳食纤维", unit: "g", note: "标签可能不提供" },
  { id: "sugarsG", label: "糖", unit: "g", note: "标签可能不提供" },
  { id: "saturatedFatG", label: "饱和脂肪", unit: "g", note: "标签可能不提供" },
  { id: "sodiumMg", label: "钠", unit: "mg", note: "仅记录" },
  { id: "waterMl", label: "饮水", unit: "ml", note: "可快速添加" }
];

export default function App() {
  const today = localDateKey();
  const [view, setView] = useState<View>("today");
  const [selectedDate, setSelectedDate] = useState(today);
  const [loggingFood, setLoggingFood] = useState<Food | null>(null);
  const [editingFood, setEditingFood] = useState<Food | "new" | null>(null);
  const [editingEntry, setEditingEntry] = useState<MealEntry | null>(null);
  const [foodQuery, setFoodQuery] = useState("");
  const [foodCategory, setFoodCategory] = useState("全部");
  const [foodSort, setFoodSort] = useState<FoodSort>("recent");
  const [mode, setMode] = useState<InputMode>("serving");
  const [quantity, setQuantity] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [undoNotice, setUndoNotice] = useState<UndoNotice | null>(null);
  const undoTimer = useRef<number | null>(null);

  const data = useLiveQuery(async () => {
    const [entries, foods, waterEntries, goal, currentGoal, settings, recentEntries] = await Promise.all([
      db.mealEntries.where("date").equals(selectedDate).sortBy("eatenAt"),
      db.foods.toArray().then((items) => items.filter((food) => !food.archived)),
      db.waterEntries.where("date").equals(selectedDate).toArray(),
      goalForDate(selectedDate),
      goalForDate(today),
      db.settings.get("main"),
      db.mealEntries.orderBy("eatenAt").reverse().toArray()
    ]);
    const recentByFood: Record<string, string> = {};
    recentEntries.forEach((entry) => { if (!recentByFood[entry.foodId]) recentByFood[entry.foodId] = entry.eatenAt; });
    return { entries, foods, waterEntries, goal, currentGoal, settings, recentByFood };
  }, [selectedDate]);

  const summary = useMemo(() => sumNutrition(data?.entries.map((entry) => entry.nutrition) ?? []), [data?.entries]);
  const waterMl = data?.waterEntries.reduce((sum, entry) => sum + entry.amountMl, 0) ?? 0;
  const kcal = kjToKcal(summary.energyKj);
  const goalKcal = data?.goal.energyKcal ?? 2000;
  const remaining = goalKcal - kcal;
  const progress = Math.max(0, (kcal / goalKcal) * 100);
  const homeMetrics = data?.settings?.homeMetrics ?? defaultHomeMetrics;
  const visibleFoods = (data?.foods.filter((food) => {
    const query = foodQuery.trim().toLocaleLowerCase("zh-CN");
    const matchesQuery = !query || `${food.name} ${food.brand ?? ""}`.toLocaleLowerCase("zh-CN").includes(query);
    const matchesCategory = foodCategory === "全部" || (food.category ?? "其他") === foodCategory;
    return matchesQuery && matchesCategory;
  }) ?? []).sort((a, b) => {
    if (foodSort === "name") return a.name.localeCompare(b.name, "zh-CN");
    if (foodSort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
    const aRecent = data?.recentByFood[a.id] ?? "";
    const bRecent = data?.recentByFood[b.id] ?? "";
    return bRecent.localeCompare(aRecent) || b.updatedAt.localeCompare(a.updatedAt);
  });
  const displayEnergy = (energyKj: number) => data?.settings?.energyUnit === "kJ"
    ? `${round(energyKj)} kJ`
    : `${round(kjToKcal(energyKj))} kcal`;

  useEffect(() => {
    document.documentElement.dataset.colorTheme = data?.settings?.colorTheme ?? "sage";
  }, [data?.settings?.colorTheme]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }

  function offerUndo(message: string, action: () => Promise<void>) {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setUndoNotice({ message, action });
    undoTimer.current = window.setTimeout(() => setUndoNotice(null), 5000);
  }

  async function undoLastChange() {
    if (!undoNotice) return;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    await undoNotice.action();
    setUndoNotice(null);
    flash("已撤销刚才的操作");
  }

  async function updateMeal(next: MealEntry) {
    if (!editingEntry) return;
    const previous = editingEntry;
    await db.mealEntries.put(next);
    setEditingEntry(null);
    offerUndo("饮食记录已更新", () => db.mealEntries.put(previous).then(() => undefined));
  }

  async function deleteMeal() {
    if (!editingEntry) return;
    const previous = editingEntry;
    await db.mealEntries.delete(previous.id);
    setEditingEntry(null);
    offerUndo("饮食记录已删除", () => db.mealEntries.put(previous).then(() => undefined));
  }

  function openLogger(food: Food) {
    setLoggingFood(food);
    setMode(food.servingG ? "serving" : "gram");
    setQuantity(food.servingG ? 1 : 100);
  }

  async function saveMeal() {
    if (!loggingFood) return;
    const amountGrams = gramsFor(loggingFood, mode, quantity);
    const now = new Date();
    await db.mealEntries.add({
      id: crypto.randomUUID(),
      foodId: loggingFood.id,
      foodName: loggingFood.name,
      foodEmoji: loggingFood.emoji,
      eatenAt: now.toISOString(),
      date: selectedDate,
      inputMode: mode,
      inputQuantity: quantity,
      amountGrams,
      nutrition: nutritionFor(loggingFood.per100g, amountGrams),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
    setLoggingFood(null);
    flash(selectedDate === today ? "已加入今天" : "已加入所选日期");
  }

  async function addWater(amountMl: number) {
    await db.waterEntries.add({ id: crypto.randomUUID(), date: selectedDate, amountMl, createdAt: new Date().toISOString() });
    flash(`已记录 ${amountMl}ml`);
  }

  if (!data) return <main className="loading">正在准备你的饮食记录…</main>;

  return (
    <main className="app-shell">
      <section className="content">
        {view === "today" && (
          <>
            <header className="page-header">
              <div><p className="eyebrow">{formatDate(selectedDate, { month: "long", day: "numeric", weekday: "short" })}</p><h1>{selectedDate === today ? "今天" : "日期记录"}</h1></div>
              {selectedDate !== today && <button className="text-button" onClick={() => setSelectedDate(today)}>回到今天</button>}
            </header>

            <section className="energy-card">
              <p>{remaining >= 0 ? "今天还可以摄入" : "今天比目标多摄入"}</p>
              <strong>{data.settings?.energyUnit === "kJ" ? `${round(Math.abs(remaining) * 4.184)} kJ` : `${round(Math.abs(remaining))} kcal`}</strong>
              <div className="energy-meta">已摄入 {displayEnergy(summary.energyKj)} · 目标 {data.settings?.energyUnit === "kJ" ? `${round(goalKcal * 4.184)} kJ` : `${goalKcal} kcal`}</div>
              <div className="progress-track"><span style={{ width: `${Math.min(progress, 100)}%` }} /></div>
              <div className="progress-label">目标完成 {round(progress)}%</div>
            </section>

            <section className="metric-grid">
              {homeMetrics.map((key) => {
                if (key === "waterMl") return <article className="metric-card water-card" key={key}><span>饮水</span><strong>{waterMl}ml</strong><small>目标 {data.goal.waterMl}ml</small><button onClick={() => addWater(250)}>＋250ml</button></article>;
                const option = metricOptions.find((item) => item.id === key)!;
                const value = summary[key as keyof Nutrients];
                const nutrientGoal = key === "proteinG" ? data.goal.proteinG : key === "carbsG" ? data.goal.carbsG : key === "fatG" ? data.goal.fatG : undefined;
                return <Metric key={key} label={option.label} value={value === undefined ? "未记录" : `${round(value, option.unit === "g" ? 1 : 0)}${option.unit}`} goal={nutrientGoal ? `目标 ${nutrientGoal}${option.unit}` : option.note} />;
              })}
            </section>

            <p className="more-nutrition">更多营养 · 今日钠约 {round(summary.sodiumMg)}mg（仅记录）</p>
            <div className="section-heading"><h2>今天的记录</h2><button className="text-button" onClick={() => setView("foods")}>添加</button></div>
            <section className="list-card">
              {data.entries.length === 0 ? <div className="empty">还没有记录，吃东西后从食品库添加。</div> : data.entries.map((entry) => (
                <button className="meal-row meal-button" key={entry.id} onClick={() => setEditingEntry(entry)}>
                  <div className="food-emoji">{entry.foodEmoji}</div>
                  <div className="meal-copy"><strong>{entry.foodName}</strong><span>{new Date(entry.eatenAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} · {round(entry.amountGrams)}g</span></div>
                  <b>{displayEnergy(entry.nutrition.energyKj)} <i>›</i></b>
                </button>
              ))}
            </section>
            <button className="primary-button" onClick={() => setView("foods")}>＋ 记录饮食</button>
          </>
        )}

        {view === "foods" && (
          <>
            <header className="page-header"><div><p className="eyebrow">提前录一次，以后直接选</p><h1>食品库</h1></div><button className="text-button" onClick={() => setEditingFood("new")}>＋ 新增</button></header>
            <button className="scan-card" onClick={() => flash("拍照识别将在第二阶段接入")}>📷 <span><strong>拍照识别营养表</strong><small>识别后先校对，再保存</small></span><b>›</b></button>
            <label className="search-field"><span>⌕</span><input type="search" placeholder="搜索食品或品牌" value={foodQuery} onChange={(event) => setFoodQuery(event.target.value)} /></label>
            <div className="food-library-toolbar"><div className="category-filter" aria-label="食品分类筛选">{["全部", ...foodCategories].map((category) => <button type="button" key={category} className={foodCategory === category ? "active" : ""} onClick={() => setFoodCategory(category)}>{category}</button>)}</div><label>排序<select value={foodSort} onChange={(event) => setFoodSort(event.target.value as FoodSort)}><option value="recent">最近使用</option><option value="updated">最近编辑</option><option value="name">名称</option></select></label></div>
            <section className="food-grid">
              {visibleFoods.length === 0 && <div className="empty food-empty">没有找到符合条件的食品。</div>}
              {visibleFoods.map((food) => (
                <article className="food-card" key={food.id}>
                  <div className="food-emoji large">{food.emoji}</div><div className="food-card-copy"><strong>{food.name}</strong><p>{food.brand || "未填写品牌"}</p><small><span>{food.category ?? "其他"}</span> · 每100g · {round(kjToKcal(food.per100g.energyKj))} kcal</small></div>
                  <div className="food-actions"><button className="edit-food" onClick={() => setEditingFood(food)}>编辑</button><button onClick={() => openLogger(food)}>记录</button></div>
                </article>
              ))}
            </section>
          </>
        )}

        {view === "calendar" && <Calendar selectedDate={selectedDate} energyUnit={data.settings?.energyUnit ?? "kcal"} onSelect={setSelectedDate} onOpenDay={() => setView("today")} onEditEntry={setEditingEntry} />}

        {view === "settings" && <Settings goal={data.currentGoal} energyUnit={data.settings?.energyUnit ?? "kcal"} colorTheme={data.settings?.colorTheme ?? "sage"} homeMetrics={data.settings?.homeMetrics ?? defaultHomeMetrics} onSaved={() => flash("设置已保存")} />}
      </section>

      <nav className="bottom-nav" aria-label="主要导航">
        <NavButton active={view === "today"} icon="◉" label="今天" onClick={() => { setSelectedDate(today); setView("today"); }} />
        <NavButton active={view === "calendar"} icon="▦" label="日历" onClick={() => setView("calendar")} />
        <NavButton active={view === "foods"} icon="▤" label="食品库" onClick={() => setView("foods")} />
        <NavButton active={view === "settings"} icon="⚙︎" label="设置" onClick={() => setView("settings")} />
      </nav>

      {loggingFood && <LogSheet food={loggingFood} mode={mode} quantity={quantity} onMode={setMode} onQuantity={setQuantity} onClose={() => setLoggingFood(null)} onSave={saveMeal} />}
      {editingFood && <FoodEditor food={editingFood === "new" ? null : editingFood} onClose={() => setEditingFood(null)} onSaved={(message) => { setEditingFood(null); flash(message); }} />}
      {editingEntry && <MealEditor entry={editingEntry} food={data.foods.find((food) => food.id === editingEntry.foodId) ?? null} onClose={() => setEditingEntry(null)} onSave={updateMeal} onDelete={deleteMeal} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      {undoNotice && <div className="undo-toast" role="status"><span>{undoNotice.message}</span><button onClick={undoLastChange}>撤销</button></div>}
    </main>
  );
}

function Metric({ label, value, goal }: { label: string; value: string; goal?: string | false }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{goal || "仅记录"}</small></article>;
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}><b>{icon}</b><span>{label}</span></button>;
}

function Calendar({ selectedDate, energyUnit, onSelect, onOpenDay, onEditEntry }: { selectedDate: string; energyUnit: EnergyUnit; onSelect: (date: string) => void; onOpenDay: () => void; onEditEntry: (entry: MealEntry) => void }) {
  const [monthDate, setMonthDate] = useState(`${selectedDate.slice(0, 7)}-01`);
  const [calendarMode, setCalendarMode] = useState<"month" | "trends">("month");
  const month = new Date(`${monthDate}T12:00:00`);
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return localDateKey(date);
  });
  const rangeStart = days[0];
  const rangeEnd = days.at(-1)!;
  const calendarData = useLiveQuery(async () => {
    const [monthEntries, selectedEntries, waterEntries, selectedGoal] = await Promise.all([
      db.mealEntries.where("date").between(rangeStart, rangeEnd, true, true).toArray(),
      db.mealEntries.where("date").equals(selectedDate).sortBy("eatenAt"),
      db.waterEntries.where("date").equals(selectedDate).toArray(),
      goalForDate(selectedDate)
    ]);
    const datesWithEntries = new Set(monthEntries.map((entry) => entry.date));
    return { selectedEntries, selectedGoal, datesWithEntries, waterMl: waterEntries.reduce((sum, entry) => sum + entry.amountMl, 0) };
  }, [rangeStart, rangeEnd, selectedDate]);
  const selectedSummary = sumNutrition(calendarData?.selectedEntries.map((entry) => entry.nutrition) ?? []);
  const selectedEntries = calendarData?.selectedEntries ?? [];

  function changeMonth(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonthDate(localDateKey(next));
  }

  function chooseDate(date: string) {
    onSelect(date);
    if (date.slice(0, 7) !== monthDate.slice(0, 7)) setMonthDate(`${date.slice(0, 7)}-01`);
  }

  const displayCalendarEnergy = (entry: MealEntry) => energyUnit === "kJ" ? `${round(entry.nutrition.energyKj)} kJ` : `${round(kjToKcal(entry.nutrition.energyKj))} kcal`;

  return <>
    <header className="page-header"><div><p className="eyebrow">点一天，直接查看当天记录</p><h1>日历</h1></div><button className="text-button" onClick={() => { const today = localDateKey(); setMonthDate(`${today.slice(0, 7)}-01`); onSelect(today); }}>回到今天</button></header>
    <div className="view-toggle"><button className={calendarMode === "month" ? "active" : ""} onClick={() => setCalendarMode("month")}>月历</button><button className={calendarMode === "trends" ? "active" : ""} onClick={() => setCalendarMode("trends")}>趋势</button></div>
    {calendarMode === "month" ? <>
      <section className="calendar-card">
      <div className="calendar-toolbar"><button aria-label="上个月" onClick={() => changeMonth(-1)}>‹</button><h2>{formatDate(monthDate, { year: "numeric", month: "long" })}</h2><button aria-label="下个月" onClick={() => changeMonth(1)}>›</button></div>
      <div className="weekday-row">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="month-grid">{days.map((date) => {
        const isOutside = date.slice(0, 7) !== monthDate.slice(0, 7);
        const hasEntry = calendarData?.datesWithEntries.has(date);
        return <button key={date} aria-label={date} className={[isOutside && "outside", date === selectedDate && "selected", date === localDateKey() && "today"].filter(Boolean).join(" ")} onClick={() => chooseDate(date)}><span>{Number(date.slice(-2))}</span>{hasEntry && <i />}</button>;
      })}</div>
      </section>
      <section className="day-detail">
      <div className="section-heading"><div><p className="eyebrow">{formatDate(selectedDate, { weekday: "long" })}</p><h2>{formatDate(selectedDate, { month: "long", day: "numeric" })}</h2></div><button className="text-button" onClick={onOpenDay}>查看完整记录</button></div>
      <div className="day-stats"><div><span>摄入能量 · 目标 {energyUnit === "kJ" ? `${round(kcalToKj(calendarData?.selectedGoal.energyKcal ?? 2000))} kJ` : `${calendarData?.selectedGoal.energyKcal ?? 2000} kcal`}</span><strong>{energyUnit === "kJ" ? `${round(selectedSummary.energyKj)} kJ` : `${round(kjToKcal(selectedSummary.energyKj))} kcal`}</strong></div><div><span>饮水 · 目标 {calendarData?.selectedGoal.waterMl ?? 2000} ml</span><strong>{calendarData?.waterMl ?? 0} ml</strong></div></div>
      <div className="list-card">{selectedEntries.length === 0 ? <div className="empty">这一天还没有饮食记录。</div> : selectedEntries.map((entry) => <button className="meal-row meal-button" key={entry.id} onClick={() => onEditEntry(entry)}><div className="food-emoji">{entry.foodEmoji}</div><div className="meal-copy"><strong>{entry.foodName}</strong><span>{new Date(entry.eatenAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} · {round(entry.amountGrams)}g</span></div><b>{displayCalendarEnergy(entry)} <i>›</i></b></button>)}</div>
      </section>
    </> : <TrendPanel energyUnit={energyUnit} />}
  </>;
}

function TrendPanel({ energyUnit }: { energyUnit: EnergyUnit }) {
  const [range, setRange] = useState<7 | 30>(7);
  const dates = useMemo(() => Array.from({ length: range }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (range - 1 - index));
    return localDateKey(date);
  }), [range]);
  const trendData = useLiveQuery(async () => {
    const [entries, goals] = await Promise.all([
      db.mealEntries.where("date").between(dates[0], dates.at(-1)!, true, true).toArray(),
      db.dailyGoals.toArray()
    ]);
    return { entries, goals };
  }, [dates[0], dates.at(-1)]);
  const daily = useMemo(() => dates.map((date) => {
    const nutrition = sumNutrition((trendData?.entries ?? []).filter((entry) => entry.date === date).map((entry) => entry.nutrition));
    return { date, kcal: kjToKcal(nutrition.energyKj), protein: nutrition.proteinG, carbs: nutrition.carbsG, fat: nutrition.fatG };
  }), [dates, trendData?.entries]);
  const energyValues = daily.map((day) => energyUnit === "kJ" ? day.kcal * 4.184 : day.kcal);
  const energyGoalValues = dates.map((date) => {
    const kcal = selectGoalForDate(trendData?.goals ?? [], date).energyKcal;
    return energyUnit === "kJ" ? kcalToKj(kcal) : kcal;
  });

  return <section className="trends-panel">
    <div className="trend-header"><div><p className="eyebrow">观察变化，不评价好坏</p><h2>饮食趋势</h2></div><div className="range-toggle"><button className={range === 7 ? "active" : ""} onClick={() => setRange(7)}>7天</button><button className={range === 30 ? "active" : ""} onClick={() => setRange(30)}>30天</button></div></div>
    <TrendChart title="每日能量" unit={energyUnit} series={[{ label: "实际", color: "var(--green)", values: energyValues }, { label: "目标", color: "var(--muted)", values: energyGoalValues, dashed: true }]} dates={dates} />
    <TrendChart title="三大营养元素" unit="g" series={[{ label: "蛋白质", color: "#ff9f0a", values: daily.map((day) => day.protein) }, { label: "碳水", color: "#0a84ff", values: daily.map((day) => day.carbs) }, { label: "脂肪", color: "#bf5af2", values: daily.map((day) => day.fat) }]} dates={dates} />
    <p className="chart-note">折线展示每日实际记录。没有记录的日期按 0 显示；它表示“当天未记录”，不代表实际没有摄入。</p>
  </section>;
}

function TrendChart({ title, unit, series, dates }: { title: string; unit: string; series: { label: string; color: string; values: number[]; dashed?: boolean }[]; dates: string[] }) {
  const width = 320;
  const height = 150;
  const padX = 18;
  const padTop = 16;
  const padBottom = 24;
  const recordedMax = Math.max(0, ...series.flatMap((item) => item.values));
  const chartMax = Math.max(1, recordedMax);
  const x = (index: number) => padX + (index / Math.max(1, dates.length - 1)) * (width - padX * 2);
  const y = (value: number) => padTop + (1 - value / chartMax) * (height - padTop - padBottom);
  return <article className="chart-card"><div className="chart-title"><h3>{title}</h3><strong>最高 {round(recordedMax)} {unit}</strong></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}趋势图`}><line x1={padX} x2={width - padX} y1={height - padBottom} y2={height - padBottom} className="chart-axis" />{series.map((item) => <polyline key={item.label} points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} fill="none" stroke={item.color} strokeWidth="3" strokeDasharray={item.dashed ? "6 5" : undefined} strokeLinecap="round" strokeLinejoin="round" />)}<text x={padX} y={height - 5}>{formatDate(dates[0], { month: "numeric", day: "numeric" })}</text><text x={width - padX} y={height - 5} textAnchor="end">{formatDate(dates.at(-1)!, { month: "numeric", day: "numeric" })}</text></svg><div className="chart-legend">{series.map((item) => <span key={item.label}><i className={item.dashed ? "dashed" : ""} style={{ background: item.color }} />{item.label}</span>)}</div></article>;
}

const colorThemes: { id: ColorTheme; label: string; note: string }[] = [
  { id: "sage", label: "鼠尾草", note: "清新自然" },
  { id: "sky", label: "天空蓝", note: "接近 iOS 蓝" },
  { id: "peach", label: "暖杏", note: "柔和温暖" },
  { id: "lavender", label: "薰衣草", note: "安静舒缓" },
  { id: "graphite", label: "石墨", note: "克制中性" }
];

function Settings({ goal, energyUnit, colorTheme, homeMetrics, onSaved }: { goal: DailyGoal; energyUnit: EnergyUnit; colorTheme: ColorTheme; homeMetrics: DashboardMetricKey[]; onSaved: () => void }) {
  const [effectiveDate, setEffectiveDate] = useState(localDateKey());
  const [energy, setEnergy] = useState(goal.energyKcal);
  const [protein, setProtein] = useState(goal.proteinG ?? 100);
  const [carbs, setCarbs] = useState(goal.carbsG ?? 250);
  const [fat, setFat] = useState(goal.fatG ?? 65);
  const [water, setWater] = useState(goal.waterMl);
  const [unit, setUnit] = useState(energyUnit);
  const [accent, setAccent] = useState(colorTheme);
  const [visibleMetrics, setVisibleMetrics] = useState(homeMetrics);
  const goalHistory = useLiveQuery(() => db.dailyGoals.orderBy("effectiveDate").reverse().toArray(), []) ?? [];

  function toggleMetric(key: DashboardMetricKey) {
    setVisibleMetrics((current) => {
      if (current.includes(key)) return current.length === 1 ? current : current.filter((item) => item !== key);
      return current.length >= 6 ? current : [...current, key];
    });
  }

  async function save() {
    await db.dailyGoals.put({ effectiveDate, energyKcal: energy, waterMl: water, proteinG: protein, carbsG: carbs, fatG: fat });
    const existing = await db.settings.get("main");
    await db.settings.put({ id: "main", energyUnit: unit, theme: "system", colorTheme: accent, homeMetrics: visibleMetrics, lastBackupAt: existing?.lastBackupAt });
    onSaved();
  }

  function loadGoal(item: DailyGoal) {
    setEffectiveDate(item.effectiveDate);
    setEnergy(item.energyKcal);
    setProtein(item.proteinG ?? 100);
    setCarbs(item.carbsG ?? 250);
    setFat(item.fatG ?? 65);
    setWater(item.waterMl);
  }
  return <>
    <header className="page-header"><div><p className="eyebrow">只保存在这台设备</p><h1>设置</h1></div></header>
    <section className="settings-section goal-settings"><div className="section-heading"><div><p className="eyebrow">按日期保存目标版本</p><h2>每日目标</h2></div></div><section className="form-card goal-form"><label>生效日期<input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></label><label>能量目标（kcal）<input type="number" min="1" value={energy} onChange={(event) => setEnergy(Number(event.target.value))} /></label><label>蛋白质目标（g）<input type="number" min="0" step="1" value={protein} onChange={(event) => setProtein(Number(event.target.value))} /></label><label>碳水目标（g）<input type="number" min="0" step="1" value={carbs} onChange={(event) => setCarbs(Number(event.target.value))} /></label><label>脂肪目标（g）<input type="number" min="0" step="1" value={fat} onChange={(event) => setFat(Number(event.target.value))} /></label><label>饮水目标（ml）<input type="number" min="1" step="100" value={water} onChange={(event) => setWater(Number(event.target.value))} /></label></section><p className="field-help">这个版本会从生效日期起使用，直到下一条目标版本生效。选择已有日期保存会更新该版本。</p><div className="goal-history"><div className="section-heading"><h3>目标历史</h3><span>{goalHistory.length} 个版本</span></div>{goalHistory.map((item) => <button type="button" key={item.effectiveDate} className={effectiveDate === item.effectiveDate ? "selected" : ""} onClick={() => loadGoal(item)}><span><strong>{formatDate(item.effectiveDate, { year: "numeric", month: "short", day: "numeric" })}起</strong><small>{item.energyKcal} kcal · 蛋白质 {item.proteinG ?? "—"}g · 饮水 {item.waterMl}ml</small></span><b>编辑</b></button>)}</div></section>
    <section className="form-card unit-setting"><label>首页能量单位<select value={unit} onChange={(event) => setUnit(event.target.value as EnergyUnit)}><option value="kcal">kcal（千卡）</option><option value="kJ">kJ（千焦）</option></select></label></section>
    <section className="settings-section"><div className="section-heading"><div><p className="eyebrow">选择 1–6 项</p><h2>首页营养卡片</h2></div><span className="selection-count">{visibleMetrics.length}/6</span></div><div className="nutrient-picker">{metricOptions.map((metric) => { const selected = visibleMetrics.includes(metric.id); return <button type="button" key={metric.id} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => toggleMetric(metric.id)}><span><strong>{metric.label}</strong><small>{metric.note}</small></span><b>{selected ? "✓" : "+"}</b></button>; })}</div><p className="field-help">能量始终显示在首页顶部。未出现在食品标签上的营养会显示“未记录”，不会按 0 计算。</p></section>
    <section className="settings-section"><div className="section-heading"><div><p className="eyebrow">整体强调色</p><h2>主题颜色</h2></div></div><div className="theme-grid">{colorThemes.map((theme) => <button type="button" key={theme.id} className={accent === theme.id ? "selected" : ""} aria-pressed={accent === theme.id} onClick={() => { setAccent(theme.id); document.documentElement.dataset.colorTheme = theme.id; }}><i className={`theme-swatch ${theme.id}`} /><span><strong>{theme.label}</strong><small>{theme.note}</small></span><b>{accent === theme.id ? "✓" : ""}</b></button>)}</div></section>
    <InstallPanel />
    <BackupPanel />
    <p className="notice">主题会立即预览，点击“保存设置”后长期保留。数据仍保存在浏览器 IndexedDB 中。</p><button className="primary-button" onClick={save}>保存设置</button>
  </>;
}

function InstallPanel() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const [online, setOnline] = useState(navigator.onLine);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return <section className="settings-section install-section"><div className="section-heading"><div><p className="eyebrow">iPhone 主屏幕准备</p><h2>安装与运行</h2></div><span className="version-badge">v{APP_VERSION}</span></div>
    <div className="runtime-card">
      <div className="runtime-status"><span className={window.isSecureContext ? "ready" : "waiting"}><i />{window.isSecureContext ? "安全连接" : "本地预览"}</span><span className={online ? "ready" : "waiting"}><i />{online ? "网络正常" : "离线可用"}</span><span className={standalone ? "ready" : "waiting"}><i />{standalone ? "主屏幕模式" : "浏览器模式"}</span></div>
      {standalone ? <div className="install-copy"><strong>已经像 App 一样运行</strong><p>今后直接点击主屏幕上的“食刻”即可。数据仍只保存在这台设备的这个网址下。</p></div> : <div className="install-copy"><strong>{isIOS ? "把食刻添加到 iPhone 主屏幕" : "在 iPhone Safari 中完成安装"}</strong><ol><li>用 Safari 打开食刻的固定 HTTPS 地址</li><li>点击底部“分享”按钮</li><li>选择“添加到主屏幕”，再点“添加”</li></ol></div>}
      <button type="button" className="copy-address" onClick={copyAddress}>{copied ? "已复制当前地址" : "复制当前地址"}</button>
    </div>
    <p className="field-help">重要：不同网址、不同浏览器会拥有各自独立的数据。第一次改用线上地址前，请先在旧版本导出 JSON 备份，再到新地址恢复。</p>
  </section>;
}

interface ShikeBackup {
  format: "shike-backup";
  version: 1;
  exportedAt: string;
  data: {
    foods: Food[];
    mealEntries: MealEntry[];
    dailyGoals: DailyGoal[];
    waterEntries: WaterEntry[];
    settings: AppSettings[];
  };
}

function BackupPanel() {
  const overview = useLiveQuery(async () => {
    const [foods, meals, water, settings] = await Promise.all([db.foods.count(), db.mealEntries.count(), db.waterEntries.count(), db.settings.get("main")]);
    return { foods, meals, water, lastBackupAt: settings?.lastBackupAt };
  }, []);
  const [pending, setPending] = useState<{ backup: ShikeBackup; fileName: string } | null>(null);
  const [message, setMessage] = useState("");

  async function exportBackup() {
    const [foods, mealEntries, dailyGoals, waterEntries, settings] = await Promise.all([db.foods.toArray(), db.mealEntries.toArray(), db.dailyGoals.toArray(), db.waterEntries.toArray(), db.settings.toArray()]);
    const exportedAt = new Date().toISOString();
    const payload: ShikeBackup = { format: "shike-backup", version: 1, exportedAt, data: { foods, mealEntries, dailyGoals, waterEntries, settings } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `食刻备份-${localDateKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    const current = await db.settings.get("main");
    if (current) await db.settings.put({ ...current, lastBackupAt: exportedAt });
    setMessage("备份文件已生成，请把它保存到安全的位置。");
  }

  async function chooseBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as ShikeBackup;
      const data = parsed?.data;
      if (parsed.format !== "shike-backup" || parsed.version !== 1 || !data || !Array.isArray(data.foods) || !Array.isArray(data.mealEntries) || !Array.isArray(data.dailyGoals) || !Array.isArray(data.waterEntries) || !Array.isArray(data.settings)) throw new Error("invalid");
      setPending({ backup: parsed, fileName: file.name });
      setMessage("");
    } catch {
      setPending(null);
      setMessage("这个文件不是有效的食刻备份，没有修改任何数据。");
    }
  }

  async function restoreBackup() {
    if (!pending) return;
    const { data } = pending.backup;
    await db.transaction("rw", db.foods, db.mealEntries, db.dailyGoals, db.waterEntries, db.settings, async () => {
      await Promise.all([db.foods.clear(), db.mealEntries.clear(), db.dailyGoals.clear(), db.waterEntries.clear(), db.settings.clear()]);
      if (data.foods.length) await db.foods.bulkPut(data.foods);
      if (data.mealEntries.length) await db.mealEntries.bulkPut(data.mealEntries);
      if (data.dailyGoals.length) await db.dailyGoals.bulkPut(data.dailyGoals);
      if (data.waterEntries.length) await db.waterEntries.bulkPut(data.waterEntries);
      if (data.settings.length) await db.settings.bulkPut(data.settings);
    });
    setPending(null);
    setMessage("备份恢复完成，页面数据已更新。");
  }

  return <section className="settings-section backup-section"><div className="section-heading"><div><p className="eyebrow">所有本地数据</p><h2>备份与恢复</h2></div></div>
    <div className="data-overview"><div><strong>{overview?.foods ?? 0}</strong><span>食品</span></div><div><strong>{overview?.meals ?? 0}</strong><span>饮食记录</span></div><div><strong>{overview?.water ?? 0}</strong><span>饮水记录</span></div></div>
    <div className="backup-actions"><button type="button" onClick={exportBackup}>导出 JSON 备份</button><label>选择备份文件<input type="file" accept="application/json,.json" onChange={chooseBackup} /></label></div>
    <p className="backup-time">最近备份：{overview?.lastBackupAt ? new Date(overview.lastBackupAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" }) : "还没有备份"}</p>
    {pending && <div className="restore-preview"><strong>准备恢复：{pending.fileName}</strong><span>{pending.backup.data.foods.length} 个食品 · {pending.backup.data.mealEntries.length} 条饮食记录</span><p>确认后会覆盖当前设备中的全部食刻数据。</p><div><button type="button" onClick={() => setPending(null)}>取消</button><button type="button" className="danger" onClick={restoreBackup}>确认覆盖并恢复</button></div></div>}
    {message && <p className="backup-message" role="status">{message}</p>}
  </section>;
}

function MealEditor({ entry, food, onClose, onSave, onDelete }: { entry: MealEntry; food: Food | null; onClose: () => void; onSave: (entry: MealEntry) => Promise<void>; onDelete: () => Promise<void> }) {
  const inferredUnitG = entry.amountGrams / Math.max(entry.inputQuantity, 0.0001);
  const calculationFood: Food = food ? {
    ...food,
    servingG: entry.inputMode === "serving" ? inferredUnitG : food.servingG,
    packageG: entry.inputMode === "package" ? inferredUnitG : food.packageG
  } : {
    id: entry.foodId,
    name: entry.foodName,
    emoji: entry.foodEmoji,
    per100g: entry.nutrition,
    servingG: inferredUnitG,
    packageG: inferredUnitG,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    archived: true
  };
  const eatenDate = new Date(entry.eatenAt);
  const [mode, setMode] = useState(entry.inputMode);
  const [quantity, setQuantity] = useState(entry.inputQuantity.toString());
  const [date, setDate] = useState(entry.date);
  const [time, setTime] = useState(`${String(eatenDate.getHours()).padStart(2, "0")}:${String(eatenDate.getMinutes()).padStart(2, "0")}`);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const numericQuantity = Number(quantity);
  const amountGrams = gramsFor(calculationFood, mode, numericQuantity);
  const previewNutrition = scaleNutrition(entry.nutrition, entry.amountGrams > 0 ? amountGrams / entry.amountGrams : 0);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0 || !date || !time) return;
    const eatenAt = new Date(`${date}T${time}:00`).toISOString();
    await onSave({ ...entry, date, eatenAt, inputMode: mode, inputQuantity: numericQuantity, amountGrams, nutrition: previewNutrition, updatedAt: new Date().toISOString() });
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    await onDelete();
  }

  return <div className="sheet-backdrop"><form className="sheet meal-editor" onSubmit={save} role="dialog" aria-modal="true" aria-label={`编辑${entry.foodName}`}><div className="sheet-handle" /><button type="button" className="sheet-close" aria-label="关闭" onClick={onClose}>×</button><div className="food-emoji hero">{entry.foodEmoji}</div><h2>{entry.foodName}</h2><p>修改后会按这条记录原来的营养比例重新计算</p>
    <div className="edit-date-time"><label>日期<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label><label>时间<input type="time" required value={time} onChange={(event) => setTime(event.target.value)} /></label></div>
    <div className="segments"><button type="button" disabled={!calculationFood.servingG} className={mode === "serving" ? "active" : ""} onClick={() => setMode("serving")}>份</button><button type="button" disabled={!calculationFood.packageG} className={mode === "package" ? "active" : ""} onClick={() => setMode("package")}>包</button><button type="button" className={mode === "gram" ? "active" : ""} onClick={() => setMode("gram")}>克</button></div>
    <label className="quantity-field">食用数量<div><input type="number" min={mode === "gram" ? "1" : "0.1"} step={mode === "gram" ? "1" : "0.1"} inputMode="decimal" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /><span>{mode === "serving" ? "份" : mode === "package" ? "包" : "g"}</span></div></label>
    <div className="edit-preview"><span>约 {round(amountGrams, 1)}g</span><strong>{round(kjToKcal(previewNutrition.energyKj))} kcal</strong></div>
    <button className="primary-button" type="submit">保存修改</button><button className={confirmDelete ? "delete-entry confirm" : "delete-entry"} type="button" onClick={remove}>{confirmDelete ? "再次点击确认删除" : "删除这条记录"}</button>
  </form></div>;
}

type OptionalNutrientKey = "fiberG" | "sugarsG" | "saturatedFatG" | "transFatG" | "cholesterolMg" | "potassiumMg" | "calciumMg" | "ironMg" | "vitaminDMcg";

const extraNutrientFields: { key: OptionalNutrientKey; label: string; unit: string }[] = [
  { key: "fiberG", label: "膳食纤维", unit: "g" },
  { key: "sugarsG", label: "糖", unit: "g" },
  { key: "saturatedFatG", label: "饱和脂肪", unit: "g" },
  { key: "transFatG", label: "反式脂肪", unit: "g" },
  { key: "cholesterolMg", label: "胆固醇", unit: "mg" },
  { key: "potassiumMg", label: "钾", unit: "mg" },
  { key: "calciumMg", label: "钙", unit: "mg" },
  { key: "ironMg", label: "铁", unit: "mg" },
  { key: "vitaminDMcg", label: "维生素 D", unit: "μg" }
];

function FoodEditor({ food, onClose, onSaved }: { food: Food | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(food?.name ?? "");
  const [brand, setBrand] = useState(food?.brand ?? "");
  const [category, setCategory] = useState(food?.category ?? "方便速食");
  const [emoji, setEmoji] = useState(food?.emoji ?? "🍱");
  const [servingG, setServingG] = useState(food?.servingG?.toString() ?? "");
  const [packageG, setPackageG] = useState(food?.packageG?.toString() ?? "");
  const [energyUnit, setEnergyUnit] = useState<EnergyUnit>("kcal");
  const [energy, setEnergy] = useState(food ? round(kjToKcal(food.per100g.energyKj), 1).toString() : "");
  const [protein, setProtein] = useState(food?.per100g.proteinG.toString() ?? "");
  const [carbs, setCarbs] = useState(food?.per100g.carbsG.toString() ?? "");
  const [fat, setFat] = useState(food?.per100g.fatG.toString() ?? "");
  const [sodium, setSodium] = useState(food?.per100g.sodiumMg.toString() ?? "");
  const [extras, setExtras] = useState<Record<OptionalNutrientKey, string>>(() => Object.fromEntries(extraNutrientFields.map(({ key }) => [key, food?.per100g[key]?.toString() ?? ""])) as Record<OptionalNutrientKey, string>);
  const [error, setError] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);

  function changeEnergyUnit(next: EnergyUnit) {
    const value = Number(energy);
    if (energy.trim() && Number.isFinite(value)) setEnergy(round(next === "kJ" ? kcalToKj(value) : kjToKcal(value), 1).toString());
    setEnergyUnit(next);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const required = [energy, protein, carbs, fat, sodium].map(Number);
    if (!name.trim()) return setError("请填写食品名称。");
    if (required.some((value) => !Number.isFinite(value) || value < 0)) return setError("请完整填写每 100g 的能量、蛋白质、碳水、脂肪和钠，数值不能小于 0。");
    const optionalValues = Object.fromEntries(extraNutrientFields.flatMap(({ key }) => {
      const raw = extras[key].trim();
      if (!raw) return [];
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? [[key, value]] : [];
    }));
    const now = new Date().toISOString();
    await db.foods.put({
      id: food?.id ?? crypto.randomUUID(),
      name: name.trim(),
      brand: brand.trim() || undefined,
      category,
      emoji: emoji.trim() || "🍱",
      servingG: servingG.trim() ? Math.max(0, Number(servingG)) || undefined : undefined,
      packageG: packageG.trim() ? Math.max(0, Number(packageG)) || undefined : undefined,
      per100g: {
        energyKj: energyUnit === "kJ" ? Number(energy) : kcalToKj(Number(energy)),
        proteinG: Number(protein),
        carbsG: Number(carbs),
        fatG: Number(fat),
        sodiumMg: Number(sodium),
        ...optionalValues
      },
      createdAt: food?.createdAt ?? now,
      updatedAt: now,
      archived: false
    });
    onSaved(food ? "食品已更新，历史记录保持原样" : "食品已加入食品库");
  }

  async function archive() {
    if (!food) return;
    if (!confirmArchive) return setConfirmArchive(true);
    await db.foods.update(food.id, { archived: true, updatedAt: new Date().toISOString() });
    onSaved("已移出食品库，过去的饮食记录仍保留");
  }

  return <div className="editor-backdrop"><section className="food-editor" role="dialog" aria-modal="true" aria-label={food ? `编辑${food.name}` : "新增食品"}>
    <header className="editor-header"><button type="button" onClick={onClose}>取消</button><div><p className="eyebrow">数值统一按每 100g</p><h2>{food ? "编辑食品" : "新增食品"}</h2></div><button type="submit" form="food-editor-form">保存</button></header>
    <form id="food-editor-form" onSubmit={save}>
      <section className="editor-card identity-fields">
        <label className="emoji-field">图标<input value={emoji} maxLength={4} onChange={(event) => setEmoji(event.target.value)} /></label>
        <label>食品名称<input autoFocus required value={name} placeholder="例如：番茄牛肉方便面" onChange={(event) => setName(event.target.value)} /></label>
        <label>品牌（可选）<input value={brand} placeholder="包装上的品牌" onChange={(event) => setBrand(event.target.value)} /></label>
        <label>分类<select value={category} onChange={(event) => setCategory(event.target.value)}>{foodCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
      </section>

      <div className="editor-section-title"><div><p className="eyebrow">方便以后按份或按包记录</p><h3>份量信息</h3></div></div>
      <section className="editor-card two-column-fields">
        <label>每份重量（g）<input type="number" min="0" step="0.1" inputMode="decimal" value={servingG} placeholder="可不填" onChange={(event) => setServingG(event.target.value)} /></label>
        <label>每包净重（g）<input type="number" min="0" step="0.1" inputMode="decimal" value={packageG} placeholder="可不填" onChange={(event) => setPackageG(event.target.value)} /></label>
      </section>

      <div className="editor-section-title"><div><p className="eyebrow">照着营养成分表填写</p><h3>每 100g 营养</h3></div><div className="mini-segments"><button type="button" className={energyUnit === "kcal" ? "active" : ""} onClick={() => changeEnergyUnit("kcal")}>kcal</button><button type="button" className={energyUnit === "kJ" ? "active" : ""} onClick={() => changeEnergyUnit("kJ")}>kJ</button></div></div>
      <section className="editor-card nutrient-fields">
        <NumberField label="能量" unit={energyUnit} value={energy} onChange={setEnergy} required />
        <NumberField label="蛋白质" unit="g" value={protein} onChange={setProtein} required />
        <NumberField label="碳水化合物" unit="g" value={carbs} onChange={setCarbs} required />
        <NumberField label="脂肪" unit="g" value={fat} onChange={setFat} required />
        <NumberField label="钠" unit="mg" value={sodium} onChange={setSodium} required />
      </section>

      <details className="extra-nutrients"><summary>更多营养素（可选）<span>膳食纤维、糖、矿物质等</span></summary><section className="editor-card nutrient-fields">{extraNutrientFields.map((field) => <NumberField key={field.key} label={field.label} unit={field.unit} value={extras[field.key]} onChange={(value) => setExtras((current) => ({ ...current, [field.key]: value }))} />)}</section></details>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button editor-save" type="submit">保存食品</button>
      {food && <button className={confirmArchive ? "archive-button confirm" : "archive-button"} type="button" onClick={archive}>{confirmArchive ? "再次点击确认移出" : "移出食品库"}</button>}
      {food && <p className="archive-help">移出后不会出现在食品库，但已经保存的饮食记录不会改变。</p>}
    </form>
  </section></div>;
}

function NumberField({ label, unit, value, onChange, required = false }: { label: string; unit: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label><span>{label}{required && <b>必填</b>}</span><div><input type="number" min="0" step="0.01" inputMode="decimal" required={required} value={value} onChange={(event) => onChange(event.target.value)} /><i>{unit}</i></div></label>;
}

function LogSheet({ food, mode, quantity, onMode, onQuantity, onClose, onSave }: { food: Food; mode: InputMode; quantity: number; onMode: (mode: InputMode) => void; onQuantity: (quantity: number) => void; onClose: () => void; onSave: () => void }) {
  const grams = gramsFor(food, mode, quantity);
  const nutrition = nutritionFor(food.per100g, grams);
  const increment = mode === "gram" ? 10 : 0.5;
  const unit = mode === "serving" ? "份" : mode === "package" ? "包" : "克";
  return <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="sheet" role="dialog" aria-modal="true" aria-label={`记录${food.name}`}><div className="sheet-handle" /><button className="sheet-close" aria-label="关闭" onClick={onClose}>×</button><div className="food-emoji hero">{food.emoji}</div><h2>{food.name}</h2><p>{food.brand}</p><div className="stepper"><button aria-label="减少" onClick={() => onQuantity(Math.max(increment, round(quantity - increment, 1)))}>−</button><div><strong>{quantity}</strong><span>{unit} · 约 {round(grams)}g</span></div><button aria-label="增加" onClick={() => onQuantity(round(quantity + increment, 1))}>＋</button></div><div className="segments"><button className={mode === "serving" ? "active" : ""} onClick={() => { onMode("serving"); onQuantity(1); }}>份</button><button className={mode === "package" ? "active" : ""} onClick={() => { onMode("package"); onQuantity(1); }}>包</button><button className={mode === "gram" ? "active" : ""} onClick={() => { onMode("gram"); onQuantity(100); }}>克</button></div><div className="calculated">本次约 {round(kjToKcal(nutrition.energyKj))} kcal</div><button className="primary-button" onClick={onSave}>加入记录</button></section></div>;
}
