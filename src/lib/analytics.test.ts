import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFlexibleDailyGoal,
  getActionMetrics,
  getBalanceData,
  getCrossActionCorrelation,
  getEnabledActions,
  getMoodActionMap,
  getTenMinRuleCount,
} from './analytics';
import { generateWeeklyReport } from './report';
import { parseImportedJson } from './export';
import {
  DEFAULT_ACTIONS,
  DIALECT_KEY,
  TOUR_DONE_KEY,
  getActiveUsername,
  getDefaultDialect,
  getInitialState,
  getUserDataKey,
  getWeekDates,
  hasSeenIntro,
  loadUserAppState,
  loginLocalAccount,
  logoutLocalAccount,
  markIntroSeen,
  markTourDoneStorage,
  registerLocalAccount,
  resetTourDoneStorage,
  saveGlobalDialect,
  saveUserAppState,
} from './storage';
import {
  analyzeUserDataForNoor,
  buildNoorReply,
  detectDialectSwitchInMessage,
  getNoorDailyQuestion,
  getNoorEmptyHomePrompt,
  getNoorInitialGreeting,
  getScreenHelpContent,
  resolveNoorDialect,
  shouldShowNoorPermissionPrompt,
} from './noor';
import { DICTIONARY } from './i18n';
import {
  AMBIENT_MODES,
  AMBIENT_MODE_META,
  AmbientAudioEngine,
  DEFAULT_AMBIENT_SOUND,
  clampVolume,
  isValidAmbientMode,
  normalizeAmbientSettings,
  selectAmbientMode,
  toggleAmbientEnabled,
} from './ambientAudio';
import type { ActionConfig, DailyLog, NoorDialect } from '../types/tracker';

const ENABLED_TEST_ACTIONS: ActionConfig[] = DEFAULT_ACTIONS.slice(0, 3).map((a) => ({
  ...a,
  enabled: true,
}));

function makeLog(
  date: string,
  studyMin: number,
  workoutMin: number,
  readingPages: number,
  energy: number,
  focus = 7,
  feelingWhy = '',
  startedWith10Min = false
): DailyLog {
  return {
    date,
    entries: {
      study: {
        actionId: 'study',
        times: studyMin > 0 ? 1 : 0,
        amounts: studyMin > 0 ? [studyMin] : [],
        total: studyMin,
        startedWith10Min,
      },
      workout: {
        actionId: 'workout',
        times: workoutMin > 0 ? 1 : 0,
        amounts: workoutMin > 0 ? [workoutMin] : [],
        total: workoutMin,
        startedWith10Min: false,
      },
      reading: {
        actionId: 'reading',
        times: readingPages > 0 ? 1 : 0,
        amounts: readingPages > 0 ? [readingPages] : [],
        total: readingPages,
        startedWith10Min: false,
      },
    },
    energy,
    focus,
    feelingWhy,
    quickNote: '',
    pointsEarned: 50,
    updatedAt: `${date}T20:00:00.000Z`,
  };
}

function setupMockLocalStorage() {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  (globalThis as unknown as { window: { localStorage: typeof localStorageMock } }).window = {
    localStorage: localStorageMock,
  };
  return store;
}

test('getEnabledActions allows 0, 1, or more actions with no forced 3-action minimum', () => {
  assert.equal(getEnabledActions(DEFAULT_ACTIONS).length, 0);
  const oneEnabled = DEFAULT_ACTIONS.map((a, i) => ({ ...a, enabled: i === 0 }));
  assert.equal(getEnabledActions(oneEnabled).length, 1);
  assert.equal(getEnabledActions(ENABLED_TEST_ACTIONS).length, 3);
});

test('computeFlexibleDailyGoal adjusts gently (+15%) from 14-day average', () => {
  const study = ENABLED_TEST_ACTIONS[0];
  assert.equal(computeFlexibleDailyGoal(study, 30), 35);
  assert.equal(computeFlexibleDailyGoal(study, 0), 30); // 210 / 7
});

test('getActionMetrics calculates weekly totals, first3 avg, 14d avg, streak, and 3-day drop', () => {
  const refDate = '2026-11-19'; // Thursday
  const weekDates = getWeekDates(0, refDate); // Sun Nov 15 .. Sat Nov 21
  const logs: Record<string, DailyLog> = {
    // Earlier logs (first 3 days avg = (20+20+20)/3 = 20)
    '2026-11-01': makeLog('2026-11-01', 20, 0, 10, 6),
    '2026-11-02': makeLog('2026-11-02', 20, 30, 10, 7),
    '2026-11-03': makeLog('2026-11-03', 20, 0, 10, 6),
    // This week: dropping over 3 days (17 -> 18 -> 19)
    [weekDates[2]]: makeLog(weekDates[2], 60, 30, 15, 8, 8, 'Focused morning', true),
    [weekDates[3]]: makeLog(weekDates[3], 30, 0, 10, 5, 5, 'Tired afternoon'),
    [weekDates[4]]: makeLog(weekDates[4], 10, 0, 5, 3, 4, 'Low sleep'),
  };

  const studyMetrics = getActionMetrics(ENABLED_TEST_ACTIONS[0], logs, 0, 'en', refDate);
  assert.equal(studyMetrics.first3DaysAvg, 20);
  assert.equal(studyMetrics.thisWeekTotal, 100);
  assert.equal(studyMetrics.thisWeekActiveDays, 3);
  assert.equal(studyMetrics.streak, 3);
  assert.equal(studyMetrics.dropping3Days, true);
  assert.equal(studyMetrics.bestDay?.total, 60);
  assert.equal(studyMetrics.worstDay?.total, 10);
});

