import { useMemo, useState } from 'react';
import { AlertTriangle, Calendar, Check, Sparkles, X } from 'lucide-react';
import type {
  ActionConfig,
  ActionLogEntry,
  DailyLog,
  Language,
} from '../types/tracker';
import { DICTIONARY, UNIT_LABELS } from '../lib/i18n';
import { getActionName } from '../lib/analytics';
import { getTodayKey } from '../lib/storage';
import { ActionIcon } from './ActionIcon';
import { RangeSlider } from './RangeSlider';

interface CheckInModalProps {
  lang: Language;
  actions: ActionConfig[];
  logs: Record<string, DailyLog>;
  initialDate: string;
  allowDateChange: boolean;
  onClose: () => void;
  onSave: (log: DailyLog) => void;
}

interface DraftEntry {
  times: number;
  amountsRaw: string;
  startedWith10Min: boolean;
}

function parseAmountsInput(raw: string, times: number): { amounts: number[]; total: number } {
  if (times <= 0 && !raw.trim()) return { amounts: [], total: 0 };
  const parts = raw
    .split(/[،,\s+]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n >= 0);

  if (parts.length === 0) return { amounts: [], total: 0 };
  if (parts.length > 1) {
    const sum = parts.reduce((a, b) => a + b, 0);
    return { amounts: parts, total: sum };
  }
  const single = parts[0];
  const effectiveTimes = Math.max(1, times);
  return {
    amounts: Array.from({ length: effectiveTimes }, () => single),
    total: single * effectiveTimes,
  };
}

