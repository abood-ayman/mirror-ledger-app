import type {
  ActionConfig,
  AppState,
  DailyLog,
  Language,
  LocalAccount,
  NoorDialect,
} from '../types/tracker';
import { ALLOWED_ACTION_COLORS } from './i18n';
import { hashPassword, verifyPassword } from './localPassword';
import { DEFAULT_AMBIENT_SOUND, normalizeAmbientSettings } from './ambientAudio';

export const ACCOUNTS_KEY = 'mirror_ledger_accounts_v1';
export const ACTIVE_USER_KEY = 'mirror_ledger_active_user_v1';
export const LANGUAGE_KEY = 'language';
export const DIALECT_KEY = 'dialect';
export const INTRO_SEEN_KEY = 'mirror_ledger_intro_seen_v1';
export const TOUR_DONE_KEY = 'tour_done';

const VALID_DIALECTS: NoorDialect[] = [
  'egyptian',
  'gulf',
  'levantine',
  'maghrebi',
  'fusha',
  'english',
];

export function isEgyptRegion(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    const lang = typeof navigator !== 'undefined' ? navigator.language ?? '' : '';
    return /cairo/i.test(tz) || /ar-eg/i.test(lang);
  } catch {
    return true;
  }
}

export function getDefaultDialect(lang: Language = 'ar'): NoorDialect {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(DIALECT_KEY) as NoorDialect | null;
    if (saved && VALID_DIALECTS.includes(saved)) {
      return saved;
    }
  }
  if (lang === 'en') {
    return 'english';
  }
  return isEgyptRegion() ? 'egyptian' : 'egyptian';
}

export function saveGlobalDialect(dialect: NoorDialect): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DIALECT_KEY, dialect);
  } catch {
    // Ignore storage quota issues
  }
}

export function hasSeenIntro(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(INTRO_SEEN_KEY) === 'true';
}

export function markIntroSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INTRO_SEEN_KEY, 'true');
  } catch {
    // Ignore storage quota issues
  }
}

export function markTourDoneStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TOUR_DONE_KEY, 'true');
  } catch {
    // Ignore storage quota issues
  }
}

export function resetTourDoneStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOUR_DONE_KEY);
  } catch {
    // Ignore storage quota issues
  }
}

export function getUserDataKey(username: string): string {
  const safe = username.trim().toLowerCase();
  return `mirror_ledger_user_${safe}_data`;
}

export const DEFAULT_ACTIONS: ActionConfig[] = [
  {
    id: 'study',
    nameAr: 'مذاكرة',
    nameEn: 'Study',
    unit: 'minutes',
    color: ALLOWED_ACTION_COLORS[0], // #FF6B35
    icon: 'book',
    weeklyGoal: 210,
    enabled: false,
  },
  {
    id: 'workout',
    nameAr: 'تمرين',
    nameEn: 'Workout',
    unit: 'minutes',
    color: ALLOWED_ACTION_COLORS[1], // #A855F7
    icon: 'dumbbell',
    weeklyGoal: 120,
    enabled: false,
  },
  {
    id: 'reading',
    nameAr: 'قراءة',
    nameEn: 'Reading',
    unit: 'pages',
    color: ALLOWED_ACTION_COLORS[2], // #00B8A9
    icon: 'bookOpen',
    weeklyGoal: 70,
    enabled: false,
  },
  {
    id: 'work',
    nameAr: 'شغل',
    nameEn: 'Work',
    unit: 'minutes',
    color: ALLOWED_ACTION_COLORS[3], // #F59E0B
    icon: 'briefcase',
    weeklyGoal: 600,
    enabled: false,
  },
  {
    id: 'sleep',
    nameAr: 'نوم',
    nameEn: 'Sleep',
    unit: 'hours',
    color: ALLOWED_ACTION_COLORS[4], // #10B981
    icon: 'moon',
    weeklyGoal: 52,
    enabled: false,
  },
];

export function getInitialState(lang: Language = 'ar'): AppState {
  return {
    version: 1,
    language: lang,
    onboarded: false,
    tourDone: false,
    userName: '',
    dialect: getDefaultDialect(lang),
    noorPreference: 'talk',
    ambientSound: { ...DEFAULT_AMBIENT_SOUND },
    actions: DEFAULT_ACTIONS.map((a) => ({ ...a })),
    logs: {},
    totalPoints: 0,
    lastCelebratedLevel: 1,
    eveningReminderEnabled: false,
  };
}

export function loadGlobalLanguage(): Language {
  if (typeof window === 'undefined') return 'ar';
  const saved = window.localStorage.getItem(LANGUAGE_KEY);
  return saved === 'en' ? 'en' : 'ar';
}

