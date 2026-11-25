import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Eye,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { Language } from '../types/tracker';
import { DICTIONARY } from '../lib/i18n';

interface AppIntroScreenProps {
  lang: Language;
  onFinish: () => void;
}

export function AppIntroScreen({ lang, onFinish }: AppIntroScreenProps) {
  const t = DICTIONARY[lang];
  const [page, setPage] = useState<0 | 1 | 2>(0);
  const touchStartX = useRef<number | null>(null);
  const ArrowNext = lang === 'ar' ? ArrowLeft : ArrowRight;
  const ArrowPrev = lang === 'ar' ? ArrowRight : ArrowLeft;

  const goNext = () => {
    if (page < 2) {
      setPage((p) => (p + 1) as 0 | 1 | 2);
    } else {
      onFinish();
    }
  };

  const goPrev = () => {
    if (page > 0) {
      setPage((p) => (p - 1) as 0 | 1 | 2);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const dx = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;

    const swipedForward = lang === 'ar' ? dx > 0 : dx < 0;
    if (swipedForward) {
      if (page < 2) setPage((p) => (p + 1) as 0 | 1 | 2);
    } else {
      goPrev();
    }
  };

  return (
    <div
      className="min-h-[76vh] flex items-center justify-center py-4"
      data-testid="prelogin-intro"
    >
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full max-w-[560px] bg-[#1A1A1A] border border-[#2A2A2A] rounded-[24px] p-6 md:p-8 flex flex-col justify-between gap-6 min-h-[470px]"
      >
        {/* Top bar: Page progress + Skip */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2" role="tablist" aria-label="Intro slides">
            {[0, 1, 2].map((idx) => (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={page === idx}
                aria-label={`Slide ${idx + 1}`}
                onClick={() => setPage(idx as 0 | 1 | 2)}
                className="h-2.5 rounded-full transition-all"
                style={{
                  width: page === idx ? 32 : 10,
                  backgroundColor: page === idx ? '#00B8A9' : '#2A2A2A',
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={onFinish}
            data-testid="intro-skip-btn"
            className="px-4 py-2 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-xs font-extrabold text-[#A1A1AA] hover:text-white transition min-h-[40px]"
          >
            {t.introSkipBtn}
          </button>
        </div>

        {/* Slide Content */}
        {page === 0 && (
          <div className="text-center space-y-5 my-auto py-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-[#00B8A9]/15 border border-[#00B8A9]/40 flex items-center justify-center">
              <Eye size={30} className="text-[#00B8A9]" />
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white text-balance">
              {t.introPage1Title}
            </h1>
            <p className="text-sm md:text-base text-[#E4E4E7] leading-relaxed max-w-[440px] mx-auto">
              {t.introPage1Text}
            </p>
          </div>
        )}

        {page === 1 && (
          <div className="space-y-5 my-auto py-2">
            <div className="text-center space-y-2">
              <h1 className="text-2xl md:text-3xl font-extrabold text-white text-balance">
                {t.introPage2Title}
              </h1>
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-[#00B8A9]/15 border border-[#00B8A9]/40 flex items-center justify-center shrink-0">
                  <Clock size={20} className="text-[#00B8A9]" />
                </div>
                <div className="text-sm md:text-base font-extrabold text-white">
                  1. {t.introPage2Step1}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-[#A855F7]/15 border border-[#A855F7]/40 flex items-center justify-center shrink-0">
                  <Sparkles size={20} className="text-[#A855F7]" />
                </div>
                <div className="text-sm md:text-base font-extrabold text-white">
                  2. {t.introPage2Step2}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-[#FF6B35]/15 border border-[#FF6B35]/40 flex items-center justify-center shrink-0">
                  <TrendingUp size={20} className="text-[#FF6B35]" />
                </div>
                <div className="text-sm md:text-base font-extrabold text-white">
                  3. {t.introPage2Step3}
                </div>
              </div>
            </div>
          </div>
        )}

        {page === 2 && (
          <div className="text-center space-y-5 my-auto py-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-[#A855F7]/15 border border-[#A855F7]/40 flex items-center justify-center">
              <TrendingUp size={30} className="text-[#A855F7]" />
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white text-balance">
              {t.introPage3Title}
            </h1>
            <p className="text-sm md:text-base text-[#E4E4E7] leading-relaxed max-w-[440px] mx-auto">
              {t.introPage3Text}
            </p>
          </div>
        )}

        {/* Footer Controls */}
        <div className="flex items-center gap-3 pt-2">
          {page > 0 && (
            <button
              type="button"
              onClick={goPrev}
              className="px-4 py-3.5 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-xs font-extrabold text-white flex items-center justify-center gap-1.5 min-h-[48px] shrink-0"
            >
              <ArrowPrev size={16} />
              <span>{t.introBackBtn}</span>
            </button>
          )}
          <button
            type="button"
            onClick={goNext}
            data-testid={page === 2 ? 'intro-start-btn' : 'intro-next-btn'}
            className="flex-1 py-4 px-5 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-base flex items-center justify-center gap-2 active:scale-[0.99] transition min-h-[48px]"
          >
            <span>{page === 2 ? t.introStartBtn : t.next}</span>
            <ArrowNext size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