export function CheckInModal({
  lang,
  actions,
  logs,
  initialDate,
  allowDateChange,
  onClose,
  onSave,
}: CheckInModalProps) {
  const t = DICTIONARY[lang];
  const todayKey = getTodayKey();
  const [date, setDate] = useState(initialDate);
  const hasActions = actions.length > 0;
  const [step, setStep] = useState<1 | 2>(hasActions ? 1 : 2);

  const buildInitialDrafts = (dKey: string) => {
    const existing = logs[dKey];
    const map: Record<string, DraftEntry> = {};
    for (const a of actions) {
      const entry = existing?.entries[a.id];
      if (entry) {
        const allSame =
          entry.amounts.length > 1 &&
          entry.amounts.every((v) => v === entry.amounts[0]);
        map[a.id] = {
          times: entry.times,
          amountsRaw: allSame
            ? String(entry.amounts[0])
            : entry.amounts.join(', '),
          startedWith10Min: entry.startedWith10Min,
        };
      } else {
        map[a.id] = { times: 0, amountsRaw: '', startedWith10Min: false };
      }
    }
    return map;
  };

  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>(() =>
    buildInitialDrafts(initialDate)
  );
  const [energy, setEnergy] = useState<number>(logs[initialDate]?.energy ?? 7);
  const [focus, setFocus] = useState<number>(logs[initialDate]?.focus ?? 6);
  const [feelingWhy, setFeelingWhy] = useState<string>(
    logs[initialDate]?.feelingWhy ?? ''
  );
  const [quickNote, setQuickNote] = useState<string>(
    logs[initialDate]?.quickNote ?? ''
  );

  const [confirmedHighStudy, setConfirmedHighStudy] = useState(false);
  const [confirmedHuge, setConfirmedHuge] = useState(false);
  const [confirmedZero, setConfirmedZero] = useState(false);
  const [validationPrompt, setValidationPrompt] = useState<
    null | 'study720' | 'huge5000' | 'zero'
  >(null);

  const handleDateSwitch = (newDate: string) => {
    setDate(newDate);
    setDrafts(buildInitialDrafts(newDate));
    setEnergy(logs[newDate]?.energy ?? 7);
    setFocus(logs[newDate]?.focus ?? 6);
    setFeelingWhy(logs[newDate]?.feelingWhy ?? '');
    setQuickNote(logs[newDate]?.quickNote ?? '');
    setConfirmedHighStudy(false);
    setConfirmedHuge(false);
    setConfirmedZero(false);
    setValidationPrompt(null);
  };

  const computedEntries = useMemo(() => {
    const out: Record<string, ActionLogEntry> = {};
    for (const a of actions) {
      const d = drafts[a.id] ?? { times: 0, amountsRaw: '', startedWith10Min: false };
      const parsed = parseAmountsInput(d.amountsRaw, d.times);
      const effectiveTimes =
        parsed.amounts.length > 1
          ? parsed.amounts.length
          : d.times > 0
          ? d.times
          : parsed.total > 0
          ? 1
          : 0;

      out[a.id] = {
        actionId: a.id,
        times: effectiveTimes,
        amounts: parsed.amounts,
        total: parsed.total,
        startedWith10Min: d.startedWith10Min,
      };
    }
    return out;
  }, [actions, drafts]);

  const validateStep1 = (): boolean => {
    let totalAll = 0;
    let hasStudyOver720 = false;
    let has5000Plus = false;

    for (const a of actions) {
      const entry = computedEntries[a.id];
      totalAll += entry.total;
      if (entry.total >= 5000) has5000Plus = true;
      if (
        (a.id === 'study' || /مذاكرة|study/i.test(a.nameEn + a.nameAr)) &&
        a.unit === 'minutes' &&
        entry.total > 720
      ) {
        hasStudyOver720 = true;
      }
    }

    if (has5000Plus && !confirmedHuge) {
      setValidationPrompt('huge5000');
      return false;
    }
    if (hasStudyOver720 && !confirmedHighStudy) {
      setValidationPrompt('study720');
      return false;
    }
    if (totalAll === 0 && !confirmedZero) {
      setValidationPrompt('zero');
      return false;
    }

    setValidationPrompt(null);
    return true;
  };

  const handleNext = () => {
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleConfirmValidation = () => {
    if (validationPrompt === 'huge5000') setConfirmedHuge(true);
    if (validationPrompt === 'study720') setConfirmedHighStudy(true);
    if (validationPrompt === 'zero') setConfirmedZero(true);
    setValidationPrompt(null);
    setStep(2);
  };

  const handleFinalSave = () => {
    const newLog: DailyLog = {
      date,
      entries: computedEntries,
      energy,
      focus,
      feelingWhy: feelingWhy.trim(),
      quickNote: quickNote.trim(),
      pointsEarned: 0,
      updatedAt: new Date().toISOString(),
    };
    onSave(newLog);
  };

  const updateDraft = (id: string, patch: Partial<DraftEntry>) => {
    setValidationPrompt(null);
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { times: 0, amountsRaw: '', startedWith10Min: false }), ...patch },
    }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={step === 1 ? t.checkInStep1Title : t.checkInStep2Title}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
    >
      <div className="w-full max-w-[540px] max-h-[92vh] overflow-y-auto bg-[#1A1A1A] border border-[#2A2A2A] rounded-t-[24px] md:rounded-[20px] p-5 md:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg md:text-xl font-extrabold text-white">
              {step === 1 ? t.checkInStep1Title : t.checkInStep2Title}
            </h2>
            <p className="text-xs text-[#A1A1AA]">{t.actionFirstNote}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] flex items-center justify-center text-[#A1A1AA] hover:text-white shrink-0"
            aria-label={t.close}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A]">
          <div className="flex items-center gap-2 text-xs font-bold text-[#A1A1AA]">
            <Calendar size={15} className="text-[#00B8A9]" />
            <span>{t.selectDateLabel}</span>
          </div>
          {allowDateChange ? (
            <input
              type="date"
              max={todayKey}
              value={date}
              onChange={(e) => handleDateSwitch(e.target.value)}
              aria-label={t.selectDateLabel}
              className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl px-2.5 py-1 text-xs font-bold text-white focus:outline-none focus:border-[#00B8A9]"
            />
          ) : (
            <span className="text-xs font-extrabold text-white tabular-nums">{date}</span>
          )}
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            {actions.map((action) => {
              const draft = drafts[action.id] ?? {
                times: 0,
                amountsRaw: '',
                startedWith10Min: false,
              };
              const computed = computedEntries[action.id];
              const unitText = UNIT_LABELS[lang][action.unit];
              const actionName = getActionName(action, lang);

              return (
                <div
                  key={action.id}
                  className="p-4 rounded-[18px] bg-[#0F0F0F] border border-[#2A2A2A] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${action.color}20` }}
                      >
                        <ActionIcon icon={action.icon} color={action.color} size={18} />
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-white">
                          {actionName}
                        </div>
                        <div className="text-[11px] text-[#A1A1AA]">{unitText}</div>
                      </div>
                    </div>
                    <div
                      className="text-xs font-extrabold px-2.5 py-1 rounded-full tabular-nums"
                      style={{
                        backgroundColor: `${action.color}22`,
                        color: action.color,
                      }}
                    >
                      {t.dayTotal}: {computed.total} {unitText}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor={`times-${action.id}`}
                        className="block text-[11px] text-[#A1A1AA] mb-1"
                      >
                        {t.howManyTimes}
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft(action.id, {
                              times: Math.max(0, draft.times - 1),
                            })
                          }
                          aria-label={`${actionName} -1`}
                          className="w-10 h-10 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] font-bold text-white text-lg shrink-0"
                        >
                          -
                        </button>
                        <input
                          id={`times-${action.id}`}
                          type="number"
                          min={0}
                          value={draft.times}
                          onChange={(e) =>
                            updateDraft(action.id, {
                              times: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-full text-center h-10 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] text-white font-bold text-sm focus:outline-none focus:border-[#00B8A9] tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft(action.id, { times: draft.times + 1 })
                          }
                          aria-label={`${actionName} +1`}
                          className="w-10 h-10 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] font-bold text-white text-lg shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor={`amt-${action.id}`}
                        className="block text-[11px] text-[#A1A1AA] mb-1"
                      >
                        {t.amountEachTime}
                      </label>
                      <input
                        id={`amt-${action.id}`}
                        type="text"
                        inputMode="decimal"
                        value={draft.amountsRaw}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const nextTimes =
                            draft.times === 0 && raw.trim() ? 1 : draft.times;
                          updateDraft(action.id, {
                            amountsRaw: raw,
                            times: nextTimes,
                          });
                        }}
                        placeholder="40, 25"
                        className="w-full h-10 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] px-3 text-white font-bold text-sm focus:outline-none focus:border-[#00B8A9] tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap gap-1.5">
                      {[10, 25, 45].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            const existing = draft.amountsRaw.trim();
                            const nextRaw = existing ? `${existing}, ${preset}` : String(preset);
                            updateDraft(action.id, {
                              amountsRaw: nextRaw,
                              times: draft.times + 1,
                            });
                          }}
                          className="px-2.5 py-1.5 rounded-full text-[11px] font-bold bg-[#1A1A1A] border border-[#2A2A2A] text-[#A1A1AA] hover:text-white hover:border-[#00B8A9] whitespace-nowrap"
                        >
                          +{preset} {unitText}
                        </button>
                      ))}
                    </div>

                    {action.allowTenMinRule !== false && (
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft(action.id, {
                            startedWith10Min: !draft.startedWith10Min,
                          })
                        }
                        aria-pressed={draft.startedWith10Min}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition whitespace-nowrap"
                        style={{
                          borderColor: draft.startedWith10Min ? '#00B8A9' : '#2A2A2A',
                          backgroundColor: draft.startedWith10Min ? '#00B8A922' : '#1A1A1A',
                          color: draft.startedWith10Min ? '#00B8A9' : '#A1A1AA',
                        }}
                      >
                        <Sparkles size={12} />
                        <span>{t.startedWith10Min}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {validationPrompt && (
              <div className="p-4 rounded-2xl bg-[#FF6B35]/10 border border-[#FF6B35] space-y-3">
                <div className="flex items-start gap-2.5 text-sm font-bold text-white">
                  <AlertTriangle size={18} className="text-[#FF6B35] shrink-0 mt-0.5" />
                  <span>
                    {validationPrompt === 'study720'
                      ? t.highStudyWarning
                      : validationPrompt === 'huge5000'
                      ? t.hugeNumberWarning
                      : t.zeroDayWarning}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleConfirmValidation}
                  className="px-4 py-2 rounded-full bg-[#FF6B35] text-[#0F0F0F] text-xs font-extrabold min-h-[40px]"
                >
                  {validationPrompt === 'zero' ? t.confirmZeroBtn : t.confirmNumberBtn}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="w-full py-4 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-base active:scale-[0.99] transition min-h-[48px]"
            >
              {t.continueToMirror}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="p-4 rounded-[18px] bg-[#0F0F0F] border border-[#2A2A2A] space-y-4">
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

            <div className="space-y-2">
              <label htmlFor="modal-why" className="block text-xs font-bold text-white">
                {t.whyPlaceholder}
              </label>
              <textarea
                id="modal-why"
                rows={3}
                value={feelingWhy}
                onChange={(e) => setFeelingWhy(e.target.value)}
                placeholder={t.whyPlaceholder}
                className="w-full rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] p-3.5 text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#00B8A9]"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="modal-note" className="block text-xs font-bold text-[#A1A1AA]">
                {t.quickNoteLabel}
              </label>
              <input
                id="modal-note"
                type="text"
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                placeholder={t.quickNotePlaceholder}
                className="w-full rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] px-3.5 py-3 text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            <div className="flex gap-3">
              {hasActions && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3.5 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-white font-bold text-sm min-h-[44px]"
                >
                  {t.backToLedger}
                </button>
              )}
              <button
                type="button"
                onClick={handleFinalSave}
                className="flex-[1.5] py-3.5 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm flex items-center justify-center gap-2 min-h-[44px]"
              >
                <Check size={17} />
                <span>{t.saveCheckIn}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
