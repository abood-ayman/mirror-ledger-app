import { useRef, useState } from 'react';
import {
  Bell,
  Cat,
  Check,
  Cloud,
  CloudRain,
  Download,
  Globe2,
  Lock,
  Music2,
  PlayCircle,
  ShieldCheck,
  Smartphone,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  AmbientSoundMode,
  AmbientSoundSettings,
  AppState,
  Language,
  NoorDialect,
} from '../types/tracker';
import { DIALECT_OPTIONS, DICTIONARY } from '../lib/i18n';
import { exportStateAsJson, parseImportedJson } from '../lib/export';
import { getDefaultDialect } from '../lib/storage';
import {
  AMBIENT_MODES,
  AMBIENT_MODE_META,
  clampVolume,
  normalizeAmbientSettings,
  selectAmbientMode,
  toggleAmbientEnabled,
} from '../lib/ambientAudio';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsModalProps {
  lang: Language;
  state: AppState;
  onClose: () => void;
  onImport: (restored: AppState) => void;
  onToggleReminder: () => void;
  onChangeDialect: (dialect: NoorDialect) => void;
  onChangeAmbientSound: (next: AmbientSoundSettings) => void;
  onReplayTour: () => void;
  cloudUserEmail?: string | null;
  cloudSyncBusy?: boolean;
  onGoogleSignIn?: () => void;
  onGoogleSignOut?: () => void;
  onCloudPush?: () => void;
  onCloudPull?: () => void;
  onCloudDelete?: () => void;
}

