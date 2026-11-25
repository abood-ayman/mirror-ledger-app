import { useState } from 'react';
import {
  Box,
  Cat,
  CloudRain,
  Gamepad2,
  MapPin,
  Music2,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  AmbientSoundMode,
  AmbientSoundSettings,
  Language,
  NoorDialect,
} from '../types/tracker';
import { DICTIONARY } from '../lib/i18n';
import {
  AMBIENT_MODES,
  AMBIENT_MODE_META,
  normalizeAmbientSettings,
  selectAmbientMode,
} from '../lib/ambientAudio';
import { GeminiStudioPanel } from './GeminiStudioPanel';
import { FocusMapPanel } from './FocusMapPanel';
import { Sanctuary3DPanel } from './Sanctuary3DPanel';
import type { FocusGameSnapshot } from '../lib/focusGameRules';

export type StudioSubTab = 'ai' | 'map' | 'sanctuary';

interface StudioHubScreenProps {
  lang: Language;
  dialect: NoorDialect;
  userName?: string;
  activeSubTab?: StudioSubTab;
  onChangeSubTab?: (tab: StudioSubTab) => void;
  ambientSound?: AmbientSoundSettings;
  onChangeAmbientSound?: (next: AmbientSoundSettings) => void;
  onOpenSettings?: () => void;
  onLaunchGame: () => void;
  lastSavedGameScore?: FocusGameSnapshot | null;
}

export function StudioHubScreen({
  lang,
  dialect,
  userName,
  activeSubTab,
  onChangeSubTab,
  ambientSound,
  onChangeAmbientSound,
  onOpenSettings,
  onLaunchGame,
}: StudioHubScreenProps) {
  const t = DICTIONARY[lang];
  const isAr = lang === 'ar';
  const [internalTab, setInternalTab] = useState<StudioSubTab>('ai');
  const subTab = activeSubTab ?? internalTab;
  const setSubTab = (tab: StudioSubTab) => {
    setInternalTab(tab);
    onChangeSubTab?.(tab);
  };

  const [prefillPrompt, setPrefillPrompt] = useState<{
    id: number;
    text: string;
    grounding?: 'none' | 'search' | 'maps';
    latLng?: { latitude: number; longitude: number } | null;
  } | null>(null);

  const handleAskMapsGrounding = (
    placeName: string,
    coords: { latitude: number; longitude: number }
  ) => {
    setPrefillPrompt({
      id: Date.now(),
      text: isAr
        ? `ما رأيك في "${placeName}" كمكان هادئ للتركيز والمذاكرة؟ وما الأماكن المشابهة القريبة؟`
        : `Tell me about "${placeName}" as a quiet spot to focus and any similar quiet spots nearby.`,
      grounding: 'maps',
      latLng: coords,
    });
    setSubTab('ai');
  };

  const ambient = normalizeAmbientSettings(ambientSound);
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
    <div className="space-y-5">
      {/* Compact Header + Focus Game Launch */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg md:text-xl font-extrabold text-white">
            {t.studioHeaderTitle}
          </h1>
          <p className="text-xs text-[#A1A1AA] leading-relaxed max-w-[60ch]">
            {t.studioHeaderSub}
          </p>
        </div>

        <button
          type="button"
          data-testid="launch-focus-game-btn"
          onClick={onLaunchGame}
          className="px-4 py-3 rounded-full bg-[#FF6B35] text-[#0F0F0F] font-extrabold text-xs md:text-sm inline-flex items-center justify-center gap-2 shrink-0 min-h-[44px] hover:opacity-95 transition"
        >
          <Gamepad2 size={17} />
          <span>{t.studioTabGame}</span>
        </button>
      </div>

      {/* Quick Ambient Soundscape Bar + Settings Shortcut */}
      {onChangeAmbientSound && (
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-extrabold text-white">
            {isAudioPlaying ? (
              <Volume2 size={15} className="text-[#00B8A9]" />
            ) : (
              <VolumeX size={15} className="text-[#A1A1AA]" />
            )}
            <span>{t.ambientSectionTitle}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {AMBIENT_MODES.map((modeId) => {
              const Icon = ambientIcons[modeId];
              const accent = AMBIENT_MODE_META[modeId].accent;
              const selected =
                modeId === 'quiet'
                  ? !isAudioPlaying && ambient.mode === 'quiet'
                  : ambient.mode === modeId && isAudioPlaying;
              return (
                <button
                  key={modeId}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChangeAmbientSound(selectAmbientMode(ambient, modeId))}
                  className="px-3 py-1.5 rounded-full text-[11px] font-extrabold border inline-flex items-center gap-1.5 transition"
                  style={{
                    backgroundColor: selected ? `${accent}20` : '#0F0F0F',
                    borderColor: selected ? accent : '#2A2A2A',
                    color: selected ? accent : '#A1A1AA',
                  }}
                >
                  <Icon size={12} />
                  <span>{ambientLabels[modeId]}</span>
                </button>
              );
            })}

            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-3 py-1.5 rounded-full text-[11px] font-extrabold border border-[#2A2A2A] bg-[#0F0F0F] text-[#E4E4E7] hover:border-[#00B8A9] inline-flex items-center gap-1.5 transition"
              >
                <SlidersHorizontal size={12} className="text-[#00B8A9]" />
                <span>{t.homeOpenSettingsAudio}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sub-navigation tabs */}
      <div
        role="tablist"
        aria-label={t.studioHeaderTitle}
        className="flex flex-wrap items-center gap-2"
      >
        {(
          [
            { id: 'ai', label: t.studioTabChat, icon: Sparkles },
            { id: 'map', label: t.studioTabMap, icon: MapPin },
            { id: 'sanctuary', label: t.studioTab3D, icon: Box },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`studio-subtab-${tab.id}`}
              onClick={() => setSubTab(tab.id)}
              className="px-4 py-2.5 rounded-full text-xs font-extrabold border inline-flex items-center gap-2 transition min-h-[42px]"
              style={{
                backgroundColor: active ? '#00B8A9' : '#1A1A1A',
                borderColor: active ? '#00B8A9' : '#2A2A2A',
                color: active ? '#0F0F0F' : '#E4E4E7',
              }}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Studio Surface */}
      {subTab === 'ai' && (
        <GeminiStudioPanel
          lang={lang}
          dialect={dialect}
          userName={userName}
          prefillPrompt={prefillPrompt}
        />
      )}

      {subTab === 'map' && (
        <FocusMapPanel lang={lang} onAskMapsGrounding={handleAskMapsGrounding} />
      )}

      {subTab === 'sanctuary' && <Sanctuary3DPanel lang={lang} />}
    </div>
  );
}
