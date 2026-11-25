export type Language = 'ar' | 'en';

export type ScreenTab = 'checkin' | 'dashboard' | 'report' | 'studio';

export type ActionUnit = 'minutes' | 'pages' | 'reps' | 'times' | 'hours' | 'cups';

export type BestTime = 'morning' | 'afternoon' | 'evening' | 'anytime';

export type TaskDifficulty = 'easy' | 'medium' | 'hard';

export type NoorPreference = 'talk' | 'quiet';

export type NoorMode = 'chat' | 'help' | 'quiet';

export type NoorDialect =
  | 'egyptian'
  | 'gulf'
  | 'levantine'
  | 'maghrebi'
  | 'fusha'
  | 'english';

export type ActionIconName =
  | 'book'
  | 'dumbbell'
  | 'bookOpen'
  | 'briefcase'
  | 'moon'
  | 'target'
  | 'flame';

export interface ActionConfig {
  id: string;
  nameAr: string;
  nameEn: string;
  unit: ActionUnit;
  color: string; // #FF6B35, #A855F7, #00B8A9, #F59E0B, #10B981
  icon: ActionIconName;
  weeklyGoal?: number;
  dailyAmount?: number;
  bestTime?: BestTime;
  reminderTime?: string;
  whyMatters?: string;
  difficulty?: TaskDifficulty;
  allowTenMinRule?: boolean;
  enabled: boolean;
}

export interface ActionLogEntry {
  actionId: string;
  times: number;
  amounts: number[];
  total: number;
  startedWith10Min: boolean;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  entries: Record<string, ActionLogEntry>;
  energy: number; // 1 - 10
  focus: number; // 1 - 10
  feelingWhy: string;
  quickNote: string;
  pointsEarned: number;
  updatedAt: string;
}

export interface LocalAccount {
  username: string;
  /** Legacy plaintext field. Present only on accounts created before the hashing change; removed on next successful login. */
  password?: string;
  /** Set for accounts created by Google sign-in. They have no local password; the Firebase uid is never stored as one. */
  external?: 'google';
  passwordHash?: { salt: string; hash: string; iter: number };
  createdAt: string;
}

export interface NoorDailyNote {
  date: string;
  question: string;
  answer: string;
  createdAt: string;
}

export interface EnabledFeaturesConfig {
  tenMinTimer?: boolean;
  dailyIntention?: string;
}

export type AmbientSoundMode = 'quiet' | 'rain' | 'lofi' | 'purr';

export interface AmbientSoundSettings {
  enabled: boolean;
  mode: AmbientSoundMode;
  volume: number; // 0 - 1
}

export interface AppState {
  version: number;
  language: Language;
  onboarded: boolean;
  tourDone?: boolean;
  userName?: string;
  dialect?: NoorDialect;
  noorPreference?: NoorPreference;
  noorMode?: NoorMode;
  accentColor?: string;
  enabledFeatures?: EnabledFeaturesConfig;
  ambientSound?: AmbientSoundSettings;
  noorLastPromptDate?: string;
  noorPromptDismissedDate?: string;
  noorLastQuestionDate?: string;
  noorLastLogNudgeDate?: string;
  noorDeclinedLogDate?: string;
  noorNotes?: Record<string, NoorDailyNote>;
  actions: ActionConfig[];
  logs: Record<string, DailyLog>;
  totalPoints: number;
  lastCelebratedLevel: number;
  eveningReminderEnabled: boolean;
}

export interface ActionWeeklyMetrics {
  action: ActionConfig;
  thisWeekTotal: number;
  thisWeekTimes: number;
  thisWeekActiveDays: number;
  dailyAmounts: { date: string; dayLabel: string; total: number }[];
  lastLoggedAmount: number | null;
  first3DaysAvg: number;
  last14DaysAvg: number;
  lastWeekTotal: number;
  lastWeekAvg: number;
  vsLastTimePct: number | null;
  vsAveragePct: number | null;
  vsFirstTimePct: number | null;
  firstTimeMultiplier: number | null;
  vsLastWeekPct: number | null;
  bestDay: {
    date: string;
    total: number;
    energy: number;
    focus: number;
    feelingWhy: string;
  } | null;
  worstDay: {
    date: string;
    total: number;
    energy: number;
    focus: number;
    feelingWhy: string;
  } | null;
  streak: number;
  streakBroken: boolean;
  flexibleDailyGoal: number;
  flexibleWeeklyGoal: number;
  dropping3Days: boolean;
  nextWeekPrediction: number;
  productivityScore: number;
}
