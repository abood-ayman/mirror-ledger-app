import { useEffect, useState } from 'react';
import { HelpCircle, Sparkles } from 'lucide-react';
import type { Language, ScreenTab } from '../types/tracker';
import { DICTIONARY } from '../lib/i18n';

interface InteractiveTourProps {
  lang: Language;
  activeTab: ScreenTab;
  onSelectTab: (tab: ScreenTab) => void;
  onComplete: () => void;
}

interface TourStepDef {
  id: number;
  target: string;
  tab: ScreenTab;
  text: string;
  isEnd?: boolean;
}

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function InteractiveTour({
  lang,
  activeTab,
  onSelectTab,
  onComplete,
}: InteractiveTourProps) {
  const t = DICTIONARY[lang];
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<HighlightRect | null>(null);

  const steps: TourStepDef[] = [
    { id: 1, target: 'add-task', tab: 'checkin', text: t.tourStep1Text },
    { id: 2, target: 'my-actions', tab: 'checkin', text: t.tourStep2Text },
    { id: 3, target: 'noor-bubble', tab: 'checkin', text: t.tourStep3Text },
    { id: 4, target: 'nav-dashboard', tab: 'dashboard', text: t.tourStep4Text },
    { id: 5, target: 'nav-report', tab: 'report', text: t.tourStep5Text },
    { id: 6, target: 'nav-studio', tab: 'studio', text: t.tourStep6Text },
    { id: 7, target: 'help-btn', tab: 'checkin', text: t.tourEndText, isEnd: true },
  ];

  const current = steps[stepIndex] ?? steps[0];

  // Switch screen automatically for Dashboard/Report steps so the user sees the screen in context
  useEffect(() => {
    if (activeTab !== current.tab) {
      onSelectTab(current.tab);
    }
  }, [activeTab, current.tab, onSelectTab]);

  // Measure target bounding box cleanly after tab switches or viewport resizes
  useEffect(() => {
    const measure = () => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour-target="${current.target}"]`)
      );
      const visible = nodes.find((el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      });
      if (!visible) {
        setRect(null);
        return;
      }
      visible.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const b = visible.getBoundingClientRect();
      setRect({
        top: Math.max(4, b.top - 6),
        left: Math.max(4, b.left - 6),
        width: b.width + 12,
        height: b.height + 12,
      });
    };

    const timer = window.setTimeout(measure, 90);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [current.target, activeTab, stepIndex]);

  const handleNext = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      onSelectTab('checkin');
      onComplete();
    }
  };

  const handleSkip = () => {
    onSelectTab('checkin');
    onComplete();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guided App Tour"
      data-testid="interactive-tour"
      className="fixed inset-0 z-[60] no-print pointer-events-auto"
    >
      {/* Dimmed backdrop — only dim whole screen when no target rect; otherwise spotlight box-shadow dims everything AROUND target while leaving target bright */}
      {!rect && <div className="absolute inset-0 bg-black/75 backdrop-blur-[1px]" />}

      {/* Highlight spotlight frame around the current target */}
      {rect && (
        <div
          aria-hidden="true"
          className="fixed rounded-[22px] border-2 border-[#00B8A9] pointer-events-none transition-all duration-200"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.72)',
          }}
        />
      )}

      {/* Guided Explanation Card */}
      <div className="fixed inset-x-0 bottom-20 md:bottom-10 px-4 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[440px] bg-[#1A1A1A] border-2 border-[#00B8A9] rounded-[22px] p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#00B8A9]">
              {current.isEnd ? <HelpCircle size={15} /> : <Sparkles size={15} />}
              <span className="tabular-nums">
                {current.isEnd
                  ? lang === 'ar'
                    ? 'النهاية'
                    : 'Done'
                  : `${current.id} / 6`}
              </span>
            </span>

            <button
              type="button"
              onClick={handleSkip}
              data-testid="tour-skip-btn"
              className="px-3 py-1 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-xs font-bold text-[#A1A1AA] hover:text-white min-h-[32px]"
            >
              {t.tourSkipBtn}
            </button>
          </div>

          <p className="text-sm md:text-base font-bold text-white leading-relaxed">
            {current.text}
          </p>

          <button
            type="button"
            onClick={handleNext}
            data-testid="tour-next-btn"
            className="w-full py-3.5 px-5 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm flex items-center justify-center gap-2 min-h-[44px]"
          >
            <span>{current.isEnd ? t.tourFinishBtn : t.tourNextBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
