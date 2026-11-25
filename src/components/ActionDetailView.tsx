import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Flame,
  Plus,
  Sparkles,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ActionConfig, DailyLog, Language } from '../types/tracker';
import { DICTIONARY, UNIT_LABELS } from '../lib/i18n';
import { getActionMetrics, getActionName } from '../lib/analytics';
import { ActionIcon } from './ActionIcon';

interface ActionDetailViewProps {
  action: ActionConfig;
  logs: Record<string, DailyLog>;
  lang: Language;
  onBack: () => void;
  onOpenLogToday: () => void;
}

export function ActionDetailView({
  action,
  logs,
  lang,
  onBack,
  onOpenLogToday,
}: ActionDetailViewProps) {
  const t = DICTIONARY[lang];
  const m = getActionMetrics(action, logs, 0, lang);
  const name = getActionName(action, lang);
  const unitStr = UNIT_LABELS[lang][action.unit];
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  const goalPct = Math.min(
    100,
    Math.round((m.thisWeekTotal / Math.max(1, m.flexibleWeeklyGoal)) * 100)
  );

  // Full chronological history (newest first) for ONLY this action
  const fullHistory = Object.values(logs)
    .filter((l) => l.entries[action.id] && l.entries[action.id].total > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  const bestTimeLabel =
    action.bestTime === 'morning'
      ? t.bestTimeMorning
      : action.bestTime === 'afternoon'
      ? t.bestTimeAfternoon
      : action.bestTime === 'evening'
      ? t.bestTimeEvening
      : action.bestTime === 'anytime'
      ? t.bestTimeAnytime
      : null;

  const difficultyLabel =
    action.difficulty === 'easy'
      ? t.difficultyEasy
      : action.difficulty === 'medium'
      ? t.difficultyMedium
      : action.difficulty === 'hard'
      ? t.difficultyHard
      : null;

  const formatDays = (count: number) =>
    lang === 'en' && count === 1 ? '1 day' : `${count} ${t.daysUnit}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-xs font-extrabold text-white inline-flex items-center gap-2 min-h-[40px]"
        >
          <BackIcon size={15} />
          <span>{t.backBtn}</span>
        </button>

        <button
          type="button"
          onClick={onOpenLogToday}
          className="px-5 py-2.5 rounded-full text-[#0F0F0F] text-xs font-extrabold inline-flex items-center gap-1.5 min-h-[40px]"
          style={{ backgroundColor: action.color }}
        >
          <Plus size={15} />
          <span>{t.logTodayBtn}</span>
        </button>
      </div>

      <section className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 md:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${action.color}22` }}
            >
              <ActionIcon icon={action.icon} color={action.color} size={24} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold text-white">{name}</h1>
              <div className="text-xs text-[#A1A1AA] tabular-nums mt-0.5">
                {t.thisWeekLabel}: <strong className="text-white">{m.thisWeekTotal}</strong>{' '}
                {unitStr} • {m.thisWeekTimes} {t.timesWord} • {t.activeDaysLabel}{' '}
                <strong className="text-white">{m.thisWeekActiveDays}/7</strong>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0F0F0F] border border-[#2A2A2A]">
            <Flame size={15} style={{ color: action.color }} />
            <span className="text-xs font-extrabold text-white tabular-nums">
              {m.streak > 0 ? formatDays(m.streak) : t.streakContinue}
            </span>
          </div>
        </div>

        {(bestTimeLabel || difficultyLabel || action.reminderTime || action.allowTenMinRule) && (
          <div className="flex flex-wrap gap-2">
            {bestTimeLabel && (
              <span className="px-3 py-1 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-[11px] font-bold text-[#A1A1AA]">
                {t.bestTimeLabel}: <strong className="text-white">{bestTimeLabel}</strong>
              </span>
            )}
            {difficultyLabel && (
              <span className="px-3 py-1 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-[11px] font-bold text-[#A1A1AA]">
                {t.difficultyLabel}: <strong className="text-white">{difficultyLabel}</strong>
              </span>
            )}
            {action.reminderTime && (
              <span className="px-3 py-1 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-[11px] font-bold text-[#A1A1AA] inline-flex items-center gap-1">
                <Clock size={12} className="text-[#00B8A9]" />
                {action.reminderTime}
              </span>
            )}
            {action.allowTenMinRule && (
              <span className="px-3 py-1 rounded-full bg-[#00B8A9]/15 border border-[#00B8A9]/40 text-[11px] font-bold text-[#00B8A9] inline-flex items-center gap-1">
                <Sparkles size={12} />
                {t.tenMinRuleBadge}
              </span>
            )}
          </div>
        )}

        {action.whyMatters && (
          <div className="p-3 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] text-xs text-white">
            <span className="text-[#A1A1AA] font-bold">{t.whyMattersLabel}: </span>
            {action.whyMatters}
          </div>
        )}

        <div dir="ltr" className="w-full h-[180px]">
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
                width={30}
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
                stroke={action.color}
                strokeWidth={3}
                dot={{ r: 3.5, fill: action.color }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-[#A1A1AA] tabular-nums">
              {t.flexibleGoal}: {m.flexibleWeeklyGoal} {unitStr} ({m.flexibleDailyGoal}/
              {lang === 'ar' ? 'يوم' : 'day'})
            </span>
            <span className="text-white tabular-nums">{goalPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-[#0F0F0F] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${goalPct}%`, backgroundColor: action.color }}
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div className="p-3.5 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A]">
          <div className="text-[11px] text-[#A1A1AA]">{t.vsLastTime}</div>
          <div className="text-base font-extrabold text-white mt-1 tabular-nums">
            {m.vsLastTimePct !== null
              ? `${m.vsLastTimePct >= 0 ? '+' : ''}${m.vsLastTimePct}%`
              : '—'}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A]">
          <div className="text-[11px] text-[#A1A1AA]">{t.vsAverage}</div>
          <div className="text-base font-extrabold text-white mt-1 tabular-nums">
            {m.vsAveragePct !== null
              ? `${m.vsAveragePct >= 0 ? '+' : ''}${m.vsAveragePct}%`
              : `${m.last14DaysAvg}`}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A]">
          <div className="text-[11px] text-[#A1A1AA]">{t.vsFirstTime}</div>
          <div className="text-base font-extrabold text-white mt-1 tabular-nums">
            {m.vsFirstTimePct !== null
              ? `${m.vsFirstTimePct >= 0 ? '+' : ''}${m.vsFirstTimePct}%`
              : `${m.first3DaysAvg}`}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A]">
          <div className="text-[11px] text-[#A1A1AA]">{t.vsLastWeek}</div>
          <div
            className="text-base font-extrabold mt-1 tabular-nums"
            style={{ color: (m.vsLastWeekPct ?? 0) >= 0 ? '#00B8A9' : '#FF6B35' }}
          >
            {m.vsLastWeekPct !== null
              ? `${m.vsLastWeekPct >= 0 ? '+' : ''}${m.vsLastWeekPct}%`
              : '—'}
          </div>
        </div>
      </div>

      {(m.bestDay || m.worstDay) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {m.bestDay && (
            <div className="p-4 rounded-[20px] bg-[#1A1A1A] border border-[#00B8A9]/40 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-extrabold text-[#00B8A9] tabular-nums">
                <span>
                  {t.bestDay}: {m.bestDay.total} {unitStr}
                </span>
                <span>{m.bestDay.date}</span>
              </div>
              <p className="text-xs text-[#A1A1AA]">
                {m.bestDay.feelingWhy || t.noReasonLogged}
              </p>
            </div>
          )}
          {m.worstDay && (
            <div className="p-4 rounded-[20px] bg-[#1A1A1A] border border-[#2A2A2A] space-y-1.5">
              <div className="flex items-center justify-between text-xs font-extrabold text-[#FF6B35] tabular-nums">
                <span>
                  {t.worstDay}: {m.worstDay.total} {unitStr}
                </span>
                <span>{m.worstDay.date}</span>
              </div>
              <p className="text-xs text-[#A1A1AA]">
                {m.worstDay.feelingWhy || t.noReasonLogged}
              </p>
            </div>
          )}
        </div>
      )}

      <section className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-white">{t.fullHistoryTitle}</h2>
          <span className="text-xs font-bold text-[#A1A1AA] tabular-nums">
            {fullHistory.length}
          </span>
        </div>

        {fullHistory.length === 0 ? (
          <p className="text-xs text-[#A1A1AA] py-4 text-center">{t.noHistoryYet}</p>
        ) : (
          <div className="space-y-2.5">
            {fullHistory.map((log) => {
              const entry = log.entries[action.id];
              return (
                <div
                  key={log.date}
                  className="p-3.5 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-white tabular-nums">
                        {log.date}
                      </span>
                      {entry.startedWith10Min && (
                        <span className="px-2 py-0.5 rounded-full bg-[#00B8A9]/15 text-[#00B8A9] text-[10px] font-bold">
                          {t.tenMinRuleBadge}
                        </span>
                      )}
                    </div>
                    {log.feelingWhy && (
                      <p className="text-xs text-[#A1A1AA]">{log.feelingWhy}</p>
                    )}
                  </div>

                  <div className="text-end tabular-nums">
                    <div
                      className="text-sm font-extrabold"
                      style={{ color: action.color }}
                    >
                      {entry.total} {unitStr}
                    </div>
                    <div className="text-[11px] text-[#A1A1AA]">
                      {entry.times} {t.timesWord} • {t.energy} {log.energy}/10
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
