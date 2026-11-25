import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { ActionConfig, ActionUnit, Language } from '../types/tracker';
import { ALLOWED_ACTION_COLORS, DICTIONARY, UNIT_LABELS } from '../lib/i18n';

interface SetupActionsModalProps {
  lang: Language;
  actions: ActionConfig[];
  onClose: () => void;
  onSave: (actions: ActionConfig[]) => void;
}

export function SetupActionsModal({
  lang,
  actions,
  onClose,
  onSave,
}: SetupActionsModalProps) {
  const t = DICTIONARY[lang];
  const [list, setList] = useState<ActionConfig[]>(() =>
    actions.filter((a) => a.enabled)
  );
  const [warn, setWarn] = useState('');

  const updateItem = (idx: number, patch: Partial<ActionConfig>) => {
    setWarn('');
    setList((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const addItem = () => {
    if (list.length >= 5) {
      setWarn(t.max5ActionsWarn);
      return;
    }
    setWarn('');
    const color = ALLOWED_ACTION_COLORS[list.length % ALLOWED_ACTION_COLORS.length];
    setList((prev) => [
      ...prev,
      {
        id: `act_${Date.now()}`,
        nameAr: 'فعل جديد',
        nameEn: 'New Action',
        unit: 'minutes',
        color,
        icon: 'target',
        weeklyGoal: 120,
        enabled: true,
      },
    ]);
  };

  const removeItem = (idx: number) => {
    setWarn('');
    setList((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    onSave(list.map((a) => ({ ...a, enabled: true })));
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.setupTitle}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
    >
      <div className="w-full max-w-[540px] max-h-[90vh] overflow-y-auto bg-[#1A1A1A] border border-[#2A2A2A] rounded-t-[24px] md:rounded-[20px] p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-white">{t.setupTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="w-10 h-10 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] flex items-center justify-center text-[#A1A1AA] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {list.length === 0 ? (
          <div className="p-6 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] text-center space-y-3">
            <div className="text-sm font-bold text-white">{t.noActionsYetTitle}</div>
            <p className="text-xs text-[#A1A1AA]">{t.noActionsYetSub}</p>
            <button
              type="button"
              onClick={addItem}
              className="px-4 py-2.5 rounded-full bg-[#00B8A9] text-[#0F0F0F] text-xs font-extrabold inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <Plus size={14} />
              <span>{t.addFirstActionBtn}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((item, idx) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-extrabold px-2.5 py-0.5 rounded-full tabular-nums"
                    style={{ backgroundColor: `${item.color}22`, color: item.color }}
                  >
                    #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-[#A1A1AA] hover:text-[#FF6B35] p-2"
                    aria-label={`Remove ${lang === 'ar' ? item.nameAr : item.nameEn}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-[#A1A1AA]">
                      {t.actionNameAr}
                      <input
                        type="text"
                        value={item.nameAr}
                        onChange={(e) => updateItem(idx, { nameAr: e.target.value })}
                        className="w-full mt-1 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00B8A9]"
                      />
                    </label>
                  </div>
                  <div>
                    <label className="text-[11px] text-[#A1A1AA]">
                      {t.actionNameEn}
                      <input
                        type="text"
                        value={item.nameEn}
                        onChange={(e) => updateItem(idx, { nameEn: e.target.value })}
                        className="w-full mt-1 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00B8A9]"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-[#A1A1AA]">
                      {t.unitLabel}
                      <select
                        value={item.unit}
                        onChange={(e) =>
                          updateItem(idx, { unit: e.target.value as ActionUnit })
                        }
                        className="w-full mt-1 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] px-2.5 py-2 text-xs text-white focus:outline-none"
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
                    </label>
                  </div>
                  <div>
                    <label className="text-[11px] text-[#A1A1AA]">
                      {t.weeklyGoalLabel}
                      <input
                        type="number"
                        min={0}
                        value={item.weeklyGoal ?? ''}
                        onChange={(e) =>
                          updateItem(idx, {
                            weeklyGoal: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        className="w-full mt-1 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00B8A9] tabular-nums"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#A1A1AA]">{t.colorLabel}:</span>
                  {ALLOWED_ACTION_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateItem(idx, { color: c })}
                      className="w-7 h-7 rounded-full border-2 transition"
                      style={{
                        backgroundColor: c,
                        borderColor: item.color === c ? '#FFFFFF' : 'transparent',
                      }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {warn && <div className="text-xs font-bold text-[#FF6B35]">{warn}</div>}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={addItem}
            className="px-4 py-3 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-white text-xs font-bold whitespace-nowrap min-h-[44px]"
          >
            {list.length === 0 ? t.addFirstActionBtn : t.addAction}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-3 rounded-full bg-[#00B8A9] text-[#0F0F0F] text-sm font-extrabold min-h-[44px]"
          >
            {t.saveSetup}
          </button>
        </div>
      </div>
    </div>
  );
}