test('getCrossActionCorrelation and getMoodActionMap detect meaningful patterns', () => {
  const logs: Record<string, DailyLog> = {
    '2026-11-10': makeLog('2026-11-10', 90, 40, 15, 8),
    '2026-11-11': makeLog('2026-11-11', 80, 30, 15, 8),
    '2026-11-12': makeLog('2026-11-12', 30, 0, 10, 3),
    '2026-11-13': makeLog('2026-11-13', 40, 0, 10, 4),
    '2026-11-14': makeLog('2026-11-14', 85, 35, 12, 8),
    '2026-11-15': makeLog('2026-11-15', 35, 0, 10, 3),
    '2026-11-16': makeLog('2026-11-16', 88, 30, 14, 8),
  };

  const corr = getCrossActionCorrelation(ENABLED_TEST_ACTIONS, logs, 'en');
  assert.ok(corr.pctLift !== null && corr.pctLift > 0);
  assert.match(corr.text, /Workout/);

  const moodMap = getMoodActionMap(ENABLED_TEST_ACTIONS, logs, 'en');
  assert.match(moodMap, /energy is under 4/i);
  assert.equal(getTenMinRuleCount(logs), 0);
});

test('generateWeeklyReport enforces heavy-week 3-sentence rule and works with 0 actions', () => {
  const state = getInitialState();
  state.onboarded = true;
  state.actions = ENABLED_TEST_ACTIONS;
  const refDate = '2026-11-19';
  state.logs = {
    '2026-11-18': makeLog('2026-11-18', 10, 0, 2, 3, 3, 'Exhausted from work', true),
  };

  const report = generateWeeklyReport(state, 'ar', 0, refDate);
  assert.equal(report.isHeavyWeek, true);
  assert.match(report.summaryText, /الأسبوع ده كان تقيل/);
  assert.doesNotMatch(report.summaryText, /فاشل|كسول|ضيعت/);
  assert.equal(report.recommendations.length, 1);

  const metrics = ENABLED_TEST_ACTIONS.map((a) =>
    getActionMetrics(a, state.logs, 0, 'ar', refDate)
  );
  const balance = getBalanceData(metrics, 'ar');
  assert.ok(balance.balanceScore >= 0 && balance.balanceScore <= 100);

  // Zero-action report test
  const zeroState = getInitialState('en');
  zeroState.onboarded = true;
  zeroState.logs = {
    '2026-11-18': {
      date: '2026-11-18',
      entries: {},
      energy: 8,
      focus: 7,
      feelingWhy: 'Calm day without tracked actions',
      quickNote: '',
      pointsEarned: 25,
      updatedAt: '2026-11-18T20:00:00.000Z',
    },
  };
  const zeroReport = generateWeeklyReport(zeroState, 'en', 0, refDate);
  assert.equal(zeroReport.numbersRows.length, 0);
  assert.equal(zeroReport.recommendations.length, 1);
  assert.equal(zeroReport.energyAvg, 8);
});

test('parseImportedJson validates backup payloads safely', () => {
  assert.equal(parseImportedJson('not json'), null);
  assert.equal(parseImportedJson('{"foo":"bar"}'), null);
  const valid = JSON.stringify(getInitialState());
  const restored = parseImportedJson(valid);
  assert.ok(restored !== null);
  assert.equal(restored?.onboarded, true);
});