export function saveGlobalLanguage(lang: Language): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    // Ignore storage quota issues
  }
}

export function loadAccounts(): Record<string, LocalAccount> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LocalAccount>) : {};
  } catch {
    return {};
  }
}

function saveAccounts(accounts: Record<string, LocalAccount>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // Ignore storage quota issues
  }
}

export function getActiveUsername(): string | null {
  if (typeof window === 'undefined') return null;
  const val = window.localStorage.getItem(ACTIVE_USER_KEY);
  return val && val.trim() ? val.trim() : null;
}

export function setActiveUsername(username: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (username) {
      window.localStorage.setItem(ACTIVE_USER_KEY, username);
    } else {
      window.localStorage.removeItem(ACTIVE_USER_KEY);
    }
  } catch {
    // Ignore storage quota issues
  }
}

export async function registerLocalAccount(
  usernameInput: string,
  passwordInput: string,
  lang: Language = 'ar'
): Promise<{ ok: true; username: string } | { ok: false; error: 'empty' | 'exists' | 'unavailable' }> {
  const username = usernameInput.trim();
  const key = username.toLowerCase();
  if (!username || !passwordInput) {
    return { ok: false, error: 'empty' };
  }
  const accounts = loadAccounts();
  if (accounts[key]) {
    return { ok: false, error: 'exists' };
  }
  let passwordHash;
  try { passwordHash = await hashPassword(passwordInput); } catch { return { ok: false, error: 'unavailable' }; }
  const latest = loadAccounts();
  if (latest[key]) return { ok: false, error: 'exists' };
  Object.assign(accounts, latest);
  accounts[key] = {
    username,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  saveAccounts(accounts);
  setActiveUsername(username);
  // Ensure fresh isolated state is initialized for this user
  const initial = getInitialState(lang);
  saveUserAppState(username, initial);
  return { ok: true, username };
}

export async function loginLocalAccount(
  usernameInput: string,
  passwordInput: string
): Promise<{ ok: true; username: string } | { ok: false; error: 'empty' | 'invalid' | 'unavailable' }> {
  const username = usernameInput.trim();
  const key = username.toLowerCase();
  if (!username || !passwordInput) {
    return { ok: false, error: 'empty' };
  }
  const accounts = loadAccounts();
  const account = accounts[key];
  if (!account) {
    return { ok: false, error: 'invalid' };
  }
  if (account.passwordHash) {
    try {
      if (!(await verifyPassword(passwordInput, account.passwordHash))) return { ok: false, error: 'invalid' };
    } catch { return { ok: false, error: 'unavailable' }; }
  } else if (typeof account.password === 'string') {
    // Legacy record (plaintext). Accept the same password as before, then upgrade it in place.
    if (account.password !== passwordInput) return { ok: false, error: 'invalid' };
    try {
      const upgraded: LocalAccount = { username: account.username, createdAt: account.createdAt, passwordHash: await hashPassword(passwordInput) };
      const fresh = loadAccounts();
      fresh[key] = upgraded;
      saveAccounts(fresh);
    } catch {
      // Could not hash here: login still succeeds, record stays as it was (no lockout).
    }
  } else {
    return { ok: false, error: 'invalid' };
  }
  setActiveUsername(account.username);
  return { ok: true, username: account.username };
}

// Account created by Google sign-in: no local password at all. The Firebase uid is an identifier, not a secret.
// A legacy record whose stored "password" equals the uid is converted by dropping that value; nothing else changes.
export function registerExternalAccount(usernameInput: string, uid: string, lang: Language = 'ar'): { ok: true; username: string } {
  const username = usernameInput.trim();
  const key = username.toLowerCase();
  const accounts = loadAccounts();
  const existing = accounts[key];
  if (!existing) {
    accounts[key] = { username, external: 'google', createdAt: new Date().toISOString() };
    saveAccounts(accounts);
    setActiveUsername(username);
    saveUserAppState(username, getInitialState(lang));
    return { ok: true, username };
  }
  if (typeof existing.password === 'string' && existing.password === uid && !existing.passwordHash) {
    accounts[key] = { username: existing.username, createdAt: existing.createdAt, external: 'google' };
    saveAccounts(accounts);
  }
  setActiveUsername(existing.username);
  return { ok: true, username: existing.username };
}

export function logoutLocalAccount(): void {
  setActiveUsername(null);
}

export function loadUserAppState(username: string): AppState {
  const globalLang = loadGlobalLanguage();
  if (typeof window === 'undefined') return getInitialState(globalLang);
  try {
    const raw = window.localStorage.getItem(getUserDataKey(username));
    if (!raw) {
      return getInitialState(globalLang);
    }
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const lang: Language =
      parsed.language === 'en' ? 'en' : parsed.language === 'ar' ? 'ar' : globalLang;
    const dialect: NoorDialect =
      parsed.dialect && VALID_DIALECTS.includes(parsed.dialect)
        ? parsed.dialect
        : getDefaultDialect(lang);
    return {
      ...getInitialState(lang),
      ...parsed,
      language: lang,
      dialect,
      ambientSound: normalizeAmbientSettings(parsed.ambientSound),
      actions: Array.isArray(parsed.actions)
        ? parsed.actions
        : DEFAULT_ACTIONS.map((a) => ({ ...a })),
      logs: parsed.logs && typeof parsed.logs === 'object' ? parsed.logs : {},
    };
  } catch {
    return getInitialState(globalLang);
  }
}

export function saveUserAppState(username: string, state: AppState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getUserDataKey(username), JSON.stringify(state));
    window.localStorage.setItem(LANGUAGE_KEY, state.language);
    if (state.dialect) {
      window.localStorage.setItem(DIALECT_KEY, state.dialect);
    }
  } catch {
    // Ignore storage quota issues gracefully
  }
}

