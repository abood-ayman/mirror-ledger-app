import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Box,
  CalendarClock,
  Cat,
  Check,
  CloudRain,
  Database,
  Flame,
  Gamepad2,
  MapPin,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';
import type {
  ActionConfig,
  AmbientSoundMode,
  AmbientSoundSettings,
  AppState,
  DailyLog,
  Language,
  NoorMode,
} from '../types/tracker';
import { DICTIONARY, UNIT_LABELS } from '../lib/i18n';
import {
  AMBIENT_MODES,
  AMBIENT_MODE_META,
  normalizeAmbientSettings,
  selectAmbientMode,
} from '../lib/ambientAudio';
import {
  computeFlexibleDailyGoal,
  getActionMetrics,
  getActionName,
  getEnabledActions,
} from '../lib/analytics';
import { analyzeUserDataForNoor, getNoorEmptyHomePrompt } from '../lib/noor';
import { getTodayKey } from '../lib/storage';
import { ActionIcon } from './ActionIcon';
import { RangeSlider } from './RangeSlider';
import { PWAInstallButton } from './PWAInstallButton';
import { ActionDetailView } from './ActionDetailView';
import type { StudioSubTab } from './StudioHubScreen';

interface DailyCheckInScreenProps {
  state: AppState;
  lang: Language;
  onOpenCheckInModal: (allowPast: boolean) => void;
  onOpenAddTaskModal: () => void;
  onOpenSetupModal: () => void;
  onOpenBackupModal: () => void;
  onSaveDailyState: (log: DailyLog) => void;
  onLowerGoal: (actionId: string) => void;
  onOpenNoorChat: (mode: NoorMode) => void;
  onStartTenMinTimer: () => void;
  onQuickAddAction: (action: ActionConfig) => void;
  onOpenStudioTool: (tab: StudioSubTab) => void;
  onLaunchGame: () => void;
  onChangeAmbientSound: (next: AmbientSoundSettings) => void;
}