test('local account auth strictly isolates data between account 1 and account 2', async () => {
  const store = setupMockLocalStorage();

  // Register account "1" with password "1"
  const reg1 = await registerLocalAccount('1', '1', 'ar');
  assert.deepEqual(reg1, { ok: true, username: '1' });
  assert.equal(getActiveUsername(), '1');
  assert.equal(getUserDataKey('1'), 'mirror_ledger_user_1_data');

  // Save data for account "1"
  const state1 = loadUserAppState('1');
  state1.onboarded = true;
  state1.userName = 'UserOne';
  state1.noorPreference = 'talk';
  state1.logs['2026-11-19'] = makeLog('2026-11-19', 45, 0, 0, 8, 8, 'Day for user 1');
  saveUserAppState('1', state1);

  // Logout and register account "2" with password "2"
  logoutLocalAccount();
  assert.equal(getActiveUsername(), null);

  const reg2 = await registerLocalAccount('2', '2', 'en');
  assert.deepEqual(reg2, { ok: true, username: '2' });
  assert.equal(getActiveUsername(), '2');
  assert.equal(getUserDataKey('2'), 'mirror_ledger_user_2_data');

  // Account "2" must NEVER see account "1"'s data
  const state2 = loadUserAppState('2');
  assert.equal(state2.userName, '');
  assert.equal(Object.keys(state2.logs).length, 0);

  // Save distinct data for account "2"
  state2.onboarded = true;
  state2.userName = 'UserTwo';
  state2.noorPreference = 'quiet';
  state2.logs['2026-11-19'] = makeLog('2026-11-19', 0, 60, 20, 9, 9, 'Day for user 2');
  saveUserAppState('2', state2);

  // Invalid password should fail
  logoutLocalAccount();
  const badLogin = await loginLocalAccount('1', 'wrong');
  assert.deepEqual(badLogin, { ok: false, error: 'invalid' });

  // Login back to "1" and verify zero leakage from "2"
  const login1 = await loginLocalAccount('1', '1');
  assert.deepEqual(login1, { ok: true, username: '1' });
  const reloaded1 = loadUserAppState('1');
  assert.equal(reloaded1.userName, 'UserOne');
  assert.equal(reloaded1.noorPreference, 'talk');
  assert.equal(reloaded1.logs['2026-11-19']?.feelingWhy, 'Day for user 1');
  assert.equal(reloaded1.logs['2026-11-19']?.entries.study?.total, 45);
  assert.equal(reloaded1.logs['2026-11-19']?.entries.workout?.total, 0);

  // Login back to "2" and verify zero leakage from "1"
  logoutLocalAccount();
  const login2 = await loginLocalAccount('2', '2');
  assert.deepEqual(login2, { ok: true, username: '2' });
  const reloaded2 = loadUserAppState('2');
  assert.equal(reloaded2.userName, 'UserTwo');
  assert.equal(reloaded2.noorPreference, 'quiet');
  assert.equal(reloaded2.logs['2026-11-19']?.feelingWhy, 'Day for user 2');
  assert.equal(reloaded2.logs['2026-11-19']?.entries.workout?.total, 60);

  assert.ok(store.has('mirror_ledger_user_1_data'));
  assert.ok(store.has('mirror_ledger_user_2_data'));
});

test('Noor respects quiet mode, max 1 permission prompt/day, and 1 question/day', () => {
  const refDate = '2026-11-19';
  const quietState = getInitialState('ar');
  quietState.onboarded = true;
  quietState.noorPreference = 'quiet';
  assert.equal(shouldShowNoorPermissionPrompt(quietState, refDate), false);

  const talkState = getInitialState('ar');
  talkState.onboarded = true;
  talkState.noorPreference = 'talk';
  assert.equal(shouldShowNoorPermissionPrompt(talkState, refDate), true);

  talkState.noorPromptDismissedDate = refDate;
  assert.equal(shouldShowNoorPermissionPrompt(talkState, refDate), false);
  assert.equal(shouldShowNoorPermissionPrompt(talkState, '2026-11-20'), true);

  // Do not pester with sleep/day survey when 0 logs exist
  assert.equal(getNoorDailyQuestion(talkState, 'ar', refDate), null);
  talkState.logs['2026-11-18'] = makeLog('2026-11-18', 20, 0, 5, 7);
  assert.ok(getNoorDailyQuestion(talkState, 'ar', refDate) !== null);
  talkState.noorLastQuestionDate = refDate;
  assert.equal(getNoorDailyQuestion(talkState, 'ar', refDate), null);
});

