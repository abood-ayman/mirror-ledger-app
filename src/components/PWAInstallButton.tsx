import { useState } from 'react';
import { CheckCircle2, Download, Share, Smartphone, X } from 'lucide-react';
import type { Language } from '../types/tracker';
import { DICTIONARY } from '../lib/i18n';
import { useOnlineStatus, usePWAInstall } from '../lib/usePWA';

export function PWAInstallButton({
  lang,
  compact = false,
}: {
  lang: Language;
  compact?: boolean;
}) {
  const t = DICTIONARY[lang];
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  // Show on Android Chrome, iPhone Safari, whenever browser exposes install prompt,
  // or inside non-compact Settings dialog.
  const shouldRenderButton = isInstallable || isAndroid || isIOS || !compact;
  if (!shouldRenderButton) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={
          compact
            ? 'px-3.5 py-2 rounded-full bg-[#00B8A9]/15 border border-[#00B8A9] text-[#00B8A9] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 min-h-[40px]'
            : 'w-full py-3.5 px-4 rounded-full bg-[#00B8A9]/15 border border-[#00B8A9] text-[#00B8A9] font-extrabold text-sm flex items-center justify-center gap-2 whitespace-nowrap min-h-[44px]'
        }
      >
        <Download size={15} />
        <span>{t.installAppBtn}</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.installModalTitle}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-sm rounded-[20px] bg-[#1A1A1A] border border-[#2A2A2A] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone size={18} className="text-[#00B8A9]" />
                <h3 className="text-base font-extrabold text-white">
                  {t.installModalTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="w-9 h-9 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] flex items-center justify-center text-[#A1A1AA] hover:text-white"
                aria-label={t.close}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5">
              <div
                className="p-3.5 rounded-2xl bg-[#0F0F0F] border space-y-1"
                style={{ borderColor: isAndroid ? '#00B8A9' : '#2A2A2A' }}
              >
                <div className="text-xs font-extrabold text-[#00B8A9] flex items-center gap-1.5">
                  <Smartphone size={14} />
                  <span>{t.androidPwaTitle}</span>
                </div>
                <p className="text-xs text-white leading-relaxed">{t.androidPwaSteps}</p>
              </div>

              <div
                className="p-3.5 rounded-2xl bg-[#0F0F0F] border space-y-1"
                style={{ borderColor: isIOS ? '#00B8A9' : '#2A2A2A' }}
              >
                <div className="text-xs font-extrabold text-[#A855F7] flex items-center gap-1.5">
                  <Share size={14} />
                  <span>{t.iphonePwaTitle}</span>
                </div>
                <p className="text-xs text-white leading-relaxed">{t.iphonePwaSteps}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-bold text-[#00B8A9]">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>{t.pwaOfflineReadyBadge}</span>
            </div>

            {isInstallable && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await install();
                  if (ok) setShowGuide(false);
                }}
                className="w-full py-3 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm flex items-center justify-center gap-2"
              >
                <Download size={15} />
                <span>{t.installNativeBtn}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-3 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-white font-extrabold text-sm"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator({ lang }: { lang: Language }) {
  const isOnline = useOnlineStatus();
  const t = DICTIONARY[lang];

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 start-4 z-50 flex items-center gap-2 rounded-full bg-[#1A1A1A] border border-[#FF6B35] px-3.5 py-2 text-xs font-bold text-[#FF6B35] shadow-lg no-print">
      <span>{t.offlineIndicatorText}</span>
    </div>
  );
}