export function DailyCheckInScreen({
  state,
  lang,
  onOpenCheckInModal,
  onOpenAddTaskModal,
  onOpenSetupModal,
  onOpenBackupModal,
  onSaveDailyState,
  onLowerGoal,
  onOpenNoorChat,
  onStartTenMinTimer,
  onQuickAddAction,
  onOpenStudioTool,
  onLaunchGame,
  onChangeAmbientSound,
}: DailyCheckInScreenProps) {
  const t = DICTIONARY[lang];
  const todayKey = getTodayKey();
  const todayLog = state.logs[todayKey];
  const enabledActions = getEnabledActions(state.actions);

  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [energy, setEnergy] = useState<number>(todayLog?.energy ?? 7);
  const [focus, setFocus] = useState<number>(todayLog?.focus ?? 5);
  const [feelingWhy, setFeelingWhy] = useState<string>(todayLog?.feelingWhy ?? '');
  const [quickNote, setQuickNote] = useState<string>(todayLog?.quickNote ?? '');
  const [savedNotice, setSavedNotice] = useState(false);
  const [timerSec, setTimerSec] = useState(600);
  const [timerRunning, setTimerRunning] = useState(false);

  const accent = state.accentColor || '#00B8A9';
  const ArrowIcon = lang === 'ar' ? ArrowLeft : ArrowRight;

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setTimerSec((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    setEnergy(todayLog?.energy ?? 7);
    setFocus(todayLog?.focus ?? 5);
    setFeelingWhy(todayLog?.feelingWhy ?? '');
    setQuickNote(todayLog?.quickNote ?? '');
  }, [todayLog?.energy, todayLog?.focus, todayLog?.feelingWhy, todayLog?.quickNote]);

  // If selected action is active, render its dedicated detail page ONLY
  const selectedAction = selectedActionId
    ? enabledActions.find((a) => a.id === selectedActionId) ?? null
    : null;

  if (selectedAction) {
    return (
      <ActionDetailView
        action={selectedAction}
        logs={state.logs}
        lang={lang}
        onBack={() => setSelectedActionId(null)}
        onOpenLogToday={() => onOpenCheckInModal(false)}
      />
    );
  }

  const hour = new Date().getHours();
  const isLateEvening = hour >= 22 && !todayLog;
  const noorAnalysis = analyzeUserDataForNoor(state, lang, todayKey);
  const isEmptyDays = noorAnalysis.loggedDaysCount === 0;
  const welcomeSentence = isEmptyDays
    ? getNoorEmptyHomePrompt(state, lang)
    : noorAnalysis.headlineInsight;

  const droppingActions = enabledActions
    .map((a) => getActionMetrics(a, state.logs, 0, lang))
    .filter((m) => m.dropping3Days);

  const handleSaveQuickState = () => {
    if (!todayLog && enabledActions.length > 0) {
      onOpenCheckInModal(false);
      return;
    }
    onSaveDailyState({
      date: todayKey,
      entries: todayLog?.entries ?? {},
      energy,
      focus,
      feelingWhy: feelingWhy.trim(),
      quickNote: quickNote.trim(),
      pointsEarned: todayLog?.pointsEarned ?? 0,
      updatedAt: new Date().toISOString(),
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2200);
  };

  const getDailyTarget = (action: ActionConfig): number => {
    if (action.dailyAmount && action.dailyAmount > 0) {
      return action.dailyAmount;
    }
    const metrics = getActionMetrics(action, state.logs, 0, lang);
    return computeFlexibleDailyGoal(action, metrics.last14DaysAvg);
  };

  const formatDays = (count: number) =>
    lang === 'en' && count === 1 ? '1 day' : `${count} ${t.daysUnit}`;

  return (
    <div className="space-y-5">
      {/* 1. TOP: Welcome from Noor + friendly empty start or insight */}
      <section className="rounded-[20px] bg-[#1A1A1A] border border-[#2A2A2A] p-5 space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 max-w-[680px]">
            <h1 className="text-2xl md:text-3xl font-extrabold text-white text-balance">
              {state.userName?.trim()
                ? `${t.greetingPrefix} ${state.userName.trim()}`
                : t.dailyCheckInTitle}
            </h1>
            <p className="text-sm text-[#E4E4E7] flex items-start gap-2 leading-relaxed">
              <Sparkles size={15} style={{ color: accent }} className="shrink-0 mt-1" />
              <span>{welcomeSentence}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PWAInstallButton lang={lang} compact />
            <button
              type="button"
              onClick={() => onOpenCheckInModal(false)}
              className="px-3.5 py-2 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-xs font-extrabold text-white flex items-center gap-1.5 whitespace-nowrap min-h-[40px]"
            >
              <span>{todayLog ? t.updateTodayBtn : t.logTodayBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenCheckInModal(true)}
              className="px-3.5 py-2 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-xs font-bold text-[#A1A1AA] hover:text-white flex items-center gap-1.5 whitespace-nowrap min-h-[40px]"
            >
              <CalendarClock size={14} className="text-[#A855F7]" />
              <span>{t.logPastDayBtn}</span>
            </button>
            <button
              type="button"
              onClick={onOpenSetupModal}
              className="px-3.5 py-2 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-xs font-bold text-[#A1A1AA] hover:text-white flex items-center gap-1.5 whitespace-nowrap min-h-[40px]"
            >
              <Settings2 size={14} className="text-[#FF6B35]" />
              <span>{t.editActionsBtn}</span>
            </button>
            <button
              type="button"
              onClick={onOpenBackupModal}
              className="px-3.5 py-2 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-xs font-bold text-[#A1A1AA] hover:text-white flex items-center gap-1.5 whitespace-nowrap min-h-[40px]"
              aria-label={t.backupBtn}
              title={t.backupBtn}
            >
              <Database size={14} className="text-[#00B8A9]" />
              <span>{t.backupBtn}</span>
            </button>
          </div>
        </div>

        {isEmptyDays && (
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onOpenNoorChat('chat')}
              className="px-4 py-2.5 rounded-full bg-[#00B8A9] text-[#0F0F0F] text-xs font-extrabold inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <MessageCircle size={14} />
              <span>{t.letsChatBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTimerSec(600);
                setTimerRunning(true);
                onStartTenMinTimer();
              }}
              className="px-4 py-2.5 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-white text-xs font-extrabold inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <Timer size={14} className="text-[#00B8A9]" />
              <span>{t.start10MinBtn}</span>
            </button>
          </div>
        )}
      </section>

      {isLateEvening && (
        <div className="rounded-[20px] bg-[#1A1A1A] border border-[#FF6B35]/50 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs md:text-sm font-bold text-white">
            <Bell size={18} className="text-[#FF6B35] shrink-0" />
            <span>{t.eveningReminder}</span>
          </div>
          <button
            type="button"
            onClick={() => onOpenCheckInModal(false)}
            className="px-3.5 py-2 rounded-full bg-[#00B8A9] text-[#0F0F0F] text-xs font-extrabold shrink-0 whitespace-nowrap"
          >
            {t.logTodayBtn}
          </button>
        </div>
      )}

      {droppingActions.length > 0 && (
        <div className="rounded-[20px] bg-[#1A1A1A] border border-[#FF6B35]/40 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs md:text-sm font-bold text-white">
            <AlertCircle size={18} className="text-[#FF6B35] shrink-0" />
            <span>
              {t.smartAlertActionDropping(
                getActionName(droppingActions[0].action, lang)
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onLowerGoal(droppingActions[0].action.id)}
            className="px-3.5 py-2 rounded-full bg-[#FF6B35]/15 border border-[#FF6B35] text-[#FF6B35] text-xs font-extrabold whitespace-nowrap"
          >
            {t.lowerGoalBtn}
          </button>
        </div>
      )}

      {/* 2. BIG TEAL PILL BUTTON: + أضف مهمة / + Add Task (always visible) */}
      <button
        type="button"
        data-tour-target="add-task"
        onClick={onOpenAddTaskModal}
        className="w-full py-4 px-6 rounded-full text-[#0F0F0F] font-extrabold text-base md:text-lg flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] transition min-h-[54px]"
        style={{ backgroundColor: '#00B8A9' }}
      >
        <span>{t.addTaskBtn}</span>
      </button>

      {state.enabledFeatures?.tenMinTimer && (
        <div className="rounded-[20px] bg-[#1A1A1A] border border-[#2A2A2A] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Timer size={18} style={{ color: accent }} />
            <div>
              <div className="text-xs font-extrabold text-white">{t.noorTimerTitle}</div>
              <div className="text-lg font-extrabold tabular-nums" style={{ color: accent }}>
                {timerSec === 0
                  ? t.noorTimerDone
                  : `${String(Math.floor(timerSec / 60)).padStart(2, '0')}:${String(
                      timerSec % 60
                    ).padStart(2, '0')}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (timerSec === 0) setTimerSec(600);
                setTimerRunning((r) => !r);
              }}
              className="px-3.5 py-2 rounded-full text-[#0F0F0F] text-xs font-extrabold inline-flex items-center gap-1.5 min-h-[38px]"
              style={{ backgroundColor: accent }}
            >
              {timerRunning ? <Pause size={13} /> : <Play size={13} />}
              <span>{timerRunning ? t.noorTimerPause : t.noorTimerStart}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTimerRunning(false);
                setTimerSec(600);
              }}
              aria-label={t.noorTimerReset}
              className="w-9 h-9 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] flex items-center justify-center text-[#A1A1AA] hover:text-white"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 3. MY ACTIONS ("أفعالي" / "My Actions") - Separate cards, swipeable on mobile, 2 cols on laptop */}
      <section className="space-y-3" data-tour-target="my-actions">
        <div className="flex items-center justify-between">
          <h2 className="text-lg md:text-xl font-extrabold text-white">
            {t.myActionsTitle}
          </h2>
          {enabledActions.length > 1 && (
            <span className="md:hidden text-[11px] font-bold text-[#A1A1AA]">
              {t.swipeHint}
            </span>
          )}
        </div>

        {enabledActions.length === 0 ? (
          <div className="p-6 rounded-[20px] bg-[#1A1A1A] border border-[#2A2A2A] text-center space-y-4">
            <div className="space-y-1.5">
              <div className="text-base font-extrabold text-white">
                {t.noActionsYetTitle}
              </div>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">
                {t.noActionsYetSub}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  onQuickAddAction({
                    id: `quick_study_${Date.now()}`,
                    nameAr: 'مذاكرة',
                    nameEn: 'Study',
                    unit: 'minutes',
                    color: '#FF6B35',
                    icon: 'book',
                    dailyAmount: 30,
                    weeklyGoal: 210,
                    bestTime: 'anytime',
                    difficulty: 'easy',
                    allowTenMinRule: true,
                    enabled: true,
                  })
                }
                className="px-3.5 py-3 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#FF6B35] text-xs font-extrabold text-white flex items-center justify-center gap-1.5 transition min-h-[44px]"
              >
                <Plus size={14} className="text-[#FF6B35] shrink-0" />
                <span>{t.exampleStudy30}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onQuickAddAction({
                    id: `quick_read_${Date.now()}`,
                    nameAr: 'قراءة',
                    nameEn: 'Reading',
                    unit: 'pages',
                    color: '#00B8A9',
                    icon: 'bookOpen',
                    dailyAmount: 10,
                    weeklyGoal: 70,
                    bestTime: 'anytime',
                    difficulty: 'easy',
                    allowTenMinRule: true,
                    enabled: true,
                  })
                }
                className="px-3.5 py-3 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-xs font-extrabold text-white flex items-center justify-center gap-1.5 transition min-h-[44px]"
              >
                <Plus size={14} className="text-[#00B8A9] shrink-0" />
                <span>{t.exampleRead10}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onQuickAddAction({
                    id: `quick_walk_${Date.now()}`,
                    nameAr: 'مشي',
                    nameEn: 'Walking',
                    unit: 'minutes',
                    color: '#A855F7',
                    icon: 'target',
                    dailyAmount: 15,
                    weeklyGoal: 105,
                    bestTime: 'anytime',
                    difficulty: 'easy',
                    allowTenMinRule: true,
                    enabled: true,
                  })
                }
                className="px-3.5 py-3 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#A855F7] text-xs font-extrabold text-white flex items-center justify-center gap-1.5 transition min-h-[44px]"
              >
                <Plus size={14} className="text-[#A855F7] shrink-0" />
                <span>{t.exampleWalk15}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenAddTaskModal}
              className="px-6 py-3 rounded-full bg-[#00B8A9] text-[#0F0F0F] text-xs font-extrabold inline-flex items-center gap-1.5 min-h-[42px]"
            >
              <Plus size={14} />
              <span>{t.addTaskMyselfBtn}</span>
            </button>
          </div>
        ) : (
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 -mx-1 px-1 md:mx-0 md:px-0 md:grid md:grid-cols-2 md:overflow-visible">
            {enabledActions.map((action) => {
              const metrics = getActionMetrics(action, state.logs, 0, lang);
              const doneToday = todayLog?.entries[action.id]?.total ?? 0;
              const goal = getDailyTarget(action);
              const pct = Math.min(100, Math.round((doneToday / Math.max(1, goal)) * 100));
              const unitStr = UNIT_LABELS[lang][action.unit];
              const name = getActionName(action, lang);

              return (
                <article
                  key={action.id}
                  className="min-w-[85%] sm:min-w-[78%] md:min-w-0 snap-center bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${action.color}20` }}
                      >
                        <ActionIcon icon={action.icon} color={action.color} size={22} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base md:text-lg font-extrabold text-white truncate">
                          {name}
                        </h3>
                        <div className="text-xs font-bold text-[#A1A1AA] tabular-nums">
                          {t.doneText(doneToday, goal, unitStr)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] shrink-0">
                      <Flame size={13} style={{ color: action.color }} />
                      <span className="text-[11px] font-extrabold text-white tabular-nums">
                        {formatDays(metrics.streak)}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar vs goal */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-[#A1A1AA]">{t.todayTotalLabel}</span>
                      <span className="tabular-nums" style={{ color: action.color }}>
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-[#0F0F0F] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${pct}%`, backgroundColor: action.color }}
                      />
                    </div>
                  </div>

                  {/* Last 7 days mini chart */}
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-[#A1A1AA]">
                      {t.last7DaysLabel}
                    </div>
                    <div dir="ltr" className="w-full h-[78px] bg-[#0F0F0F] rounded-2xl p-2 border border-[#2A2A2A]">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <LineChart data={metrics.dailyAmounts}>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#1A1A1A',
                              border: '1px solid #2A2A2A',
                              borderRadius: 10,
                              color: '#FFFFFF',
                              fontSize: 11,
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="total"
                            name={name}
                            stroke={action.color}
                            strokeWidth={2.5}
                            dot={{ r: 2.5, fill: action.color }}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* View Details button */}
                  <button
                    type="button"
                    onClick={() => setSelectedActionId(action.id)}
                    className="w-full py-3 px-4 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-white text-xs font-extrabold flex items-center justify-center gap-2 transition min-h-[42px]"
                  >
                    <span>{t.viewDetailsBtn}</span>
                    <ArrowIcon size={14} style={{ color: action.color }} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Daily State Card (Energy, Focus, Reflection) */}
      <section className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-extrabold text-white">{t.dailyState}</h2>
          <span className="text-[11px] font-bold text-[#A1A1AA] tabular-nums">
            {todayLog ? todayKey : t.actionFirstNote}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <RangeSlider
            label={t.energy}
            value={energy}
            onChange={setEnergy}
            color="#00B8A9"
            lang={lang}
          />

          <RangeSlider
            label={t.focus}
            value={focus}
            onChange={setFocus}
            color="#8B5CF6"
            lang={lang}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <textarea
            rows={2}
            value={feelingWhy}
            onChange={(e) => setFeelingWhy(e.target.value)}
            placeholder={t.whyPlaceholder}
            aria-label={t.whyPlaceholder}
            className="w-full rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] p-3 text-xs md:text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#00B8A9]"
          />
          <input
            type="text"
            value={quickNote}
            onChange={(e) => setQuickNote(e.target.value)}
            placeholder={t.quickNotePlaceholder}
            aria-label={t.quickNoteLabel}
            className="w-full rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] px-3 py-2.5 text-xs md:text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#8B5CF6]"
          />
        </div>

        <button
          type="button"
          onClick={handleSaveQuickState}
          className="w-full py-3 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-white text-xs md:text-sm font-extrabold flex items-center justify-center gap-2 transition min-h-[44px]"
        >
          {savedNotice ? (
            <>
              <Check size={16} className="text-[#00B8A9]" />
              <span className="text-[#00B8A9]">{t.savedToast}</span>
            </>
          ) : (
            <span>{t.saveDailyState}</span>
          )}
        </button>
      </section>

      {/* Explore All Added Tools, Studio Modes & Quick Ambient Sounds */}
      <section
        data-testid="home-explore-hub"
        className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base md:text-lg font-extrabold text-white">
              {t.homeExploreTitle}
            </h2>
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              {t.homeExploreSub}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenBackupModal}
            className="px-3.5 py-2 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-xs font-extrabold text-white inline-flex items-center gap-1.5 transition shrink-0 min-h-[38px]"
          >
            <SlidersHorizontal size={13} className="text-[#00B8A9]" />
            <span>{t.homeOpenSettingsAudio}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            data-testid="home-launch-ai"
            onClick={() => onOpenStudioTool('ai')}
            className="text-start p-4 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] transition flex flex-col justify-between gap-2.5 min-h-[112px]"
          >
            <div className="w-9 h-9 rounded-xl bg-[#00B8A9]/15 flex items-center justify-center">
              <Sparkles size={18} className="text-[#00B8A9]" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-extrabold text-white">{t.studioTabChat}</div>
              <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                {lang === 'ar'
                  ? 'متوقفة في النسخة العامة حالياً. مفيش كلام بيتبعت لأي خدمة ذكاء اصطناعي.'
                  : 'Turned off in this public version. Nothing you write is sent to an AI service.'}
              </p>
            </div>
          </button>

          <button
            type="button"
            data-testid="home-launch-map"
            onClick={() => onOpenStudioTool('map')}
            className="text-start p-4 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#A855F7] transition flex flex-col justify-between gap-2.5 min-h-[112px]"
          >
            <div className="w-9 h-9 rounded-xl bg-[#A855F7]/15 flex items-center justify-center">
              <MapPin size={18} className="text-[#A855F7]" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-extrabold text-white">{t.studioTabMap}</div>
              <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                {lang === 'ar'
                  ? 'استكشف مكتبات وكافيهات هادية قريبة للتركيز على الخريطة'
                  : 'Discover quiet libraries & calm cafés nearby on Google Maps'}
              </p>
            </div>
          </button>

          <button
            type="button"
            data-testid="home-launch-3d"
            onClick={() => onOpenStudioTool('sanctuary')}
            className="text-start p-4 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#38BDF8] transition flex flex-col justify-between gap-2.5 min-h-[112px]"
          >
            <div className="w-9 h-9 rounded-xl bg-[#38BDF8]/15 flex items-center justify-center">
              <Box size={18} className="text-[#38BDF8]" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-extrabold text-white">{t.studioTab3D}</div>
              <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                {lang === 'ar'
                  ? 'مشهد ثلاثي الأبعاد تفاعلي بـ 3 أجواء ونبض تنفس هادي'
                  : 'Interactive Three.js sanctuary with 3 lighting moods & breathing'}
              </p>
            </div>
          </button>

          <button
            type="button"
            data-testid="home-launch-game"
            onClick={onLaunchGame}
            className="text-start p-4 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#FF6B35] transition flex flex-col justify-between gap-2.5 min-h-[112px]"
          >
            <div className="w-9 h-9 rounded-xl bg-[#FF6B35]/15 flex items-center justify-center">
              <Gamepad2 size={18} className="text-[#FF6B35]" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-extrabold text-white">{t.studioTabGame}</div>
              <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                {lang === 'ar'
                  ? 'لعبة توازن التركيز السريعة لتفريغ الضغط واستعادة صفائك'
                  : 'Orbital Balance arcade reset to recharge your focus anytime'}
              </p>
            </div>
          </button>
        </div>

        {/* Inline Quick Ambient Audio Switcher */}
        {(() => {
          const ambient = normalizeAmbientSettings(state.ambientSound);
          const isAudioPlaying = ambient.enabled && ambient.mode !== 'quiet';
          const ambientIcons: Record<AmbientSoundMode, typeof CloudRain> = {
            rain: CloudRain,
            lofi: Music2,
            purr: Cat,
            quiet: VolumeX,
          };
          const ambientLabels: Record<AmbientSoundMode, string> = {
            rain: t.ambientModeRain,
            lofi: t.ambientModeLofi,
            purr: t.ambientModePurr,
            quiet: t.ambientModeQuiet,
          };
          return (
            <div className="pt-2 border-t border-[#2A2A2A] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-white">
                {isAudioPlaying ? (
                  <Volume2 size={15} className="text-[#00B8A9]" />
                ) : (
                  <VolumeX size={15} className="text-[#A1A1AA]" />
                )}
                <span>{t.homeExploreAmbientLabel}</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {AMBIENT_MODES.map((modeId) => {
                  const Icon = ambientIcons[modeId];
                  const modeAccent = AMBIENT_MODE_META[modeId].accent;
                  const selected =
                    modeId === 'quiet'
                      ? !isAudioPlaying && ambient.mode === 'quiet'
                      : ambient.mode === modeId && isAudioPlaying;
                  return (
                    <button
                      key={modeId}
                      type="button"
                      aria-pressed={selected}
                      data-testid={`home-ambient-${modeId}`}
                      onClick={() => onChangeAmbientSound(selectAmbientMode(ambient, modeId))}
                      className="px-3 py-1.5 rounded-full text-[11px] font-extrabold border inline-flex items-center gap-1.5 transition min-h-[34px]"
                      style={{
                        backgroundColor: selected ? `${modeAccent}20` : '#0F0F0F',
                        borderColor: selected ? modeAccent : '#2A2A2A',
                        color: selected ? modeAccent : '#A1A1AA',
                      }}
                    >
                      <Icon size={12} />
                      <span>{ambientLabels[modeId]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </section>
    </div>
  );
}