test('Noor computes real sleep/study correlation, detects missed day gently, and requires confirmation for changes', () => {
  const refDate = '2026-11-19';
  const state = getInitialState('ar');
  state.onboarded = true;
  state.userName = 'أحمد';
  state.dialect = 'egyptian';
  state.actions = DEFAULT_ACTIONS.map((a) =>
    a.id === 'study' || a.id === 'sleep' ? { ...a, enabled: true } : a
  );
  state.logs = {
    '2026-11-16': {
      date: '2026-11-16',
      entries: {
        study: { actionId: 'study', times: 2, amounts: [45, 45], total: 90, startedWith10Min: true },
        sleep: { actionId: 'sleep', times: 1, amounts: [8], total: 8, startedWith10Min: false },
      },
      energy: 8,
      focus: 8,
      feelingWhy: 'نمت كويس',
      quickNote: '',
      pointsEarned: 80,
      updatedAt: '2026-11-16T21:00:00.000Z',
    },
    '2026-11-17': {
      date: '2026-11-17',
      entries: {
        study: { actionId: 'study', times: 1, amounts: [30], total: 30, startedWith10Min: false },
        sleep: { actionId: 'sleep', times: 1, amounts: [5], total: 5, startedWith10Min: false },
      },
      energy: 4,
      focus: 5,
      feelingWhy: 'نمت قليل',
      quickNote: '',
      pointsEarned: 45,
      updatedAt: '2026-11-17T21:00:00.000Z',
    },
  };

  const analysis = analyzeUserDataForNoor(state, 'ar', refDate);
  assert.equal(analysis.sleepImpactPct, 200); // 90 vs 30
  assert.match(analysis.headlineInsight, /يا أحمد/);
  assert.match(analysis.headlineInsight, /200%/);
  assert.equal(analysis.missedRecentDay, true);
  assert.match(analysis.oneStepOnly, /نكمل من بكرة، مفيش عقاب/);
  assert.doesNotMatch(analysis.headlineInsight, /فاشل|كسول|ضيعت/);

  // Proposals must always wait for confirmation
  const addReply = buildNoorReply(state, 'أضف فعل تأمل', 'ar', refDate);
  assert.equal(addReply.proposal?.kind, 'add_action');
  assert.equal(addReply.proposalStatus, 'pending');

  const colorReply = buildNoorReply(state, 'غير الألوان للبنفسجي', 'ar', refDate);
  assert.equal(colorReply.proposal?.kind, 'change_color');
  assert.equal(colorReply.proposalStatus, 'pending');

  const delReply = buildNoorReply(state, 'احذف فعل مذاكرة', 'ar', refDate);
  assert.equal(delReply.proposal?.kind, 'remove_action');
  assert.equal(delReply.proposalStatus, 'pending');
});

test('cups unit and custom dailyAmount work in flexible goals and day points', () => {
  const waterTask: ActionConfig = {
    id: 'water_1',
    nameAr: 'شرب مياه',
    nameEn: 'Drink Water',
    unit: 'cups',
    color: '#00B8A9',
    icon: 'flame',
    dailyAmount: 8,
    weeklyGoal: 56,
    bestTime: 'morning',
    difficulty: 'easy',
    allowTenMinRule: false,
    enabled: true,
  };
  assert.equal(computeFlexibleDailyGoal(waterTask, 0), 8);
  const metrics = getActionMetrics(waterTask, {}, 0, 'en', '2026-11-19');
  assert.equal(metrics.flexibleDailyGoal, 8);
});