export function SettingsModal({
  lang,
  state,
  onClose,
  onImport,
  onToggleReminder,
  onChangeDialect,
  onChangeAmbientSound,
  onReplayTour,
  cloudUserEmail,
  cloudSyncBusy,
  onGoogleSignIn,
  onGoogleSignOut,
  onCloudPush,
  onCloudPull,
  onCloudDelete,
}: SettingsModalProps) {
  const t = DICTIONARY[lang];
  const fileRef = useRef<HTMLInputElement>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [activeWalkthroughIdx, setActiveWalkthroughIdx] = useState<number>(0);

  const currentDialect: NoorDialect = state.dialect ?? getDefaultDialect(lang);
  const ambient = normalizeAmbientSettings(state.ambientSound);
  const isPlaying = ambient.enabled && ambient.mode !== 'quiet';
  const volumePct = Math.round(ambient.volume * 100);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseImportedJson(text);
    if (!parsed) {
      setStatusMsg({ text: t.importError, ok: false });
      return;
    }
    onImport(parsed);
    setStatusMsg({ text: t.importSuccess, ok: true });
  };

  const modeDetails: Record<
    AmbientSoundMode,
    { label: string; desc: string; icon: typeof CloudRain }
  > = {
    rain: {
      label: t.ambientModeRain,
      desc: t.ambientModeRainDesc,
      icon: CloudRain,
    },
    lofi: {
      label: t.ambientModeLofi,
      desc: t.ambientModeLofiDesc,
      icon: Music2,
    },
    purr: {
      label: t.ambientModePurr,
      desc: t.ambientModePurrDesc,
      icon: Cat,
    },
    quiet: {
      label: t.ambientModeQuiet,
      desc: t.ambientModeQuietDesc,
      icon: VolumeX,
    },
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.backupTitle}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
    >
      <div className="w-full max-w-[510px] max-h-[90vh] overflow-y-auto bg-[#1A1A1A] border border-[#2A2A2A] rounded-t-[24px] md:rounded-[20px] p-5 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-[#00B8A9]" />
            <h2 className="text-lg font-extrabold text-white">{t.backupTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="w-11 h-11 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] flex items-center justify-center text-[#A1A1AA] hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Global Ambient Sounds Controls */}
        <section
          data-testid="ambient-sounds-settings"
          aria-labelledby="ambient-sounds-heading"
          className="bg-[#0F0F0F] border border-[#2A2A2A] rounded-2xl p-4 space-y-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                {isPlaying ? (
                  <Volume2 size={16} className="text-[#00B8A9]" />
                ) : (
                  <VolumeX size={16} className="text-[#A1A1AA]" />
                )}
                <h3
                  id="ambient-sounds-heading"
                  className="text-sm font-extrabold text-white"
                >
                  {t.ambientSectionTitle}
                </h3>
              </div>
              <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                {t.ambientSectionSub}
              </p>
            </div>
            <span
              data-testid="ambient-status-text"
              className="text-[11px] font-extrabold whitespace-nowrap shrink-0 tabular-nums"
              style={{ color: isPlaying ? '#00B8A9' : '#71717A' }}
            >
              {isPlaying ? t.ambientPlayingBadge : t.ambientStatusOff}
            </span>
          </div>

          {/* Global Master ON/OFF Toggle */}
          <button
            type="button"
            data-testid="ambient-toggle-btn"
            aria-pressed={isPlaying}
            onClick={() => onChangeAmbientSound(toggleAmbientEnabled(ambient))}
            className="w-full py-2.5 px-3.5 rounded-xl bg-[#1A1A1A] border flex items-center justify-between gap-3 min-h-[44px] transition"
            style={{
              borderColor: isPlaying ? '#00B8A9' : '#2A2A2A',
            }}
          >
            <span className="text-xs font-extrabold text-white">
              {t.ambientMasterToggle}
            </span>
            <span className="flex items-center gap-2.5 shrink-0">
              <span
                className="text-[11px] font-extrabold whitespace-nowrap"
                style={{ color: isPlaying ? '#00B8A9' : '#A1A1AA' }}
              >
                {isPlaying ? t.ambientStatusOn : t.ambientStatusOff}
              </span>
              <span
                aria-hidden="true"
                className="w-10 h-5 rounded-full p-0.5 flex items-center transition-colors"
                style={{
                  backgroundColor: isPlaying ? '#00B8A9' : '#2A2A2A',
                  justifyContent: isPlaying ? 'flex-end' : 'flex-start',
                }}
              >
                <span className="w-4 h-4 rounded-full bg-[#0F0F0F] shadow-sm" />
              </span>
            </span>
          </button>

          {/* Audio Mode Selector Grid */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-[#A1A1AA]">
              {t.ambientModeLabel}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {AMBIENT_MODES.map((modeId) => {
                const detail = modeDetails[modeId];
                const Icon = detail.icon;
                const accent = AMBIENT_MODE_META[modeId].accent;
                const selected =
                  modeId === 'quiet'
                    ? !isPlaying && ambient.mode === 'quiet'
                    : ambient.mode === modeId && isPlaying;
                const isLastSelectedSound = ambient.mode === modeId && modeId !== 'quiet';

                return (
                  <button
                    key={modeId}
                    type="button"
                    data-ambient-mode={modeId}
                    aria-pressed={selected}
                    onClick={() => onChangeAmbientSound(selectAmbientMode(ambient, modeId))}
                    className="p-3 rounded-xl bg-[#1A1A1A] border text-start flex flex-col justify-between gap-1.5 min-h-[58px] transition"
                    style={{
                      borderColor: selected
                        ? accent
                        : isLastSelectedSound
                        ? `${accent}55`
                        : '#2A2A2A',
                      backgroundColor: selected ? `${accent}16` : '#1A1A1A',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 w-full">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Icon
                          size={15}
                          style={{ color: selected || isLastSelectedSound ? accent : '#A1A1AA' }}
                          className="shrink-0"
                        />
                        <span className="text-xs font-extrabold text-white truncate">
                          {detail.label}
                        </span>
                      </span>
                      {selected && (
                        <Check size={13} style={{ color: accent }} className="shrink-0" />
                      )}
                    </div>
                    <span className="text-[11px] text-[#A1A1AA] leading-snug line-clamp-1">
                      {detail.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Volume Control */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="ambient-volume-range"
                className="font-bold text-[#E4E4E7]"
              >
                {t.ambientVolumeLabel}
              </label>
              <span className="font-extrabold text-[#00B8A9] tabular-nums">
                {volumePct}%
              </span>
            </div>
            <input
              id="ambient-volume-range"
              data-testid="ambient-volume-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={volumePct}
              aria-label={t.ambientVolumeLabel}
              onChange={(e) =>
                onChangeAmbientSound({
                  ...ambient,
                  volume: clampVolume(Number(e.target.value) / 100),
                })
              }
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[#2A2A2A] accent-[#00B8A9]"
            />
          </div>
        </section>

        {/* Privacy Architecture Notice */}
        <div className="bg-[#0F0F0F] border border-[#00B8A9]/40 rounded-2xl p-3.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#00B8A9]">
            <Lock size={14} />
            <span>{t.privacyArchitectureTitle}</span>
          </div>
          <p className="text-xs leading-relaxed text-[#E4E4E7]">{t.privacyNotice}</p>

          <p className="text-[11px] leading-relaxed text-[#A1A1AA]">
            {lang === 'ar'
              ? 'كل بياناتك بتتحفظ على جهازك بس. لو سجلت بجوجل وضغطت "رفع"، نسخة بتتحفظ في حسابك وتقدر تمسحها في أي وقت. السيرفر مش بيحفظ إيميلك ولا اسمك ولا صورتك.'
              : 'Your data is saved on this device only. If you sign in with Google and press sync, a copy is saved to your account and you can delete it at any time. The server does not store your email, name or photo.'}
          </p>
        </div>

        {/* Optional Google + Cloud SQL Sync */}
        {onGoogleSignIn && (
          <section
            data-testid="cloud-sync-settings"
            className="bg-[#0F0F0F] border border-[#2A2A2A] rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                  <Cloud size={15} className="text-[#00B8A9]" />
                  <span>{t.cloudSyncTitle}</span>
                </div>
                <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                  {t.cloudSyncSub}
                </p>
              </div>
            </div>

            {cloudUserEmail ? (
              <div className="space-y-2.5">
                <div className="px-3 py-2 rounded-xl bg-[#1A1A1A] border border-[#00B8A9]/40 text-xs font-bold text-[#00B8A9] truncate">
                  {cloudUserEmail}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={cloudSyncBusy}
                    onClick={() => {
                      const ok = window.confirm(
                        lang === 'ar'
                          ? 'بياناتك هتتحفظ في حسابك على السحابة، وتقدر تمسحها في أي وقت من الإعدادات. تكمل؟'
                          : 'Your data will be saved to your cloud account. You can delete it at any time from Settings. Continue?'
                      );
                      if (ok) onCloudPush?.();
                    }}
                    className="py-2.5 px-3 rounded-full bg-[#00B8A9] text-[#0F0F0F] text-xs font-extrabold min-h-[40px] disabled:opacity-50"
                  >
                    {cloudSyncBusy ? t.cloudSyncing : t.cloudSyncNow}
                  </button>
                  <button
                    type="button"
                    disabled={cloudSyncBusy}
                    onClick={onCloudPull}
                    className="py-2.5 px-3 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] text-white text-xs font-extrabold min-h-[40px] disabled:opacity-50"
                  >
                    {t.cloudLoadFromCloud}
                  </button>
                </div>
                {onGoogleSignOut && (
                  <button
                    type="button"
                    onClick={onGoogleSignOut}
                    className="w-full py-2 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] text-[11px] font-bold text-[#A1A1AA] hover:text-[#FF6B35]"
                  >
                    {t.cloudSignOutGoogle}
                  </button>
                )}
                {onCloudDelete && (
                  <button
                    type="button"
                    data-testid="settings-delete-cloud-account-btn"
                    disabled={cloudSyncBusy}
                    onClick={onCloudDelete}
                    className="w-full py-2 rounded-full bg-[#1A1A1A] border border-[#FF6B35]/50 text-[11px] font-bold text-[#FF6B35] disabled:opacity-50"
                  >
                    {lang === 'ar' ? 'امسح حسابي وبياناتي من السحابة' : 'Delete my account and cloud data'}
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                data-testid="settings-google-signin-btn"
                disabled={cloudSyncBusy}
                onClick={onGoogleSignIn}
                className="w-full py-2.5 px-4 rounded-full bg-[#1A1A1A] border border-[#00B8A9]/60 hover:border-[#00B8A9] text-xs font-extrabold text-[#00B8A9] min-h-[42px]"
              >
                {t.cloudSignInGoogle}
              </button>
            )}
          </section>
        )}

        {/* How to Use Video-like Walkthrough Section + Replay Tour */}
        <div
          data-testid="settings-walkthrough"
          className="bg-[#0F0F0F] border border-[#2A2A2A] rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-white">{t.walkthroughTitle}</h3>
              <p className="text-[11px] text-[#A1A1AA]">{t.walkthroughSub}</p>
            </div>
            <button
              type="button"
              data-testid="replay-tour-btn"
              onClick={() => {
                onClose();
                onReplayTour();
              }}
              className="px-3 py-2 rounded-full bg-[#00B8A9]/15 border border-[#00B8A9] text-[#00B8A9] text-[11px] font-extrabold inline-flex items-center gap-1.5 shrink-0 min-h-[44px]"
            >
              <PlayCircle size={13} />
              <span>{t.replayTourBtn}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {t.walkthroughCards.map((card, idx) => {
              const active = activeWalkthroughIdx === idx;
              const isFullRow =
                idx === t.walkthroughCards.length - 1 && t.walkthroughCards.length % 2 === 1;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveWalkthroughIdx(idx)}
                  className={`text-start p-3 rounded-xl bg-[#1A1A1A] border transition space-y-1.5 ${
                    isFullRow ? 'sm:col-span-2' : ''
                  }`}
                  style={{
                    borderColor: active ? '#00B8A9' : '#2A2A2A',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-white leading-snug">
                      {card.title}
                    </span>
                    <span
                      className="text-[10px] font-extrabold tabular-nums shrink-0"
                      style={{ color: active ? '#00B8A9' : '#71717A' }}
                    >
                      0{idx + 1}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#E4E4E7] leading-relaxed">{card.line1}</p>
                  <p className="text-[11px] text-[#A1A1AA] leading-relaxed">{card.line2}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dialect Selector */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
            <Globe2 size={14} className="text-[#00B8A9]" />
            <span>{t.dialectSettingsLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DIALECT_OPTIONS.map((opt) => {
              const selected = currentDialect === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-settings-dialect={opt.id}
                  aria-pressed={selected}
                  onClick={() => onChangeDialect(opt.id)}
                  className="px-3 py-2.5 rounded-xl bg-[#0F0F0F] border text-start flex items-center justify-between gap-2 transition min-h-[44px]"
                  style={{
                    borderColor: selected ? '#00B8A9' : '#2A2A2A',
                    backgroundColor: selected ? '#00B8A916' : '#0F0F0F',
                  }}
                >
                  <span className="text-xs font-extrabold text-white truncate">
                    {lang === 'ar' ? opt.labelAr : opt.labelEn}
                  </span>
                  {selected && (
                    <Check size={14} className="text-[#00B8A9] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Backup, Install & Reminder Controls */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => exportStateAsJson(state)}
            className="w-full py-3.5 px-4 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm flex items-center justify-center gap-2 min-h-[44px]"
          >
            <Download size={17} />
            <span>{t.exportJsonBtn}</span>
          </button>

          <button
            type="button"
            data-testid="settings-delete-local-data-btn"
            onClick={() => {
              const ar = lang === 'ar';
              const ok = window.confirm(
                ar
                  ? 'هتتمسح كل بياناتك المحفوظة على الجهاز ده (الحسابات المحلية والتقارير والإعدادات). لو عايز نسخة، صدّر بياناتك الأول. الحساب السحابي لو موجود بيتمسح من زرار منفصل. تكمل؟'
                  : 'This erases all data saved on this device (local accounts, logs, settings). Export first if you want a copy. A cloud account, if you have one, is deleted with its own button. Continue?'
              );
              if (!ok) return;
              try {
                window.localStorage.clear();
                window.sessionStorage.clear();
              } catch {
                // storage blocked: nothing to clear
              }
              window.location.reload();
            }}
            className="w-full py-3 px-4 rounded-full bg-[#0F0F0F] border border-[#FF6B35]/50 text-[#FF6B35] font-bold text-sm min-h-[44px]"
          >
            {lang === 'ar' ? 'امسح كل البيانات المحلية' : 'Delete all local data'}
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full py-3.5 px-4 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-white font-bold text-sm flex items-center justify-center gap-2 hover:border-[#A855F7] min-h-[44px]"
          >
            <Upload size={17} className="text-[#A855F7]" />
            <span>{t.importJsonBtn}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />

          <PWAInstallButton lang={lang} />

          <button
            type="button"
            onClick={onToggleReminder}
            className="w-full py-3 px-4 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] text-xs font-bold flex items-center justify-between min-h-[44px]"
          >
            <span className="flex items-center gap-2 text-white">
              <Bell size={15} className="text-[#FF6B35]" />
              {t.enableEveningNotif}
            </span>
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px]"
              style={{
                backgroundColor: state.eveningReminderEnabled ? '#00B8A922' : '#2A2A2A',
                color: state.eveningReminderEnabled ? '#00B8A9' : '#A1A1AA',
              }}
            >
              {state.eveningReminderEnabled ? t.notifEnabled : 'OFF'}
            </span>
          </button>
        </div>

        {statusMsg && (
          <div
            className="text-xs font-bold p-3 rounded-xl border"
            style={{
              borderColor: statusMsg.ok ? '#00B8A9' : '#FF6B35',
              color: statusMsg.ok ? '#00B8A9' : '#FF6B35',
            }}
          >
            {statusMsg.text}
          </div>
        )}

        <div className="p-3.5 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold text-white">
              <Smartphone size={15} className="text-[#00B8A9]" />
              <span>{t.installModalTitle}</span>
            </div>
            <span className="text-[10px] font-bold text-[#00B8A9]">
              {t.pwaOfflineReadyBadge}
            </span>
          </div>
          <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
            {t.androidPwaSteps}
          </p>
          <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
            {t.iphonePwaSteps}
          </p>
        </div>
      </div>
    </div>
  );
}
