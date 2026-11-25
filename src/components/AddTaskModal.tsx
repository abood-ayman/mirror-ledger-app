import { useState } from 'react';
import { Check, Plus, Sparkles, X } from 'lucide-react';
import type {
  ActionConfig,
  ActionUnit,
  BestTime,
  Language,
  TaskDifficulty,
} from '../types/tracker';
import { ALLOWED_ACTION_COLORS, DICTIONARY, UNIT_LABELS } from '../lib/i18n';

interface AddTaskModalProps {
  lang: Language;
  existingCount: number;
  onClose: () => void;
  onSaveTask: (task: ActionConfig) => void;
}

export function AddTaskModal({
  lang,
  existingCount,
  onClose,
  onSaveTask,
}: AddTaskModalProps) {
  const t = DICTIONARY[lang];
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number>(20);
  const [unit, setUnit] = useState<ActionUnit>('minutes');
  const [color, setColor] = useState<string>(
    ALLOWED_ACTION_COLORS[existingCount % ALLOWED_ACTION_COLORS.length]
  );
  const [weeklyGoal, setWeeklyGoal] = useState<string>('100');
  const [bestTime, setBestTime] = useState<BestTime>('anytime');
  const [reminderTime, setReminderTime] = useState<string>('');
  const [whyMatters, setWhyMatters] = useState<string>('');
  const [difficulty, setDifficulty] = useState<TaskDifficulty>('medium');
  const [allowTenMinRule, setAllowTenMinRule] = useState<boolean>(true);
  const [warn, setWarn] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setWarn(t.taskNameRequiredWarn);
      return;
    }

    const safeAmount = Math.max(1, Number(amount) || 1);
    const parsedWeekly = weeklyGoal.trim()
      ? Math.max(1, Number(weeklyGoal) || safeAmount * 5)
      : safeAmount * 5;

    const newTask: ActionConfig = {
      id: `task_${Date.now()}`,
      nameAr: trimmed,
      nameEn: trimmed,
      unit,
      color,
      icon: unit === 'cups' ? 'flame' : 'target',
      dailyAmount: safeAmount,
      weeklyGoal: parsedWeekly,
      bestTime,
      reminderTime: reminderTime.trim() || undefined,
      whyMatters: whyMatters.trim() || undefined,
      difficulty,
      allowTenMinRule,
      enabled: true,
    };

    onSaveTask(newTask);
    onClose();
  };

  const bestTimeOptions: { id: BestTime; label: string }[] = [
    { id: 'morning', label: t.bestTimeMorning },
    { id: 'afternoon', label: t.bestTimeAfternoon },
    { id: 'evening', label: t.bestTimeEvening },
    { id: 'anytime', label: t.bestTimeAnytime },
  ];

  const difficultyOptions: { id: TaskDifficulty; label: string }[] = [
    { id: 'easy', label: t.difficultyEasy },
    { id: 'medium', label: t.difficultyMedium },
    { id: 'hard', label: t.difficultyHard },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.addTaskTitle}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[540px] max-h-[92vh] overflow-y-auto bg-[#1A1A1A] border border-[#2A2A2A] rounded-t-[24px] md:rounded-[20px] p-5 md:p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#00B8A9]/15 flex items-center justify-center">
              <Plus size={16} className="text-[#00B8A9]" />
            </div>
            <h2 className="text-lg font-extrabold text-white">{t.addTaskTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="w-10 h-10 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] flex items-center justify-center text-[#A1A1AA] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="task-name" className="block text-xs font-bold text-[#A1A1AA]">
            {t.taskNameLabel}
          </label>
          <input
            id="task-name"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setWarn('');
            }}
            placeholder={t.taskNamePlaceholder}
            className="w-full rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] px-3.5 py-3 text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#00B8A9]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="task-amount" className="block text-xs font-bold text-[#A1A1AA] mb-1">
              {t.taskAmountLabel}
            </label>
            <input
              id="task-amount"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => {
                const val = Math.max(1, Number(e.target.value) || 1);
                setAmount(val);
                setWeeklyGoal(String(val * 5));
              }}
              className="w-full rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00B8A9] tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="task-unit" className="block text-xs font-bold text-[#A1A1AA] mb-1">
              {t.unitLabel}
            </label>
            <select
              id="task-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as ActionUnit)}
              className="w-full rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00B8A9]"
            >
              {(
                ['minutes', 'pages', 'reps', 'times', 'hours', 'cups'] as ActionUnit[]
              ).map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[lang][u]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="task-weekly-goal" className="block text-xs font-bold text-[#A1A1AA] mb-1">
              {t.weeklyGoalLabel}
            </label>
            <input
              id="task-weekly-goal"
              type="number"
              min={1}
              value={weeklyGoal}
              onChange={(e) => setWeeklyGoal(e.target.value)}
              className="w-full rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00B8A9] tabular-nums"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-bold text-[#A1A1AA]">{t.colorLabel}</span>
          <div className="flex items-center gap-2.5">
            {ALLOWED_ACTION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                className="w-8 h-8 rounded-full border-2 flex items-center justify-center transition"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? '#FFFFFF' : 'transparent',
                }}
              >
                {color === c && <Check size={14} className="text-[#0F0F0F]" />}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="block text-xs font-bold text-[#A1A1AA]">{t.bestTimeLabel}</span>
            <div className="grid grid-cols-2 gap-1.5">
              {bestTimeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBestTime(opt.id)}
                  className="py-2 px-2.5 rounded-xl text-xs font-bold border transition"
                  style={{
                    backgroundColor: bestTime === opt.id ? '#00B8A922' : '#0F0F0F',
                    borderColor: bestTime === opt.id ? '#00B8A9' : '#2A2A2A',
                    color: bestTime === opt.id ? '#00B8A9' : '#A1A1AA',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="task-reminder" className="block text-xs font-bold text-[#A1A1AA]">
              {t.reminderTimeLabel}
            </label>
            <input
              id="task-reminder"
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="w-full rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00B8A9]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-bold text-[#A1A1AA]">{t.difficultyLabel}</span>
          <div className="grid grid-cols-3 gap-2">
            {difficultyOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDifficulty(opt.id)}
                className="py-2 rounded-xl text-xs font-bold border transition"
                style={{
                  backgroundColor: difficulty === opt.id ? '#A855F722' : '#0F0F0F',
                  borderColor: difficulty === opt.id ? '#A855F7' : '#2A2A2A',
                  color: difficulty === opt.id ? '#A855F7' : '#A1A1AA',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="task-why" className="block text-xs font-bold text-[#A1A1AA]">
            {t.whyMattersLabel}
          </label>
          <input
            id="task-why"
            type="text"
            value={whyMatters}
            onChange={(e) => setWhyMatters(e.target.value)}
            placeholder={t.whyMattersPlaceholder}
            className="w-full rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] px-3.5 py-2.5 text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#00B8A9]"
          />
        </div>

        <button
          type="button"
          onClick={() => setAllowTenMinRule((v) => !v)}
          aria-pressed={allowTenMinRule}
          className="w-full p-3.5 rounded-2xl bg-[#0F0F0F] border flex items-center justify-between gap-3 transition"
          style={{
            borderColor: allowTenMinRule ? '#00B8A9' : '#2A2A2A',
          }}
        >
          <span className="flex items-center gap-2 text-xs font-bold text-white text-start">
            <Sparkles
              size={15}
              style={{ color: allowTenMinRule ? '#00B8A9' : '#71717A' }}
            />
            <span>{t.allowTenMinToggle}</span>
          </span>
          <span
            className="w-11 h-6 rounded-full p-0.5 transition flex items-center shrink-0"
            style={{
              backgroundColor: allowTenMinRule ? '#00B8A9' : '#2A2A2A',
              justifyContent: allowTenMinRule ? 'flex-end' : 'flex-start',
            }}
          >
            <span className="w-5 h-5 rounded-full bg-white shadow" />
          </span>
        </button>

        {warn && (
          <div role="alert" className="text-xs font-bold text-[#FF6B35]">
            {warn}
          </div>
        )}

        <button
          type="submit"
          className="w-full py-3.5 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm md:text-base min-h-[48px]"
        >
          {t.saveTaskBtn}
        </button>
      </form>
    </div>
  );
}