test('Deep Weekly Recommendation detects Sleep 7+h, Energy < 4 drop, and Friday-only dip, and Noor explains it in chat', () => {
  const refDate = '2026-11-19';

  // Case A: Sleep 7+ hours boosts Study with real numbers + Noor explains it
  const sleepStudyState = getInitialState('en');
  sleepStudyState.onboarded = true;
  sleepStudyState.userName = 'Omar';
  sleepStudyState.dialect = 'english';
  sleepStudyState.actions = DEFAULT_ACTIONS.map((a) =>
    a.id === 'study' || a.id === 'sleep' ? { ...a, enabled: true } : a
  );
  sleepStudyState.logs = {
    '2026-11-16': {
      date: '2026-11-16',
      entries: {
        study: { actionId: 'study', times: 2, amounts: [45, 45], total: 90, startedWith10Min: false },
        sleep: { actionId: 'sleep', times: 1, amounts: [8], total: 8, startedWith10Min: false },
      },
      energy: 7,
      focus: 8,
      feelingWhy: 'Rested',
      quickNote: '',
      pointsEarned: 70,
      updatedAt: '2026-11-16T21:00:00.000Z',
    },
    '2026-11-17': {
      date: '2026-11-17',
      entries: {
        study: { actionId: 'study', times: 1, amounts: [30], total: 30, startedWith10Min: false },
        sleep: { actionId: 'sleep', times: 1, amounts: [5], total: 5, startedWith10Min: false },
      },
      energy: 6,
      focus: 6,
      feelingWhy: 'Short sleep',
      quickNote: '',
      pointsEarned: 40,
      updatedAt: '2026-11-17T21:00:00.000Z',
    },
  };
  // Only 2 logged days: no correlation claim is allowed (tiny sample).
  const tinyReport = generateWeeklyReport(sleepStudyState, 'en', 0, refDate);
  assert.equal(tinyReport.deepRecommendation.pattern, 'baseline');
  assert.doesNotMatch(tinyReport.recommendations[0].text, /\d+%/);

  // Enough days (4 good-sleep + 4 short-sleep): the pattern may appear.
  const mk = (d: string, study: number, sleep: number) => ({
    date: d,
    entries: {
      study: { actionId: 'study', times: 1, amounts: [study], total: study, startedWith10Min: false },
      sleep: { actionId: 'sleep', times: 1, amounts: [sleep], total: sleep, startedWith10Min: false },
    },
    energy: 6,
    focus: 6,
    feelingWhy: 'x',
    quickNote: '',
    pointsEarned: 40,
    updatedAt: d + 'T21:00:00.000Z',
  });
  sleepStudyState.logs = {
    '2026-11-12': mk('2026-11-12', 90, 8),
    '2026-11-13': mk('2026-11-13', 30, 5),
    '2026-11-14': mk('2026-11-14', 90, 8),
    '2026-11-15': mk('2026-11-15', 30, 5),
    '2026-11-16': mk('2026-11-16', 90, 8),
    '2026-11-17': mk('2026-11-17', 30, 5),
    '2026-11-18': mk('2026-11-18', 90, 8),
    '2026-11-19': mk('2026-11-19', 30, 5),
  };
  const sleepReport = generateWeeklyReport(sleepStudyState, 'en', 0, refDate);
  assert.equal(sleepReport.recommendations.length, 1);
  assert.equal(sleepReport.deepRecommendation.pattern, 'sleep_study');
  assert.match(sleepReport.recommendations[0].text, /7\+ hours/);
  assert.match(sleepReport.recommendations[0].text, /200%/);

  const noorSleepExplain = buildNoorReply(
    sleepStudyState,
    'Explain weekly recommendation',
    'en',
    refDate
  );
  assert.match(noorSleepExplain.text, /Omar/);
  assert.match(noorSleepExplain.text, /200%/);

  // Case B: Energy < 4 makes Workout drop
  const energyDropState = getInitialState('en');
  energyDropState.onboarded = true;
  energyDropState.actions = DEFAULT_ACTIONS.map((a) =>
    a.id === 'workout' ? { ...a, enabled: true } : a
  );
  energyDropState.logs = {
    '2026-11-16': makeLog('2026-11-16', 0, 50, 0, 8),
    '2026-11-17': makeLog('2026-11-17', 0, 40, 0, 7),
    '2026-11-18': makeLog('2026-11-18', 0, 0, 0, 3),
    '2026-11-19': makeLog('2026-11-19', 0, 10, 0, 2),
    // earlier days so the sample is large enough (7+ logs, 2+ per group)
    '2026-11-12': makeLog('2026-11-12', 0, 45, 0, 7),
    '2026-11-13': makeLog('2026-11-13', 0, 40, 0, 8),
    '2026-11-14': makeLog('2026-11-14', 0, 5, 0, 3),
  };
  const energyReport = generateWeeklyReport(energyDropState, 'en', 0, refDate);
  assert.equal(energyReport.recommendations.length, 1);
  assert.equal(energyReport.deepRecommendation.pattern, 'low_energy_drop');
  assert.match(energyReport.recommendations[0].text, /below 4\/10/i);
  assert.match(energyReport.recommendations[0].text, /Workout/i);

  // Case C: Friday is consistently low -> recommend lowering goal on Friday ONLY
  const fridayDipState = getInitialState('ar');
  fridayDipState.onboarded = true;
  fridayDipState.actions = DEFAULT_ACTIONS.map((a) =>
    a.id === 'study' ? { ...a, enabled: true } : a
  );
  fridayDipState.logs = {
    '2026-11-08': makeLog('2026-11-08', 60, 0, 0, 6), // Sun
    '2026-11-09': makeLog('2026-11-09', 60, 0, 0, 6), // Mon
    '2026-11-06': makeLog('2026-11-06', 5, 0, 0, 6), // Friday
    '2026-11-13': makeLog('2026-11-13', 10, 0, 0, 6), // Friday
    '2026-11-15': makeLog('2026-11-15', 60, 0, 0, 6), // Sun
    '2026-11-16': makeLog('2026-11-16', 60, 0, 0, 6), // Mon
    '2026-11-17': makeLog('2026-11-17', 60, 0, 0, 6), // Tue
    '2026-11-18': makeLog('2026-11-18', 60, 0, 0, 6), // Wed
  };
  const fridayReport = generateWeeklyReport(fridayDipState, 'ar', 0, refDate);
  assert.equal(fridayReport.recommendations.length, 1);
  assert.equal(fridayReport.deepRecommendation.pattern, 'weekday_dip');
  assert.match(fridayReport.recommendations[0].text, /الجمعة/);
  assert.match(fridayReport.recommendations[0].text, /قلّل هدف يوم الجمعة بس/);
});