export function toDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayKey(): string {
  return toDateKey(new Date());
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(dateKey: string, delta: number): string {
  const dt = parseDateKey(dateKey);
  dt.setDate(dt.getDate() + delta);
  return toDateKey(dt);
}

/**
 * Returns the 7 date keys (Sunday..Saturday) for the week offset by `weekOffset` (0 = current week, -1 = last week)
 */
export function getWeekDates(weekOffset = 0, referenceKey = getTodayKey()): string[] {
  const ref = parseDateKey(referenceKey);
  const dayOfWeek = ref.getDay(); // 0 = Sun ... 6 = Sat
  const startOfWeek = new Date(ref);
  startOfWeek.setDate(ref.getDate() - dayOfWeek + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(startOfWeek);
    dt.setDate(startOfWeek.getDate() + i);
    return toDateKey(dt);
  });
}

export function formatWeekRange(dates: string[], lang: Language): string {
  if (dates.length === 0) return '';
  const start = parseDateKey(dates[0]);
  const end = parseDateKey(dates[dates.length - 1]);
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const startDay = start.getDate();
  const endDay = end.getDate();
  const monthName = end.toLocaleDateString(locale, { month: 'short' });
  const startMonth = start.toLocaleDateString(locale, { month: 'short' });

  if (start.getMonth() === end.getMonth()) {
    return lang === 'ar'
      ? `الأسبوع ${startDay} - ${endDay} ${monthName}`
      : `Week ${startDay}-${endDay} ${monthName}`;
  }
  return lang === 'ar'
    ? `الأسبوع ${startDay} ${startMonth} - ${endDay} ${monthName}`
    : `Week ${startDay} ${startMonth} - ${endDay} ${monthName}`;
}

export function calculateDayPoints(log: DailyLog, actions: ActionConfig[]): number {
  let pts = 0;
  for (const action of actions) {
    const entry = log.entries[action.id];
    if (!entry || entry.total <= 0) continue;
    const weight =
      action.unit === 'hours'
        ? 15
        : action.unit === 'times'
        ? 12
        : action.unit === 'cups'
        ? 8
        : action.unit === 'pages'
        ? 2
        : action.unit === 'reps'
        ? 0.5
        : 1; // minutes
    pts += Math.min(120, Math.round(entry.total * weight));
    if (entry.startedWith10Min) pts += 10;
  }
  // Base check-in points when user logs daily state even with 0 actions
  if (pts === 0 && (log.energy > 0 || log.focus > 0)) {
    pts += 10;
  }
  if (log.feelingWhy.trim().length > 0) {
    pts += 15; // Reflection bonus
  }
  return pts;
}

export function recalculateAllPoints(
  logs: Record<string, DailyLog>,
  actions: ActionConfig[]
): number {
  let sum = 0;
  for (const log of Object.values(logs)) {
    sum += calculateDayPoints(log, actions);
  }
  return sum;
}

export function getLevelInfo(totalPoints: number): {
  level: number;
  currentXp: number;
  nextLevelXp: number;
  progressPct: number;
} {
  const level = Math.floor(totalPoints / 200) + 1;
  const currentXp = totalPoints % 200;
  const nextLevelXp = 200;
  const progressPct = Math.round((currentXp / nextLevelXp) * 100);
  return { level, currentXp, nextLevelXp, progressPct };
}
