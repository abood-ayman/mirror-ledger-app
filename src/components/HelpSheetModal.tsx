import { HelpCircle, PlayCircle, X } from 'lucide-react';
import type { AppState, Language } from '../types/tracker';
import { DICTIONARY } from '../lib/i18n';
import { getScreenHelpContent, type HelpScreenKey } from '../lib/noor';

interface HelpSheetModalProps {
  screen: HelpScreenKey;
  state: AppState;
  lang: Language;
  canReplayTour: boolean;
  onClose: () => void;
  onReplayTour: () => void;
}

export function HelpSheetModal({
  screen,
  state,
  lang,
  canReplayTour,
  onClose,
  onReplayTour,
}: HelpSheetModalProps) {
  const t = DICTIONARY[lang];
  const content = getScreenHelpContent(screen, state, lang);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.helpSheetTitle}
      data-testid="help-sheet-modal"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 no-print"
    >
      <div className="w-full max-w-[460px] bg-[#1A1A1A] border border-[#2A2A2A] rounded-t-[24px] md:rounded-[20px] p-5 md:p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#00B8A9]">
            <HelpCircle size={18} />
            <span>{content.title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="w-9 h-9 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] flex items-center justify-center text-[#A1A1AA] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] space-y-2.5">
          <p className="text-sm font-bold text-white leading-relaxed">{content.body}</p>
          {content.extra && (
            <p className="text-xs text-[#E4E4E7] leading-relaxed pt-2 border-t border-[#2A2A2A]">
              {content.extra}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          {canReplayTour && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onReplayTour();
              }}
              className="flex-1 py-3 px-4 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-xs font-extrabold text-white flex items-center justify-center gap-1.5 min-h-[44px]"
            >
              <PlayCircle size={15} className="text-[#00B8A9]" />
              <span>{t.replayTourBtn}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-full bg-[#00B8A9] text-[#0F0F0F] text-xs font-extrabold min-h-[44px]"
          >
            {t.helpGotItBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
