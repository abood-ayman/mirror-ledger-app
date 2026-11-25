import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Compass,
  FileText,
  HelpCircle,
  Home,
  LogOut,
  Settings,
  Sparkles,
} from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import type {
  ActionConfig,
  AmbientSoundSettings,
  AppState,
  DailyLog,
  Language,
  NoorDialect,
  NoorMode,
  NoorPreference,
  ScreenTab,
} from '../types/tracker';
import { DICTIONARY } from '../lib/i18n';
import { getEnabledActions } from '../lib/analytics';
import { ambientAudioEngine, normalizeAmbientSettings } from '../lib/ambientAudio';
import {
  calculateDayPoints,
  getActiveUsername,
  getInitialState,
  getLevelInfo,
  getTodayKey,
  hasSeenIntro,
  loadGlobalLanguage,
  loadUserAppState,
  logoutLocalAccount,
  markIntroSeen,
  markTourDoneStorage,
  recalculateAllPoints,
  resetTourDoneStorage,
  saveGlobalDialect,
  saveGlobalLanguage,
  saveUserAppState,
} from '../lib/storage';
import { AppIntroScreen } from './AppIntroScreen';
import { AuthScreen } from './AuthScreen';
import { OnboardingFlow } from './OnboardingFlow';
import { DailyCheckInScreen } from './DailyCheckInScreen';
import { DashboardScreen } from './DashboardScreen';
import { ReportScreen } from './ReportScreen';
import { CheckInModal } from './CheckInModal';
import { SetupActionsModal } from './SetupActionsModal';
import { SettingsModal } from './SettingsModal';
import { OfflineIndicator } from './PWAInstallButton';
import { NoorCompanion } from './NoorCompanion';
import { AddTaskModal } from './AddTaskModal';
import { HelpSheetModal } from './HelpSheetModal';
import { InteractiveTour } from './InteractiveTour';
import type { HelpScreenKey, NoorProposal } from '../lib/noor';
import { StudioHubScreen, type StudioSubTab } from './StudioHubScreen';
import { FocusGameOverlay } from './FocusGameOverlay';
import {
  firebaseAuth,
  getFreshIdToken,
  onAuthStateChanged,
  signInWithGoogle,
  signOutGoogle,
  type FirebaseUser,
} from '../lib/firebase';
import { getDefaultDialect, registerExternalAccount } from '../lib/storage';

