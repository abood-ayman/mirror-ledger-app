import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe2,
  MessageCircle,
  Plus,
  Sparkles,
  VolumeX,
} from 'lucide-react';
import type {
  ActionConfig,
  ActionUnit,
  Language,
  NoorDialect,
  NoorPreference,
} from '../types/tracker';
import {
  ALLOWED_ACTION_COLORS,
  DIALECT_OPTIONS,
  DICTIONARY,
  UNIT_LABELS,
} from '../lib/i18n';
import { getDefaultDialect, saveGlobalDialect } from '../lib/storage';
import { ActionIcon } from './ActionIcon';

interface OnboardingFlowProps {
  lang: Language;
  initialActions: ActionConfig[];
  onComplete: (payload: {
    selectedActions: ActionConfig[];
    userName: string;
    dialect: NoorDialect;
    noorPreference: NoorPreference;
  }) => void;
}

function NoorAvatar({ mood = 'wave' }: { mood?: 'wave' | 'listen' | 'ready' }) {
  return (
    <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
      <div
        className="absolute inset-0 rounded-full bg-[#00B8A9]/15 blur-md"
        aria-hidden="true"
      />
      <svg
        viewBox="0 0 88 88"
        className="w-20 h-20 relative z-10"
        aria-hidden="true"
      >
        <circle
          cx="44"
          cy="44"
          r="38"
          fill="#1A1A1A"
          stroke="#00B8A9"
          strokeWidth="2.5"
        />
        <circle cx="44" cy="44" r="30" fill="#0F0F0F" />
        {/* Warm aura halo */}
        <path
          d="M 24 30 Q 44 18 64 30"
          fill="none"
          stroke="#00B8A9"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.65"
        />
        {/* Friendly eyes */}
        <circle cx="34" cy="42" r="3.4" fill="#00B8A9" />
        <circle cx="54" cy="42" r="3.4" fill="#00B8A9" />
        <circle cx="35.1" cy="40.8" r="1.1" fill="#FFFFFF" />
        <circle cx="55.1" cy="40.8" r="1.1" fill="#FFFFFF" />
        {/* Gentle cheeks */}
        <ellipse cx="27" cy="49" rx="3.5" ry="2" fill="#FF6B35" opacity="0.35" />
        <ellipse cx="61" cy="49" rx="3.5" ry="2" fill="#FF6B35" opacity="0.35" />
        {/* Friendly smile */}
        {mood === 'listen' ? (
          <path
            d="M 37 53 Q 44 57 51 53"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M 35 51 Q 44 59 53 51"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        )}
        {/* Small floating star */}
        <circle cx="71" cy="21" r="4" fill="#A855F7" />
        <circle cx="71" cy="21" r="1.8" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

export function OnboardingFlow({
  lang,
  initialActions,
  onComplete,
}: OnboardingFlowProps) {
  const t = DICTIONARY[lang];
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [userName, setUserName] = useState('');
  const [dialect, setDialect] = useState<NoorDialect>(() => getDefaultDialect(lang));
  const [noorPreference, setNoorPreference] = useState<NoorPreference>('talk');
  const [showActionPicker, setShowActionPicker] = useState(false);

  const [actions, setActions] = useState<ActionConfig[]>(() =>
    initialActions.map((a) => ({ ...a, enabled: false }))
  );
  const [customAr, setCustomAr] = useState('');
  const [customEn, setCustomEn] = useState('');
  const [customUnit, setCustomUnit] = useState<ActionUnit>('minutes');

  const enabledCount = actions.filter((a) => a.enabled).length;
  const ArrowIcon = lang === 'ar' ? ArrowLeft : ArrowRight;

  const toggleAction = (id: string) => {
    setActions((prev) => {
      const target = prev.find((a) => a.id === id);
      if (!target) return prev;
      if (!target.enabled && enabledCount >= 5) return prev;
      return prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a));
    });
  };

  const updateName = (id: string, val: string) => {
    setActions((prev) =>
      prev.map((a) =>
        a.id === id
          ? lang === 'ar'
            ? { ...a, nameAr: val }
            : { ...a, nameEn: val }
          : a
      )
    );
  };

  const addCustom = () => {
    if ((!customAr.trim() && !customEn.trim()) || actions.length >= 6) return;
    const color = ALLOWED_ACTION_COLORS[actions.length % ALLOWED_ACTION_COLORS.length];
    const newAction: ActionConfig = {
      id: `custom_${Date.now()}`,
      nameAr: customAr.trim() || customEn.trim(),
      nameEn: customEn.trim() || customAr.trim(),
      unit: customUnit,
      color,
      icon: 'target',
      enabled: enabledCount < 5,
    };
    setActions((prev) => [...prev, newAction]);
    setCustomAr('');
    setCustomEn('');
  };

  const finishWithoutActions = () => {
    saveGlobalDialect(dialect);
    onComplete({
      selectedActions: actions.map((a) => ({ ...a, enabled: false })),
      userName: userName.trim(),
      dialect,
      noorPreference,
    });
  };

  const finishWithSelected = () => {
    saveGlobalDialect(dialect);
    onComplete({
      selectedActions: actions,
      userName: userName.trim(),
      dialect,
      noorPreference,
    });
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-6">
      <div className="w-full max-w-[540px] bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map((idx) => (
            <span
              key={idx}
              className="h-2 rounded-full transition-all"
              style={{
                width: step === idx ? 32 : 10,
                backgroundColor: step >= idx ? '#00B8A9' : '#2A2A2A',
              }}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="text-center space-y-5 py-3">
            <NoorAvatar mood="wave" />
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00B8A9]/15 border border-[#00B8A9]/40 text-xs font-extrabold text-[#00B8A9]">
              <Sparkles size={13} />
              <span>{t.noorName}</span>
            </div>
            <div className="p-4 md:p-5 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A]">
              <h1 className="text-lg md:text-2xl font-extrabold text-white leading-relaxed text-balance">
                {t.noorIntro}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full py-4 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.99] transition min-h-[48px]"
            >
              <span>{t.next}</span>
              <ArrowIcon size={18} />
            </button>
          </div>
        )}

        {step === 2 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep(3);
            }}
            className="text-center space-y-5 py-3"
          >
            <NoorAvatar mood="listen" />
            <h1 className="text-2xl md:text-3xl font-extrabold text-white leading-snug text-balance">
              {t.noorAskName}
            </h1>
            <input
              type="text"
              autoFocus
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder={t.noorNamePlaceholder}
              aria-label={t.noorAskName}
              className="w-full rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] px-4 py-3.5 text-center text-base font-bold text-white placeholder-[#71717A] focus:outline-none focus:border-[#00B8A9]"
            />
            <button
              type="submit"
              className="w-full py-4 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.99] transition min-h-[48px]"
            >
              <span>{t.next}</span>
              <ArrowIcon size={18} />
            </button>
          </form>
        )}

        {step === 3 && (
          <div className="text-center space-y-5 py-2">
            <NoorAvatar mood="listen" />
            <div className="space-y-1.5">
              {userName.trim() && (
                <div className="text-xs font-extrabold text-[#00B8A9]">
                  {t.greetingPrefix} {userName.trim()}
                </div>
              )}
              <h1 className="text-xl md:text-2xl font-extrabold text-white leading-snug text-balance flex items-center justify-center gap-2">
                <Globe2 size={20} className="text-[#00B8A9] shrink-0" />
                <span>{t.noorAskDialect}</span>
              </h1>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-start">
              {DIALECT_OPTIONS.map((opt) => {
                const selected = dialect === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-dialect-card={opt.id}
                    aria-pressed={selected}
                    onClick={() => {
                      setDialect(opt.id);
                      saveGlobalDialect(opt.id);
                    }}
                    className="p-3.5 rounded-2xl bg-[#0F0F0F] border transition flex items-start justify-between gap-2 min-h-[68px]"
                    style={{
                      borderColor: selected ? '#00B8A9' : '#2A2A2A',
                      backgroundColor: selected ? '#00B8A914' : '#0F0F0F',
                    }}
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-sm font-extrabold text-white">
                        {lang === 'ar' ? opt.labelAr : opt.labelEn}
                      </div>
                      <div className="text-[11px] text-[#A1A1AA] leading-snug">
                        {lang === 'ar' ? opt.subAr : opt.subEn}
                      </div>
                    </div>
                    <span
                      className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        borderColor: selected ? '#00B8A9' : '#3F3F46',
                        backgroundColor: selected ? '#00B8A9' : 'transparent',
                      }}
                    >
                      {selected && <Check size={12} className="text-[#0F0F0F]" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                saveGlobalDialect(dialect);
                setStep(4);
              }}
              className="w-full py-4 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.99] transition min-h-[48px]"
            >
              <span>{t.next}</span>
              <ArrowIcon size={18} />
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="text-center space-y-5 py-3">
            <NoorAvatar mood="ready" />
            {userName.trim() && (
              <div className="text-xs font-extrabold text-[#00B8A9]">
                {t.greetingPrefix} {userName.trim()}
              </div>
            )}
            <h1 className="text-xl md:text-2xl font-extrabold text-white leading-relaxed text-balance">
              {t.noorPermission}
            </h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setNoorPreference('talk');
                  setStep(5);
                }}
                className="w-full py-4 px-4 rounded-2xl bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm md:text-base flex items-center justify-center gap-2 active:scale-[0.99] transition min-h-[52px]"
              >
                <MessageCircle size={18} />
                <span>{t.noorTalkBtn}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setNoorPreference('quiet');
                  setStep(5);
                }}
                className="w-full py-4 px-4 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#A855F7] text-white font-extrabold text-sm md:text-base flex items-center justify-center gap-2 active:scale-[0.99] transition min-h-[52px]"
              >
                <VolumeX size={18} className="text-[#A855F7]" />
                <span>{t.noorQuietBtn}</span>
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <NoorAvatar mood="ready" />
              <h1 className="text-xl md:text-2xl font-extrabold text-white text-balance">
                {t.noorActionsTitle}
              </h1>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">{t.noorActionsSub}</p>
            </div>

            {!showActionPicker ? (
              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowActionPicker(true)}
                  className="w-full py-4 px-5 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.99] transition min-h-[48px]"
                >
                  <Plus size={18} />
                  <span>{t.addFirstActionBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={finishWithoutActions}
                  className="w-full py-4 px-5 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-white font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.99] transition min-h-[48px]"
                >
                  <span>{t.startWithoutActionsBtn}</span>
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-2.5">
                  {actions.map((action) => (
                    <div
                      key={action.id}
                      className="flex items-center gap-3 p-3 rounded-[16px] bg-[#0F0F0F] border transition"
                      style={{
                        borderColor: action.enabled ? action.color : '#2A2A2A',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleAction(action.id)}
                        className="w-8 h-8 rounded-full flex items-center justify-center border shrink-0 transition"
                        style={{
                          backgroundColor: action.enabled ? action.color : 'transparent',
                          borderColor: action.enabled ? action.color : '#3F3F46',
                        }}
                        aria-label={lang === 'ar' ? action.nameAr : action.nameEn}
                        aria-pressed={action.enabled}
                      >
                        {action.enabled && <Check size={15} className="text-[#0F0F0F]" />}
                      </button>

                      <ActionIcon icon={action.icon} color={action.color} size={18} />

                      <input
                        type="text"
                        value={lang === 'ar' ? action.nameAr : action.nameEn}
                        onChange={(e) => updateName(action.id, e.target.value)}
                        aria-label={lang === 'ar' ? action.nameAr : action.nameEn}
                        className="flex-1 bg-transparent text-white font-bold text-sm focus:outline-none border-b border-transparent focus:border-[#2A2A2A] py-0.5"
                      />

                      <span className="text-xs text-[#A1A1AA] px-2 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A]">
                        {UNIT_LABELS[lang][action.unit]}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-[16px] bg-[#0F0F0F] border border-[#2A2A2A] space-y-2">
                  <div className="text-xs font-bold text-[#A1A1AA]">{t.customAction}</div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={lang === 'ar' ? customAr : customEn}
                      onChange={(e) =>
                        lang === 'ar'
                          ? setCustomAr(e.target.value)
                          : setCustomEn(e.target.value)
                      }
                      placeholder={lang === 'ar' ? 'اسم الفعل...' : 'Action name...'}
                      className="flex-1 min-w-[130px] bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00B8A9]"
                    />
                    <select
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value as ActionUnit)}
                      aria-label={t.unitLabel}
                      className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none"
                    >
                      {(
                        ['minutes', 'pages', 'reps', 'times', 'hours', 'cups'] as ActionUnit[]
                      ).map(
                        (u) => (
                          <option key={u} value={u}>
                            {UNIT_LABELS[lang][u]}
                          </option>
                        )
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={addCustom}
                      aria-label={t.addAction}
                      className="px-3 py-2 rounded-xl bg-[#2A2A2A] text-white text-xs font-bold flex items-center gap-1 hover:bg-[#3A3A3A] min-h-[38px]"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                  <span>{t.selectUpTo5}</span>
                  <span className="font-bold text-[#00B8A9] tabular-nums">
                    {enabledCount} / 5
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={finishWithoutActions}
                    className="flex-1 py-3.5 px-4 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-white font-bold text-sm min-h-[46px]"
                  >
                    {t.startWithoutActionsBtn}
                  </button>
                  <button
                    type="button"
                    onClick={finishWithSelected}
                    className="flex-1 py-3.5 px-4 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm min-h-[46px]"
                  >
                    {enabledCount > 0 ? t.startNow : t.startWithoutActionsBtn}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
