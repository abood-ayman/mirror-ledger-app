import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Flame,
  Plus,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AppState, Language } from '../types/tracker';
import { DAY_LABELS, DICTIONARY, UNIT_LABELS } from '../lib/i18n';
import {
  getActionMetrics,
  getActionName,
  getBalanceData,
  getCrossActionCorrelation,
  getEnabledActions,
  getEnergyStreak,
  getMoodActionMap,
  getTenMinRuleCount,
  getTodayOverviewSentence,
} from '../lib/analytics';
import {
  formatWeekRange,
  getLevelInfo,
  getTodayKey,
  getWeekDates,
} from '../lib/storage';

interface DashboardScreenProps {
  state: AppState;
  lang: Language;
  onLogFirstDay: () => void;
  onLowerGoal: (actionId: string) => void;
  onOpenSetupModal?: () => void;
}

export function DashboardScreen({
  state,
  lang,
  onLogFirstDay,
  onLowerGoal,
  onOpenSetupModal,
}: DashboardScreenProps) {
  const t = DICTIONARY[lang];
  const [weekOffset, setWeekOffset] = useState(0);
  const [heatmapMode, setHeatmapMode] = useState<'5weeks' | 'actions'>('5weeks');
  const [selectedHeatmapActionId, setSelectedHeatmapActionId] = useState<string>('all');
  const [hoveredCellInfo, setHoveredCellInfo] = useState<string>('');

  const totalLogsCount = Object.keys(state.logs).length;
  const enabledActions = getEnabledActions(state.actions);
  const todayKey = getTodayKey();
  const weekDates = useMemo(() => getWeekDates(weekOffset, todayKey), [weekOffset, todayKey]);
  const weekRangeLabel = formatWeekRange(weekDates, lang);

  const metricsList = useMemo(
    () => enabledActions.map((a) => getActionMetrics(a, state.logs, weekOffset, lang)),
    [enabledActions, state.logs, weekOffset, lang]
  );

  if (totalLogsCount === 0) {
    return (
      <div className="min-h-[62vh] flex items-center justify-center">
        <div className="w-full max-w-[540px] bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-8 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-full bg-[#00B8A9]/15 border border-[#00B8A9]/40 flex items-center justify-center">
            <Sparkles size={24} className="text-[#00B8A9]" />
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold text-white leading-snug text-balance">
            {t.emptyDashboardText}
          </h2>
          <button
            type="button"
            onClick={onLogFirstDay}
            className="px-7 py-3.5 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm md:text-base inline-flex items-center gap-2 min-h-[48px]"
          >
            <Plus size={18} />
            <span>{t.emptyDashboardBtn}</span>
          </button>
        </div>
      </div>
    );
  }

  const todaySentence = getTodayOverviewSentence(state, metricsList, lang);
  const balance = getBalanceData(metricsList, lang);
  const energyStreak = getEnergyStreak(state.logs);
  const correlation = getCrossActionCorrelation(state.actions, state.logs, lang);
  const moodMapText = getMoodActionMap(state.actions, state.logs, lang);
  const tenMinCount = getTenMinRuleCount(state.logs, weekDates);
  const levelInfo = getLevelInfo(state.totalPoints);
  const dayLabels = DAY_LABELS[lang];

  const weeklyTrendData = weekDates.map((d, idx) => {
    const row: Record<string, string | number> = {
      day: dayLabels[idx],
      date: d,
    };
    for (const a of enabledActions) {
      row[a.id] = state.logs[d]?.entries[a.id]?.total ?? 0;
    }
    return row;
  });

  const radarData = metricsList.map((m) => ({
    subject: getActionName(m.action, lang),
    score: Math.min(100, Math.round((m.thisWeekTotal / Math.max(1, m.flexibleWeeklyGoal)) * 100)),
  }));

  const heatmapRows5Weeks = Array.from({ length: 5 }, (_, rowIdx) => {
    const wOffset = weekOffset - (4 - rowIdx);
    const dates = getWeekDates(wOffset, todayKey);
    return dates.map((d) => {
      const log = state.logs[d];
      if (!log) {
        return { date: d, intensity: 0, color: '#00B8A9', summary: `${d}: 0` };
      }
      if (enabledActions.length === 0) {
        const intensity =
          log.energy <= 2 ? 1 : log.energy <= 5 ? 2 : log.energy <= 7 ? 3 : 4;
        return {
          date: d,
          intensity,
          color: '#00B8A9',
          summary: `${d} • ${t.energy}: ${log.energy}/10`,
        };
      }
      if (selectedHeatmapActionId !== 'all') {
        const act = enabledActions.find((a) => a.id === selectedHeatmapActionId) ?? enabledActions[0];
        const val = log.entries[act.id]?.total ?? 0;
        const m = metricsList.find((x) => x.action.id === act.id);
        const goal = Math.max(1, m?.flexibleDailyGoal ?? 15);
        const ratio = val / goal;
        const intensity = val === 0 ? 0 : ratio < 0.4 ? 1 : ratio < 0.8 ? 2 : ratio < 1.1 ? 3 : 4;
        return {
          date: d,
          intensity,
          color: act.color,
          summary: `${d} • ${getActionName(act, lang)}: ${val} ${UNIT_LABELS[lang][act.unit]}`,
        };
      }
      const totalActionsDone = enabledActions.filter(
        (a) => (log.entries[a.id]?.total ?? 0) > 0
      ).length;
      const ratio = totalActionsDone / Math.max(1, enabledActions.length);
      const intensity =
        totalActionsDone === 0 ? 0 : ratio <= 0.34 ? 1 : ratio <= 0.67 ? 2 : ratio < 1 ? 3 : 4;
      return {
        date: d,
        intensity,
        color: '#00B8A9',
        summary: `${d} • ${totalActionsDone}/${enabledActions.length}`,
      };
    });
  });

  const heatmapRowsByAction = Array.from({ length: 5 }, (_, rowIdx) => {
    const action = enabledActions[rowIdx];
    return weekDates.map((d) => {
      if (!action) {
        return { date: d, intensity: -1, color: '#2A2A2A', summary: '' };
      }
      const val = state.logs[d]?.entries[action.id]?.total ?? 0;
      const m = metricsList[rowIdx];
      const goal = Math.max(1, m?.flexibleDailyGoal ?? 15);
      const ratio = val / goal;
      const intensity = val === 0 ? 0 : ratio < 0.4 ? 1 : ratio < 0.8 ? 2 : ratio < 1.1 ? 3 : 4;
      return {
        date: d,
        intensity,
        color: action.color,
        summary: `${d} • ${getActionName(action, lang)}: ${val} ${UNIT_LABELS[lang][action.unit]}`,
      };
    });
  });

  const formatDays = (count: number) =>
    lang === 'en' && count === 1 ? '1 day' : `${count} ${t.daysUnit}`;

  const activeHeatmapRows = heatmapMode === '5weeks' ? heatmapRows5Weeks : heatmapRowsByAction;

  const droppingAction = metricsList.find((m) => m.dropping3Days);
  const PrevIcon = lang === 'ar' ? ChevronRight : ChevronLeft;
  const NextIcon = lang === 'ar' ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white">
            {t.dashboardTitle}
          </h1>
          <p className="text-sm text-[#A1A1AA] mt-0.5">{weekRangeLabel}</p>
        </div>

        <div className="flex items-center gap-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-full px-2 py-1">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#A1A1AA] hover:text-white"
            aria-label="Previous week"
          >
            <PrevIcon size={17} />
          </button>
          <span className="text-xs font-bold text-white px-2 whitespace-nowrap tabular-nums">
            {weekOffset === 0
              ? lang === 'ar'
                ? 'الأسبوع ده'
                : 'This Week'
              : weekDates[0]}
          </span>
          <button
            type="button"
            disabled={weekOffset >= 0}
            onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#A1A1AA] hover:text-white disabled:opacity-30"
            aria-label="Next week"
          >
            <NextIcon size={17} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 flex flex-col justify-between gap-3">
          <div className="text-xs font-extrabold text-[#00B8A9] tracking-wide">
            {t.todayOverviewTitle}
          </div>
          <p className="text-base md:text-lg font-extrabold text-white leading-relaxed">
            {todaySentence}
          </p>
        </div>

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-[#A1A1AA] flex items-center gap-1.5">
              <Trophy size={15} className="text-[#FF6B35]" />
              {t.pointsLevelTitle}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#A855F7]/20 text-[#A855F7] text-xs font-extrabold tabular-nums">
              {t.levelWord} {levelInfo.level}
            </span>
          </div>
          <div className="text-2xl font-extrabold text-white tabular-nums">
            {state.totalPoints}{' '}
            <span className="text-xs text-[#A1A1AA] font-bold">{t.pointsWord}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#0F0F0F] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#00B8A9] transition-all"
              style={{ width: `${levelInfo.progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {droppingAction && (
        <div className="bg-[#1A1A1A] border border-[#FF6B35]/50 rounded-[20px] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-bold text-white">
            <AlertCircle size={18} className="text-[#FF6B35]" />
            <span>
              {t.smartAlertActionDropping(getActionName(droppingAction.action, lang))}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onLowerGoal(droppingAction.action.id)}
            className="px-4 py-2 rounded-full bg-[#FF6B35] text-[#0F0F0F] text-xs font-extrabold whitespace-nowrap"
          >
            {t.lowerGoalBtn}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-white">{t.activityHeatmap}</h2>
            <div className="flex items-center gap-1 bg-[#0F0F0F] p-1 rounded-full border border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setHeatmapMode('5weeks')}
                className="px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap"
                style={{
                  backgroundColor: heatmapMode === '5weeks' ? '#00B8A9' : 'transparent',
                  color: heatmapMode === '5weeks' ? '#0F0F0F' : '#A1A1AA',
                }}
              >
                {t.heatmapAllTeal}
              </button>
              <button
                type="button"
                onClick={() => setHeatmapMode('actions')}
                className="px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap"
                style={{
                  backgroundColor: heatmapMode === 'actions' ? '#00B8A9' : 'transparent',
                  color: heatmapMode === 'actions' ? '#0F0F0F' : '#A1A1AA',
                }}
              >
                {t.heatmapByAction}
              </button>
            </div>
          </div>

          {heatmapMode === '5weeks' && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedHeatmapActionId('all')}
                className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap"
                style={{
                  borderColor: selectedHeatmapActionId === 'all' ? '#00B8A9' : '#2A2A2A',
                  color: selectedHeatmapActionId === 'all' ? '#00B8A9' : '#A1A1AA',
                }}
              >
                {lang === 'ar' ? 'الكل' : 'All'}
              </button>
              {enabledActions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedHeatmapActionId(a.id)}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap"
                  style={{
                    borderColor:
                      selectedHeatmapActionId === a.id ? a.color : '#2A2A2A',
                    color: selectedHeatmapActionId === a.id ? a.color : '#A1A1AA',
                  }}
                >
                  {getActionName(a, lang)}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold text-[#A1A1AA]">
              {dayLabels.map((lbl, i) => (
                <span key={i}>{lbl}</span>
              ))}
            </div>

            <div className="space-y-2">
              {activeHeatmapRows.map((row, rIdx) => (
                <div key={rIdx} className="grid grid-cols-7 gap-2">
                  {row.map((cell, cIdx) => {
                    const opacity =
                      cell.intensity <= 0
                        ? 0.12
                        : cell.intensity === 1
                        ? 0.3
                        : cell.intensity === 2
                        ? 0.52
                        : cell.intensity === 3
                        ? 0.78
                        : 1;
                    const bg =
                      cell.intensity < 0
                        ? '#141414'
                        : cell.intensity === 0
                        ? '#0F0F0F'
                        : cell.color;
                    return (
                      <button
                        key={cIdx}
                        type="button"
                        title={cell.summary}
                        aria-label={cell.summary || `Day ${cell.date}`}
                        onClick={() => cell.summary && setHoveredCellInfo(cell.summary)}
                        className="aspect-square rounded-[8px] border border-[#2A2A2A] transition hover:scale-105"
                        style={{
                          backgroundColor: bg,
                          opacity: cell.intensity <= 0 ? 1 : opacity,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-[#A1A1AA]">
            {hoveredCellInfo ? hoveredCellInfo : t.heatmapExplain}
          </p>
        </section>

        {enabledActions.length === 0 ? (
          <section className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 flex flex-col items-center justify-center text-center space-y-4">
            <h2 className="text-base font-extrabold text-white">{t.noActionsYetTitle}</h2>
            <p className="text-xs text-[#A1A1AA] max-w-[320px] leading-relaxed">
              {t.noActionsYetSub}
            </p>
            {onOpenSetupModal && (
              <button
                type="button"
                onClick={onOpenSetupModal}
                className="px-5 py-3 rounded-full bg-[#00B8A9] text-[#0F0F0F] text-xs font-extrabold inline-flex items-center gap-1.5 min-h-[44px]"
              >
                <Plus size={15} />
                <span>{t.addFirstActionBtn}</span>
              </button>
            )}
          </section>
        ) : (
          <section className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-extrabold text-white">{t.weeklyTrend}</h2>
              <div className="flex flex-wrap gap-2">
                {enabledActions.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#A1A1AA]"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: a.color }}
                    />
                    {getActionName(a, lang)}
                  </span>
                ))}
              </div>
            </div>

            <div dir="ltr" className="w-full h-[210px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={weeklyTrendData}>
                  <CartesianGrid stroke="#2A2A2A" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke="#A1A1AA"
                    tick={{ fill: '#A1A1AA', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#A1A1AA"
                    tick={{ fill: '#A1A1AA', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F0F0F',
                      border: '1px solid #2A2A2A',
                      borderRadius: 12,
                      color: '#FFFFFF',
                      fontSize: 12,
                    }}
                  />
                  {enabledActions.map((a) => (
                    <Line
                      key={a.id}
                      type="monotone"
                      dataKey={a.id}
                      name={getActionName(a, lang)}
                      stroke={a.color}
                      strokeWidth={3}
                      dot={{ r: 3.5, fill: a.color }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <p className="text-xs text-[#A1A1AA]">{t.weeklyTrendExplain}</p>
          </section>
        )}
      </div>

      {enabledActions.length > 0 && (
        <>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-white">{t.todayBalance}</h2>
            <span className="text-xs font-extrabold text-[#00B8A9] tabular-nums">
              {t.balancedWord} {balance.balanceScore}%
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div dir="ltr" className="relative w-[170px] h-[170px] shrink-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={balance.slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={74}
                    paddingAngle={3}
                    stroke="none"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F0F0F',
                      border: '1px solid #2A2A2A',
                      borderRadius: 12,
                      color: '#FFFFFF',
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-extrabold text-white tabular-nums">
                  {balance.balanceScore}%
                </span>
                <span className="text-[11px] text-[#A1A1AA]">{t.balancedWord}</span>
              </div>
            </div>

            <div className="flex-1 w-full space-y-2">
              {balance.slices.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs font-bold bg-[#0F0F0F] border border-[#2A2A2A] rounded-xl px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-white">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: s.fill }}
                    />
                    {s.name}
                  </span>
                  <span className="text-[#A1A1AA] tabular-nums">{s.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-[#A1A1AA]">{t.balanceExplain}</p>
        </section>

        <section className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 space-y-4">
          <h2 className="text-base font-extrabold text-white">{t.streaksTitle}</h2>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#0F0F0F] border border-[#00B8A9]/40">
              <span className="flex items-center gap-2.5 font-extrabold text-sm text-white">
                <Flame size={18} className="text-[#FF6B35]" />
                {t.energyStreak}
              </span>
              <span className="text-sm font-extrabold text-[#00B8A9] tabular-nums">
                {formatDays(energyStreak)}
              </span>
            </div>

            {metricsList.map((m) => (
              <div
                key={m.action.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A]"
              >
                <span className="flex items-center gap-2.5 font-bold text-xs md:text-sm text-white">
                  <Flame size={16} style={{ color: m.action.color }} />
                  {getActionName(m.action, lang)}
                </span>
                {m.streak > 0 ? (
                  <span
                    className="text-xs font-extrabold tabular-nums"
                    style={{ color: m.action.color }}
                  >
                    {formatDays(m.streak)}
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-[#A1A1AA]">
                    {t.streakContinue}
                  </span>
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-[#A1A1AA]">{t.streaksExplain}</p>
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <section className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-white">{t.balanceWheelTitle}</h2>
          </div>
          <div dir="ltr" className="w-full h-[185px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#2A2A2A" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: '#A1A1AA', fontSize: 11 }}
                />
                <Radar
                  dataKey="score"
                  stroke="#00B8A9"
                  fill="#00B8A9"
                  fillOpacity={0.28}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-[11px] font-bold gap-2">
            <span className="text-[#00B8A9] truncate">
              {t.balancedAction}: {balance.balancedName}
            </span>
            <span className="text-[#FF6B35] truncate">
              {t.neglectedAction}: {balance.neglectedName}
            </span>
          </div>
          <p className="text-xs text-[#A1A1AA]">{t.balanceWheelExplain}</p>
        </section>

        <section className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <h2 className="text-sm font-extrabold text-[#00B8A9]">{t.correlationTitle}</h2>
            <p className="text-sm font-bold text-white leading-relaxed">
              {correlation.text}
            </p>
          </div>
          <div className="border-t border-[#2A2A2A] pt-3 space-y-2">
            <h3 className="text-sm font-extrabold text-[#A855F7]">{t.moodMapTitle}</h3>
            <p className="text-sm font-bold text-white leading-relaxed">{moodMapText}</p>
          </div>
        </section>

        <section className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-[#FF6B35]">
                {t.tenMinRuleTitle}
              </h2>
              <span className="text-xl font-extrabold text-white tabular-nums">
                {tenMinCount}
              </span>
            </div>
            <p className="text-xs text-[#A1A1AA]">{t.tenMinRuleExplain}</p>
          </div>

          <div className="border-t border-[#2A2A2A] pt-3 space-y-1.5">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
              <TrendingUp size={15} className="text-[#00B8A9]" />
              {t.predictionTitle}
            </h3>
            {metricsList[0] && (
              <p className="text-xs font-bold text-[#A1A1AA] leading-relaxed">
                {lang === 'ar'
                  ? `لو كملت بالمعدل ده، الأسبوع الجاي هتوصل لـ ${metricsList[0].nextWeekPrediction} ${
                      UNIT_LABELS[lang][metricsList[0].action.unit]
                    } ${getActionName(metricsList[0].action, lang)}.`
                  : `If you continue like this, next week you will reach ${
                      metricsList[0].nextWeekPrediction
                    } ${UNIT_LABELS[lang][metricsList[0].action.unit]} of ${getActionName(
                      metricsList[0].action,
                      lang
                    )}.`}
              </p>
            )}
          </div>
        </section>
      </div>

      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-5 ${
          metricsList.length === 3 ? 'lg:grid-cols-3' : ''
        }`}
      >
        {metricsList.map((m) => {
          const name = getActionName(m.action, lang);
          const unitStr = UNIT_LABELS[lang][m.action.unit];
          const goalPct = Math.min(
            100,
            Math.round((m.thisWeekTotal / Math.max(1, m.flexibleWeeklyGoal)) * 100)
          );

          return (
            <section
              key={m.action.id}
              className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3
                    className="text-lg font-extrabold"
                    style={{ color: m.action.color }}
                  >
                    {name}
                  </h3>
                  <div className="text-xs text-[#A1A1AA] mt-0.5 tabular-nums">
                    {t.thisWeekLabel}: <strong className="text-white">{m.thisWeekTotal}</strong>{' '}
                    {unitStr} • {m.thisWeekTimes} {t.timesWord} • {t.activeDaysLabel}{' '}
                    <strong className="text-white">{m.thisWeekActiveDays}/7</strong>
                  </div>
                </div>
                {m.firstTimeMultiplier !== null && m.firstTimeMultiplier >= 1.5 && (
                  <span
                    className="px-2.5 py-1 rounded-full text-[11px] font-extrabold tabular-nums"
                    style={{
                      backgroundColor: `${m.action.color}22`,
                      color: m.action.color,
                    }}
                  >
                    {t.fromFirstTime(String(m.firstTimeMultiplier))}
                  </span>
                )}
              </div>

              <div dir="ltr" className="w-full h-[145px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <LineChart data={m.dailyAmounts}>
                    <CartesianGrid stroke="#2A2A2A" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="dayLabel"
                      stroke="#A1A1AA"
                      tick={{ fill: '#A1A1AA', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#A1A1AA"
                      tick={{ fill: '#A1A1AA', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F0F0F',
                        border: '1px solid #2A2A2A',
                        borderRadius: 10,
                        color: '#FFFFFF',
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name={name}
                      stroke={m.action.color}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: m.action.color }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A]">
                  <div className="text-[10px] text-[#A1A1AA]">{t.vsLastTime}</div>
                  <div className="text-xs font-extrabold text-white mt-0.5 tabular-nums">
                    {m.vsLastTimePct !== null
                      ? `${m.vsLastTimePct >= 0 ? '+' : ''}${m.vsLastTimePct}%`
                      : '—'}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A]">
                  <div className="text-[10px] text-[#A1A1AA]">{t.vsAverage}</div>
                  <div className="text-xs font-extrabold text-white mt-0.5 tabular-nums">
                    {m.vsAveragePct !== null
                      ? `${m.vsAveragePct >= 0 ? '+' : ''}${m.vsAveragePct}%`
                      : `${m.last14DaysAvg}`}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A]">
                  <div className="text-[10px] text-[#A1A1AA]">{t.vsFirstTime}</div>
                  <div className="text-xs font-extrabold text-white mt-0.5 tabular-nums">
                    {m.vsFirstTimePct !== null
                      ? `${m.vsFirstTimePct >= 0 ? '+' : ''}${m.vsFirstTimePct}%`
                      : `${m.first3DaysAvg}`}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A]">
                  <div className="text-[10px] text-[#A1A1AA]">{t.vsLastWeek}</div>
                  <div
                    className="text-xs font-extrabold mt-0.5 tabular-nums"
                    style={{
                      color:
                        (m.vsLastWeekPct ?? 0) >= 0 ? '#00B8A9' : '#FF6B35',
                    }}
                  >
                    {m.vsLastWeekPct !== null
                      ? `${m.vsLastWeekPct >= 0 ? '+' : ''}${m.vsLastWeekPct}%`
                      : '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {m.bestDay && (
                  <div className="p-2.5 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] space-y-1">
                    <div className="font-extrabold text-[#00B8A9] tabular-nums">
                      {t.bestDay}: {m.bestDay.total} {unitStr}
                    </div>
                    <div className="text-[11px] text-[#A1A1AA] truncate">
                      {m.bestDay.feelingWhy || t.noReasonLogged}
                    </div>
                  </div>
                )}
                {m.worstDay && (
                  <div className="p-2.5 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] space-y-1">
                    <div className="font-extrabold text-[#A1A1AA] tabular-nums">
                      {t.worstDay}: {m.worstDay.total} {unitStr}
                    </div>
                    <div className="text-[11px] text-[#A1A1AA] truncate">
                      {m.worstDay.feelingWhy || t.noReasonLogged}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-[#A1A1AA] tabular-nums">
                    {t.flexibleGoal}: {m.flexibleWeeklyGoal} {unitStr} (
                    {m.flexibleDailyGoal}/{lang === 'ar' ? 'يوم' : 'day'})
                  </span>
                  <span className="text-white tabular-nums">{goalPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-[#0F0F0F] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${goalPct}%`, backgroundColor: m.action.color }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#A1A1AA] gap-2">
                <span>{t.actionChartExplain(name)}</span>
                <span className="font-bold text-white shrink-0 whitespace-nowrap tabular-nums">
                  {m.streak > 0
                    ? formatDays(m.streak)
                    : m.streakBroken
                    ? t.streakContinue
                    : ''}
                </span>
              </div>
            </section>
          );
        })}
      </div>
        </>
      )}
    </div>
  );
}
