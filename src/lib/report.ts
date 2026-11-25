import type {
  ActionConfig,
  ActionWeeklyMetrics,
  AppState,
  DailyLog,
  Language,
} from '../types/tracker';
import {
  getActionMetrics,
  getActionName,
  getBalanceData,
  getCrossActionCorrelation,
  getEnabledActions,
  getTenMinRuleCount,
} from './analytics';
import { UNIT_LABELS } from './i18n';
import { getTodayKey, getWeekDates } from './storage';

/** Minimum logged days before a pattern/correlation is shown (small samples are noise). */
export const MIN_PATTERN_LOGS = 7;
/** Minimum logged days this week before the week is judged heavy from goals or last-week comparison. */
export const MIN_WEEK_LOGS_TO_JUDGE = 4;

export type DeepPatternType =
  | 'sleep_study'
  | 'low_energy_drop'
  | 'weekday_dip'
  | 'energy_lift'
  | 'ten_min_rule'
  | 'baseline';

export interface DeepWeeklyRecommendation {
  pattern: DeepPatternType;
  pillType: 'suggestion' | 'goal' | 'tip';
  pillLabel: string;
  color: string;
  text: string;
  explanation: string;
  oneStep: string;
}

export interface WeeklyReportData {
  weekDates: string[];
  isHeavyWeek: boolean;
  /** True when too few days are logged to judge the week (balance and comparisons are hidden). */
  isPartialWeek: boolean;
  summaryText: string;
  energyAvg: number;
  energyChangePct: number | null;
  numbersRows: {
    actionId: string;
    name: string;
    color: string;
    total: number;
    unit: string;
    times: number;
    activeDays: number;
    /** This week's total divided by the days this action was logged, comparable to a per-logged-day average. */
    avgPerLoggedDay: number;
  }[];
  comparisonRows: {
    actionId: string;
    name: string;
    color: string;
    lastTime: number | null;
    avg14: number;
    first3Avg: number;
    vsLastWeekPct: number | null;
    firstTimeMult: number | null;
  }[];
  keyInsights: string[];
  deepRecommendation: DeepWeeklyRecommendation;
  recommendations: {
    pillType: 'suggestion' | 'goal' | 'tip';
    pillLabel: string;
    color: string;
    text: string;
  }[];
  oneNextStep: string;
  crossActionText: string;
}

const FORBIDDEN_PATTERN =
  /فاشل|كسول|ضيعت|لازم تشد حيلك|\blazy\b|\bfailure\b|\bwasted\b/gi;