export default function AppShell() {
  const [activeUsername, setActiveUsername] = useState<string | null>(() =>
    getActiveUsername()
  );
  const [state, setState] = useState<AppState>(() => {
    const active = getActiveUsername();
    if (!active) {
      return getInitialState(loadGlobalLanguage());
    }
    const loaded = loadUserAppState(active);
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('autostart') === '1' &&
      !loaded.onboarded
    ) {
      return { ...loaded, onboarded: true };
    }
    return loaded;
  });

  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [introDone, setIntroDone] = useState<boolean>(() =>
    isAutostart ? true : hasSeenIntro()
  );
  const [activeTab, setActiveTab] = useState<ScreenTab>('checkin');
  const [studioSubTab, setStudioSubTab] = useState<StudioSubTab>('ai');
  const [checkInModal, setCheckInModal] = useState<{
    open: boolean;
    allowPast: boolean;
  }>({ open: false, allowPast: false });
  const [setupOpen, setSetupOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [forceTourOpen, setForceTourOpen] = useState(false);
  const [levelUpCelebration, setLevelUpCelebration] = useState<number | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [noorExternalPrompt, setNoorExternalPrompt] = useState<{
    id: number;
    query?: string;
    openMode?: NoorMode;
  } | null>(null);
  const [gameOpen, setGameOpen] = useState(false);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [cloudSyncBusy, setCloudSyncBusy] = useState(false);

  useEffect(() => {
    try {
      registerSW({ immediate: true });
    } catch {
      // Ignore registration error in unsupported contexts
    }
    const unsubAuth = onAuthStateChanged(firebaseAuth, (user) => {
      setFirebaseUser(user);
    });
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => {
      unsubAuth();
      window.removeEventListener('gmp-quota-exceeded', onQuota);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = state.language;
    document.documentElement.dir = state.language === 'ar' ? 'rtl' : 'ltr';
    if (activeUsername) {
      saveUserAppState(activeUsername, state);
    } else {
      saveGlobalLanguage(state.language);
    }
  }, [activeUsername, state]);

  useEffect(() => {
    if (!activeUsername) {
      ambientAudioEngine.applySettings({ enabled: false, mode: 'rain', volume: 0.45 });
      return;
    }
    ambientAudioEngine.applySettings(normalizeAmbientSettings(state.ambientSound));
  }, [activeUsername, state.ambientSound]);

  useEffect(() => {
    return () => {
      ambientAudioEngine.dispose();
    };
  }, []);

  useEffect(() => {
    if (!activeUsername || !state.eveningReminderEnabled) return;
    const hour = new Date().getHours();
    const today = getTodayKey();
    if (
      hour >= 22 &&
      !state.logs[today] &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      new Notification(DICTIONARY[state.language].appName, {
        body: DICTIONARY[state.language].eveningReminder,
      });
    }
  }, [activeUsername, state.eveningReminderEnabled, state.logs, state.language]);

  const lang: Language = state.language;
  const t = DICTIONARY[lang];

  const toggleLanguage = () => {
    setState((prev) => ({
      ...prev,
      language: prev.language === 'ar' ? 'en' : 'ar',
    }));
  };

  const handleAuthenticated = (username: string) => {
    const userState = loadUserAppState(username);
    // Preserve current language choice if user toggled language on AuthScreen before logging in
    const syncedState: AppState = {
      ...userState,
      language: state.language,
      onboarded: isAutostart ? true : userState.onboarded,
    };
    setActiveUsername(username);
    setState(syncedState);
    setActiveTab('checkin');
    setCheckInModal({ open: false, allowPast: false });
    setSetupOpen(false);
    setAddTaskOpen(false);
    setBackupOpen(false);
  };

  const handleGoogleSignIn = async () => {
    setCloudSyncBusy(true);
    try {
      const user = await signInWithGoogle();
      setFirebaseUser(user);
      if (!activeUsername) {
        const localName = user.email || `google_${user.uid.slice(0, 8)}`;
        registerExternalAccount(localName, user.uid, state.language);
        const userState = loadUserAppState(localName);
        setActiveUsername(localName);
        setState({
          ...userState,
          language: state.language,
          userName: userState.userName || user.displayName || undefined,
        });
      }
      setStatusToast(DICTIONARY[state.language].cloudSyncedSuccess);
      setTimeout(() => setStatusToast(null), 2200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in cancelled';
      setStatusToast(`${DICTIONARY[state.language].cloudErrorPrefix} ${msg}`);
      setTimeout(() => setStatusToast(null), 2800);
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogle();
    setFirebaseUser(null);
  };

  const handleCloudPush = async () => {
    if (!firebaseUser) return;
    setCloudSyncBusy(true);
    try {
      const token = await getFreshIdToken(firebaseUser);
      const res = await fetch('/api/cloud/state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          language: state.language,
          dialect: state.dialect ?? getDefaultDialect(state.language),
          userName: state.userName,
          actions: state.actions,
          logs: state.logs,
          totalPoints: state.totalPoints,
        }),
      });
      if (!res.ok) {
        let detail = '';
        try {
          const j = (await res.json()) as { error?: string; errorAr?: string };
          detail = (state.language === 'ar' ? j.errorAr : j.error) ?? '';
        } catch {
          // non-JSON error body: keep the generic message
        }
        throw new Error(detail || 'Sync failed');
      }
      setStatusToast(DICTIONARY[state.language].cloudSyncedSuccess);
      setTimeout(() => setStatusToast(null), 2200);
    } catch (err) {
      const detail = err instanceof Error && err.message !== 'Sync failed' ? err.message : '';
      setStatusToast(
        `${DICTIONARY[state.language].cloudErrorPrefix} ${detail || DICTIONARY[state.language].cloudSyncTitle}`
      );
      setTimeout(() => setStatusToast(null), 2600);
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const handleCloudPull = async () => {
    if (!firebaseUser) return;
    setCloudSyncBusy(true);
    try {
      const token = await getFreshIdToken(firebaseUser);
      const res = await fetch('/api/cloud/state', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Fetch failed');
      const data = (await res.json()) as {
        synced?: boolean;
        state?: {
          language?: Language;
          dialect?: NoorDialect;
          userName?: string;
          actions?: ActionConfig[];
          logs?: Record<string, DailyLog>;
          totalPoints?: number;
        };
      };
      if (data.synced && data.state) {
        setState((prev) => ({
          ...prev,
          language: data.state!.language ?? prev.language,
          dialect: data.state!.dialect ?? prev.dialect,
          userName: data.state!.userName ?? prev.userName,
          actions: Array.isArray(data.state!.actions) ? data.state!.actions : prev.actions,
          logs: data.state!.logs ?? prev.logs,
          totalPoints: data.state!.totalPoints ?? prev.totalPoints,
          onboarded: true,
        }));
        setStatusToast(DICTIONARY[state.language].cloudLoadedSuccess);
      } else {
        setStatusToast(DICTIONARY[state.language].cloudSyncedSuccess);
      }
      setTimeout(() => setStatusToast(null), 2400);
    } catch {
      setStatusToast(
        `${DICTIONARY[state.language].cloudErrorPrefix} ${DICTIONARY[state.language].cloudLoadFromCloud}`
      );
      setTimeout(() => setStatusToast(null), 2600);
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const handleCloudDeleteAccount = async () => {
    if (!firebaseUser) return;
    const ar = state.language === 'ar';
    const ok = window.confirm(
      ar
        ? 'هتتمسح حسابك وكل بياناتك المخزنة في السحابة نهائيا. بياناتك على الجهاز مش هتتأثر. تكمل؟'
        : 'This permanently deletes your account and everything stored for it in the cloud. Data on this device is not affected. Continue?'
    );
    if (!ok) return;
    setCloudSyncBusy(true);
    try {
      const token = await getFreshIdToken(firebaseUser);
      const res = await fetch('/api/cloud/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      await signOutGoogle();
      setFirebaseUser(null);
      setStatusToast(ar ? 'اتمسح الحساب وبياناته من السحابة.' : 'Account and cloud data deleted.');
      setTimeout(() => setStatusToast(null), 2600);
    } catch {
      setStatusToast(ar ? 'مقدرناش نمسح الحساب دلوقتي. جرب تاني.' : 'Could not delete the account right now. Try again.');
      setTimeout(() => setStatusToast(null), 2800);
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const handleLogout = () => {
    ambientAudioEngine.applySettings({ enabled: false, mode: 'rain', volume: 0.45 });
    logoutLocalAccount();
    setActiveUsername(null);
    setState(getInitialState(state.language));
    setActiveTab('checkin');
    setCheckInModal({ open: false, allowPast: false });
    setSetupOpen(false);
    setAddTaskOpen(false);
    setBackupOpen(false);
    setLevelUpCelebration(null);
  };

  const handleOnboardingComplete = ({
    selectedActions,
    userName,
    dialect,
    noorPreference,
  }: {
    selectedActions: ActionConfig[];
    userName: string;
    dialect: NoorDialect;
    noorPreference: NoorPreference;
  }) => {
    saveGlobalDialect(dialect);
    setState((prev) => ({
      ...prev,
      onboarded: true,
      userName,
      dialect,
      noorPreference,
      actions: selectedActions,
    }));
    setActiveTab('checkin');
  };

  const handleChangeDialect = (dialect: NoorDialect) => {
    saveGlobalDialect(dialect);
    setState((prev) => ({
      ...prev,
      dialect,
    }));
  };

  const handleChangeMode = (noorMode: NoorMode) => {
    setState((prev) => ({
      ...prev,
      noorMode,
    }));
  };

  const handleChangeAmbientSound = (next: AmbientSoundSettings) => {
    const normalized = ambientAudioEngine.applySettings(next);
    setState((prev) => ({
      ...prev,
      ambientSound: normalized,
    }));
  };

  const handleDeclineLoggingToday = (todayKey: string) => {
    setState((prev) => ({
      ...prev,
      noorDeclinedLogDate: todayKey,
      noorLastLogNudgeDate: todayKey,
    }));
  };

  const handleStartTenMinTimer = () => {
    setState((prev) => ({
      ...prev,
      enabledFeatures: {
        ...(prev.enabledFeatures ?? {}),
        tenMinTimer: true,
      },
    }));
  };

  const handleFinishIntro = () => {
    markIntroSeen();
    setIntroDone(true);
  };

  const handleCompleteTour = () => {
    markTourDoneStorage();
    setForceTourOpen(false);
    setState((prev) => ({
      ...prev,
      tourDone: true,
    }));
  };

  const handleReplayTour = () => {
    resetTourDoneStorage();
    setActiveTab('checkin');
    setBackupOpen(false);
    setHelpOpen(false);
    setState((prev) => ({
      ...prev,
      tourDone: false,
    }));
    setForceTourOpen(true);
  };

  const handleQuickAddAction = (newTask: ActionConfig) => {
    setState((prev) => {
      const nextActions = [...prev.actions, newTask];
      return {
        ...prev,
        actions: nextActions,
        totalPoints: recalculateAllPoints(prev.logs, nextActions),
      };
    });
    setStatusToast(t.noorActionDone);
    setTimeout(() => setStatusToast(null), 2200);
  };

  const handleSaveLog = (log: DailyLog) => {
    setState((prev) => {
      const updatedLog: DailyLog = {
        ...log,
        pointsEarned: calculateDayPoints(log, prev.actions),
      };
      const nextLogs = {
        ...prev.logs,
        [log.date]: updatedLog,
      };
      const totalPoints = recalculateAllPoints(nextLogs, prev.actions);
      const newLevel = getLevelInfo(totalPoints).level;

      if (newLevel > prev.lastCelebratedLevel) {
        setLevelUpCelebration(newLevel);
      }

      return {
        ...prev,
        logs: nextLogs,
        totalPoints,
        lastCelebratedLevel: Math.max(prev.lastCelebratedLevel, newLevel),
      };
    });
    setCheckInModal({ open: false, allowPast: false });
    setStatusToast(t.savedToast);
    setTimeout(() => setStatusToast(null), 2200);
  };

  const handleLowerGoal = (actionId: string) => {
    setState((prev) => ({
      ...prev,
      actions: prev.actions.map((a) => {
        if (a.id !== actionId) return a;
        const base = a.weeklyGoal ?? 105;
        return { ...a, weeklyGoal: Math.max(7, Math.round(base * 0.7)) };
      }),
    }));
    setStatusToast(t.goalLoweredToast);
    setTimeout(() => setStatusToast(null), 2600);
  };

  const handleToggleEveningReminder = async () => {
    if (!state.eveningReminderEnabled && typeof Notification !== 'undefined') {
      if (Notification.permission === 'default') {
        await Notification.requestPermission().catch(() => {});
      }
    }
    setState((prev) => ({
      ...prev,
      eveningReminderEnabled: !prev.eveningReminderEnabled,
    }));
  };

  const handleDismissDailyPrompt = (todayKey: string) => {
    setState((prev) => ({
      ...prev,
      noorLastPromptDate: todayKey,
      noorPromptDismissedDate: todayKey,
    }));
  };

  const handleMarkPromptAccepted = (todayKey: string) => {
    setState((prev) => ({
      ...prev,
      noorLastPromptDate: todayKey,
    }));
  };

  const handleAnswerDailyQuestion = (
    question: string,
    answer: string,
    todayKey: string
  ) => {
    setState((prev) => {
      const existing = prev.logs[todayKey];
      const combinedWhy = existing?.feelingWhy
        ? `${existing.feelingWhy} | ${answer}`
        : answer;
      const updatedLog: DailyLog = {
        date: todayKey,
        entries: existing?.entries ?? {},
        energy: existing?.energy ?? 7,
        focus: existing?.focus ?? 6,
        feelingWhy: combinedWhy,
        quickNote: existing?.quickNote ?? '',
        pointsEarned: existing?.pointsEarned ?? 0,
        updatedAt: new Date().toISOString(),
      };
      updatedLog.pointsEarned = calculateDayPoints(updatedLog, prev.actions);
      const nextLogs = { ...prev.logs, [todayKey]: updatedLog };
      const totalPoints = recalculateAllPoints(nextLogs, prev.actions);
      return {
        ...prev,
        noorLastQuestionDate: todayKey,
        noorNotes: {
          ...(prev.noorNotes ?? {}),
          [todayKey]: {
            date: todayKey,
            question,
            answer,
            createdAt: new Date().toISOString(),
          },
        },
        logs: nextLogs,
        totalPoints,
      };
    });
  };

  const handleSkipDailyQuestion = (todayKey: string) => {
    setState((prev) => ({
      ...prev,
      noorLastQuestionDate: todayKey,
    }));
  };

  const handleApplyProposal = (proposal: NoorProposal) => {
    setState((prev) => {
      if (proposal.kind === 'add_action') {
        const existingDisabled = prev.actions.find(
          (a) => !a.enabled && (a.nameAr === proposal.nameAr || a.nameEn === proposal.nameEn)
        );
        const nextActions = existingDisabled
          ? prev.actions.map((a) =>
              a.id === existingDisabled.id
                ? { ...a, enabled: true, weeklyGoal: proposal.weeklyGoal }
                : a
            )
          : [
              ...prev.actions,
              {
                id: `noor_${Date.now()}`,
                nameAr: proposal.nameAr,
                nameEn: proposal.nameEn,
                unit: proposal.unit,
                color: proposal.color,
                icon: 'target' as const,
                weeklyGoal: proposal.weeklyGoal,
                enabled: true,
              },
            ];
        return {
          ...prev,
          actions: nextActions,
          totalPoints: recalculateAllPoints(prev.logs, nextActions),
        };
      }
      if (proposal.kind === 'edit_action') {
        const nextActions = prev.actions.map((a) =>
          a.id === proposal.actionId
            ? {
                ...a,
                nameAr: proposal.newNameAr,
                nameEn: proposal.newNameEn,
                weeklyGoal: proposal.newWeeklyGoal,
              }
            : a
        );
        return { ...prev, actions: nextActions };
      }
      if (proposal.kind === 'remove_action') {
        const nextActions = prev.actions.map((a) =>
          a.id === proposal.actionId ? { ...a, enabled: false } : a
        );
        return {
          ...prev,
          actions: nextActions,
          totalPoints: recalculateAllPoints(prev.logs, nextActions),
        };
      }
      if (proposal.kind === 'change_color') {
        return {
          ...prev,
          accentColor: proposal.newAccentColor,
        };
      }
      if (proposal.kind === 'add_feature') {
        if (proposal.feature === 'eveningReminder') {
          return { ...prev, eveningReminderEnabled: true };
        }
        return {
          ...prev,
          enabledFeatures: {
            ...(prev.enabledFeatures ?? {}),
            tenMinTimer: true,
          },
        };
      }
      return prev;
    });
    setStatusToast(t.noorActionDone);
    setTimeout(() => setStatusToast(null), 2200);
  };

  const navItems: { id: ScreenTab; label: string; icon: typeof Home }[] = [
    { id: 'checkin', label: t.navCheckIn, icon: Home },
    { id: 'dashboard', label: t.navDashboard, icon: BarChart3 },
    { id: 'report', label: t.navReport, icon: FileText },
  ];

  const isSignedInAndOnboarded = Boolean(activeUsername) && state.onboarded;
  const shouldShowTour =
    isSignedInAndOnboarded && (forceTourOpen || (!state.tourDone && !isAutostart));
  const currentHelpScreen: HelpScreenKey = !activeUsername
    ? 'auth'
    : !state.onboarded
    ? 'onboarding'
    : activeTab === 'dashboard'
    ? 'dashboard'
    : activeTab === 'report'
    ? 'report'
    : activeTab === 'studio'
    ? 'studio'
    : 'home';

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white pb-36 md:pb-36 overflow-x-hidden">
      {mapsQuotaExceeded && (
        <div
          role="status"
          className="sticky top-0 z-50 bg-[#F59E0B] text-[#0F0F0F] px-4 py-2 text-xs font-extrabold flex items-center justify-center gap-2 text-center"
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span>{t.mapsQuotaBanner}</span>
          <a
            href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-extrabold"
          >
            {t.mapsQuotaLearnMore}
          </a>
        </div>
      )}
      <header className="sticky top-0 z-40 bg-[#0F0F0F]/95 backdrop-blur-md border-b border-[#2A2A2A] no-print">
        <div className="mx-auto max-w-[430px] md:max-w-[1100px] px-4 md:px-6 min-h-16 py-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden min-[420px]:flex items-center gap-1" aria-hidden="true">
              <span className="w-3.5 h-3.5 rounded-full bg-[#00B8A9] inline-block" />
              <span className="w-3.5 h-3.5 rounded-full bg-[#FF6B35] inline-block" />
            </div>
            <span className="text-base md:text-lg font-extrabold text-white whitespace-nowrap">
              {t.appName}
            </span>
          </div>

          {isSignedInAndOnboarded && (
            <nav aria-label="Primary" className="hidden md:flex items-center gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                const tourAttr =
                  item.id === 'dashboard'
                    ? 'nav-dashboard'
                    : item.id === 'report'
                    ? 'nav-report'
                    : item.id === 'studio'
                    ? 'nav-studio'
                    : undefined;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-tour-target={tourAttr}
                    onClick={() => setActiveTab(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className="px-4 py-2 rounded-full text-xs font-extrabold flex items-center gap-2 transition whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: active ? '#1A1A1A' : 'transparent',
                      border: active ? '1px solid #00B8A9' : '1px solid transparent',
                      color: active ? '#00B8A9' : '#A1A1AA',
                    }}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 max-[359px]:w-full max-[359px]:justify-between">
            {isSignedInAndOnboarded && (
              <button
                type="button"
                data-tour-target="nav-studio"
                data-testid="header-studio-btn"
                onClick={() => setActiveTab('studio')}
                aria-label={t.navStudio}
                aria-current={activeTab === 'studio' ? 'page' : undefined}
                title={t.navStudio}
                className="w-9 h-9 max-[359px]:w-11 max-[359px]:h-11 rounded-full bg-[#1A1A1A] border flex items-center justify-center transition shrink-0"
                style={{
                  borderColor: activeTab === 'studio' ? '#00B8A9' : '#2A2A2A',
                  color: activeTab === 'studio' ? '#00B8A9' : '#E4E4E7',
                }}
              >
                <Compass size={16} />
              </button>
            )}

            {isSignedInAndOnboarded && (
              <button
                type="button"
                data-testid="header-settings-btn"
                onClick={() => setBackupOpen(true)}
                aria-label={t.settingsBtnAria}
                title={t.settingsBtnAria}
                className="w-9 h-9 max-[359px]:w-11 max-[359px]:h-11 rounded-full bg-[#1A1A1A] border flex items-center justify-center transition shrink-0"
                style={{
                  borderColor:
                    state.ambientSound?.enabled && state.ambientSound?.mode !== 'quiet'
                      ? '#00B8A9'
                      : '#2A2A2A',
                  color:
                    state.ambientSound?.enabled && state.ambientSound?.mode !== 'quiet'
                      ? '#00B8A9'
                      : '#E4E4E7',
                }}
              >
                <Settings size={16} />
              </button>
            )}

            <button
              type="button"
              data-testid="help-btn"
              data-tour-target="help-btn"
              onClick={() => setHelpOpen(true)}
              aria-label={t.helpBtnAria}
              title={t.helpBtnAria}
              className="w-9 h-9 max-[359px]:w-11 max-[359px]:h-11 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] flex items-center justify-center text-[#00B8A9] transition shrink-0"
            >
              <HelpCircle size={16} />
            </button>

            {activeUsername && (
              <button
                type="button"
                onClick={handleLogout}
                aria-label={t.logoutBtn}
                title={t.logoutBtn}
                className="w-9 h-9 max-[359px]:w-11 max-[359px]:h-11 sm:w-auto sm:h-auto justify-center sm:px-3 sm:py-2 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#FF6B35] text-xs font-extrabold text-[#A1A1AA] hover:text-[#FF6B35] flex items-center gap-1.5 transition shrink-0 whitespace-nowrap"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">{t.logoutBtn}</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleLanguage}
              className="px-2.5 sm:px-3 py-2 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-xs font-extrabold text-white transition shrink-0 whitespace-nowrap"
            >
              {t.langToggle}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[430px] md:max-w-[1100px] px-4 md:px-6 pt-5 md:pt-7">
        {!activeUsername ? (
          !introDone ? (
            <AppIntroScreen lang={lang} onFinish={handleFinishIntro} />
          ) : (
            <AuthScreen
              lang={lang}
              onAuthenticated={handleAuthenticated}
              onViewIntro={() => setIntroDone(false)}
              onGoogleLogin={handleGoogleSignIn}
            />
          )
        ) : !state.onboarded ? (
          <OnboardingFlow
            lang={lang}
            initialActions={state.actions}
            onComplete={handleOnboardingComplete}
          />
        ) : (
          <>
            {activeTab === 'checkin' && (
              <DailyCheckInScreen
                key={activeUsername}
                state={state}
                lang={lang}
                onOpenCheckInModal={(allowPast) =>
                  setCheckInModal({ open: true, allowPast })
                }
                onOpenAddTaskModal={() => setAddTaskOpen(true)}
                onOpenSetupModal={() => setSetupOpen(true)}
                onOpenBackupModal={() => setBackupOpen(true)}
                onSaveDailyState={handleSaveLog}
                onLowerGoal={handleLowerGoal}
                onOpenNoorChat={(openMode) =>
                  setNoorExternalPrompt({ id: Date.now(), openMode })
                }
                onStartTenMinTimer={handleStartTenMinTimer}
                onQuickAddAction={handleQuickAddAction}
                onOpenStudioTool={(subTab) => {
                  setStudioSubTab(subTab);
                  setActiveTab('studio');
                }}
                onLaunchGame={() => setGameOpen(true)}
                onChangeAmbientSound={handleChangeAmbientSound}
              />
            )}

            {activeTab === 'dashboard' && (
              <DashboardScreen
                state={state}
                lang={lang}
                onLogFirstDay={() => {
                  setActiveTab('checkin');
                  setCheckInModal({ open: true, allowPast: false });
                }}
                onLowerGoal={handleLowerGoal}
                onOpenSetupModal={() => setSetupOpen(true)}
              />
            )}

            {activeTab === 'report' && (
              <ReportScreen
                state={state}
                lang={lang}
                onAskNoorExplain={(query) =>
                  setNoorExternalPrompt({ id: Date.now(), query })
                }
                onLogDay={() => {
                  setActiveTab('checkin');
                  setCheckInModal({ open: true, allowPast: false });
                }}
              />
            )}

            {activeTab === 'studio' && (
              <StudioHubScreen
                lang={lang}
                dialect={state.dialect ?? getDefaultDialect(lang)}
                userName={state.userName}
                activeSubTab={studioSubTab}
                onChangeSubTab={setStudioSubTab}
                ambientSound={state.ambientSound}
                onChangeAmbientSound={handleChangeAmbientSound}
                onOpenSettings={() => setBackupOpen(true)}
                onLaunchGame={() => setGameOpen(true)}
              />
            )}
          </>
        )}
      </main>

      {isSignedInAndOnboarded && (
        <nav
          aria-label="Mobile navigation"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0F0F0F]/95 backdrop-blur-md border-t border-[#2A2A2A] safe-bottom no-print"
        >
          <div className="mx-auto max-w-[430px] grid grid-cols-3 h-16">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              const tourAttr =
                item.id === 'dashboard'
                  ? 'nav-dashboard'
                  : item.id === 'report'
                  ? 'nav-report'
                  : item.id === 'studio'
                  ? 'nav-studio'
                  : undefined;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-tour-target={tourAttr}
                  onClick={() => setActiveTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className="flex flex-col items-center justify-center gap-1"
                  style={{ color: active ? '#00B8A9' : '#A1A1AA' }}
                >
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                  <span className="text-[11px] font-bold whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {checkInModal.open && (
        <CheckInModal
          lang={lang}
          actions={getEnabledActions(state.actions)}
          logs={state.logs}
          initialDate={getTodayKey()}
          allowDateChange={checkInModal.allowPast}
          onClose={() => setCheckInModal({ open: false, allowPast: false })}
          onSave={handleSaveLog}
        />
      )}

      {setupOpen && (
        <SetupActionsModal
          lang={lang}
          actions={state.actions}
          onClose={() => setSetupOpen(false)}
          onSave={(newActions) =>
            setState((prev) => ({
              ...prev,
              actions: newActions,
              totalPoints: recalculateAllPoints(prev.logs, newActions),
            }))
          }
        />
      )}

      {addTaskOpen && (
        <AddTaskModal
          lang={lang}
          existingCount={getEnabledActions(state.actions).length}
          onClose={() => setAddTaskOpen(false)}
          onSaveTask={(newTask) => {
            setState((prev) => {
              const nextActions = [...prev.actions, newTask];
              return {
                ...prev,
                actions: nextActions,
                totalPoints: recalculateAllPoints(prev.logs, nextActions),
              };
            });
            setStatusToast(t.noorActionDone);
            setTimeout(() => setStatusToast(null), 2200);
          }}
        />
      )}

      {backupOpen && (
        <SettingsModal
          lang={lang}
          state={state}
          onClose={() => setBackupOpen(false)}
          onImport={(restored) => {
            if (restored.dialect) saveGlobalDialect(restored.dialect);
            const normalizedAmbient = normalizeAmbientSettings(restored.ambientSound);
            ambientAudioEngine.applySettings(normalizedAmbient);
            setState({
              ...restored,
              ambientSound: normalizedAmbient,
            });
            setBackupOpen(false);
          }}
          onToggleReminder={handleToggleEveningReminder}
          onChangeDialect={handleChangeDialect}
          onChangeAmbientSound={handleChangeAmbientSound}
          onReplayTour={handleReplayTour}
          cloudUserEmail={firebaseUser?.email ?? firebaseUser?.displayName ?? null}
          cloudSyncBusy={cloudSyncBusy}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          onCloudPush={handleCloudPush}
          onCloudPull={handleCloudPull}
          onCloudDelete={handleCloudDeleteAccount}
        />
      )}

      {helpOpen && (
        <HelpSheetModal
          screen={currentHelpScreen}
          state={state}
          lang={lang}
          canReplayTour={isSignedInAndOnboarded}
          onClose={() => setHelpOpen(false)}
          onReplayTour={handleReplayTour}
        />
      )}

      {shouldShowTour && (
        <InteractiveTour
          lang={lang}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onComplete={handleCompleteTour}
        />
      )}

      <OfflineIndicator lang={lang} />

      {isSignedInAndOnboarded && activeTab !== 'studio' && !gameOpen && (
        <NoorCompanion
          state={state}
          lang={lang}
          externalPromptRequest={noorExternalPrompt}
          onDismissDailyPrompt={handleDismissDailyPrompt}
          onMarkPromptAccepted={handleMarkPromptAccepted}
          onAnswerDailyQuestion={handleAnswerDailyQuestion}
          onSkipDailyQuestion={handleSkipDailyQuestion}
          onApplyProposal={handleApplyProposal}
          onChangeDialect={handleChangeDialect}
          onChangeMode={handleChangeMode}
          onDeclineLoggingToday={handleDeclineLoggingToday}
          onStartTenMinTimer={handleStartTenMinTimer}
          onStartTour={handleReplayTour}
        />
      )}

      {statusToast && (
        <div className="fixed top-20 inset-x-0 z-[60] flex justify-center px-4 pointer-events-none no-print">
          <div className="px-5 py-2.5 rounded-full bg-[#1A1A1A] border border-[#00B8A9] text-xs font-extrabold text-[#00B8A9] shadow-xl">
            {statusToast}
          </div>
        </div>
      )}

      {levelUpCelebration !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.levelUpTitle}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 no-print"
        >
          <div className="animate-levelPop w-full max-w-[360px] bg-[#1A1A1A] border-2 border-[#00B8A9] rounded-[24px] p-7 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-[#00B8A9]/20 flex items-center justify-center">
              <Sparkles size={28} className="text-[#00B8A9]" />
            </div>
            <h2 className="text-2xl font-extrabold text-white">{t.levelUpTitle}</h2>
            <div className="text-4xl font-extrabold text-[#00B8A9] tabular-nums">
              {t.levelWord} {levelUpCelebration}
            </div>
            <button
              type="button"
              onClick={() => setLevelUpCelebration(null)}
              className="w-full py-3 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm min-h-[44px]"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
      {gameOpen && (
        <FocusGameOverlay
          lang={lang}
          autostart={isAutostart}
          onClose={() => setGameOpen(false)}
        />
      )}
    </div>
  );
}
