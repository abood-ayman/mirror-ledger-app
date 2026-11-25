import type {
  ActionConfig,
  ActionWeeklyMetrics,
  AppState,
  DailyLog,
  Language,
} from '../types/tracker';
import { DAY_LABELS, UNIT_LABELS } from './i18n';
import { addDays, getTodayKey, getWeekDates } from './storage';

export function getEnabledActions(actions: ActionConfig[]): ActionConfig[] {
  return actions.filter((a) => a.enabled);
}

export function getActionName(action: ActionConfig, lang: Language): string {
  return lang === 'ar' ? action.nameAr || action.nameEn : action.nameEn || action.nameAr;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeFlexibleDailyGoal(
  action: ActionConfig,
  last14DaysAvg: number
): number {
  if (last14DaysAvg > 0) {
    // Auto-adjust gently (+15%, e.g. avg 30 -> 35, never jumping blindly to 60)
    const target = Math.ceil(last14DaysAvg * 1.15);
    return Math.max(1, target === Math.round(last14DaysAvg) ? target + 1 : target);
  }
  if (action.dailyAmount && action.dailyAmount > 0) {
    return action.dailyAmount;
  }
  if (action.weeklyGoal && action.weeklyGoal > 0) {
    return Math.max(1, Math.round(action.weeklyGoal / 7));
  }
  if (action.unit === 'minutes') return 15;
  if (action.unit === 'pages') return 10;
  if (action.unit === 'hours') return 7;
  if (action.unit === 'cups') return 6;
  if (action.unit === 'reps') return 20;
  return 1;
}

export function getActionMetrics(
  action: ActionConfig,
  logs: Record<string, DailyLog>,
  weekOffset: number,
  lang: Language,
  referenceKey = getTodayKey()
): ActionWeeklyMetrics {
  const today = referenceKey;
  const thisWeekDates = getWeekDates(weekOffset, today);
  const lastWeekDates = getWeekDates(weekOffset - 1, today);

  // All logged dates sorted chronologically ascending
  const allSortedAsc = Object.values(logs)
    .filter((l) => (l.entries[action.id]?.total ?? 0) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // 1. First Time = Average of FIRST 3 days ever logged for this action
  const first3 = allSortedAsc.slice(0, 3);
  const first3DaysAvg =
    first3.length > 0
      ? round1(
          first3.reduce((acc, l) => acc + (l.entries[action.id]?.total ?? 0), 0) /
            first3.length
        )
      : 0;

  // 2. Average = Average of LAST 14 logged days
  const last14 = allSortedAsc.slice(-14);
  const last14DaysAvg =
    last14.length > 0
      ? round1(
          last14.reduce((acc, l) => acc + (l.entries[action.id]?.total ?? 0), 0) /
            last14.length
        )
      : 0;

  // 3. Last Week = Last 7 full days (previous 7-day window)
  const lastWeekTotal = lastWeekDates.reduce(
    (acc, d) => acc + (logs[d]?.entries[action.id]?.total ?? 0),
    0
  );
  const lastWeekAvg = round1(lastWeekTotal / 7);

  // This week totals
  let thisWeekTotal = 0;
  let thisWeekTimes = 0;
  let thisWeekActiveDays = 0;
  const labels = DAY_LABELS[lang];

  const dailyAmounts = thisWeekDates.map((d, idx) => {
    const entry = logs[d]?.entries[action.id];
    const total = entry?.total ?? 0;
    const times = entry?.times ?? 0;
    thisWeekTotal += total;
    thisWeekTimes += times;
    if (total > 0) thisWeekActiveDays += 1;
    return {
      date: d,
      dayLabel: labels[idx] ?? String(idx + 1),
      total,
    };
  });

  const lastLogged = allSortedAsc[allSortedAsc.length - 1];
  const prevLogged = allSortedAsc[allSortedAsc.length - 2];
  const lastLoggedAmount = lastLogged?.entries[action.id]?.total ?? null;

  const vsLastTimePct =
    lastLoggedAmount !== null && prevLogged
      ? Math.round(
          ((lastLoggedAmount - (prevLogged.entries[action.id]?.total ?? 0)) /
            Math.max(1, prevLogged.entries[action.id]?.total ?? 1)) *
            100
        )
      : null;

  const vsAveragePct =
    lastLoggedAmount !== null && last14DaysAvg > 0
      ? Math.round(((lastLoggedAmount - last14DaysAvg) / last14DaysAvg) * 100)
      : null;

  const currentDayOrWeekAvg =
    thisWeekActiveDays > 0 ? thisWeekTotal / thisWeekActiveDays : lastLoggedAmount ?? 0;

  const vsFirstTimePct =
    first3DaysAvg > 0 && currentDayOrWeekAvg > 0
      ? Math.round(((currentDayOrWeekAvg - first3DaysAvg) / first3DaysAvg) * 100)
      : null;

  const firstTimeMultiplier =
    first3DaysAvg > 0 && currentDayOrWeekAvg > 0
      ? round1(currentDayOrWeekAvg / first3DaysAvg)
      : null;

  const vsLastWeekPct =
    lastWeekTotal > 0
      ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
      : thisWeekTotal > 0
      ? 100
      : null;

  const weekLogs = thisWeekDates
    .map((d) => logs[d])
    .filter((l): l is DailyLog => Boolean(l));

  let bestDay: ActionWeeklyMetrics['bestDay'] = null;
  let worstDay: ActionWeeklyMetrics['worstDay'] = null;

  const candidateLogs = weekLogs.length > 0 ? weekLogs : allSortedAsc.slice(-7);
  if (candidateLogs.length > 0) {
    const sortedByAmount = [...candidateLogs].sort(
      (a, b) =>
        (b.entries[action.id]?.total ?? 0) - (a.entries[action.id]?.total ?? 0)
    );
    const best = sortedByAmount[0];
    bestDay = {
      date: best.date,
      total: best.entries[action.id]?.total ?? 0,
      energy: best.energy,
      focus: best.focus,
      feelingWhy: best.feelingWhy,
    };

    const worst = sortedByAmount[sortedByAmount.length - 1];
    if (sortedByAmount.length > 1 && worst.date !== best.date) {
      worstDay = {
        date: worst.date,
        total: worst.entries[action.id]?.total ?? 0,
        energy: worst.energy,
        focus: worst.focus,
        feelingWhy: worst.feelingWhy,
      };
    }
  }

  // Consecutive streak ending today or yesterday
  let streak = 0;
  let cursor = (logs[today]?.entries[action.id]?.total ?? 0) > 0 ? today : addDays(today, -1);
  while ((logs[cursor]?.entries[action.id]?.total ?? 0) > 0) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  const streakBroken = streak === 0 && allSortedAsc.length > 0;

  const flexibleDailyGoal = computeFlexibleDailyGoal(action, last14DaysAvg);
  const flexibleWeeklyGoal =
    action.weeklyGoal && action.weeklyGoal > 0
      ? Math.min(action.weeklyGoal, flexibleDailyGoal * 7)
      : flexibleDailyGoal * 7;

  // Check if action dropped 3 days in a row
  const last3Days = [addDays(today, -2), addDays(today, -1), today];
  const dVals = last3Days.map((d) => logs[d]?.entries[action.id]?.total ?? 0);
  const hadPriorLogs = allSortedAsc.length >= 3;
  const dropping3Days =
    hadPriorLogs &&
    ((dVals[0] > dVals[1] && dVals[1] > dVals[2] && dVals[2] < last14DaysAvg) ||
      (dVals[0] < last14DaysAvg * 0.6 &&
        dVals[1] < last14DaysAvg * 0.6 &&
        dVals[2] < last14DaysAvg * 0.6));

  const dailyRate =
    thisWeekActiveDays > 0
      ? thisWeekTotal / 7
      : last14DaysAvg > 0
      ? last14DaysAvg * 0.7
      : 0;
  const nextWeekPrediction = Math.round(
    dailyRate * 7 * (vsLastWeekPct && vsLastWeekPct > 0 ? 1.08 : 1)
  );

  const consistency = thisWeekActiveDays / 7;
  const productivityScore = Math.round(thisWeekTimes * thisWeekTotal * consistency);

  return {
    action,
    thisWeekTotal,
    thisWeekTimes,
    thisWeekActiveDays,
    dailyAmounts,
    lastLoggedAmount,
    first3DaysAvg,
    last14DaysAvg,
    lastWeekTotal,
    lastWeekAvg,
    vsLastTimePct,
    vsAveragePct,
    vsFirstTimePct,
    firstTimeMultiplier,
    vsLastWeekPct,
    bestDay,
    worstDay,
    streak,
    streakBroken,
    flexibleDailyGoal,
    flexibleWeeklyGoal,
    dropping3Days,
    nextWeekPrediction,
    productivityScore,
  };
}

export function getEnergyStreak(
  logs: Record<string, DailyLog>,
  referenceKey = getTodayKey()
): number {
  const today = referenceKey;
  let streak = 0;
  let cursor = logs[today] ? today : addDays(today, -1);
  while (logs[cursor]) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function getTenMinRuleCount(
  logs: Record<string, DailyLog>,
  weekDates?: string[]
): number {
  const targetLogs = weekDates
    ? weekDates.map((d) => logs[d]).filter((l): l is DailyLog => Boolean(l))
    : Object.values(logs);

  let count = 0;
  for (const log of targetLogs) {
    for (const entry of Object.values(log.entries)) {
      if (entry.startedWith10Min && entry.total > 0) {
        count += 1;
      }
    }
  }
  return count;
}

/** Minimum logged days before a cross-action pattern is shown. */
const MIN_CORRELATION_LOGS = 7;

export function getCrossActionCorrelation(
  actions: ActionConfig[],
  logs: Record<string, DailyLog>,
  lang: Language
): { text: string; pctLift: number | null } {
  const enabled = getEnabledActions(actions);
  const allLogs = Object.values(logs);

  if (allLogs.length < MIN_CORRELATION_LOGS || enabled.length < 2) {
    return {
      text:
        lang === 'ar'
          ? 'سجل 7 أيام على الأقل عشان نقدر نلاحظ ارتباط أفعالك ببعضها.'
          : 'Log at least 7 days so we can notice how your actions relate.',
      pctLift: null,
    };
  }

  const study =
    enabled.find((a) => a.id === 'study' || /مذاكرة|study/i.test(a.nameEn + a.nameAr)) ??
    enabled[0];
  const workout =
    enabled.find((a) => a.id === 'workout' || /تمرين|workout/i.test(a.nameEn + a.nameAr)) ??
    enabled[1];

  const withDriver = allLogs.filter((l) => (l.entries[workout.id]?.total ?? 0) > 0);
  const withoutDriver = allLogs.filter((l) => (l.entries[workout.id]?.total ?? 0) === 0);

  if (withDriver.length > 0 && withoutDriver.length > 0) {
    const avgWith =
      withDriver.reduce((s, l) => s + (l.entries[study.id]?.total ?? 0), 0) /
      withDriver.length;
    const avgWithout =
      withoutDriver.reduce((s, l) => s + (l.entries[study.id]?.total ?? 0), 0) /
      withoutDriver.length;

    if (avgWithout > 0) {
      const lift = Math.round(((avgWith - avgWithout) / avgWithout) * 100);
      const driverName = getActionName(workout, lang);
      const targetName = getActionName(study, lang);
      if (lift > 0) {
        return {
          text:
            lang === 'ar'
              ? `في الأيام اللي بتعمل فيها ${driverName}، ${targetName} كان أعلى بنسبة ${lift}% في الأيام اللي سجلتها (ملاحظة مش سبب)`
              : `On days you do ${driverName}, your ${targetName} was ${lift}% higher across the days you logged (a pattern, not a cause)`,
          pctLift: lift,
        };
      }
    }
  }

  const highE = allLogs.filter((l) => l.energy >= 7);
  const lowE = allLogs.filter((l) => l.energy < 7);
  if (highE.length > 0 && lowE.length > 0) {
    const avgHigh =
      highE.reduce((s, l) => s + (l.entries[study.id]?.total ?? 0), 0) / highE.length;
    const avgLow =
      lowE.reduce((s, l) => s + (l.entries[study.id]?.total ?? 0), 0) / lowE.length;
    if (avgLow > 0) {
      const lift = Math.max(0, Math.round(((avgHigh - avgLow) / avgLow) * 100));
      const targetName = getActionName(study, lang);
      return {
        text:
          lang === 'ar'
            ? `في الأيام اللي طاقتك فيها 7 أو أكتر، ${targetName} كان أعلى بنسبة ${lift}% في الأيام اللي سجلتها (ملاحظة مش سبب)`
            : `On days your energy is 7+, your ${targetName} was ${lift}% higher across the days you logged (a pattern, not a cause)`,
        pctLift: lift,
      };
    }
  }

  return {
    text:
      lang === 'ar'
        ? `استمر في تسجيل أفعالك وطاقتك عشان نقيس التأثير المتبادل بدقة.`
        : `Keep logging actions and energy to measure cross-action lift accurately.`,
    pctLift: null,
  };
}

export function getMoodActionMap(
  actions: ActionConfig[],
  logs: Record<string, DailyLog>,
  lang: Language
): string {
  const enabled = getEnabledActions(actions);
  if (enabled.length === 0) {
    return lang === 'ar'
      ? 'أضف أول فعل عشان نكتشف علاقته بمستوى طاقتك.'
      : 'Add your first action to see how it responds to your energy.';
  }
  const allLogs = Object.values(logs);
  const lowEnergyLogs = allLogs.filter((l) => l.energy <= 4);
  const normalLogs = allLogs.filter((l) => l.energy > 4);

  if (lowEnergyLogs.length === 0 || normalLogs.length === 0) {
    return lang === 'ar'
      ? 'لما تسجل أيام بطاقة أقل من 4 هنحددلك أول فعل بيتأثر.'
      : 'When you log days with energy under 4, we will spot which action drops first.';
  }

  let worstDropAction = enabled[0];
  let biggestDropPct = -999;

  for (const a of enabled) {
    const avgNormal =
      normalLogs.reduce((s, l) => s + (l.entries[a.id]?.total ?? 0), 0) / normalLogs.length;
    const avgLow =
      lowEnergyLogs.reduce((s, l) => s + (l.entries[a.id]?.total ?? 0), 0) /
      lowEnergyLogs.length;
    if (avgNormal > 0) {
      const dropPct = Math.round(((avgNormal - avgLow) / avgNormal) * 100);
      if (dropPct > biggestDropPct) {
        biggestDropPct = dropPct;
        worstDropAction = a;
      }
    }
  }

  const name = getActionName(worstDropAction, lang);
  return lang === 'ar'
    ? `لما طاقتك بتكون أقل من 4، ${name} هو أول حاجة بتقل.`
    : `When your energy is under 4, ${name} is the first to drop.`;
}

export function getTodayOverviewSentence(
  state: AppState,
  metricsList: ActionWeeklyMetrics[],
  lang: Language,
  referenceKey = getTodayKey()
): string {
  const todayLog = state.logs[referenceKey];

  if (!todayLog) {
    return lang === 'ar'
      ? 'لسه مسجلتش النهاردة — دقيقة واحدة تسجل فعلك وتبدأ خريطتك.'
      : "You haven't logged today yet — take 1 minute to record today's action.";
  }

  const primary = metricsList[0];
  if (!primary) {
    return lang === 'ar'
      ? `النهاردة سجلت طاقتك ${todayLog.energy}/10 وتركيزك ${todayLog.focus}/10.`
      : `Today you logged energy at ${todayLog.energy}/10 and focus at ${todayLog.focus}/10.`;
  }
  const todayVal = todayLog.entries[primary.action.id]?.total ?? 0;
  const avg = primary.last14DaysAvg;
  const name = getActionName(primary.action, lang);
  const unit = UNIT_LABELS[lang][primary.action.unit];

  if (avg === 0) {
    return lang === 'ar'
      ? `النهاردة سجلت ${todayVal} ${unit} ${name}، وطاقتك ${todayLog.energy}/10.`
      : `Today you logged ${todayVal} ${unit} of ${name}, with energy at ${todayLog.energy}/10.`;
  }

  const diffPct = Math.round(((todayVal - avg) / avg) * 100);
  if (diffPct >= 10) {
    return lang === 'ar'
      ? `النهاردة ${name} أعلى من متوسطك بـ ${diffPct}% (${todayVal} مقابل ${avg} ${unit}).`
      : `Today your ${name} is ${diffPct}% above your average (${todayVal} vs ${avg} ${unit}).`;
  }
  if (diffPct <= -10) {
    return lang === 'ar'
      ? `النهاردة ${name} أهدى من متوسطك بـ ${Math.abs(diffPct)}% (${todayVal} مقابل ${avg} ${unit}) — كمل براحتك.`
      : `Today your ${name} is ${Math.abs(diffPct)}% lighter than average (${todayVal} vs ${avg} ${unit}) — steady pace.`;
  }
  return lang === 'ar'
    ? `النهاردة ماشي قريب من متوسطك في ${name} (${todayVal} ${unit}) وطاقتك ${todayLog.energy}/10.`
    : `Today you are right around your ${name} average (${todayVal} ${unit}) with ${todayLog.energy}/10 energy.`;
}

export function getBalanceData(
  metricsList: ActionWeeklyMetrics[],
  lang: Language
): {
  balanceScore: number;
  slices: { name: string; value: number; pct: number; fill: string; attainment: number }[];
  balancedName: string;
  neglectedName: string;
} {
  const attainments = metricsList.map((m) => {
    const goal = Math.max(1, m.flexibleWeeklyGoal);
    const ratio = Math.min(1.2, m.thisWeekTotal / goal);
    return {
      action: m.action,
      name: getActionName(m.action, lang),
      fill: m.action.color,
      rawTotal: m.thisWeekTotal,
      attainment: Math.round(ratio * 100),
    };
  });

  const sumAttainment = attainments.reduce((s, a) => s + Math.max(1, a.attainment), 0);
  const slices = attainments.map((a) => ({
    name: a.name,
    value: Math.max(1, a.attainment),
    pct: Math.round((Math.max(1, a.attainment) / Math.max(1, sumAttainment)) * 100),
    fill: a.fill,
    attainment: a.attainment,
  }));

  const sorted = [...attainments].sort((a, b) => b.attainment - a.attainment);
  const maxAtt = sorted[0]?.attainment ?? 0;
  const minAtt = sorted[sorted.length - 1]?.attainment ?? 0;
  const avgAtt =
    attainments.reduce((s, a) => s + Math.min(100, a.attainment), 0) /
    Math.max(1, attainments.length);

  const spreadPenalty = Math.max(0, (maxAtt - minAtt) * 0.25);
  const balanceScore = Math.max(0, Math.min(100, Math.round(avgAtt - spreadPenalty)));

  return {
    balanceScore,
    slices,
    balancedName: sorted[0]?.name ?? '',
    neglectedName: sorted[sorted.length - 1]?.name ?? '',
  };
}