test('Noor strictly separates all 6 dialects, persists dialect in localStorage, and switches immediately on "انا مصري"', () => {
  const store = setupMockLocalStorage();
  const refDate = '2026-11-19';

  saveGlobalDialect('gulf');
  assert.equal(store.get(DIALECT_KEY), 'gulf');
  assert.equal(getDefaultDialect('ar'), 'gulf');

  const baseState = getInitialState('ar');
  baseState.onboarded = true;
  baseState.userName = 'علي';
  baseState.actions = ENABLED_TEST_ACTIONS;

  // Test Gulf: zero Egyptian markers allowed
  const gulfState = { ...baseState, dialect: 'gulf' as NoorDialect };
  const gulfAnalysis = analyzeUserDataForNoor(gulfState, 'ar', refDate);
  const gulfReply = buildNoorReply(gulfState, 'مرحبا', 'ar', refDate);
  const gulfCombined = `${gulfAnalysis.headlineInsight} ${gulfAnalysis.oneStepOnly} ${gulfAnalysis.dashboardExplanation} ${gulfReply.text}`;
  assert.match(gulfCombined, /هلا|وش أخبارك|يالله|زين/);
  assert.doesNotMatch(gulfCombined, /ازيك|عامل ايه|عايز|عشان|كده|دلوقتي|مفيش|لسه|جامد/);

  // Test Egyptian: zero Gulf/Levantine/Maghrebi markers allowed
  const egState = { ...baseState, dialect: 'egyptian' as NoorDialect };
  const egAnalysis = analyzeUserDataForNoor(egState, 'ar', refDate);
  const egReply = buildNoorReply(egState, 'ازيك', 'ar', refDate);
  const egCombined = `${egAnalysis.headlineInsight} ${egAnalysis.oneStepOnly} ${egAnalysis.dashboardExplanation} ${egReply.text}`;
  assert.match(egCombined, /ازيك|عشان|كده|يلا|براحتك|دلوقتي|مفيش/);
  assert.doesNotMatch(
    egCombined,
    /(?<![\u0621-\u064A])(وش رايك|ابشر|أبشر|طيب|عسى|زين|الحين|وايد|كيفك|شو|بدي|هيك|لاباس|كيداير|بغيت|بزاف)(?![\u0621-\u064A])/
  );

  // Test Levantine
  const levState = { ...baseState, dialect: 'levantine' as NoorDialect };
  const levAnalysis = analyzeUserDataForNoor(levState, 'ar', refDate);
  assert.match(levAnalysis.headlineInsight, /كيفك|كيف كان|منيح|عم نبلش/);
  assert.doesNotMatch(levAnalysis.headlineInsight, /ازيك|وش|لاباس/);

  // Test Maghrebi
  const magState = { ...baseState, dialect: 'maghrebi' as NoorDialect };
  const magAnalysis = analyzeUserDataForNoor(magState, 'ar', refDate);
  assert.match(magAnalysis.headlineInsight, /كيداز|نهارك|ماشي مشكل/);
  assert.doesNotMatch(magAnalysis.headlineInsight, /ازيك|وش|كيفك/);

  // Test Fusha
  const fushaState = { ...baseState, dialect: 'fusha' as NoorDialect };
  const fushaAnalysis = analyzeUserDataForNoor(fushaState, 'ar', refDate);
  assert.match(fushaAnalysis.headlineInsight, /لا بأس|أخبرني/);
  assert.doesNotMatch(fushaAnalysis.headlineInsight, /ازيك|وش|كيفك|لاباس/);

  // Test English (warm friend greeting on 0 days, never nagging "no days logged")
  const enState = { ...baseState, dialect: 'english' as NoorDialect };
  const enAnalysis = analyzeUserDataForNoor(enState, 'ar', refDate);
  assert.equal(resolveNoorDialect(enState, 'ar'), 'english');
  assert.match(enAnalysis.headlineInsight, /just starting|how was your day/i);
  assert.doesNotMatch(enAnalysis.headlineInsight, /haven't logged any days|no days logged/i);

  // Chat test: User in Gulf says "انا مصري" -> Noor switches immediately & says "تمام، هكلمك مصري على طول"
  assert.equal(detectDialectSwitchInMessage('انا مصري'), 'egyptian');
  const switchReply = buildNoorReply(gulfState, 'انا مصري', 'ar', refDate);
  assert.equal(switchReply.switchedDialect, 'egyptian');
  assert.match(switchReply.text, /تمام، هكلمك مصري على طول/);

  // Truthful Privacy & Architecture copy check (local-first + optional Cloud SQL sync + server Studio APIs)
  assert.match(DICTIONARY.ar.privacyNotice, /على جهازك افتراضياً/);
  assert.match(DICTIONARY.ar.privacyNotice, /Cloud SQL/);
  assert.match(DICTIONARY.en.privacyNotice, /offline on your device by default/i);
  assert.match(DICTIONARY.en.privacyNotice, /Cloud SQL/);
});

test('Noor is a friendly companion: never nags on 0 days, handles boredom empathetically, enforces 1 question, and never repeats/guilts', () => {
  const refDate = '2026-11-19';
  const state = getInitialState('ar');
  state.onboarded = true;
  state.userName = 'يوسف';
  state.dialect = 'egyptian';
  state.noorPreference = 'talk';

  // Rule 1 & 3: 0 days logged -> never says "مفيش أيام متسجلة"
  const initGreeting = getNoorInitialGreeting(state, 'ar', 'chat', refDate);
  assert.doesNotMatch(initGreeting.text, /مفيش أيام متسجلة|0 days/i);
  assert.match(initGreeting.text, /يوسف/);

  const emptyPrompt = getNoorEmptyHomePrompt(state, 'ar');
  assert.match(emptyPrompt, /احنا لسه في الأول خالص/);

  // Exact Test Case: "انا زهقان ومش عايز اذاكر"
  const unmotivated = buildNoorReply(state, 'انا زهقان ومش عايز اذاكر', 'ar', refDate);
  assert.doesNotMatch(unmotivated.text, /مفيش أيام متسجلة|سجل يومك/);
  assert.match(unmotivated.text, /فاهمك.*كلنا بنزهق، تحب نحكي شوية ولا نعمل حاجة خفيفة خالص؟/);

  // Bored -> follow up asking if work or study (max 1 question)
  const bored = buildNoorReply(state, 'انا زهقان', 'ar', refDate);
  assert.match(bored.text, /زهقان ليه يا يوسف؟ احكيلي، الشغل ولا المذاكرة\./);
  assert.equal((bored.text.match(/[?؟]/g) ?? []).length <= 1, true);

  // Follow-up answer "المذاكرة" -> sympathetic friend follow-up
  const followUp = buildNoorReply(state, 'المذاكرة', 'ar', {
    mode: 'chat',
    previousNoorTexts: [bored.text],
    referenceKey: refDate,
  });
  assert.match(followUp.text, /المذاكرة|بريك/);
  assert.equal((followUp.text.match(/[?؟]/g) ?? []).length <= 1, true);

  // Greeting "ازيك" -> remembers name, asks about him, no data talk
  const hi = buildNoorReply(state, 'ازيك', 'ar', refDate);
  assert.match(hi.text, /ازيك يا يوسف، عامل ايه النهاردة؟/);
  assert.doesNotMatch(hi.text, /مفيش أيام متسجلة|سجل/);

  // Rule 4: Help Mode ("ساعديني") works gently with 0 data
  const helpReply = buildNoorReply(state, 'ساعديني', 'ar', refDate);
  assert.equal(helpReply.switchedMode, 'help');
  assert.doesNotMatch(helpReply.text, /مفيش أيام متسجلة/);

  // Rule 5: Anti-repeat + Decline logging stops without guilt
  const tell1 = buildNoorReply(state, 'احكيلي حاجة', 'ar', { mode: 'chat', previousNoorTexts: [], referenceKey: refDate });
  const tell2 = buildNoorReply(state, 'احكيلي حاجة', 'ar', { mode: 'chat', previousNoorTexts: [tell1.text], referenceKey: refDate });
  assert.notEqual(tell1.text, tell2.text);

  const declined = buildNoorReply(state, 'مش عايز اسجل', 'ar', refDate);
  assert.equal(declined.declinedLogToday, true);
  assert.match(declined.text, /تمام براحتك يا يوسف، انا هنا لما تحب/);
});

test('Guided onboarding, tour persistence, (?) help content, and Noor lost-user Show Me flow work together', () => {
  const store = setupMockLocalStorage();
  const refDate = '2026-11-19';

  assert.equal(hasSeenIntro(), false);
  markIntroSeen();
  assert.equal(hasSeenIntro(), true);

  markTourDoneStorage();
  assert.equal(store.get(TOUR_DONE_KEY), 'true');
  resetTourDoneStorage();
  assert.equal(store.get(TOUR_DONE_KEY), undefined);

  const egState = getInitialState('ar');
  egState.onboarded = true;
  egState.userName = 'أحمد';
  egState.dialect = 'egyptian';

  const lostReply = buildNoorReply(egState, 'انا مش فاهم', 'ar', refDate);
  assert.equal(lostReply.showTourButton, true);
  assert.match(lostReply.text, /بص يا أحمد، البرنامج ده ببساطة.*تحب أوريك؟/);

  const homeHelp = getScreenHelpContent('home', egState, 'ar');
  assert.match(homeHelp.body, /هنا بتبدأ يومك/);
  assert.match(homeHelp.extra ?? '', /كل فعل ليه بطاقة لوحده/);
  assert.match(getScreenHelpContent('dashboard', egState, 'ar').body, /هنا بتشوف تطورك/);
  assert.match(getScreenHelpContent('report', egState, 'ar').body, /التقرير الأسبوعي/);
  assert.match(getScreenHelpContent('studio', egState, 'ar').body, /Gemini|خريطة/);

  const enState = { ...egState, dialect: 'english' as NoorDialect };
  const enLost = buildNoorReply(enState, "I'm lost", 'en', refDate);
  assert.equal(enLost.showTourButton, true);
  assert.match(enLost.text, /أحمد.*want me to show you\?/);

  assert.equal(DICTIONARY.ar.walkthroughCards.length, 5);
  assert.equal(DICTIONARY.en.walkthroughCards.length, 5);
  assert.match(DICTIONARY.ar.walkthroughCards[4].line1, /محفوظة على جهازك افتراضياً/);
});

test('Ambient Sounds helpers, engine headless fallback, and per-user persistence work cleanly', async () => {
  setupMockLocalStorage();

  // Mode and volume validation
  assert.deepEqual(AMBIENT_MODES, ['rain', 'lofi', 'purr', 'quiet']);
  assert.equal(isValidAmbientMode('rain'), true);
  assert.equal(isValidAmbientMode('lofi'), true);
  assert.equal(isValidAmbientMode('purr'), true);
  assert.equal(isValidAmbientMode('quiet'), true);
  assert.equal(isValidAmbientMode('thunder'), false);
  assert.equal(AMBIENT_MODE_META.purr.accent, '#FF6B35');

  assert.equal(clampVolume(1.7), 1);
  assert.equal(clampVolume(-0.4), 0);
  assert.equal(clampVolume(Number.NaN), DEFAULT_AMBIENT_SOUND.volume);
  assert.equal(clampVolume(0.65), 0.65);

  // Normalization & transitions
  assert.deepEqual(normalizeAmbientSettings(null), DEFAULT_AMBIENT_SOUND);
  assert.deepEqual(
    normalizeAmbientSettings({ enabled: true, mode: 'quiet', volume: 0.5 }),
    { enabled: false, mode: 'quiet', volume: 0.5 }
  );

  const toggledOn = toggleAmbientEnabled(DEFAULT_AMBIENT_SOUND);
  assert.equal(toggledOn.enabled, true);
  assert.equal(toggledOn.mode, 'rain');

  const selectedLofi = selectAmbientMode(toggledOn, 'lofi');
  assert.equal(selectedLofi.enabled, true);
  assert.equal(selectedLofi.mode, 'lofi');

  const selectedPurr = selectAmbientMode(selectedLofi, 'purr');
  assert.equal(selectedPurr.enabled, true);
  assert.equal(selectedPurr.mode, 'purr');

  const selectedQuiet = selectAmbientMode(selectedPurr, 'quiet');
  assert.equal(selectedQuiet.enabled, false);
  assert.equal(selectedQuiet.mode, 'quiet');

  // Re-enabling from quiet restores 'rain'
  const resumed = toggleAmbientEnabled(selectedQuiet);
  assert.equal(resumed.enabled, true);
  assert.equal(resumed.mode, 'rain');

  // Engine gracefully handles Node/headless environments without AudioContext
  const engine = new AmbientAudioEngine();
  assert.equal(engine.isSupported(), false);
  const applied = engine.applySettings({ enabled: true, mode: 'purr', volume: 0.72 });
  assert.deepEqual(applied, { enabled: true, mode: 'purr', volume: 0.72 });
  assert.deepEqual(engine.getSettings(), { enabled: true, mode: 'purr', volume: 0.72 });
  engine.dispose();

  // Per-user storage persistence
  await registerLocalAccount('audio_user', 'pass', 'en');
  const userState = loadUserAppState('audio_user');
  userState.ambientSound = { enabled: true, mode: 'lofi', volume: 0.8 };
  saveUserAppState('audio_user', userState);

  const reloaded = loadUserAppState('audio_user');
  assert.deepEqual(reloaded.ambientSound, { enabled: true, mode: 'lofi', volume: 0.8 });

  // Bilingual dictionary coverage
  assert.equal(DICTIONARY.en.ambientModeRain, 'Rain');
  assert.equal(DICTIONARY.en.ambientModeLofi, 'Lo-fi');
  assert.equal(DICTIONARY.en.ambientModePurr, 'Cat Purring');
  assert.match(DICTIONARY.ar.ambientModePurr, /خرخرة قطة/);
});


test('partial week with few logged days is not called heavy from goals alone', () => {
  const state = getInitialState();
  state.onboarded = true;
  state.actions = ENABLED_TEST_ACTIONS;
  const refDate = '2026-11-19';
  state.logs = {
    '2026-11-18': makeLog('2026-11-18', 10, 0, 2, 7, 7, 'ok', true),
    '2026-11-19': makeLog('2026-11-19', 10, 0, 2, 7, 7, 'ok', true),
  };
  const report = generateWeeklyReport(state, 'ar', 0, refDate);
  assert.equal(report.isHeavyWeek, false);
});

test('Noor Egyptian reflects an already-stated low feeling instead of asking how they feel', () => {
  const state = getInitialState('ar');
  state.onboarded = true;
  state.dialect = 'egyptian';
  state.actions = ENABLED_TEST_ACTIONS;
  const reply = buildNoorReply(state, 'حاسس اني مش مبسوط ومش عارف ليه', 'ar', '2026-11-19');
  assert.doesNotMatch(reply.text, /حاسس بإيه/);
  assert.match(reply.text, /تقيل|حاسس بيك/);
  assert.notEqual(reply.isFallback, true);
});