const WEEKDAY_NAMES: Record<Language, string[]> = {
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

function sanitizeNoBlame(text: string): string {
  return text.replace(FORBIDDEN_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function parseDayOfWeek(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getDay();
}

function analyzeDeepWeeklyRecommendation(
  state: AppState,
  metrics: ActionWeeklyMetrics[],
  thisWeekLogs: DailyLog[],
  energyAvg: number,
  lang: Language
): DeepWeeklyRecommendation {
  const allLogs = Object.values(state.logs).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const enabled = getEnabledActions(state.actions);

  const sleepAction = state.actions.find(
    (a) => a.id === 'sleep' || /نوم|sleep/i.test(a.nameEn + a.nameAr)
  );
  const studyTarget =
    enabled.find(
      (a) =>
        a.id !== sleepAction?.id &&
        (a.id === 'study' || /مذاكرة|قراءة|دراسة|study|read|focus/i.test(a.nameEn + a.nameAr))
    ) ??
    enabled.find((a) => a.id !== sleepAction?.id) ??
    null;

  const workoutTarget =
    enabled.find(
      (a) =>
        a.id !== sleepAction?.id &&
        (a.id === 'workout' || /رياضة|تمرين|workout|exercise|gym|run/i.test(a.nameEn + a.nameAr))
    ) ??
    enabled.find((a) => a.id !== sleepAction?.id) ??
    null;

  const candidates: { score: number; rec: DeepWeeklyRecommendation }[] = [];

  // 1. Sleep 7+ hours -> study / focus action lift
  if (sleepAction && studyTarget && allLogs.length >= MIN_PATTERN_LOGS) {
    const sleepThreshold = sleepAction.unit === 'minutes' ? 420 : 7;
    const sleepLogs = allLogs.filter(
      (l) => (l.entries[sleepAction.id]?.total ?? 0) > 0
    );
    const goodSleep = sleepLogs.filter(
      (l) => (l.entries[sleepAction.id]?.total ?? 0) >= sleepThreshold
    );
    const shortSleep = sleepLogs.filter(
      (l) => (l.entries[sleepAction.id]?.total ?? 0) < sleepThreshold
    );

    if (goodSleep.length >= 2 && shortSleep.length >= 2) {
      const avgGood = round1(
        goodSleep.reduce((s, l) => s + (l.entries[studyTarget.id]?.total ?? 0), 0) /
          goodSleep.length
      );
      const avgShort = round1(
        shortSleep.reduce((s, l) => s + (l.entries[studyTarget.id]?.total ?? 0), 0) /
          shortSleep.length
      );
      if (avgGood > avgShort && avgShort > 0) {
        const liftPct = Math.round(((avgGood - avgShort) / avgShort) * 100);
        if (liftPct >= 15) {
          const targetName = getActionName(studyTarget, lang);
          const unitStr = UNIT_LABELS[lang][studyTarget.unit];
          const text =
            lang === 'ar'
              ? `لما بتنام 7+ ساعات، ${targetName} عندك كان أعلى بنسبة ${liftPct}% في الأيام المسجلة (${avgGood} مقابل ${avgShort} ${unitStr}). ملاحظة مش سبب: ممكن تجرب تحمي نومك قبل أيام ${targetName} المهمة وتشوف.`
              : `When you sleep 7+ hours, your ${targetName} was ${liftPct}% higher on the logged days (${avgGood} vs ${avgShort} ${unitStr}). Protect 7+ hours of sleep before your key ${targetName} days.`;
          const explanation =
            lang === 'ar'
              ? `من بياناتك (${sleepLogs.length} أيام): في ${goodSleep.length} يوم نمت فيها 7+ ساعات، متوسط ${targetName} كان ${avgGood} ${unitStr}، مقابل ${avgShort} ${unitStr} في الأيام اللي نومها أقل من 7 ساعات.`
              : `Across ${sleepLogs.length} logged days: on ${goodSleep.length} day(s) with 7+ hours of sleep, ${targetName} averaged ${avgGood} ${unitStr}, compared to ${avgShort} ${unitStr} on shorter-sleep days.`;
          const oneStep =
            lang === 'ar'
              ? `خطوة الأسبوع: نام 7 ساعات على الأقل قبل يوم ${targetName} الجاي`
              : `This week's step: protect 7+ hours of sleep before your next ${targetName} day`;

          candidates.push({
            score: 80 + Math.min(40, liftPct / 4) + sleepLogs.length * 2,
            rec: {
              pattern: 'sleep_study',
              pillType: 'suggestion',
              pillLabel: lang === 'ar' ? 'توصية ذكية' : 'Deep Pattern',
              color: '#00B8A9',
              text: sanitizeNoBlame(text),
              explanation: sanitizeNoBlame(explanation),
              oneStep: sanitizeNoBlame(oneStep),
            },
          });
        }
      }
    }
  }

  // 2. Energy < 4 -> workout / primary action drop
  if (enabled.length > 0 && allLogs.length >= MIN_PATTERN_LOGS) {
    const lowEnergyLogs = allLogs.filter((l) => l.energy < 4);
    const normalEnergyLogs = allLogs.filter((l) => l.energy >= 4);

    if (lowEnergyLogs.length >= 2 && normalEnergyLogs.length >= 2) {
      const inspectOrder: ActionConfig[] = workoutTarget
        ? [workoutTarget, ...enabled.filter((a) => a.id !== workoutTarget.id && a.id !== sleepAction?.id)]
        : enabled.filter((a) => a.id !== sleepAction?.id);

      let bestMatch: {
        action: ActionConfig;
        avgNormal: number;
        avgLow: number;
        dropPct: number;
      } | null = null;

      for (const action of inspectOrder) {
        const avgNormal = round1(
          normalEnergyLogs.reduce((s, l) => s + (l.entries[action.id]?.total ?? 0), 0) /
            normalEnergyLogs.length
        );
        const avgLow = round1(
          lowEnergyLogs.reduce((s, l) => s + (l.entries[action.id]?.total ?? 0), 0) /
            lowEnergyLogs.length
        );
        if (avgNormal > 0) {
          const dropPct = Math.round(((avgNormal - avgLow) / avgNormal) * 100);
          if (dropPct >= 25 && (!bestMatch || dropPct > bestMatch.dropPct)) {
            bestMatch = { action, avgNormal, avgLow, dropPct };
          }
        }
      }

      if (bestMatch) {
        const { action, avgNormal, avgLow, dropPct } = bestMatch;
        const name = getActionName(action, lang);
        const unitStr = UNIT_LABELS[lang][action.unit];
        const lightAmt = action.unit === 'minutes' ? 10 : action.unit === 'pages' ? 3 : 1;
        const text =
          lang === 'ar'
            ? `في الأيام اللي طاقتك فيها تحت 4/10، ${name} كان أقل بنسبة ${dropPct}% في الأيام المسجلة (من ${avgNormal} لـ ${avgLow} ${unitStr}). ملاحظة مش سبب: ممكن تجرب ${lightAmt} ${unitStr} خفيفة بس في الأيام دي.`
            : `On days your energy was below 4/10, your ${name} was ${dropPct}% lower across the logged days (from ${avgNormal} to ${avgLow} ${unitStr}). An observation, not a cause: you could try a light ${lightAmt} ${unitStr} minimum on those days.`;
        const explanation =
          lang === 'ar'
            ? `في ${lowEnergyLogs.length} يوم سجلت فيهم طاقة أقل من 4/10، نزل ${name} لمتوسط ${avgLow} ${unitStr} مقارنة بـ ${avgNormal} ${unitStr} في الأيام اللي طاقتك فيها 4 أو أكتر.`
            : `Across ${lowEnergyLogs.length} logged day(s) with energy below 4/10, ${name} averaged ${avgLow} ${unitStr} vs ${avgNormal} ${unitStr} on days with energy 4+.`;
        const oneStep =
          lang === 'ar'
            ? `خطوة الأسبوع: لو طاقتك تحت 4، اعمل ${lightAmt} ${unitStr} ${name} بس عشان تحافظ على السلسلة`
            : `This week's step: on energy < 4 days, do just ${lightAmt} ${unitStr} of ${name} to protect consistency`;

        candidates.push({
          score: 82 + Math.min(40, dropPct / 3) + lowEnergyLogs.length * 2,
          rec: {
            pattern: 'low_energy_drop',
            pillType: 'suggestion',
            pillLabel: lang === 'ar' ? 'توصية ذكية' : 'Deep Pattern',
            color: '#FF6B35',
            text: sanitizeNoBlame(text),
            explanation: sanitizeNoBlame(explanation),
            oneStep: sanitizeNoBlame(oneStep),
          },
        });
      }
    }
  }

  // 3. Specific Weekday Always Low (e.g., Friday) -> lower goal on that day ONLY, not all week
  if (enabled.length > 0 && allLogs.length >= MIN_PATTERN_LOGS) {
    let bestWeekdayDip: {
      action: ActionConfig;
      dayIdx: number;
      dayCount: number;
      dayAvg: number;
      otherAvg: number;
      dropPct: number;
      suggestedGoal: number;
    } | null = null;

    for (const metric of metrics) {
      const action = metric.action;
      if (action.id === sleepAction?.id) continue;

      const byDay: Record<number, number[]> = {};
      for (const log of allLogs) {
        const dIdx = parseDayOfWeek(log.date);
        if (!byDay[dIdx]) byDay[dIdx] = [];
        byDay[dIdx].push(log.entries[action.id]?.total ?? 0);
      }

      for (const [dIdxStr, vals] of Object.entries(byDay)) {
        const dayIdx = Number(dIdxStr);
        // Require at least 2 logs on that weekday, OR Friday (day 5) logged alongside >= 3 other days
        const otherVals = Object.entries(byDay)
          .filter(([k]) => Number(k) !== dayIdx)
          .flatMap(([, list]) => list);
        const meetsSample =
          vals.length >= 2 || (dayIdx === 5 && vals.length >= 1 && otherVals.length >= 3);
        if (!meetsSample || otherVals.length === 0) continue;

        const dayAvg = round1(vals.reduce((s, v) => s + v, 0) / vals.length);
        const otherAvg = round1(
          otherVals.reduce((s, v) => s + v, 0) / otherVals.length
        );
        if (otherAvg <= 0) continue;

        const dropPct = Math.round(((otherAvg - dayAvg) / otherAvg) * 100);
        if (dropPct >= 30) {
          const suggestedGoal = Math.max(
            1,
            Math.round(Math.min(metric.flexibleDailyGoal * 0.5, Math.max(1, otherAvg * 0.4)))
          );
          if (
            !bestWeekdayDip ||
            vals.length > bestWeekdayDip.dayCount ||
            (vals.length === bestWeekdayDip.dayCount && dropPct > bestWeekdayDip.dropPct)
          ) {
            bestWeekdayDip = {
              action,
              dayIdx,
              dayCount: vals.length,
              dayAvg,
              otherAvg,
              dropPct,
              suggestedGoal,
            };
          }
        }
      }
    }

    if (bestWeekdayDip) {
      const { action, dayIdx, dayCount, dayAvg, otherAvg, dropPct, suggestedGoal } =
        bestWeekdayDip;
      const dayName = WEEKDAY_NAMES[lang][dayIdx];
      const actionName = getActionName(action, lang);
      const unitStr = UNIT_LABELS[lang][action.unit];

      const text =
        lang === 'ar'
          ? `يوم ${dayName} دايماً أهدى في ${actionName} (متوسط ${dayAvg} مقابل ${otherAvg} ${unitStr} باقي الأسبوع، أقل بـ ${dropPct}%). قلّل هدف يوم ${dayName} بس لـ ${suggestedGoal} ${unitStr} مش باقي الأسبوع.`
          : `${dayName} is consistently your lowest day for ${actionName} (${dayAvg} vs ${otherAvg} ${unitStr} on other days — ${dropPct}% lower). Lower your goal on ${dayName} only to ${suggestedGoal} ${unitStr}, not the whole week.`;
      const explanation =
        lang === 'ar'
          ? `عبر ${dayCount} مرات متسجلة ليوم ${dayName}، كان متوسط ${actionName} فيه ${dayAvg} ${unitStr} مقارنة بـ ${otherAvg} ${unitStr} في باقي الأيام. تكييف هدف يوم ${dayName} لوحده بيمنع الإحباط ويحفظ مستواك بقية الأسبوع.`
          : `Across ${dayCount} logged ${dayName}(s), ${actionName} averaged ${dayAvg} ${unitStr} compared to ${otherAvg} ${unitStr} on the other days. Adjusting ${dayName} only keeps the rest of your week strong.`;
      const oneStep =
        lang === 'ar'
          ? `خطوة الأسبوع: اعتمد ${suggestedGoal} ${unitStr} كهدف ليوم ${dayName} بس في ${actionName}`
          : `This week's step: set a ${suggestedGoal} ${unitStr} target for ${dayName} only on ${actionName}`;

      candidates.push({
        score: 84 + dayCount * 5 + Math.min(30, dropPct / 4),
        rec: {
          pattern: 'weekday_dip',
          pillType: 'goal',
          pillLabel: lang === 'ar' ? 'هدف ذكي' : 'Smart Goal',
          color: '#A855F7',
          text: sanitizeNoBlame(text),
          explanation: sanitizeNoBlame(explanation),
          oneStep: sanitizeNoBlame(oneStep),
        },
      });
    }
  }

  // 4. High Energy (7+) correlation lift
  if (enabled.length > 0 && allLogs.length >= MIN_PATTERN_LOGS) {
    const highE = allLogs.filter((l) => l.energy >= 7);
    const lowE = allLogs.filter((l) => l.energy < 7);
    const primary = studyTarget ?? enabled[0];
    if (highE.length >= 2 && lowE.length >= 2 && primary) {
      const avgHigh = round1(
        highE.reduce((s, l) => s + (l.entries[primary.id]?.total ?? 0), 0) / highE.length
      );
      const avgLow = round1(
        lowE.reduce((s, l) => s + (l.entries[primary.id]?.total ?? 0), 0) / lowE.length
      );
      if (avgLow > 0 && avgHigh > avgLow) {
        const lift = Math.round(((avgHigh - avgLow) / avgLow) * 100);
        if (lift >= 20) {
          const name = getActionName(primary, lang);
          const unitStr = UNIT_LABELS[lang][primary.unit];
          const text =
            lang === 'ar'
              ? `في الأيام اللي طاقتك فيها 7+، ${name} كان أعلى بنسبة ${lift}% في الأيام المسجلة (${avgHigh} مقابل ${avgLow} ${unitStr}). ممكن تجرب تبدأ ${name} في وقت أعلى طاقة عندك (ملاحظة مش سبب).`
              : `On 7+ energy days, your ${name} jumps ${lift}% (${avgHigh} vs ${avgLow} ${unitStr}). Schedule ${name} right inside your peak-energy window.`;
          const explanation =
            lang === 'ar'
              ? `مقارنة ${highE.length} يوم بطاقة 7+ (${avgHigh} ${unitStr}) مع ${lowE.length} يوم بطاقة أقل (${avgLow} ${unitStr}) بتوضح إن توقيت المجهود أهم من ضغط الوقت.`
              : `Comparing ${highE.length} high-energy day(s) (${avgHigh} ${unitStr}) vs ${lowE.length} calmer day(s) (${avgLow} ${unitStr}) shows timing drives your output.`;
          const oneStep =
            lang === 'ar'
              ? `خطوة الأسبوع: خصص ${name} لساعات طاقتك العالية في بداية اليوم`
              : `This week's step: move ${name} to your highest-energy hour`;

          candidates.push({
            score: 70 + Math.min(25, lift / 4),
            rec: {
              pattern: 'energy_lift',
              pillType: 'tip',
              pillLabel: lang === 'ar' ? 'توصية الأسبوع' : 'Key Insight',
              color: '#00B8A9',
              text: sanitizeNoBlame(text),
              explanation: sanitizeNoBlame(explanation),
              oneStep: sanitizeNoBlame(oneStep),
            },
          });
        }
      }
    }
  }

  // Pick strongest real-data candidate if found
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].rec;
  }

  // 5. Fallback using real logged baseline numbers (still single powerful recommendation, never 3 generic tips)
  const focusMetric =
    [...metrics].sort((a, b) => a.thisWeekActiveDays - b.thisWeekActiveDays)[0] ?? null;

  if (focusMetric && thisWeekLogs.length > 0) {
    const focusName = getActionName(focusMetric.action, lang);
    const focusUnit = UNIT_LABELS[lang][focusMetric.action.unit];
    const starter =
      focusMetric.action.unit === 'minutes'
        ? Math.min(10, focusMetric.flexibleDailyGoal)
        : Math.max(1, Math.round(focusMetric.flexibleDailyGoal * 0.5));

    const text =
      lang === 'ar'
        ? `سجلت ${thisWeekLogs.length} أيام بمتوسط طاقة ${energyAvg}/10، و${focusName} هو أكتر فعل محتاج مساحة (${focusMetric.thisWeekTotal} ${focusUnit} الأسبوع ده). ابدأ بـ ${starter} ${focusUnit} بس يومياً عشان تبني سلسلة ثابتة.`
        : `Across ${thisWeekLogs.length} logged day(s) (avg energy ${energyAvg}/10), ${focusName} has the most room to grow (${focusMetric.thisWeekTotal} ${focusUnit} this week). Lock in ${starter} ${focusUnit} daily to build steady momentum.`;
    const explanation =
      lang === 'ar'
        ? `أول ما تسجل أيام أكتر بطاقات مختلفة (مثلاً نوم أطول أو أيام طاقة تحت 4 أو آخر الأسبوع)، التقرير هيكتشفلك أنماط أعمق بالأرقام.`
        : `As you log a few more contrasting days (different sleep lengths, energy dips, and weekdays), this recommendation automatically sharpens with deeper correlations.`;
    const oneStep =
      lang === 'ar'
        ? `خطوة الأسبوع: ${starter} ${focusUnit} ${focusName} يومياً`
        : `This week's step: ${starter} ${focusUnit} of ${focusName} daily`;

    return {
      pattern: 'baseline',
      pillType: 'suggestion',
      pillLabel: lang === 'ar' ? 'توصية الأسبوع' : 'Weekly Focus',
      color: '#FF6B35',
      text: sanitizeNoBlame(text),
      explanation: sanitizeNoBlame(explanation),
      oneStep: sanitizeNoBlame(oneStep),
    };
  }

  const fallbackText =
    lang === 'ar'
      ? `سجل طاقتك وأفعالك على مدار أيام الأسبوع عشان نطلعلك نمطك الحقيقي (تأثير النوم، أيام الطاقة القليلة، وأيام الأسبوع الهادية).`
      : `Log your energy and actions across a few days so we can uncover your strongest real pattern (sleep impact, low-energy dips, and weekday rhythms).`;

  return {
    pattern: 'baseline',
    pillType: 'tip',
    pillLabel: lang === 'ar' ? 'توصية الأسبوع' : 'Weekly Focus',
    color: '#00B8A9',
    text: fallbackText,
    explanation: fallbackText,
    oneStep:
      lang === 'ar'
        ? 'خطوة الأسبوع: سجل حالتك وفعل واحد في أقل من دقيقة النهاردة'
        : "This week's step: log today's energy and one action in under a minute",
  };
}

export function generateWeeklyReport(
  state: AppState,
  lang: Language,
  weekOffset = 0,
  referenceKey = getTodayKey()
): WeeklyReportData {
  const weekDates = getWeekDates(weekOffset, referenceKey);
  const lastWeekDates = getWeekDates(weekOffset - 1, referenceKey);
  const enabled = getEnabledActions(state.actions);
  const metrics: ActionWeeklyMetrics[] = enabled.map((a) =>
    getActionMetrics(a, state.logs, weekOffset, lang, referenceKey)
  );

  const thisWeekLogs = weekDates
    .map((d) => state.logs[d])
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
  const lastWeekLogs = lastWeekDates
    .map((d) => state.logs[d])
    .filter((l): l is NonNullable<typeof l> => Boolean(l));

  const energyAvg =
    thisWeekLogs.length > 0
      ? Math.round(
          (thisWeekLogs.reduce((s, l) => s + l.energy, 0) / thisWeekLogs.length) * 10
        ) / 10
      : 0;
  const prevEnergyAvg =
    lastWeekLogs.length > 0
      ? lastWeekLogs.reduce((s, l) => s + l.energy, 0) / lastWeekLogs.length
      : 0;
  const energyChangePct =
    thisWeekLogs.length >= MIN_WEEK_LOGS_TO_JUDGE && prevEnergyAvg > 0 && energyAvg > 0
      ? Math.round(((energyAvg - prevEnergyAvg) / prevEnergyAvg) * 100)
      : null;

  const balance = getBalanceData(metrics, lang);
  const avgGoalCompletion =
    metrics.reduce(
      (s, m) => s + Math.min(1, m.thisWeekTotal / Math.max(1, m.flexibleWeeklyGoal)),
      0
    ) / Math.max(1, metrics.length);

  const avgWeekOverWeekDrop =
    metrics.filter((m) => (m.vsLastWeekPct ?? 0) < -20).length >=
    Math.ceil(metrics.length / 2);

  // A week with only a few logged days is not judged against the full-week
  // goal or last week's total: that would call an unfinished week "heavy".
  const enoughDaysToJudgeWeek = thisWeekLogs.length >= MIN_WEEK_LOGS_TO_JUDGE;
  const isHeavyWeek =
    thisWeekLogs.length === 0 ||
    (enoughDaysToJudgeWeek &&
      metrics.length > 0 &&
      (avgGoalCompletion < 0.4 || avgWeekOverWeekDrop)) ||
    (energyAvg > 0 && energyAvg < 4.5);

  const deepRecommendation = analyzeDeepWeeklyRecommendation(
    state,
    metrics,
    thisWeekLogs,
    energyAvg,
    lang
  );
  const oneNextStep = enoughDaysToJudgeWeek
    ? deepRecommendation.oneStep
    : lang === 'ar'
    ? 'كمّل تسجّل كام يوم، وممكن يبان نمط مع الوقت'
    : 'Keep logging for a few days; a pattern may show up over time';

  const numbersRows = metrics.map((m) => ({
    actionId: m.action.id,
    name: getActionName(m.action, lang),
    color: m.action.color,
    total: m.thisWeekTotal,
    unit: UNIT_LABELS[lang][m.action.unit],
    times: m.thisWeekTimes,
    activeDays: m.thisWeekActiveDays,
    avgPerLoggedDay:
      m.thisWeekActiveDays > 0 ? Math.round((m.thisWeekTotal / m.thisWeekActiveDays) * 10) / 10 : 0,
  }));

  const comparisonRows = metrics.map((m) => ({
    actionId: m.action.id,
    name: getActionName(m.action, lang),
    color: m.action.color,
    lastTime: m.lastLoggedAmount,
    avg14: m.last14DaysAvg,
    first3Avg: m.first3DaysAvg,
    vsLastWeekPct: enoughDaysToJudgeWeek ? m.vsLastWeekPct : null,
    firstTimeMult: m.firstTimeMultiplier,
  }));

  let summaryText = '';
  if (isHeavyWeek) {
    const numbersShort = numbersRows
      .slice(0, 3)
      .map((r) => `${r.name}: ${r.total} ${r.unit}`)
      .join(lang === 'ar' ? '، ' : ', ');

    summaryText =
      numbersRows.length > 0
        ? lang === 'ar'
          ? `الأسبوع ده كان تقيل. ده اللي حصل بالظبط: طاقتك كانت ${energyAvg}/10، وأرقامك كانت (${numbersShort}). ${oneNextStep}.`
          : `This week was heavy. Here is exactly what happened: your energy averaged ${energyAvg}/10, and your numbers were (${numbersShort}). ${oneNextStep}.`
        : lang === 'ar'
        ? `الأسبوع ده كان تقيل. طاقتك كانت ${energyAvg}/10 خلال ${thisWeekLogs.length} يوم متسجل. ${oneNextStep}.`
        : `This week was heavy. Your energy averaged ${energyAvg}/10 across ${thisWeekLogs.length} logged day(s). ${oneNextStep}.`;
  } else if (!enoughDaysToJudgeWeek) {
    summaryText =
      lang === 'ar'
        ? `لسه بدري نحكم على الأسبوع: متسجل ${thisWeekLogs.length} من 7 أيام بس، فالأرقام دي بداية مش تقييم. متوسط طاقتك لحد دلوقتي ${energyAvg}/10.`
        : `It is too early to judge this week: only ${thisWeekLogs.length} of 7 days are logged, so these numbers are a start, not an assessment. Your average energy so far is ${energyAvg}/10.`;
  } else {
    const energyDesc =
      energyChangePct !== null
        ? lang === 'ar'
          ? energyChangePct >= 0
            ? `طاقتك ارتفعت ${energyChangePct}% عن الأسبوع اللي فات`
            : `متوسط طاقتك كان ${energyAvg}/10`
          : energyChangePct >= 0
          ? `Your energy rose ${energyChangePct}% from last week`
          : `Your average energy was ${energyAvg}/10`
        : lang === 'ar'
        ? `متوسط طاقتك كان ${energyAvg}/10`
        : `Your average energy was ${energyAvg}/10`;

    summaryText =
      lang === 'ar'
        ? `أسبوع ثابت وواضح — توازنك وصل ${balance.balanceScore}% و${energyDesc}. كملت ${thisWeekLogs.length} من 7 أيام بأرقام حقيقية.`
        : `A solid, balanced week — your balance reached ${balance.balanceScore}% and ${energyDesc}. You logged ${thisWeekLogs.length} of 7 days.`;
  }

  const correlation = getCrossActionCorrelation(state.actions, state.logs, lang);
  const keyInsights: string[] = [];

  // Percent comparisons and cross-action patterns are not shown on an unfinished week.
  if (enoughDaysToJudgeWeek) keyInsights.push(correlation.text);

  const withFeeling = thisWeekLogs.filter((l) => l.feelingWhy.trim().length > 0);
  if (withFeeling.length > 0) {
    const lowDay = [...withFeeling].sort((a, b) => a.energy - b.energy)[0];
    const highDay = [...withFeeling].sort((a, b) => b.energy - a.energy)[0];

    if (lowDay && lowDay.energy <= 5) {
      keyInsights.push(
        lang === 'ar'
          ? `في يوم ${lowDay.date}، الطاقة كانت ${lowDay.energy}/10 وكتبت: "${lowDay.feelingWhy.trim()}".`
          : `On ${lowDay.date}, energy was ${lowDay.energy}/10 and you wrote: "${lowDay.feelingWhy.trim()}".`
      );
    }
    if (highDay && highDay.date !== lowDay?.date) {
      keyInsights.push(
        lang === 'ar'
          ? `في أحسن يوم طاقة (${highDay.energy}/10 يوم ${highDay.date}) كتبت: "${highDay.feelingWhy.trim()}".`
          : `On your highest-energy day (${highDay.energy}/10 on ${highDay.date}), you noted: "${highDay.feelingWhy.trim()}".`
      );
    }
  } else {
    keyInsights.push(
      lang === 'ar'
        ? `سجل كلمة قصيرة في خانة "ليه اليوم مشي كده؟" عشان التقرير يربط أرقامك بظروف يومك.`
        : `Add a quick line in "Why did today go like this?" so insights explain the real context behind your numbers.`
    );
  }

  const missedDays = 7 - thisWeekLogs.length;
  if (missedDays > 0) {
    keyInsights.push(
      lang === 'ar'
        ? `فاتك ${missedDays} أيام الأسبوع ده — كمل من بكرة، مفيش عقاب.`
        : `You missed ${missedDays} day(s) this week — continue from tomorrow, no penalty.`
    );
  }

  const tenMinCount = getTenMinRuleCount(state.logs, weekDates);
  if (tenMinCount > 0) {
    keyInsights.push(
      lang === 'ar'
        ? `استخدمت قاعدة الـ 10 دقايق ${tenMinCount} مرة الأسبوع ده وكملت بعدها.`
        : `You used the 10-minute rule ${tenMinCount} time(s) this week and kept going.`
    );
  }

  // Strictly ONE deep, real-data recommendation per week
  const partialText =
    lang === 'ar'
      ? `متسجل ${thisWeekLogs.length} من 7 أيام بس، فمفيش توصية مبنية على أرقام دلوقتي. كمّل تسجّل، وممكن يبان نمط مع الوقت.`
      : `Only ${thisWeekLogs.length} of 7 days are logged, so there is no data-based recommendation yet. Keep logging; a pattern may show up over time.`;
  const recommendations: WeeklyReportData['recommendations'] = [
    {
      pillType: enoughDaysToJudgeWeek ? deepRecommendation.pillType : 'tip',
      pillLabel: enoughDaysToJudgeWeek
        ? deepRecommendation.pillLabel
        : lang === 'ar'
        ? 'ملاحظة'
        : 'Note',
      color: deepRecommendation.color,
      text: enoughDaysToJudgeWeek ? deepRecommendation.text : partialText,
    },
  ];

  return {
    weekDates,
    isHeavyWeek,
    isPartialWeek: !enoughDaysToJudgeWeek,
    summaryText: sanitizeNoBlame(summaryText),
    energyAvg,
    energyChangePct,
    numbersRows,
    comparisonRows,
    keyInsights: keyInsights.slice(0, 4).map(sanitizeNoBlame),
    deepRecommendation: enoughDaysToJudgeWeek
      ? deepRecommendation
      : { ...deepRecommendation, text: partialText, explanation: partialText, oneStep: oneNextStep },
    recommendations,
    oneNextStep: sanitizeNoBlame(oneNextStep),
    crossActionText: enoughDaysToJudgeWeek ? sanitizeNoBlame(correlation.text) : '',
  };
}
