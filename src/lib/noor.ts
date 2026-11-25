import type {
  ActionUnit,
  AppState,
  Language,
  NoorDialect,
  NoorMode,
} from '../types/tracker';
import {
  getActionMetrics,
  getActionName,
  getBalanceData,
  getEnabledActions,
  getEnergyStreak,
  getTenMinRuleCount,
} from './analytics';
import { ALLOWED_ACTION_COLORS, UNIT_LABELS } from './i18n';
import { generateWeeklyReport } from './report';
import { addDays, getDefaultDialect, getTodayKey } from './storage';

const FORBIDDEN_BLAME_REGEX =
  /فاشل|كسول|ضيعت|لازم تشد حيلك|\blazy\b|\bfailure\b|\bwasted\b/gi;

export function sanitizeNoorText(text: string): string {
  return enforceSingleQuestion(
    text.replace(FORBIDDEN_BLAME_REGEX, '').replace(/\s{2,}/g, ' ').trim()
  );
}

/** Ensures Noor asks at most ONE question per message so she feels like a friend, not a survey. */
export function enforceSingleQuestion(text: string): string {
  let seenQuestionMark = false;
  let out = '';
  for (const ch of text) {
    if (ch === '?' || ch === '؟') {
      if (!seenQuestionMark) {
        seenQuestionMark = true;
        out += ch;
      } else {
        out += '.';
      }
    } else {
      out += ch;
    }
  }
  return out;
}

export type NoorProposal =
  | {
      id: string;
      kind: 'add_action';
      summary: string;
      nameAr: string;
      nameEn: string;
      unit: ActionUnit;
      color: string;
      weeklyGoal: number;
    }
  | {
      id: string;
      kind: 'edit_action';
      summary: string;
      actionId: string;
      newNameAr: string;
      newNameEn: string;
      newWeeklyGoal: number;
    }
  | {
      id: string;
      kind: 'remove_action';
      summary: string;
      actionId: string;
      actionName: string;
    }
  | {
      id: string;
      kind: 'change_color';
      summary: string;
      newAccentColor: string;
      colorLabel: string;
    }
  | {
      id: string;
      kind: 'add_feature';
      summary: string;
      feature: 'tenMinTimer' | 'eveningReminder' | 'dailyIntention';
      intentionText?: string;
    };

export interface NoorChatMessage {
  id: string;
  sender: 'noor' | 'user';
  text: string;
  oneStep?: string;
  proposal?: NoorProposal;
  proposalStatus?: 'pending' | 'confirmed' | 'cancelled';
  switchedDialect?: NoorDialect;
  switchedMode?: NoorMode;
  declinedLogToday?: boolean;
  triggerTenMinTimer?: boolean;
  showTourButton?: boolean;
  /** True when no built-in rule matched and this is the generic listening reply. */
  isFallback?: boolean;
}

export interface NoorReplyOptions {
  mode?: NoorMode;
  previousNoorTexts?: string[];
  previousUserTexts?: string[];
  referenceKey?: string;
}

export interface NoorAnalysis {
  loggedDaysCount: number;
  energyAvg: number;
  focusAvg: number;
  energyStreak: number;
  missedRecentDay: boolean;
  sleepImpactPct: number | null;
  sleepAvg: number | null;
  energyLiftPct: number | null;
  bestWeekday: string | null;
  tenMinCount: number;
  headlineInsight: string;
  oneStepOnly: string;
  dashboardExplanation: string;
}

const WEEKDAY_NAMES_AR = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];
const WEEKDAY_NAMES_EN = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function resolveNoorDialect(state: AppState, lang: Language): NoorDialect {
  if (state.dialect) return state.dialect;
  return getDefaultDialect(lang);
}

export function resolveNoorMode(state: AppState): NoorMode {
  if (state.noorPreference === 'quiet') return 'quiet';
  return state.noorMode ?? 'chat';
}

function getEffectiveLang(dialect: NoorDialect): Language {
  return dialect === 'english' ? 'en' : 'ar';
}

function callUser(state: AppState, dialect: NoorDialect): string {
  const name = state.userName?.trim();
  if (!name) return '';
  return dialect === 'english' ? `${name}, ` : `يا ${name}، `;
}

function nameTag(state: AppState, dialect: NoorDialect): string {
  const name = state.userName?.trim();
  if (!name) return '';
  return dialect === 'english' ? ` ${name}` : ` يا ${name}`;
}

function normalizeArabicInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function pickNonRepeatingVariant(
  variants: string[],
  previousNoorTexts: string[] = []
): string {
  if (variants.length === 0) return '';
  const sanitized = variants.map(sanitizeNoorText);
  const seenSet = new Set(previousNoorTexts.map((s) => s.trim()));
  const fresh = sanitized.find((v) => !seenSet.has(v));
  if (fresh) return fresh;
  return sanitized[previousNoorTexts.length % sanitized.length];
}

export function detectDialectSwitchInMessage(message: string): NoorDialect | null {
  const normalized = normalizeArabicInput(message);

  if (
    /انا مصري|اتكلمي مصري|كلميني مصري|اتكلم مصري|بالمصري|لهجه مصريه|egyptian/i.test(
      normalized
    )
  ) {
    return 'egyptian';
  }
  if (
    /انا خليجي|انا سعودي|انا اماراتي|انا كويتي|انا قطري|انا بحريني|انا عماني|اتكلمي خليجي|كلميني خليجي|بالخليجي|gulf dialect/i.test(
      normalized
    )
  ) {
    return 'gulf';
  }
  if (
    /انا شامي|انا سوري|انا لبناني|انا اردني|انا فلسطيني|اتكلمي شامي|كلميني شامي|بالشامي|levantine/i.test(
      normalized
    )
  ) {
    return 'levantine';
  }
  if (
    /انا مغربي|انا جزائري|انا تونسي|اتكلمي مغربي|كلميني مغربي|بالمغربي|بالدارجه|maghrebi/i.test(
      normalized
    )
  ) {
    return 'maghrebi';
  }
  if (
    /فصحي|فصحى|عربيه فصحى|لغه عربيه فصحى|fusha|standard arabic/i.test(normalized)
  ) {
    return 'fusha';
  }
  if (/speak english|switch to english|in english|انجليزي/i.test(normalized)) {
    return 'english';
  }
  return null;
}

export function getNoorEmptyHomePrompt(state: AppState, lang: Language): string {
  const dialect = resolveNoorDialect(state, lang);
  const map: Record<NoorDialect, string> = {
    egyptian:
      'احنا لسه في الأول خالص، مش لازم تسجل حاجة دلوقتي، لو حابب نحكي شوية الأول، انا موجودة. ولو حابب تبدأ بحاجة صغيرة، نبدأ بـ 10 دقايق بس، ايه رايك؟',
    gulf:
      'حنا تونا في البداية، ما يلزم تسجل شيء الحين، لو ودك نسولف شوي بالأول أنا موجودة. ولو ودك تبدأ بشيء خفيف، نبدأ بـ 10 دقايق بس، وش رايك؟',
    levantine:
      'إحنا لسا بالأول خالص، مو لازم تسجل شي هلأ، إذا بتحب نحكي شوي بالأول أنا موجودة. وإذا بدك تبلش بشي صغير، نبدأ بـ 10 دقايق بس، شو رأيك؟',
    maghrebi:
      'إحنا يلا بدينا دابا، ماشي لازم تسجل والو دابا، إلا بغيتي نهضرو شوية الأول أنا هنا. وإلا بغيتي تبدا بشي حاجة خفيفة، نبداو غير بـ 10 دقايق، شنو بان ليك؟',
    fusha:
      'نحن في البداية الآن، لا يلزمك تسجيل أي شيء حالياً، إن أحببت أن نتحدث قليلاً أولاً فأنا هنا. وإن أردت بداية خفيفة، فلنبدأ بـ 10 دقائق فقط، ما رأيك؟',
    english:
      "We're right at the very beginning — you don't have to log anything right now. If you'd like to chat first, I'm here. Or if you want something light, how about just 10 minutes?",
  };
  return sanitizeNoorText(map[dialect]);
}

export function getNoorPermissionAskText(dialect: NoorDialect): string {
  switch (dialect) {
    case 'egyptian':
      return 'أهلاً! تحب نحكي شوية مع بعض؟';
    case 'gulf':
      return 'هلا! ودك نسولف شوي مع بعض؟';
    case 'levantine':
      return 'أهلين! بتحب نحكي شوي سوا؟';
    case 'maghrebi':
      return 'أهلا! بغيتي نهضرو شوية مع بعضياتنا؟';
    case 'fusha':
      return 'مرحباً! هل تود أن نتحدث قليلاً؟';
    case 'english':
      return 'Hey! Want to chat for a minute?';
  }
}

export function getNoorDialectChangedMessage(
  dialect: NoorDialect,
  userName?: string
): string {
  const name = userName?.trim();
  const yaName = name ? `يا ${name}، ` : '';
  switch (dialect) {
    case 'egyptian':
      return sanitizeNoorText(
        `تمام، هكلمك مصري على طول! ${yaName}ازيك وعامل ايه النهاردة؟`
      );
    case 'gulf':
      return sanitizeNoorText(
        `أبشر، الحين بتكلم معك بالخليجي على طول! ${yaName}وش أخبارك اليوم؟`
      );
    case 'levantine':
      return sanitizeNoorText(
        `تم، هلأ بحكي معك بالشامي على طول! ${yaName}كيفك اليوم؟`
      );
    case 'maghrebi':
      return sanitizeNoorText(
        `واخا، دابا غادي نهضر معاك بالمغربي! ${yaName}لاباس عليك وكيداير اليوم؟`
      );
    case 'fusha':
      return sanitizeNoorText(
        `حسناً، سأتحدث معك بالعربية البسيطة من الآن! ${yaName}كيف حالك اليوم؟`
      );
    case 'english':
      return sanitizeNoorText(
        name
          ? `Got it, ${name}! Simple friendly English from now on — how is your day going?`
          : 'Got it! Simple friendly English from now on — how is your day going?'
      );
  }
}

export type HelpScreenKey =
  | 'home'
  | 'dashboard'
  | 'report'
  | 'studio'
  | 'myactions'
  | 'auth'
  | 'onboarding';

export function getScreenHelpContent(
  screen: HelpScreenKey,
  state: AppState,
  lang: Language
): { title: string; body: string; extra?: string } {
  const dialect = resolveNoorDialect(state, lang);
  const titleMap: Record<HelpScreenKey, Record<NoorDialect, string>> = {
    home: {
      egyptian: 'الشاشة الرئيسية',
      gulf: 'الشاشة الرئيسية',
      levantine: 'الشاشة الرئيسية',
      maghrebi: 'الشاشة الرئيسية',
      fusha: 'الشاشة الرئيسية',
      english: 'Home Screen',
    },
    dashboard: {
      egyptian: 'لوحة الأسبوع (المراية)',
      gulf: 'لوحة الأسبوع (المرايا)',
      levantine: 'لوحة الأسبوع (المراية)',
      maghrebi: 'لوحة الأسبوع (المرايا)',
      fusha: 'لوحة الأسبوع',
      english: 'Weekly Dashboard',
    },
    report: {
      egyptian: 'التقرير الأسبوعي',
      gulf: 'التقرير الأسبوعي',
      levantine: 'التقرير الأسبوعي',
      maghrebi: 'التقرير الأسبوعي',
      fusha: 'التقرير الأسبوعي',
      english: 'Weekly Report',
    },
    studio: {
      egyptian: 'استوديو ونشاط',
      gulf: 'الاستوديو والاستكشاف',
      levantine: 'الاستوديو والاستكشاف',
      maghrebi: 'الاستوديو والاستكشاف',
      fusha: 'الاستوديو والاستكشاف',
      english: 'Studio & Explore',
    },
    myactions: {
      egyptian: 'أفعالي',
      gulf: 'أفعالي',
      levantine: 'أفعالي',
      maghrebi: 'الأفعال ديالي',
      fusha: 'أفعالي',
      english: 'My Actions',
    },
    auth: {
      egyptian: 'تسجيل الدخول والمزامنة',
      gulf: 'الدخول والمزامنة',
      levantine: 'الدخول والمزامنة',
      maghrebi: 'الدخول والمزامنة',
      fusha: 'الحساب المحلي والسحابي',
      english: 'Account & Optional Sync',
    },
    onboarding: {
      egyptian: 'التجهيز السريع مع نور',
      gulf: 'الإعداد السريع مع نور',
      levantine: 'التحضير السريع مع نور',
      maghrebi: 'الإعداد السريع مع نور',
      fusha: 'الإعداد المبدئي',
      english: 'Quick Setup with Noor',
    },
  };

  const bodyMap: Record<HelpScreenKey, Record<NoorDialect, string>> = {
    home: {
      egyptian:
        'هنا بتبدأ يومك، بتضيف مهامك، وبتسجل طاقتك وتركيزك في دقيقة، وكمان تحت تلاقي اختصارات سريعة للاستوديو، الأصوات المحيطة، الخريطة، والمشهد 3D واللعبة.',
      gulf: 'هنا تبدأ يومك، تضيف مهامك، وتسجل طاقتك وتركيزك في دقيقة، وتحت تلقى اختصارات للاستوديو والأصوات المحيطة والخريطة واللعبة.',
      levantine:
        'هون بتبلش يومك، بتضيف مهامك، وبتسجل طاقتك وتركيزك بدقيقة، وتحت بتلاقي اختصارات سريعة للاستوديو والأصوات واللعبة.',
      maghrebi:
        'هنا كتبدا نهارك، كتزيد المهام ديالك، وكتسجل الطاقة والتركيز فدقيقة، وتحت كاينين اختصارات للاستوديو والأصوات واللعبة.',
      fusha:
        'هنا تبدأ يومك، وتضيف مهامك، وتسجّل طاقتك وتركيزك، مع اختصارات مباشرة للاستوديو والأصوات المحيطة والخريطة واللعبة.',
      english:
        'Here you log your day in 1 minute, manage actions, and jump straight to Studio AI, Ambient Sounds, Focus Map, 3D Sanctuary, or the Focus Game.',
    },
    myactions: {
      egyptian: 'كل فعل ليه بطاقة لوحده، دوس عليها تشوف كل تفاصيلها.',
      gulf: 'كل فعل له بطاقة لحاله، اضغط عليها تشوف كل تفاصيلها.',
      levantine: 'كل فعل إلو بطاقة لحاله، اكبس عليها لتشوف كل تفاصيلها.',
      maghrebi: 'كل فعل عندو بطاقة بوحدو، ضغط عليها باش تشوف جميع التفاصيل ديالها.',
      fusha: 'لكل فعل بطاقة مستقلة؛ اضغط عليها لعرض جميع تفاصيلها وتطورها.',
      english: 'Each action has its own separate card — tap one to see its full details and history.',
    },
    dashboard: {
      egyptian: 'هنا بتشوف تطورك، مش عشان تحاسب نفسك، عشان تفهم نفسك.',
      gulf: 'هنا تشوف تطورك، مو علشان تحاسب نفسك، علشان تفهم نفسك.',
      levantine: 'هون بتشوف تطورك، مو مشان تحاسب حالك، مشان تفهم حالك.',
      maghrebi: 'هنا كتشوف التطور ديالك، ماشي باش تحاسب راسك، غير باش تفهم راسك.',
      fusha: 'هنا ترى تطورك؛ ليس لمحاسبة نفسك بل لتفهم أنماطك بوضوح.',
      english: 'Here you see your progress — not to judge yourself, just to understand yourself.',
    },
    report: {
      egyptian: 'هنا التقرير الأسبوعي، بيقولك إيه اللي فرق معاك، وخطوة واحدة بس للأسبوع الجاي.',
      gulf: 'هنا التقرير الأسبوعي، يعلمك وش اللي فرق معك، وخطوة وحدة بس للأسبوع الجاي.',
      levantine: 'هون التقرير الأسبوعي، بيقلك شو يلي فرق معك، وخطوة وحدة بس للأسبوع الجاي.',
      maghrebi: 'هنا التقرير الأسبوعي، كيقولك شنو لي دار الفرق معاك، وخطوة وحدة للسيمانة الجاية.',
      fusha: 'هنا التقرير الأسبوعي يخبرك بما أحدث فرقاً معك ويقترح خطوة واحدة للأسبوع القادم.',
      english: 'Here is your Weekly Report — showing what truly mattered and one single step for next week.',
    },
    studio: {
      egyptian:
        'في الاستوديو تقدر تحكي مع نور بذكاء Gemini (بحث وخرائط وصوت مباشر)، تدوّر على أماكن هادية على الخريطة، تقعد في الملاذ ثلاثي الأبعاد، أو تلعب لعبة توازن التركيز.',
      gulf: 'بالاستوديو تقدر تتكلم مع نور بذكاء Gemini (بحث وخرائط وصوت مباشر)، تبحث عن أماكن هادية بالخريطة، ترتاح بالمشهد ثلاثي الأبعاد، أو تلعب لعبة التركيز.',
      levantine:
        'بالاستوديو فيك تحكي مع نور بذكاء Gemini (بحث وخرائط وصوت مباشر)، تلاقي أماكن هادية ع الخريطة، ترتاح بالمشهد ثلاثي الأبعاد، أو تلعب لعبة التركيز.',
      maghrebi:
        'فالاستوديو تقدر تهضر مع نور بذكاء Gemini (بحث وخرائط وصوت مباشر)، تقلب على أماكن هادئة فالخريطة، ترتاح فالمشهد ثلاثي الأبعاد، أو تلعب لعبة التركيز.',
      fusha:
        'في الاستوديو يمكنك التحدث مع Gemini (بالبحث والخرائط والصوت المباشر)، واستكشاف أماكن هادئة على الخريطة، أو الاسترخاء في الملاذ ثلاثي الأبعاد ولعب لعبة التركيز.',
      english:
        'In Studio you can chat with Gemini (with Search, Maps grounding, voice dictation & Live Voice), explore Focus Map spots, unwind in the 3D Sanctuary, or play Orbital Balance.',
    },
    auth: {
      egyptian:
        'اعمل حساب محلي يفضل على جهازك افتراضياً، أو سجل بجوجل لو حابب تحفظ نسخة احتياطية على السحابة.',
      gulf: 'سو حساب محلي يبقى بجهازك افتراضياً، أو سجل بجوجل لو حاب تحفظ نسخة احتياطية سحابياً.',
      levantine: 'اعمل حساب محلي بيضل ع جهازك افتراضياً، أو سجل بجوجل إذا بدك مزامنة سحابية.',
      maghrebi: 'دير حساب محلي كيبقى فجهازك، ولا سجل بجوجل إلى بغيتي المزامنة السحابية.',
      fusha:
        'أنشئ حساباً محلياً على جهازك افتراضياً، أو سجّل بحساب جوجل لتفعيل المزامنة السحابية الاختيارية.',
      english:
        'Create a local account stored on this device by default, or sign in with Google if you want optional Cloud SQL sync.',
    },
    onboarding: {
      egyptian: 'خطوتين تلاتة بس عشان نور تعرف اسمك ولهجتك، ومش مجبر تضيف أي أفعال دلوقتي.',
      gulf: 'خطوات بسيطة علشان نور تعرف اسمك ولهجتك، وما يلزم تضيف أفعال الحين.',
      levantine: 'كم خطوة سريعة لتعرف نور اسمك ولهجتك، ومو مجبور تضيف أفعال هلأ.',
      maghrebi: 'خطوات بساط باش نور تعرف سميتك ولهجتك، وماشي ضروري تزيد أفعال دابا.',
      fusha: 'خطوات قصيرة لتتعرف نور على اسمك ولهجتك، ويمكنك البدء دون أفعال.',
      english: 'Just a few quick steps so Noor knows your name and dialect — no actions required.',
    },
  };

  return {
    title: titleMap[screen][dialect],
    body: sanitizeNoorText(bodyMap[screen][dialect]),
    extra:
      screen === 'home'
        ? sanitizeNoorText(bodyMap.myactions[dialect])
        : undefined,
  };
}

export function getNoorDailyAnswerSavedText(dialect: NoorDialect): string {
  switch (dialect) {
    case 'egyptian':
      return 'تمام يا صاحبي، حفظت كلامك عندي.';
    case 'gulf':
      return 'زين، حفظت كلامك عندي.';
    case 'levantine':
      return 'منيح، حفظت كلامك عندي.';
    case 'maghrebi':
      return 'مزيان، سجلت كلامك عندي.';
    case 'fusha':
      return 'حسناً، حفظت ملاحظتك عندي.';
    case 'english':
      return 'Saved — thanks for sharing how your day went.';
  }
}

export function getNoorActionDoneText(dialect: NoorDialect): string {
  switch (dialect) {
    case 'egyptian':
      return 'تمام، اتعمل التعديل بنجاح!';
    case 'gulf':
      return 'أبشر، تم التعديل بنجاح!';
    case 'levantine':
      return 'تمام، صار التعديل بنجاح!';
    case 'maghrebi':
      return 'مزيان، التعديل تسجل بنجاح!';
    case 'fusha':
      return 'تم التعديل بنجاح!';
    case 'english':
      return 'Done! Updated safely.';
  }
}

export function getNoorActionCancelledText(dialect: NoorDialect): string {
  switch (dialect) {
    case 'egyptian':
      return 'ولا يهمك، مفيش أي حاجة اتغيرت.';
    case 'gulf':
      return 'زين، ما في أي شيء تغيّر.';
    case 'levantine':
      return 'ما في مشكلة، ما تغيّر شي أبداً.';
    case 'maghrebi':
      return 'ما كاين باس، حتى حاجة ما تبدلات.';
    case 'fusha':
      return 'حسناً، لم يتم تغيير أي شيء.';
    case 'english':
      return 'Okay, nothing was changed.';
  }
}

export function shouldShowNoorPermissionPrompt(
  state: AppState,
  todayKey = getTodayKey()
): boolean {
  if (!state.onboarded) return false;
  if (state.noorPreference === 'quiet') return false;
  if (state.noorDeclinedLogDate === todayKey) return false;
  if (state.noorLastPromptDate === todayKey) return false;
  if (state.noorPromptDismissedDate === todayKey) return false;
  return true;
}

export function getNoorDailyQuestion(
  state: AppState,
  lang: Language,
  todayKey = getTodayKey()
): string | null {
  if (!state.onboarded) return null;
  if (state.noorPreference === 'quiet') return null;
  if (Object.keys(state.logs).length === 0) return null;
  if (state.noorLastQuestionDate === todayKey) return null;

  const dialect = resolveNoorDialect(state, lang);
  const questionsByDialect: Record<NoorDialect, string[]> = {
    egyptian: [
      'ازيك النهاردة؟ إيه أكتر حاجة أثرت على مزاجك؟',
      'نومك امبارح ساعدك النهاردة ولا لسه حاسس بنعاس؟',
      'يومك النهاردة ماشي هادي ولا زحمة شوية؟',
    ],
    gulf: [
      'وش أخبارك اليوم؟ وش أكثر شيء أثر على مزاجك؟',
      'نومك أمس ريّحك اليوم ولا بعدك تعبان؟',
      'يومك اليوم هادي ولا زحمة شوي؟',
    ],
    levantine: [
      'كيفك اليوم؟ شو أكتر شي أثر على مزاجك؟',
      'نومك مبارح ريّحك اليوم ولا لسا تعبان؟',
      'يومك اليوم هادي ولا معجوق شوي؟',
    ],
    maghrebi: [
      'كيداير اليوم؟ شنو لي أثر على المزاج ديالك كتر؟',
      'واش النعاس ديال البارح ريحك اليوم ولا باقي شوية؟',
      'نهارك اليوم هادي ولا عامر شوية؟',
    ],
    fusha: [
      'كيف حالك اليوم؟ ما أكثر شيء أثر على مزاجك؟',
      'هل كان نومك مريحاً الليلة الماضية؟',
      'كيف تسير وتيرة يومك حتى الآن؟',
    ],
    english: [
      'How are you feeling today overall?',
      'Did last night’s sleep feel restful?',
      'Is today feeling calm or a bit heavy?',
    ],
  };

  const list = questionsByDialect[dialect];
  const dayNum = Number(todayKey.split('-')[2] || 1);
  return list[dayNum % list.length];
}

export function analyzeUserDataForNoor(
  state: AppState,
  lang: Language,
  referenceKey = getTodayKey()
): NoorAnalysis {
  const dialect = resolveNoorDialect(state, lang);
  const effLang = getEffectiveLang(dialect);
  const enabled = getEnabledActions(state.actions);
  const allLogs = Object.values(state.logs).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const loggedDaysCount = allLogs.length;
  const prefix = callUser(state, dialect);
  const energyStreak = getEnergyStreak(state.logs, referenceKey);
  const tenMinCount = getTenMinRuleCount(state.logs);

  const yesterdayKey = addDays(referenceKey, -1);
  const twoDaysAgoKey = addDays(referenceKey, -2);
  const missedRecentDay =
    loggedDaysCount > 0 &&
    !state.logs[yesterdayKey] &&
    (!state.logs[referenceKey] || !state.logs[twoDaysAgoKey]);

  const energyAvg =
    loggedDaysCount > 0
      ? Math.round((allLogs.reduce((s, l) => s + l.energy, 0) / loggedDaysCount) * 10) /
        10
      : 0;
  const focusAvg =
    loggedDaysCount > 0
      ? Math.round((allLogs.reduce((s, l) => s + l.focus, 0) / loggedDaysCount) * 10) /
        10
      : 0;

  const sleepAction = state.actions.find(
    (a) => a.id === 'sleep' || /نوم|sleep/i.test(a.nameEn + a.nameAr)
  );
  const primaryFocusAction =
    enabled.find((a) => a.id !== sleepAction?.id) ?? enabled[0] ?? null;

  let sleepAvg: number | null = null;
  let sleepImpactPct: number | null = null;
  if (sleepAction && loggedDaysCount >= 2) {
    const sleepLogs = allLogs.filter(
      (l) => (l.entries[sleepAction.id]?.total ?? 0) > 0
    );
    if (sleepLogs.length > 0) {
      sleepAvg =
        Math.round(
          (sleepLogs.reduce((s, l) => s + (l.entries[sleepAction.id]?.total ?? 0), 0) /
            sleepLogs.length) *
            10
        ) / 10;
    }
    if (primaryFocusAction && sleepLogs.length >= 2) {
      const goodSleep = sleepLogs.filter(
        (l) => (l.entries[sleepAction.id]?.total ?? 0) >= 7
      );
      const shortSleep = sleepLogs.filter(
        (l) => (l.entries[sleepAction.id]?.total ?? 0) < 7
      );
      if (goodSleep.length > 0 && shortSleep.length > 0) {
        const avgGood =
          goodSleep.reduce(
            (s, l) => s + (l.entries[primaryFocusAction.id]?.total ?? 0),
            0
          ) / goodSleep.length;
        const avgShort =
          shortSleep.reduce(
            (s, l) => s + (l.entries[primaryFocusAction.id]?.total ?? 0),
            0
          ) / shortSleep.length;
        if (avgShort > 0 && avgGood > avgShort) {
          sleepImpactPct = Math.round(((avgGood - avgShort) / avgShort) * 100);
        }
      }
    }
  }

  let energyLiftPct: number | null = null;
  if (primaryFocusAction && loggedDaysCount >= 2) {
    const highE = allLogs.filter((l) => l.energy >= 7);
    const lowE = allLogs.filter((l) => l.energy < 7);
    if (highE.length > 0 && lowE.length > 0) {
      const avgHigh =
        highE.reduce((s, l) => s + (l.entries[primaryFocusAction.id]?.total ?? 0), 0) /
        highE.length;
      const avgLow =
        lowE.reduce((s, l) => s + (l.entries[primaryFocusAction.id]?.total ?? 0), 0) /
        lowE.length;
      if (avgLow > 0 && avgHigh > avgLow) {
        energyLiftPct = Math.round(((avgHigh - avgLow) / avgLow) * 100);
      }
    }
  }

  let bestWeekday: string | null = null;
  if (loggedDaysCount >= 3) {
    const byDay: Record<number, { sum: number; count: number }> = {};
    for (const log of allLogs) {
      const [y, m, d] = log.date.split('-').map(Number);
      const dayIdx = new Date(y, (m || 1) - 1, d || 1).getDay();
      const score =
        primaryFocusAction !== null
          ? log.entries[primaryFocusAction.id]?.total ?? 0
          : log.energy;
      byDay[dayIdx] = {
        sum: (byDay[dayIdx]?.sum ?? 0) + score,
        count: (byDay[dayIdx]?.count ?? 0) + 1,
      };
    }
    let topDayIdx = -1;
    let topAvg = -1;
    for (const [idxStr, bucket] of Object.entries(byDay)) {
      const avg = bucket.sum / bucket.count;
      if (avg > topAvg) {
        topAvg = avg;
        topDayIdx = Number(idxStr);
      }
    }
    if (topDayIdx >= 0 && topAvg > 0) {
      bestWeekday =
        (dialect === 'english' ? WEEKDAY_NAMES_EN : WEEKDAY_NAMES_AR)[topDayIdx] ??
        null;
    }
  }

  // Rule 1: NEVER nag about "no days logged" when 0 logs! Talk like a warm friend.
  let headlineInsight = '';
  if (loggedDaysCount === 0) {
    const emptyMap: Record<NoorDialect, string> = {
      egyptian: `${prefix}ولا يهمك، احنا لسه بنبدأ، قولي يومك كان عامل ازاي النهاردة؟ حلو ولا تقيل؟`,
      gulf: `${prefix}ولا يهمك، حنا تونا نبدأ، قولي وشلون يومك اليوم؟ زين ولا ثقيل شوي؟`,
      levantine: `${prefix}ولا يهمك، إحنا لسا عم نبلش، قلي كيف كان يومك اليوم؟ منيح ولا تقيل؟`,
      maghrebi: `${prefix}ماشي مشكل، يلا بدينا دابا، قولي كيداز نهارك اليوم؟ مزيان ولا تقيل؟`,
      fusha: `${prefix}لا بأس، نحن ما زلنا في البداية، أخبرني كيف كان يومك اليوم؟ جيداً أم متعباً؟`,
      english: `${prefix}no worries, we are just starting, tell me how was your day? Good or heavy?`,
    };
    headlineInsight = emptyMap[dialect];
  } else if (sleepImpactPct !== null && primaryFocusAction) {
    const pName = getActionName(primaryFocusAction, effLang);
    const map: Record<NoorDialect, string> = {
      egyptian: `${prefix}لاحظت من بياناتك إنك في الأيام اللي نمت فيها 7+ ساعات، ${pName} كان أعلى بنسبة ${sleepImpactPct}% في الأيام اللي سجلتها (ملاحظة مش سبب).`,
      gulf: `${prefix}لاحظت من أرقامك إنك بالأيام اللي نمت فيها 7+ ساعات، ${pName} كان أعلى بنسبة ${sleepImpactPct}% بالأيام اللي سجلتها (ملاحظة مو سبب).`,
      levantine: `${prefix}لاحظت من أرقامك إنك بالأيام يلي نمت فيها 7+ ساعات، ${pName} كان أعلى بنسبة ${sleepImpactPct}% بالأيام يلي سجلتها (ملاحظة مش سبب).`,
      maghrebi: `${prefix}لاحظت من الأرقام ديالك أنك فالأيام لي نعست فيها 7+ سوايع، ${pName} كان أعلى بنسبة ${sleepImpactPct}% فالأيام لي سجلتي (ملاحظة ماشي سبب).`,
      fusha: `${prefix}لاحظت من بياناتك أنه في الأيام التي نمت فيها 7+ ساعات، كان ${pName} أعلى بنسبة ${sleepImpactPct}% في الأيام المسجلة (ملاحظة وليست سبباً).`,
      english: `${prefix}I noticed from your logs that on days you slept 7+ hours, your ${pName} was ${sleepImpactPct}% higher across the days you logged (an observation, not a cause).`,
    };
    headlineInsight = map[dialect];
  } else if (energyLiftPct !== null && primaryFocusAction) {
    const pName = getActionName(primaryFocusAction, effLang);
    const map: Record<NoorDialect, string> = {
      egyptian: `${prefix}في الأيام اللي طاقتك فيها 7 أو أكتر، ${pName} كان أعلى بنسبة ${energyLiftPct}% عن الأيام الهادية في الأيام اللي سجلتها (ملاحظة مش سبب).`,
      gulf: `${prefix}في الأيام اللي طاقتك فيها 7 أو أكثر، ${pName} كان أعلى بنسبة ${energyLiftPct}% عن الأيام الهادئة بالأيام اللي سجلتها (ملاحظة مو سبب).`,
      levantine: `${prefix}بالأيام يلي طاقتك فيها 7 أو أكتر، ${pName} كان أعلى بنسبة ${energyLiftPct}% عن الأيام الهادية في الأيام اللي سجلتها (ملاحظة مش سبب).`,
      maghrebi: `${prefix}فالأيام لي الطاقة ديالك فيها 7 أو كتر، ${pName} كان أعلى بنسبة ${energyLiftPct}% مقارنة بالأيام الهادئة فالأيام لي سجلتي (ملاحظة ماشي سبب).`,
      fusha: `${prefix}في الأيام التي تكون طاقتك فيها 7 أو أكثر، كان ${pName} أعلى بنسبة ${energyLiftPct}% مقارنة بالأيام الهادئة في الأيام المسجلة (ملاحظة وليست سبباً).`,
      english: `${prefix}on days when your energy is 7+, your ${pName} was ${energyLiftPct}% higher than on low-energy days across the days you logged (an observation, not a cause).`,
    };
    headlineInsight = map[dialect];
  } else if (missedRecentDay) {
    const map: Record<NoorDialect, string> = {
      egyptian: `${prefix}لاحظت إن في يوم فاتك قريب — نكمل من بكرة، مفيش عقاب. متوسط طاقتك حالياً ${energyAvg}/10.`,
      gulf: `${prefix}لاحظت إنه في يوم فاتك قريب — نكمل من باكر، ما في عقاب. متوسط طاقتك الحين ${energyAvg}/10.`,
      levantine: `${prefix}لاحظت إنه في يوم فاتك قريب — نكمل من بكرة، ما في عقاب. متوسط طاقتك هلأ ${energyAvg}/10.`,
      maghrebi: `${prefix}لاحظت باللي فاتك نهار قريب — نكملو غدا، ما كاين حتى عقاب. متوسط الطاقة ديالك دابا ${energyAvg}/10.`,
      fusha: `${prefix}لاحظت أنك لم تسجل يوماً قريباً — نكمل غداً دون أي عقاب. متوسط طاقتك الآن ${energyAvg}/10.`,
      english: `${prefix}I noticed a recent gap — continue tomorrow, no penalty. Your average energy is ${energyAvg}/10.`,
    };
    headlineInsight = map[dialect];
  } else if (bestWeekday) {
    const map: Record<NoorDialect, string> = {
      egyptian: `${prefix}أكتر يوم أرقامك بتعلى فيه هو ${bestWeekday}، ومتوسط طاقتك ${energyAvg}/10 وتركيزك ${focusAvg}/10 خلال ${loggedDaysCount} أيام.`,
      gulf: `${prefix}أكثر يوم أرقامك ترتفع فيه هو ${bestWeekday}، ومتوسط طاقتك ${energyAvg}/10 وتركيزك ${focusAvg}/10 خلال ${loggedDaysCount} أيام.`,
      levantine: `${prefix}أكتر يوم أرقامك بتعلى فيه هو ${bestWeekday}، ومتوسط طاقتك ${energyAvg}/10 وتركيزك ${focusAvg}/10 خلال ${loggedDaysCount} أيام.`,
      maghrebi: `${prefix}أحسن نهار كتعلى فيه الأرقام ديالك هو ${bestWeekday}، ومتوسط الطاقة ${energyAvg}/10 والتركيز ${focusAvg}/10 فـ ${loggedDaysCount} أيام.`,
      fusha: `${prefix}أكثر يوم ترتفع فيه أرقامك هو ${bestWeekday}، بمتوسط طاقة ${energyAvg}/10 وتركيز ${focusAvg}/10 خلال ${loggedDaysCount} أيام.`,
      english: `${prefix}your strongest day of the week is ${bestWeekday}, with ${energyAvg}/10 avg energy and ${focusAvg}/10 focus over ${loggedDaysCount} logged days.`,
    };
    headlineInsight = map[dialect];
  } else {
    const map: Record<NoorDialect, string> = {
      egyptian: `${prefix}سجلت ${loggedDaysCount} ${loggedDaysCount === 1 ? 'يوم' : 'أيام'} بمتوسط طاقة ${energyAvg}/10 وتركيز ${focusAvg}/10 — ماشي كويس وبراحتك.`,
      gulf: `${prefix}سجلت ${loggedDaysCount} ${loggedDaysCount === 1 ? 'يوم' : 'أيام'} بمتوسط طاقة ${energyAvg}/10 وتركيز ${focusAvg}/10 — مستواك وايد زين.`,
      levantine: `${prefix}سجلت ${loggedDaysCount} ${loggedDaysCount === 1 ? 'يوم' : 'أيام'} بمتوسط طاقة ${energyAvg}/10 وتركيز ${focusAvg}/10 — شي منيح كتير.`,
      maghrebi: `${prefix}سجلتي ${loggedDaysCount} ${loggedDaysCount === 1 ? 'نهار' : 'أيام'} بمتوسط طاقة ${energyAvg}/10 وتركيز ${focusAvg}/10 — مزيان بزاف.`,
      fusha: `${prefix}سجلت ${loggedDaysCount} ${loggedDaysCount === 1 ? 'يوماً' : 'أيام'} بمتوسط طاقة ${energyAvg}/10 وتركيز ${focusAvg}/10.`,
      english: `${prefix}you logged ${loggedDaysCount} day(s) with ${energyAvg}/10 avg energy and ${focusAvg}/10 avg focus.`,
    };
    headlineInsight = map[dialect];
  }

  let oneStepOnly = '';
  if (loggedDaysCount === 0) {
    // Non-pushy, zero-data-nag step
    const map: Record<NoorDialect, string> = {
      egyptian: 'مش لازم تسجل حاجة دلوقتي — لو حابب نحكي شوية الأول انا معاك.',
      gulf: 'ما يلزم تسجل شيء الحين — لو ودك نسولف شوي بالأول أنا معك.',
      levantine: 'مو لازم تسجل شي هلأ — إذا بتحب نحكي شوي بالأول أنا معك.',
      maghrebi: 'ماشي لازم تسجل والو دابا — إلا بغيتي نهضرو شوية الأول أنا معاك.',
      fusha: 'لا يلزمك تسجيل أي شيء الآن — إن أحببت الحديث أولاً فأنا معك.',
      english: "You don't have to log anything right now — we can just chat first if you like.",
    };
    oneStepOnly = map[dialect];
  } else if (missedRecentDay) {
    const map: Record<NoorDialect, string> = {
      egyptian: 'نكمل من بكرة، مفيش عقاب — خطوة واحدة: سجل طاقتك النهاردة أو 10 دقايق بس.',
      gulf: 'نكمل من باكر، ما في عقاب — خطوة واحدة: سجل طاقتك اليوم أو 10 دقايق بس.',
      levantine: 'نكمل من بكرة، ما في عقاب — خطوة واحدة: سجل طاقتك اليوم أو 10 دقايق بس.',
      maghrebi: 'نكملو غدا، ما كاين حتى عقاب — خطوة وحدة: سجل الطاقة ديالك اليوم أو 10 دقايق فقط.',
      fusha: 'نكمل غداً دون أي عقاب — خطوة واحدة: سجل طاقتك اليوم أو 10 دقائق فقط.',
      english: 'Continue tomorrow, no penalty — one step: log today’s energy or just 10 minutes.',
    };
    oneStepOnly = map[dialect];
  } else if (primaryFocusAction) {
    const m = getActionMetrics(primaryFocusAction, state.logs, 0, effLang, referenceKey);
    const pName = getActionName(primaryFocusAction, effLang);
    const pUnit = UNIT_LABELS[effLang][primaryFocusAction.unit];
    const smallAmount =
      primaryFocusAction.unit === 'minutes'
        ? Math.min(10, m.flexibleDailyGoal)
        : Math.min(5, m.flexibleDailyGoal);
    const map: Record<NoorDialect, string> = {
      egyptian: `خطوة واحدة بس: يلا ابدأ بـ ${smallAmount} ${pUnit} ${pName} في وقت طاقتك العالية.`,
      gulf: `خطوة واحدة بس: يالله ابدأ بـ ${smallAmount} ${pUnit} ${pName} في وقت نشاطك.`,
      levantine: `خطوة واحدة بس: يلا بلش بـ ${smallAmount} ${pUnit} ${pName} بوقت طاقتك العالية.`,
      maghrebi: `خطوة وحدة برك: يلا بدا بـ ${smallAmount} ${pUnit} ديال ${pName} فوقت الطاقة العالية.`,
      fusha: `خطوة واحدة فقط: هيا ابدأ بـ ${smallAmount} ${pUnit} من ${pName} في وقت نشاطك.`,
      english: `Just one step: start with ${smallAmount} ${pUnit} of ${pName} during your high-energy hours.`,
    };
    oneStepOnly = map[dialect];
  } else {
    const map: Record<NoorDialect, string> = {
      egyptian: 'لو حابب تبدأ بحاجة خفيفة، ممكن 10 دقايق بس لأي حاجة بتحبها.',
      gulf: 'لو ودك تبدأ بشيء بسيط، يمديك تجرب 10 دقايق بس لأي شيء تحبه.',
      levantine: 'إذا بتحب تبلش بشي خفيف، جرب 10 دقايق بس لأي شي بتحبه.',
      maghrebi: 'إلا بغيتي تبدا بشي حاجة خفيفة، جرب غير 10 دقايق فشي حاجة كتحبها.',
      fusha: 'إن أردت بداية خفيفة، يمكنك تجربة 10 دقائق فقط في أي شيء تحبه.',
      english: 'If you want something light, you can start with just 10 minutes on anything you enjoy.',
    };
    oneStepOnly = map[dialect];
  }

  const metrics = enabled.map((a) =>
    getActionMetrics(a, state.logs, 0, effLang, referenceKey)
  );
  const balance = getBalanceData(metrics, effLang);
  let dashboardExplanation = '';

  if (loggedDaysCount === 0) {
    const map: Record<NoorDialect, string> = {
      egyptian: `${prefix}اللوحة هادية دلوقتي عشان احنا لسه بنبدأ سوا، أول ما تحب تشارك أي يوم هترسملك خريطتك براحتك.`,
      gulf: `${prefix}اللوحة هادية الحين لأننا تونا نبدأ سوا، متى ما حبيت تشارك يومك بترسم لك خريطتك بسهولة.`,
      levantine: `${prefix}اللوحة هادية هلأ لأننا لسا عم نبلش سوا، إيمتى ما حبيت تشارك يومك بترسملك خريطتك.`,
      maghrebi: `${prefix}اللوحة هادية دابا حيت يلا بدينا مع بعضياتنا، فوقاش ما بغيتي تشارك نهارك غادي تبان الخريطة ديالك.`,
      fusha: `${prefix}اللوحة هادئة الآن لأننا في البداية معاً، ومتى شئت مشاركة يومك ستتشكّل خريطتك هنا.`,
      english: `${prefix}your dashboard is calm right now since we're just starting — whenever you feel like sharing a day, your map will light up here.`,
    };
    dashboardExplanation = map[dialect];
  } else if (enabled.length === 0) {
    const map: Record<NoorDialect, string> = {
      egyptian: `${prefix}سلسلة الطاقة بتاعتك ${energyStreak} ${energyStreak === 1 ? 'يوم' : 'أيام'}، ومتوسط طاقتك ${energyAvg}/10 على مدار ${loggedDaysCount} أيام. لو عايز تشوف رسوم الأفعال، تقدر تضيف فعل واحد في أي وقت.`,
      gulf: `${prefix}سلسلة الطاقة عندك ${energyStreak} ${energyStreak === 1 ? 'يوم' : 'أيام'}، ومتوسط طاقتك ${energyAvg}/10 خلال ${loggedDaysCount} أيام. إذا تبي تشوف رسوم الأفعال، يمديك تضيف فعل واحد بأي وقت.`,
      levantine: `${prefix}سلسلة الطاقة عندك ${energyStreak} ${energyStreak === 1 ? 'يوم' : 'أيام'}، ومتوسط طاقتك ${energyAvg}/10 خلال ${loggedDaysCount} أيام. إذا بدك تشوف رسوم الأفعال، فيك تضيف فعل واحد بأي وقت.`,
      maghrebi: `${prefix}سلسلة الطاقة ديالك ${energyStreak} ${energyStreak === 1 ? 'نهار' : 'أيام'}، ومتوسط الطاقة ${energyAvg}/10 فـ ${loggedDaysCount} أيام. إلا بغيتي تشوف المبيانات، تقدر تزيد فعل واحد فأي وقت.`,
      fusha: `${prefix}سلسلة الطاقة لديك ${energyStreak} ${energyStreak === 1 ? 'يوم' : 'أيام'}، ومتوسط طاقتك ${energyAvg}/10 خلال ${loggedDaysCount} أيام. يمكنك إضافة فعل واحد في أي وقت لمتابعته.`,
      english: `${prefix}your energy streak is ${energyStreak} day(s) with ${energyAvg}/10 average energy across ${loggedDaysCount} logged days. Add one action whenever you want action trend charts.`,
    };
    dashboardExplanation = map[dialect];
  } else {
    const topAction = [...metrics].sort((a, b) => b.thisWeekTotal - a.thisWeekTotal)[0];
    const topName = getActionName(topAction.action, effLang);
    const topUnit = UNIT_LABELS[effLang][topAction.action.unit];
    const map: Record<NoorDialect, string> = {
      egyptian: `${prefix}توازن أفعالك الأسبوع ده ${balance.balanceScore}%، وسلسلة الطاقة ${energyStreak} أيام. أكتر فعل مشيت فيه هو ${topName} (${topAction.thisWeekTotal} ${topUnit}).`,
      gulf: `${prefix}توازن أفعالك هالأسبوع ${balance.balanceScore}%، وسلسلة الطاقة ${energyStreak} أيام. أكثر فعل أنجزت فيه هو ${topName} (${topAction.thisWeekTotal} ${topUnit}).`,
      levantine: `${prefix}توازن أفعالك هالأسبوع ${balance.balanceScore}%، وسلسلة الطاقة ${energyStreak} أيام. أكتر فعل مشيت فيه هو ${topName} (${topAction.thisWeekTotal} ${topUnit}).`,
      maghrebi: `${prefix}توازن الأفعال ديالك هاد السيمانة ${balance.balanceScore}%، وسلسلة الطاقة ${energyStreak} أيام. أكتر فعل خدمتي فيه هو ${topName} (${topAction.thisWeekTotal} ${topUnit}).`,
      fusha: `${prefix}توازن أفعالك هذا الأسبوع ${balance.balanceScore}%، وسلسلة الطاقة ${energyStreak} أيام. أكثر فعل أنجزت فيه هو ${topName} (${topAction.thisWeekTotal} ${topUnit}).`,
      english: `${prefix}your weekly balance is ${balance.balanceScore}% with a ${energyStreak}-day energy streak. Your top action this week is ${topName} (${topAction.thisWeekTotal} ${topUnit}).`,
    };
    dashboardExplanation = map[dialect];
  }

  return {
    loggedDaysCount,
    energyAvg,
    focusAvg,
    energyStreak,
    missedRecentDay,
    sleepImpactPct,
    sleepAvg,
    energyLiftPct,
    bestWeekday,
    tenMinCount,
    headlineInsight: sanitizeNoorText(headlineInsight),
    oneStepOnly: sanitizeNoorText(oneStepOnly),
    dashboardExplanation: sanitizeNoorText(dashboardExplanation),
  };
}

export function getNoorInitialGreeting(
  state: AppState,
  lang: Language,
  mode: NoorMode = resolveNoorMode(state),
  referenceKey = getTodayKey()
): NoorChatMessage {
  const dialect = resolveNoorDialect(state, lang);
  const analysis = analyzeUserDataForNoor(state, lang, referenceKey);
  const id = `init_${Date.now()}`;

  if (mode === 'help' && analysis.loggedDaysCount > 0) {
    return {
      id,
      sender: 'noor',
      text: analysis.headlineInsight,
      oneStep: analysis.oneStepOnly,
    };
  }

  if (mode === 'help' && analysis.loggedDaysCount === 0) {
    const prefix = callUser(state, dialect);
    const helpEmpty: Record<NoorDialect, string> = {
      egyptian: `${prefix}أنا في خدمتك! قولي تحب أساعدك في إيه النهاردة؟`,
      gulf: `${prefix}أنا حاضر! قولي وش ودك أساعدك فيه اليوم؟`,
      levantine: `${prefix}أنا جاهزة! قلي بشو بتحب ساعدك اليوم؟`,
      maghrebi: `${prefix}أنا هنا! قولي فاش بغيتي نعاونك اليوم؟`,
      fusha: `${prefix}أنا هنا لمساعدتك! أخبرني بما تريد المساعدة فيه اليوم؟`,
      english: `${prefix}I'm here to help! What would you like a hand with today?`,
    };
    return {
      id,
      sender: 'noor',
      text: sanitizeNoorText(helpEmpty[dialect]),
    };
  }

  // Chat Mode or 0 days -> pure warm friend opening, NEVER mentions missing data
  const who = nameTag(state, dialect);
  const chatOpenings: Record<NoorDialect, string> = {
    egyptian: `أهلاً${who}، ولا يهمك، احنا لسه بنبدأ، قولي يومك كان عامل ازاي النهاردة؟`,
    gulf: `هلا${who}، ولا يهمك، حنا تونا نبدأ، قولي وشلون يومك اليوم؟`,
    levantine: `أهلين${who}، ولا يهمك، إحنا لسا عم نبلش، قلي كيف كان يومك اليوم؟`,
    maghrebi: `أهلا${who}، ماشي مشكل، يلا بدينا دابا، قولي كيداز نهارك اليوم؟`,
    fusha: `مرحباً${who}، لا بأس، نحن في البداية، أخبرني كيف كان يومك اليوم؟`,
    english: `Hey${who}, no worries, we are just starting — tell me, how was your day?`,
  };
  return {
    id,
    sender: 'noor',
    text: sanitizeNoorText(chatOpenings[dialect]),
  };
}

function parseColorRequest(input: string): { hex: string; labelAr: string; labelEn: string } {
  const lower = input.toLowerCase();
  if (/بنفسجي|موف|purple|violet/.test(lower)) {
    return { hex: '#A855F7', labelAr: 'البنفسجي (#A855F7)', labelEn: 'Purple (#A855F7)' };
  }
  if (/برتقالي|أورانج|orange/.test(lower)) {
    return { hex: '#FF6B35', labelAr: 'البرتقالي (#FF6B35)', labelEn: 'Orange (#FF6B35)' };
  }
  if (/أخضر|اخضر|green|emerald/.test(lower)) {
    return { hex: '#10B981', labelAr: 'الأخضر (#10B981)', labelEn: 'Emerald (#10B981)' };
  }
  if (/تيل|أزرق|ازرق|teal|cyan|default|أصلي/.test(lower)) {
    return { hex: '#00B8A9', labelAr: 'التيل الأساسي (#00B8A9)', labelEn: 'Teal (#00B8A9)' };
  }
  return { hex: '#A855F7', labelAr: 'البنفسجي (#A855F7)', labelEn: 'Purple (#A855F7)' };
}

export function buildNoorReply(
  state: AppState,
  userMessage: string,
  lang: Language,
  referenceKeyOrOptions: string | NoorReplyOptions = getTodayKey()
): NoorChatMessage {
  const options: NoorReplyOptions =
    typeof referenceKeyOrOptions === 'string'
      ? { referenceKey: referenceKeyOrOptions }
      : referenceKeyOrOptions;
  const referenceKey = options.referenceKey ?? getTodayKey();
  const mode: NoorMode = options.mode ?? resolveNoorMode(state);
  const previousNoorTexts = options.previousNoorTexts ?? [];
  const lastNoorMsg = previousNoorTexts[previousNoorTexts.length - 1] ?? '';

  const text = userMessage.trim();
  const lower = text.toLowerCase();
  const normalized = normalizeArabicInput(text);
  const id = `noor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // 0. Check if user requested a dialect change in chat (e.g. "انا مصري")
  const requestedDialect = detectDialectSwitchInMessage(text);
  if (requestedDialect) {
    return {
      id,
      sender: 'noor',
      text: getNoorDialectChangedMessage(requestedDialect, state.userName),
      switchedDialect: requestedDialect,
    };
  }

  const dialect = resolveNoorDialect(state, lang);
  const effLang = getEffectiveLang(dialect);
  const enabled = getEnabledActions(state.actions);
  const prefix = callUser(state, dialect);
  const who = nameTag(state, dialect);
  const loggedDaysCount = Object.keys(state.logs).length;

  // 1. User declines logging -> STOP completely, zero guilt, zero pressure
  if (
    /مش عايز اسجل|مش هسجل|مش حابب اسجل|مليش مزاج اسجل|لا مش عايز اسجل|ما ابغى اسجل|ما بدي سجل|ما بغيتش نسجل|لا اريد التسجيل|don'?t want to log|not logging|skip logging|no logging/i.test(
      normalized
    )
  ) {
    const declinedVariants: Record<NoorDialect, string[]> = {
      egyptian: [
        `تمام براحتك${who}، انا هنا لما تحب.`,
        `على راحتك خالص${who}، انا موجودة هنا وقت ما تحب نحكي.`,
      ],
      gulf: [
        `زين على راحتك${who}، أنا هنا متى ما بغيت.`,
        `ما في مشكلة${who}، خذ راحتك وأنا موجودة متى ما حبيت.`,
      ],
      levantine: [
        `تمام على راحتك${who}، أنا هون إيمتى ما تحب.`,
        `ولا يهمك${who}، براحتك خالص وأنا موجودة لما بدك.`,
      ],
      maghrebi: [
        `مزيان على خاطرك${who}، أنا هنا فوقاش ما بغيتي.`,
        `ما كاين مشكل${who}، على راحتك وأنا ديما هنا.`,
      ],
      fusha: [
        `حسناً كما تحب${who}، أنا هنا متى أردت.`,
        `بكل سرور${who}، خذ راحتك وأنا موجودة دائماً.`,
      ],
      english: [
        `Totally fine${who}, I'm right here whenever you want.`,
        `No pressure at all${who} — I'm here anytime you feel like talking.`,
      ],
    };
    return {
      id,
      sender: 'noor',
      text: pickNonRepeatingVariant(declinedVariants[dialect], previousNoorTexts),
      declinedLogToday: true,
    };
  }

  // 1b. User is lost / doesn't understand the app ("انا مش فاهم" / "I'm lost")
  if (
    /انا مش فاهم|مش فاهم|تايه|تايهه|مش عارف استخدم|فهميني البرنامج|ازاي استخدم|إزاي استخدم|مو فاهم|ما فهمت|ضعت|i'?m lost|\bim lost\b|i don'?t understand|confused|what is this app/i.test(
      normalized
    )
  ) {
    const lostMap: Record<NoorDialect, string> = {
      egyptian: `بص${who}، البرنامج ده ببساطة: بتسجل يومك في دقيقة، انا بفهمك، وبعد أسبوع بقولك إيه اللي بيخليك كويس. مش لازم تعمل كل حاجة، ابدأ بحاجة واحدة بس، تحب أوريك؟`,
      gulf: `شوف${who}، التطبيق هذا ببساطة: تسجل يومك في دقيقة، أنا أفهمك، وبعد أسبوع أعلمك وش اللي يخليك زين. ما يلزم تسوي كل شيء، ابدأ بشيء واحد بس، ودك أوريك؟`,
      levantine: `شوف${who}، التطبيق هاد ببساطة: بتسجل يومك بدقيقة، أنا بفهمك، وبعد أسبوع بقلك شو يلي بيخليك منيح. مو لازم تعمل كل شي، بلش بشغلة وحدة بس، تحب فرجيك؟`,
      maghrebi: `شوف${who}، التطبيق ببساطة: كتسجل نهارك فدقيقة، أنا كنفهمك، ومن بعد سيمانة كنقولك شنو لي كيخليك مزيان. ماشي لازم دير كلشي، بدا بحاجة وحدة برك، بغيتي نوريك؟`,
      fusha: `ببساطة${who}، هذا التطبيق سهل جداً: تسجّل يومك في دقيقة، وأنا أفهمك، وبعد أسبوع أخبرك بما يجعلك أفضل. لا يلزمك فعل كل شيء، ابدأ بشيء واحد فقط، هل تحب أن أريك؟`,
      english: `Look${who}, it's super simple: log your day in 1 minute, I learn how you tick, and after a week I tell you what helps you feel great. No need to do everything — start with just 1 thing, want me to show you?`,
    };
    return {
      id,
      sender: 'noor',
      text: sanitizeNoorText(lostMap[dialect]),
      showTourButton: true,
    };
  }

  // 2. Bored + doesn't want to study/work (Exact Test Rule + dialect variants)
  if (
    (/زهقان|ملل|تعبان|قرفان|مليت|طفشان|bored|unmotivated/i.test(normalized) &&
      /مش عايز|مش قادر|مش طايق|مالي نفس|ما لي خلق|مو قادر|ما بغيتش|don'?t want|do not want|ifollow|study|اذاكر|اشتغل|الشغل|المذاكر/i.test(
        normalized
      )) ||
    /انا زهقان ومش عايز اذاكر/i.test(normalized)
  ) {
    const variants: Record<NoorDialect, string[]> = {
      egyptian: [
        `فاهمك${who}، كلنا بنزهق، تحب نحكي شوية ولا نعمل حاجة خفيفة خالص؟`,
        `عادي جداً${who}، الدماغ بتحتاج تفصل أحياناً — تحب ندردش شوية ولا نخلي النهاردة راحة؟`,
        `حاسس بيك والله${who}، مفيش داعي تضغط على نفسك دلوقتي — تحب نغيّر جو ولا نبدأ بحاجة 5 دقايق؟`,
      ],
      gulf: [
        `فاهمك${who}، كلنا نمل أحياناً، ودك نسولف شوي ولا نسوي شيء خفيف مرّة؟`,
        `عادي جداً${who}، الواحد يحتاج يريح باله — تحب ندردش شوي ولا نخفف اليوم؟`,
      ],
      levantine: [
        `فاهم عليك${who}، كلنا بنزهق أحياناً، بتحب نحكي شوي ولا نعمل شي خفيف كتير؟`,
        `عادي كتير${who}، الواحد بيحتاج يفصل شوي — بدك ندردش ولا تريّح راسك اليوم؟`,
      ],
      maghrebi: [
        `فاهمك${who}، كاملين كيجينا الملل شي مرات، بغيتي نهضرو شوية ولا نديرو شي حاجة خفيفة بزاف؟`,
        `عادي بزاف${who}، الراس كيحتاج يرتاح — بغيتي نبدلو الجو بالهضرة؟`,
      ],
      fusha: [
        `أتفهمك تماماً${who}، جميعنا نشعر بالملل أحياناً، هل تود أن نتحدث قليلاً أم نفعل شيئاً خفيفاً جداً؟`,
        `هذا طبيعي جداً${who}، لا تضغط على نفسك الآن — هل تفضل دردشة هادئة؟`,
      ],
      english: [
        `I get you${who} — we all burn out sometimes. Want to just chat a bit or do something super light?`,
        `Totally normal${who}, your mind probably needs a breather — want to talk about something fun instead?`,
      ],
    };
    return {
      id,
      sender: 'noor',
      text: pickNonRepeatingVariant(variants[dialect], previousNoorTexts),
    };
  }

  // 3. User is bored / stressed / down -> warm conversation & follow-up question (NEVER "سجل يومك")
  if (
    /انا زهقان|زهقان|زهقانه|ملل|ممل|طفشان|متضايق|مخنوق|تعبان|مضغوط|i'?m bored|\bbored\b|stressed|tired|burnt out/i.test(
      normalized
    )
  ) {
    const variants: Record<NoorDialect, string[]> = {
      egyptian: [
        `زهقان ليه${who}؟ احكيلي، الشغل ولا المذاكرة؟`,
        `يعم حقك تزهق شوية${who} — قولي إيه اللي مضايقك أكتر النهاردة؟`,
        `تعالى نفك الملل ده سوا${who}، قولي لو في إيدك تعمل حاجة بتحبها دلوقتي هتعمل إيه؟`,
      ],
      gulf: [
        `طفشان ليه${who}؟ علمني، من الشغل ولا الدراسة؟`,
        `يا هلا${who}، عادي الواحد يطفش أحياناً — وش أكثر شيء شاغل بالك الحين؟`,
        `خلنا نغير جو شوي${who}، لو بيدك الحين تسوي أي شيء يونسّك وش بتختار؟`,
      ],
      levantine: [
        `زهقان ليه${who}؟ احكيلي، من الشغل ولا الدراسة؟`,
        `حقك تزهق أحياناً${who} — قلي شو أكتر شي عم يضغطك اليوم؟`,
        `يلا نكسر الملل سوا${who}، شو أكتر شي بتحب تعمله لتروق؟`,
      ],
      maghrebi: [
        `علاش قانط${who}؟ قولي، واش الخدمة ولا القراية؟`,
        `عادي تجي القنطة شي مرات${who} — قولي شنو لي مبرزطك اليوم؟`,
        `يلا نبدلو الجو شوية${who}، شنو الحاجة لي كتفرحك فحال هاد الوقت؟`,
      ],
      fusha: [
        `لماذا تشعر بالملل${who}؟ أخبرني، هل بسبب العمل أم الدراسة؟`,
        `من الطبيعي أن نشعر بالتعب أحياناً${who} — ما الذي يشغل بالك اليوم؟`,
        `دعنا نغيّر الجو قليلاً${who}، ما النشاط الصغير الذي يريحك عادةً؟`,
      ],
      english: [
        `Why are you bored${who}? Tell me — is it work or studying?`,
        `Fair enough${who}, everyone hits a dull moment — what's weighing on today?`,
        `Let's switch the vibe${who} — what's something you actually enjoy doing when you unwind?`,
      ],
    };
    return {
      id,
      sender: 'noor',
      text: pickNonRepeatingVariant(variants[dialect], previousNoorTexts),
    };
  }

  // 4. Follow-up replies when user answers Noor's question ("المذاكرة", "الشغل", "حلو", "تقيل")
  if (
    /^(المذاكره|مذاكره|الشغل|شغل|الدراسه|دراسه|الجامعه|البيت|work|studying|study)$/i.test(
      normalized
    ) ||
    (/(المذاكره|الشغل|work|study)/i.test(normalized) &&
      /زهقان|احكيلي|الشغل ولا المذاكرة|work or studying/i.test(lastNoorMsg))
  ) {
    const isStudy = /مذاكر|دراسه|study|جامع/i.test(normalized);
    const variants: Record<NoorDialect, string[]> = isStudy
      ? {
          egyptian: [
            `المذاكرة فعلاً بتتقل لما تبقى لوحدك${who} — تاخد بريك كوباية شاي ولا تفتح صفحة واحدة بس معايا؟`,
            `فاهمك جداً${who}، أحياناً المادة بتبقى تقيلة من غير نفس — تحب نقسمها حتة قد كف الإيد ولا ناخد نفس الأول؟`,
          ],
          gulf: [
            `الدراسة فعلاً تثقل أحياناً${who} — وش رايك تاخذ بريك شاهي ولا تبدأ بصفحة وحدة بس؟`,
            `فاهمك${who}، لا تشيل هم الكمية الحين — تبي ترتاح شوي ولا نخلص جزء بسيط؟`,
          ],
          levantine: [
            `الدراسة بتتقل أحياناً${who} — شو رأيك بريك صغير مع كاسة شاي ولا صفحة وحدة بس؟`,
            `فاهمك كتير${who}، ما تحمل هم الكمية هلأ — بتحب تريّح شوي؟`,
          ],
          maghrebi: [
            `القراية كتتقل شي مرات${who} — تاخد استراحة بكاس د أتاي ولا تبدا غير بصفحة وحدة؟`,
            `فاهمك مزيان${who}، ما تهزش الهم دابا — بغيتي ترتاح شوية؟`,
          ],
          fusha: [
            `الدراسة تصبح ثقيلة أحياناً${who} — هل تفضل استراحة قصيرة أم البدء بصفحة واحدة فقط؟`,
            `أتفهمك${who}، لا تحمل هم الكمية الآن — هل تود أخذ نفس قصير؟`,
          ],
          english: [
            `Studying definitely gets heavy sometimes${who} — want a quick tea break or just one tiny page together?`,
            `I hear you${who} — no need to tackle the whole mountain, how about catching your breath first?`,
          ],
        }
      : {
          egyptian: [
            `ضغط الشغل بياكل الطاقة${who} — حقك تفصل شوية، أكلت كويس النهاردة ولا لسه؟`,
            `ربنا يقويك على الشغل${who} — خلصت الجزء الكبير ولا لسه قدامك حاجات؟`,
          ],
          gulf: [
            `ضغط الشغل يستهلك الطاقة${who} — حقك ترتاح شوي، تغديت ولا بعدك؟`,
            `الله يعطيك العافية${who} — خلصت أغلب الشغل ولا باقي لك شيء؟`,
          ],
          levantine: [
            `ضغط الشغل بيسحب الطاقة${who} — حقك تفصل شوي، أكلت منيح اليوم؟`,
            `يعطيك العافية${who} — خلصت الجزء الكبير ولا لسا في شغل؟`,
          ],
          maghrebi: [
            `ضغط الخدمة كيدي الطاقة${who} — من حقك ترتاح شوية، كليتي مزيان اليوم؟`,
            `الله يعاونك${who} — ساليتي الخدمة الكبيرة ولا باقي شوية؟`,
          ],
          fusha: [
            `ضغط العمل يستنزف الطاقة${who} — من حقك أن تستريح قليلاً، كيف قضيت وقتك بعده؟`,
            `أعانك الله${who}، هل أنهيت الجزء الأصعب من يومك؟`,
          ],
          english: [
            `Work pressure drains your battery fast${who} — did you get a real break or a good meal today?`,
            `Hang in there${who} — is the hardest part of work behind you now?`,
          ],
        };
    return {
      id,
      sender: 'noor',
      text: pickNonRepeatingVariant(variants[dialect], previousNoorTexts),
    };
  }

  // Answer to "good or heavy?" / mood updates
  if (
    /^(حلو|كويس|تمام|الحمد لله|مبسوط|رايق|good|great|nice|fine|okay)$/i.test(
      normalized
    ) ||
    /^(تقيل|تعب|وحش|صعب|زحمه|heavy|rough|hard|bad)$/i.test(normalized)
  ) {
    const isHeavy = /تقيل|تعب|وحش|صعب|زحمه|heavy|rough|hard|bad/i.test(normalized);
    const variants: Record<NoorDialect, string[]> = isHeavy
      ? {
          egyptian: [
            `سلامتك من التعب${who} — الأيام التقيلة بتعدي، المهم تهوّن على نفسك الليلة، تحب نحكي شوية ولا تريح خالص؟`,
            `معلش${who}، مش كل الأيام بتبقى بنفس الخفة — إيه أكتر حاجة ممكن تبسطك دلوقتي في 5 دقايق؟`,
          ],
          gulf: [
            `ما تشوف شر من التعب${who} — الأيام الثقيلة تعدي، أهم شيء تهوّن على نفسك الليلة، ودك نسولف شوي؟`,
            `لا تشيل هم${who}، مو كل يوم يكون خفيف — وش أبسط شيء يريحك الحين؟`,
          ],
          levantine: [
            `سلامتك من التعب${who} — الأيام التقيلة بتمرق، المهم تريّح حالك الليلة، بتحب نحكي شوي؟`,
            `ولا يهمك${who}، مو كل يوم لازم يكون خفيف — شو أكتر شي بيريّحك هلأ؟`,
          ],
          maghrebi: [
            `لا باس عليك${who} — الأيام التقيلة كدوز، المهم تهلى فراسك الليلة، بغيتي نهضرو شوية؟`,
            `ماشي مشكل${who}، ماشي كل نهار كيكون خفيف — شنو الحاجة لي تريحك دابا؟`,
          ],
          fusha: [
            `هون على نفسك${who} — الأيام المتعبة تمر، الأهم أن تمنح نفسك راحة الليلة، هل تود التحدث قليلاً؟`,
            `لا بأس${who}، ليست كل الأيام متشابهة — ما أبسط شيء يريحك الآن؟`,
          ],
          english: [
            `Sorry today felt heavy${who} — rough days pass, and tonight it's okay to just go easy on yourself. Want to chat about something lighter?`,
            `I hear you${who} — not every day has to be super productive. What helps you unwind most tonight?`,
          ],
        }
      : {
          egyptian: [
            `يا سيدي يدوم الروقان${who}! فرحتلك والله، قولي إيه أحلى حاجة حصلتلك النهاردة؟`,
            `كلام جامد ده${who}! طالما المزاج حلو، ناوي تعمل إيه لطيف بقية اليوم؟`,
          ],
          gulf: [
            `عسى دوم يا رب${who}! والله فرحت لك، قولي وش أحلى شيء صار معك اليوم؟`,
            `ما شاء الله وايد زين${who}! وش ناوي تسوي بباقي يومك؟`,
          ],
          levantine: [
            `إن شاء الله ع طول منيح${who}! فرحتلك، شو أحلى شي صار معك اليوم؟`,
            `شي حلو كتير${who}! كيف ناوي تكمل باقي يومك؟`,
          ],
          maghrebi: [
            `ديما مزيان إن شاء الله${who}! فرحت ليك بزاف، شنو أحسن حاجة وقعت اليوم؟`,
            `زوين بزاف${who}! شنو ناوي دير فباقي النهار؟`,
          ],
          fusha: [
            `رائع جداً${who}! يسعدني سماع ذلك، ما أجمل لحظة مرّت بك اليوم؟`,
            `جميل جداً${who}! ماذا تحب أن تفعل في بقية يومك؟`,
          ],
          english: [
            `Love to hear that${who}! What was the best moment of your day so far?`,
            `That's awesome${who}! Doing anything fun with the rest of your day?`,
          ],
        };
    return {
      id,
      sender: 'noor',
      text: pickNonRepeatingVariant(variants[dialect], previousNoorTexts),
    };
  }

  // 5. Greetings ("ازيك", "Hi", "Hello", "اهلا") -> friend greeting, NO data talk
  if (
    /^(ازيك|عامل ايه|اهلا|اهلاً|السلام عليكم|صباح الخير|مساء الخير|مرحبا|هلا|كيفك|لاباس|كيداير|hi|hello|hey|yo|good morning|good evening)/i.test(
      normalized
    )
  ) {
    const greetVariants: Record<NoorDialect, string[]> = {
      egyptian: [
        `ازيك${who}، عامل ايه النهاردة؟ طمني أخبارك إيه؟`,
        `أهلاً أهلاً${who}! وحشتني الدردشة معاك — يومك ماشي ازاي النهاردة؟`,
        `منور الدنيا${who}! قولي نفسيتك عاملة إيه دلوقتي؟`,
      ],
      gulf: [
        `هلا والله${who}، وش أخبارك اليوم؟ عساك بخير؟`,
        `أهلاً${who}! حياك الله — وشلون يومك ماشي اليوم؟`,
        `هلا بك${who}! قولي كيف المعنويات اليوم؟`,
      ],
      levantine: [
        `أهلين${who}، كيفك اليوم؟ شو أخبارك؟`,
        `يا هلا${who}! منور — كيف ماشي يومك اليوم؟`,
        `كيفك${who}؟ قلي نفسيتك كيف اليوم؟`,
      ],
      maghrebi: [
        `أهلا${who}، لاباس عليك كيداير اليوم؟`,
        `مرحبا بك${who}! كيداز نهارك لحد الساعة؟`,
        `أهلا وسهلا${who}! قولي كيف داير المزاج اليوم؟`,
      ],
      fusha: [
        `مرحباً${who}، كيف حالك اليوم؟ أتمنى أن تكون بخير؟`,
        `أهلاً بك${who}! كيف يسير يومك حتى الآن؟`,
      ],
      english: [
        `Hi${who}, how are you doing today?`,
        `Hey${who}! Good to see you — how has your day been treating you?`,
        `Hello${who}! What kind of mood are you in today?`,
      ],
    };
    return {
      id,
      sender: 'noor',
      text: pickNonRepeatingVariant(greetVariants[dialect], previousNoorTexts),
    };
  }

  // 6. Tell me something / Let's chat / Joke / Motivation -> light human vibe
  if (
    /احكيلي حاجه|احكيلي|قولي نكته|نكته|نحكي شويه|ندردش|فرفشيني|قولي حاجه|شجعيني|tell me something|let'?s chat|\bjoke\b|motivate|chat with me/i.test(
      normalized
    )
  ) {
    const storyVariants: Record<NoorDialect, string[]> = {
      egyptian: [
        `عارف${who}، سر صغير: ساعات الإنجاز الحقيقي إنك تقفل الموبايل ربع ساعة وتشرب حاجة سخنة وتقول لنفسك كفاية شطارة النهاردة — بتحب تشرب إيه وانت رايق؟`,
        `مرة واحد عمل جدول مذاكرة مثالي 12 ساعة في اليوم... الجدول لسه بيتصور على إنستجرام وهو نام ساعتين! عشان كده احنا بنمشي براحتنا. إيه أكتر حاجة بتضحكك؟`,
        `معلومة لطيفة${who}: المخ بيكره البدايات الكبيرة، بس لو خدعته بـ 10 دقايق بس بيقولك طب ما نكمل! نفسك تجرب الفكرة دي في حاجة قريب؟`,
      ],
      gulf: [
        `تدري${who}؟ أحياناً أكبر إنجاز هو إنك تترك الجوال ربع ساعة وتشرب قهوتك بهدوء — وش مشروبك المفضل وقت الروقان؟`,
        `مرة واحد سوى جدول يومي من 5 الفجر لين 12 الليل... ثم نام بعد أول سطر! علشان كذا دايم البساطة تفوز. وش يضحكك أكثر شيء؟`,
        `فكرة حلوة${who}: العقل يخاف من البداية الكبيرة، بس 10 دقايق بس تخليه يتحمس لحاله — وش رايك في هالحيلة؟`,
      ],
      levantine: [
        `بتعرف${who}؟ أحياناً أحلى إنجاز هو تترك الموبايل ربع ساعة وتشرب قهوة ع رواق — شو مشروبك المفضل؟`,
        `مرة واحد خطط يدرس 10 ساعات ورا بعض... خلص تخطيط الألوان ونام! لهيك البساطة أحلى. شو أكتر شي بيضحكك؟`,
      ],
      maghrebi: [
        `عارف${who}؟ شي مرات أحسن إنجاز هو تحط التليفون ربع ساعة وتشرب قهوة على خاطرك — شنو المشروب المفضل عندك؟`,
        `واحد المرة دار برنامج ديال 10 سوايع قراية... زوق الورقة مزيان ومشا ينعس! داكشي علاش غير بشوية أحسن. شنو كيضحكك بزاف؟`,
      ],
      fusha: [
        `هل تعلم${who}؟ أحياناً يكون أفضل إنجاز أن تأخذ استراحة قصيرة مع مشروب دافئ بعيداً عن الضجيج — ما مشروبك المفضل؟`,
        `العقل يقاوم المهام الكبيرة، لكنه يرحّب ببداية مدتها 10 دقائق فقط — هل لاحظت ذلك من قبل؟`,
      ],
      english: [
        `Little secret${who}: sometimes the best win of the day is putting your phone down for 15 minutes with a warm drink — what's your go-to comfort drink?`,
        `Someone once wrote a 12-hour super-schedule... spent 2 hours picking highlighters and immediately took a nap! That's why keeping things tiny works. What makes you laugh lately?`,
        `Fun fact${who}: your brain dreads giant tasks, yet happily accepts "just 10 minutes" — sneaky, right?`,
      ],
    };
    return {
      id,
      sender: 'noor',
      text: pickNonRepeatingVariant(storyVariants[dialect], previousNoorTexts),
    };
  }

  // 7. Start 10 minutes
  if (/نبدأ ب.? 10|10 دقايق|start 10 min|10 min starter/i.test(normalized)) {
    const start10Map: Record<NoorDialect, string[]> = {
      egyptian: [
        `عاش${who}! 10 دقايق بس من غير أي ضغط — ولو وقفت بعدهم انت بطل برضه. جاهز؟`,
        `يلا بينا${who}! فتحتلك مؤقت الـ 10 دقايق — ركز في حتة قد كف الإيد وبس!`,
      ],
      gulf: [
        `كفو${who}! 10 دقايق بس بدون أي ضغط — ولو وقفت بعدها أنت كفو بعد. جاهز؟`,
        `يالله نبدأ${who}! 10 دقايق خفيفة تفتح النفس بدون تعقيد.`,
      ],
      levantine: [
        `برافو${who}! 10 دقايق بس بلا أي ضغط — جاهز نبلش؟`,
      ],
      maghrebi: [
        `برافو${who}! 10 دقايق فقط بلا زيار — واجد نبداو؟`,
      ],
      fusha: [
        `ممتاز${who}! 10 دقائق فقط دون أي ضغط — هل أنت مستعد؟`,
      ],
      english: [
        `Love that${who}! Just 10 light minutes with zero pressure — ready to roll?`,
      ],
    };
    return {
      id,
      sender: 'noor',
      text: pickNonRepeatingVariant(start10Map[dialect], previousNoorTexts),
      triggerTenMinTimer: true,
    };
  }

  // 8. Delete / Remove action — NEVER deletes without explicit confirmation
  if (/احذف|امسح|الغي فعل|delete action|remove action/.test(lower)) {
    const target =
      enabled.find(
        (a) =>
          lower.includes(a.nameAr.toLowerCase()) ||
          lower.includes(a.nameEn.toLowerCase())
      ) ?? enabled[0];
    if (!target) {
      const noActionMap: Record<NoorDialect, string> = {
        egyptian: `${prefix}مفيش أفعال مفعّلة دلوقتي عشان نحذفها.`,
        gulf: `${prefix}ما في أفعال مفعّلة الحين علشان نحذفها.`,
        levantine: `${prefix}ما في أفعال مفعّلة هلأ مشان نحذفها.`,
        maghrebi: `${prefix}ما كاينش أفعال مفعّلة دابا باش نحيدوها.`,
        fusha: `${prefix}لا توجد أفعال مفعّلة حالياً لحذفها.`,
        english: `${prefix}there are no enabled actions to remove right now.`,
      };
      return {
        id,
        sender: 'noor',
        text: sanitizeNoorText(noActionMap[dialect]),
      };
    }
    const name = getActionName(target, effLang);
    const confirmMap: Record<NoorDialect, string> = {
      egyptian: `${prefix}مش همسح "${name}" غير لما تأكدلي الأول.`,
      gulf: `${prefix}ما بحذف "${name}" لين تأكد لي الأول.`,
      levantine: `${prefix}ما رح امسح "${name}" إلا لما تأكدلي بالأول.`,
      maghrebi: `${prefix}ما غاديش نحيد "${name}" حتى تأكد ليا الأول.`,
      fusha: `${prefix}لن أحذف "${name}" قبل تأكيدك أولاً.`,
      english: `${prefix}I won't remove "${name}" without your confirmation.`,
    };
    const summaryMap: Record<NoorDialect, string> = {
      egyptian: `مسح فعل "${name}" من قائمتك اليومية`,
      gulf: `حذف فعل "${name}" من قائمتك اليومية`,
      levantine: `إزالة فعل "${name}" من قائمتك اليومية`,
      maghrebi: `إزالة فعل "${name}" من القائمة اليومية`,
      fusha: `إزالة فعل "${name}" من قائمتك اليومية`,
      english: `Remove "${name}" from your active actions`,
    };
    return {
      id,
      sender: 'noor',
      text: sanitizeNoorText(confirmMap[dialect]),
      proposal: {
        id: `prop_${Date.now()}`,
        kind: 'remove_action',
        actionId: target.id,
        actionName: name,
        summary: summaryMap[dialect],
      },
      proposalStatus: 'pending',
    };
  }

  // 9. Add a new action
  if (/أضف فعل|اضف فعل|ضيف فعل|فعل جديد|add action|new action/.test(lower)) {
    if (enabled.length >= 5) {
      const maxMap: Record<NoorDialect, string> = {
        egyptian: `${prefix}عندك 5 أفعال بالفعل (ده الحد الأقصى عشان متضغطش نفسك). تقدر تعدل أو تحذف فعل لو عايز.`,
        gulf: `${prefix}عندك 5 أفعال بالفعل (هذا الحد الأقصى علشان ما تضغط على نفسك). يمديك تعدل أو تحذف فعل إذا تبي.`,
        levantine: `${prefix}عندك 5 أفعال حالياً (هاد الحد الأقصى مشان ما تضغط حالك). فيك تعدّل أو تشيل فعل إذا بدك.`,
        maghrebi: `${prefix}عندك 5 أفعال دابا (هاد هو الحد الأقصى باش ما تزيرش راسك). تقدر تبدل أو تحيد شي فعل إلا بغيتي.`,
        fusha: `${prefix}لديك 5 أفعال بالفعل (وهو الحد الأقصى حتى لا تضغط على نفسك). يمكنك تعديل أو إزالة فعل إذا أردت.`,
        english: `${prefix}you already have 5 active actions (the gentle max). You can edit or remove one first.`,
      };
      return {
        id,
        sender: 'noor',
        text: sanitizeNoorText(maxMap[dialect]),
      };
    }
    const disabledPreset = state.actions.find((a) => !a.enabled);
    const cleanedCustom = text
      .replace(/أضف فعل|اضف فعل|ضيف فعل|فعل جديد|add action|new action/gi, '')
      .trim();

    const nameAr =
      cleanedCustom.length > 0
        ? cleanedCustom
        : disabledPreset?.nameAr ?? 'تأمل وهدوء';
    const nameEn =
      cleanedCustom.length > 0
        ? cleanedCustom
        : disabledPreset?.nameEn ?? 'Mindfulness';
    const unit: ActionUnit = disabledPreset?.unit ?? 'minutes';
    const color =
      ALLOWED_ACTION_COLORS[enabled.length % ALLOWED_ACTION_COLORS.length];
    const weeklyGoal = disabledPreset?.weeklyGoal ?? 70;
    const unitTxt = UNIT_LABELS[effLang][unit];

    const addMap: Record<NoorDialect, string> = {
      egyptian: `${prefix}أقدر أضيفلك فعل "${nameAr}" بهدف مرن ${weeklyGoal} ${unitTxt} في الأسبوع — براحتك.`,
      gulf: `${prefix}أبشر، يمديني أضيفلك فعل "${nameAr}" بهدف مرن ${weeklyGoal} ${unitTxt} بالأسبوع.`,
      levantine: `${prefix}فيني ضيفلك فعل "${nameAr}" بهدف مرن ${weeklyGoal} ${unitTxt} بالأسبوع.`,
      maghrebi: `${prefix}نقدر نزيد ليك فعل "${nameAr}" بهدف مرن ${weeklyGoal} ${unitTxt} فالسيمانة.`,
      fusha: `${prefix}يمكنني إضافة فعل "${nameAr}" بهدف مرن ${weeklyGoal} ${unitTxt} أسبوعياً.`,
      english: `${prefix}I can add "${nameEn}" with a gentle goal of ${weeklyGoal} ${unitTxt}/week.`,
    };
    return {
      id,
      sender: 'noor',
      text: sanitizeNoorText(addMap[dialect]),
      proposal: {
        id: `prop_${Date.now()}`,
        kind: 'add_action',
        nameAr,
        nameEn,
        unit,
        color,
        weeklyGoal,
        summary:
          effLang === 'ar'
            ? `إضافة فعل "${nameAr}" (${weeklyGoal} ${UNIT_LABELS.ar[unit]}/أسبوع)`
            : `Add "${nameEn}" (${weeklyGoal} ${UNIT_LABELS.en[unit]}/week)`,
      },
      proposalStatus: 'pending',
    };
  }

  // 10. Edit an action
  if (/عدّل|عدل|تعديل فعل|edit action|lower goal/.test(lower)) {
    const target =
      enabled.find(
        (a) =>
          lower.includes(a.nameAr.toLowerCase()) ||
          lower.includes(a.nameEn.toLowerCase())
      ) ?? enabled[0];
    if (!target) {
      const noEditMap: Record<NoorDialect, string> = {
        egyptian: `${prefix}تحب نضيف أول فعل خفيف سوا دلوقتي؟`,
        gulf: `${prefix}ودك نضيف أول فعل بسيط سوا الحين؟`,
        levantine: `${prefix}بتحب نضيف أول فعل خفيف سوا هلأ؟`,
        maghrebi: `${prefix}بغيتي نزيدو أول فعل خفيف دابا؟`,
        fusha: `${prefix}هل تريد إضافة أول فعل خفيف معاً الآن؟`,
        english: `${prefix}want to add your first light action together?`,
      };
      return {
        id,
        sender: 'noor',
        text: sanitizeNoorText(noEditMap[dialect]),
      };
    }
    const currentName = getActionName(target, effLang);
    const currentGoal = target.weeklyGoal ?? 105;
    const newGoal = Math.max(7, Math.round(currentGoal * 0.8));
    const unitTxt = UNIT_LABELS[effLang][target.unit];
    const editMap: Record<NoorDialect, string> = {
      egyptian: `${prefix}أقدر أظبطلك الهدف الأسبوعي لـ "${currentName}" من ${currentGoal} لـ ${newGoal} ${unitTxt} عشان يبقى أريح.`,
      gulf: `${prefix}يمديني أعدل الهدف الأسبوعي لـ "${currentName}" من ${currentGoal} إلى ${newGoal} ${unitTxt} علشان يكون أريح لك.`,
      levantine: `${prefix}فيني عدّل الهدف الأسبوعي لـ "${currentName}" من ${currentGoal} لـ ${newGoal} ${unitTxt} مشان يكون أريح.`,
      maghrebi: `${prefix}نقدر نبدل الهدف الأسبوعي ديال "${currentName}" من ${currentGoal} لـ ${newGoal} ${unitTxt} باش يكون مريح كتر.`,
      fusha: `${prefix}يمكنني تعديل الهدف الأسبوعي لـ "${currentName}" من ${currentGoal} إلى ${newGoal} ${unitTxt} ليكون أسهل.`,
      english: `${prefix}I can adjust "${currentName}" weekly goal from ${currentGoal} to ${newGoal} ${unitTxt} to keep it comfortable.`,
    };
    return {
      id,
      sender: 'noor',
      text: sanitizeNoorText(editMap[dialect]),
      proposal: {
        id: `prop_${Date.now()}`,
        kind: 'edit_action',
        actionId: target.id,
        newNameAr: target.nameAr,
        newNameEn: target.nameEn,
        newWeeklyGoal: newGoal,
        summary:
          effLang === 'ar'
            ? `تعديل هدف "${currentName}" إلى ${newGoal} ${UNIT_LABELS.ar[target.unit]}/أسبوع`
            : `Update "${currentName}" weekly goal to ${newGoal} ${UNIT_LABELS.en[target.unit]}/week`,
      },
      proposalStatus: 'pending',
    };
  }

  // 11. Change design colors
  if (/لون|ألوان|الوان|color|theme/.test(lower)) {
    const chosen =
      state.accentColor === '#A855F7' && !/بنفسجي|purple/.test(lower)
        ? { hex: '#00B8A9', labelAr: 'التيل الأساسي (#00B8A9)', labelEn: 'Teal (#00B8A9)' }
        : parseColorRequest(text);
    const colorMap: Record<NoorDialect, string> = {
      egyptian: `${prefix}أقدر أغيّر لون التمييز بتاعك لـ ${chosen.labelAr} مع الحفاظ على الخلفية الداكنة.`,
      gulf: `${prefix}أبشر، يمديني أغير لون التمييز إلى ${chosen.labelAr} مع بقاء الخلفية الداكنة.`,
      levantine: `${prefix}فيني غيّر لون التمييز إلك لـ ${chosen.labelAr} مع الحفاظ على الخلفية الغامقة.`,
      maghrebi: `${prefix}نقدر نبدل لون التمييز لـ ${chosen.labelAr} مع بقاء الخلفية الداكنة.`,
      fusha: `${prefix}يمكنني تغيير لون التمييز إلى ${chosen.labelAr} مع الحفاظ على المظهر الداكن.`,
      english: `${prefix}I can switch your accent color to ${chosen.labelEn} while keeping the dark theme.`,
    };
    return {
      id,
      sender: 'noor',
      text: sanitizeNoorText(colorMap[dialect]),
      proposal: {
        id: `prop_${Date.now()}`,
        kind: 'change_color',
        newAccentColor: chosen.hex,
        colorLabel: effLang === 'ar' ? chosen.labelAr : chosen.labelEn,
        summary:
          effLang === 'ar'
            ? `تغيير لون التمييز إلى ${chosen.labelAr}`
            : `Change accent color to ${chosen.labelEn}`,
      },
      proposalStatus: 'pending',
    };
  }

  // 12. Add a requested feature
  if (/ميزة|أضف ميزة|اضف ميزة|مؤقت|تذكير|feature|timer|reminder/.test(lower)) {
    const wantReminder = /تذكير|نوم|ليل|reminder|10 ?pm/.test(lower);
    const feature = wantReminder ? 'eveningReminder' : 'tenMinTimer';
    const featureMap: Record<NoorDialect, string> = wantReminder
      ? {
          egyptian: `${prefix}أقدر أفعّلك ميزة تذكير الساعة 10 بالليل لو حبيت.`,
          gulf: `${prefix}يمديني أفعل لك تذكير الساعة 10 بالليل إذا حبيت.`,
          levantine: `${prefix}فيني فعّلك تذكير الساعة 10 بالليل إذا حبيت.`,
          maghrebi: `${prefix}نقدر نفعل ليك التذكير مع 10 دالليل إلا بغيتي.`,
          fusha: `${prefix}يمكنني تفعيل التذكير المسائي الساعة 10 إذا أحببت.`,
          english: `${prefix}I can enable the gentle 10 PM check-in reminder for you.`,
        }
      : {
          egyptian: `${prefix}أقدر أضيفلك "مؤقت الـ 10 دقايق" في الشاشة الرئيسية عشان تبدأ براحتك.`,
          gulf: `${prefix}يمديني أضيفلك "مؤقت الـ 10 دقايق" في الشاشة الرئيسية علشان تبدأ بسهولة.`,
          levantine: `${prefix}فيني ضيفلك "مؤقت الـ 10 دقايق" بالشاشة الرئيسية مشان تبلش بسهولة.`,
          maghrebi: `${prefix}نقدر نزيد ليك "مؤقت 10 دقايق" فالشاشة الرئيسية باش تبدا مرتاح.`,
          fusha: `${prefix}يمكنني إضافة "مؤقت الـ 10 دقائق" في الشاشة الرئيسية لتبدأ بسهولة.`,
          english: `${prefix}I can add the "10-Minute Starter Timer" widget to your Daily Check-in screen.`,
        };

    return {
      id,
      sender: 'noor',
      text: sanitizeNoorText(featureMap[dialect]),
      proposal: {
        id: `prop_${Date.now()}`,
        kind: 'add_feature',
        feature,
        summary:
          feature === 'eveningReminder'
            ? effLang === 'ar'
              ? 'تفعيل ميزة التذكير المسائي (10 بالليل)'
              : 'Enable 10 PM evening reminder feature'
            : effLang === 'ar'
            ? 'إضافة مؤقت قاعدة الـ 10 دقايق للشاشة الرئيسية'
            : 'Add 10-Minute Starter Timer to Daily Check-in',
      },
      proposalStatus: 'pending',
    };
  }

  // 13. Explain weekly deep recommendation with real numbers
  if (
    /توصية|توصيه|التوصية|توصيات|نمط|اشرح.*الأسبوع|recommendation|weekly rec|pattern|why.*friday/i.test(
      lower
    )
  ) {
    const rec = explainWeeklyRecommendationWithNoor(state, lang, referenceKey);
    return {
      id,
      sender: 'noor',
      text: rec.text,
      oneStep: rec.oneStep,
      switchedMode: 'help',
    };
  }

  // 14. Explain dashboard
  if (/اشرح|لوحة|أرقام|dashboard|explain|summary|chart/.test(lower)) {
    const analysis = analyzeUserDataForNoor(state, lang, referenceKey);
    return {
      id,
      sender: 'noor',
      text: analysis.dashboardExplanation,
      oneStep: analysis.oneStepOnly,
      switchedMode: 'help',
    };
  }

  // 15. Help Mode explicit request ("ساعديني" / "ساعدني" / "help me")
  if (/ساعديني|ساعدني|مساعده|help me|\bhelp\b|اقترحي/i.test(normalized)) {
    if (loggedDaysCount === 0) {
      const noDataHelpVariants: Record<NoorDialect, string[]> = {
        egyptian: [
          `عيني ليك${who}! تحب نرتب خطوة صغيرة مدتها 10 دقايق دلوقتي ولا تحكيلي الأول إيه اللي شاغلك؟`,
          `معاك${who}، قولي أكتر حاجة نفسك تنجزها النهاردة إيه وأنا هظبطها معاك في خطوة واحدة؟`,
        ],
        gulf: [
          `أبشر${who}! ودك نرتب خطوة خفيفة 10 دقايق الحين ولا تعلمني وش اللي شاغل بالك؟`,
          `معك${who}، قولي وش ودك تخلص اليوم ونبدأه بخطوة وحدة بسيطة؟`,
        ],
        levantine: [
          `من عيوني${who}! بتحب نرتب خطوة خفيفة 10 دقايق هلأ ولا تحكيلي شو شاغل بالك؟`,
          `معك${who}، قلي شو حابب تساعدك فيه اليوم؟`,
        ],
        maghrebi: [
          `على الراس والعين${who}! بغيتي نقادو خطوة خفيفة ديال 10 دقايق ولا تقولي شنو شاغل بالك؟`,
        ],
        fusha: [
          `بكل سرور${who}! كيف تحب أن أساعدك الآن؟`,
        ],
        english: [
          `I've got you${who}! Would you like a gentle 10-minute plan for right now, or tell me what's on your mind?`,
        ],
      };
      return {
        id,
        sender: 'noor',
        text: pickNonRepeatingVariant(noDataHelpVariants[dialect], previousNoorTexts),
        switchedMode: 'help',
      };
    }
    const analysis = analyzeUserDataForNoor(state, lang, referenceKey);
    return {
      id,
      sender: 'noor',
      text: analysis.headlineInsight,
      oneStep: analysis.oneStepOnly,
      switchedMode: 'help',
    };
  }

  // 16. If explicitly in Help Mode and data exists -> share insight + ONE step
  if (mode === 'help' && loggedDaysCount > 0) {
    const analysis = analyzeUserDataForNoor(state, lang, referenceKey);
    return {
      id,
      sender: 'noor',
      text: analysis.headlineInsight,
      oneStep: analysis.oneStepOnly,
    };
  }

  // 16b. Interim rules-only context carry-over (Egyptian): when the user already named a
  // low feeling, reflect it and ask about what happened instead of asking "how do you feel".
  if (
    dialect === 'egyptian' &&
    /مش مبسوط|مش مبسوطة|زهقان|زهقت|متضايق|متضايقة|مخنوق|مخنوقة|حزين|حزينة|زعلان|زعلانة|قلقان|قلقانة|متوتر|متوترة|تعبان|تعبانة/.test(
      normalized
    )
  ) {
    const reflectVariants = [
      `واضح إن اليوم تقيل عليك${who}، وده مش لازم يكون له سبب واضح. حصل حاجة النهارده ضغطت عليك، ولا هو تراكم من الأيام اللي فاتت؟`,
      `حاسس بيك${who}. مش لازم نلاقي سبب دلوقتي. لو حابب، قولي أكتر حاجة شغلت بالك النهارده وأنا معاك.`,
    ];
    return {
      id,
      sender: 'noor',
      text: pickNonRepeatingVariant(reflectVariants, previousNoorTexts),
    };
  }

  // 17. Chat Mode / Casual conversation fallback — warm friend, uses user's name & dialect, asks max 1 question, NO data nagging!
  const chatFallback: Record<NoorDialect, string[]> = {
    egyptian: [
      `سمعتك${who}، كلامك يهمني جداً — قولي حاسس بإيه أكتر دلوقتي؟`,
      `معاك ع الخط${who}، كمل كلامك وبراحتك خالص — تحب نكمل حكاية في الموضوع ده ولا نغيّر جو؟`,
      `يا سلام${who}، بحب لما بتحكيلي بصراحة — إيه اللي في دماغك دلوقتي؟`,
    ],
    gulf: [
      `أسمعك زين${who} — قولي وش حاس فيه الحين؟`,
      `معك على الخط${who}، خذ راحتك بالسوالف — ودك تكمل في هالموضوع؟`,
      `هلا بك${who}، يعجبني كلامك الصريح — وش اللي ببالك الحين؟`,
    ],
    levantine: [
      `عم اسمعك${who} — قلي شو حاسس هلأ؟`,
      `معك ع الخط${who}، احكيلي براحتك — بتحب نكمل بهالموضوع؟`,
    ],
    maghrebi: [
      `كنسمعك مزيان${who} — قولي باش حاس دابا؟`,
      `معاك${who}، هضر على خاطرك — بغيتي نكملو فهاد الموضوع؟`,
    ],
    fusha: [
      `أنا أستمع إليك جيداً${who} — بمَ تشعر الآن؟`,
      `معك دائماً${who}، تحدث كما تشاء — هل تود مواصلة الحديث في هذا الأمر؟`,
    ],
    english: [
      `I'm listening${who} — how are you feeling about it right now?`,
      `Right here with you${who} — want to tell me a bit more about what's on your mind?`,
      `Totally hear you${who} — anything else making today feel that way?`,
    ],
  };

  return {
    id,
    sender: 'noor',
    text: pickNonRepeatingVariant(chatFallback[dialect], previousNoorTexts),
    isFallback: true,
  };
}

const NOOR_AI_DIALECT_LABEL: Record<NoorDialect, string> = {
  egyptian: 'Egyptian Arabic (عامية مصرية)',
  gulf: 'Gulf Arabic (خليجي)',
  levantine: 'Levantine Arabic (شامي)',
  maghrebi: 'Maghrebi Arabic (مغاربي)',
  fusha: 'Modern Standard Arabic (فصحى)',
  english: 'English',
};

export interface NoorAiRequest {
  systemInstruction: string;
  messages: Array<{ role: 'user' | 'model'; text: string }>;
}

/**
 * Builds the request for the optional AI conversation mode. Privacy: only the
 * user's chosen name, dialect and the last few chat turns are sent. Habit logs,
 * feelings and reports never leave the device through this path.
 */
export function buildNoorAiRequest(
  userName: string | undefined,
  dialect: NoorDialect,
  history: Array<{ sender: 'noor' | 'user'; text: string }>,
  userMessage: string
): NoorAiRequest {
  const name = userName?.trim();
  const systemInstruction = [
    'You are Noor (نور), a warm, calm companion inside a habits and feelings tracker app.',
    `Reply in ${NOOR_AI_DIALECT_LABEL[dialect]}, in the same dialect the user writes in.`,
    'Understand what the user actually says and answer it directly first, in 1 to 3 short sentences.',
    'Ask at most one question, and only if it helps. Never blame, shame or pressure the user. Never call them lazy or a failure.',
    'You cannot see their tracker data in this conversation, so never invent numbers, streaks or logs. If asked about their data, say it is in the app screens.',
    'You are not a doctor or therapist. If the user mentions self-harm or being in danger, respond with care and encourage reaching a trusted person or local emergency help.',
    name ? `The user likes to be called ${name}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const turns = history
    .filter((m) => m.text.trim())
    .slice(-8)
    .map((m) => ({
      role: m.sender === 'user' ? ('user' as const) : ('model' as const),
      text: m.text.trim().slice(0, 1000),
    }));
  turns.push({ role: 'user', text: userMessage.trim().slice(0, 1000) });
  // The API needs the first turn to be from the user.
  while (turns.length > 1 && turns[0].role !== 'user') turns.shift();
  return { systemInstruction, messages: turns };
}

export function explainWeeklyRecommendationWithNoor(
  state: AppState,
  lang: Language,
  referenceKey = getTodayKey()
): { text: string; oneStep: string } {
  const dialect = resolveNoorDialect(state, lang);
  const effLang = getEffectiveLang(dialect);
  const report = generateWeeklyReport(state, effLang, 0, referenceKey);
  const deep = report.deepRecommendation;
  const prefix = callUser(state, dialect);

  if (dialect === 'english' || dialect === 'egyptian') {
    return {
      text: sanitizeNoorText(`${prefix}${deep.text} ${deep.explanation}`),
      oneStep: sanitizeNoorText(deep.oneStep),
    };
  }

  const introByDialect: Record<Exclude<NoorDialect, 'english' | 'egyptian'>, string> = {
    gulf: `${prefix}وش رايك في هالملاحظة الحقيقية من أرقامك؟ `,
    levantine: `${prefix}شوف شو بيقولولنا أرقامك هالأسبوع: `,
    maghrebi: `${prefix}شوف شنو كيبينو الأرقام ديالك هاد السيمانة: `,
    fusha: `${prefix}إليك خلاصة التوصية المبنية على أرقامك الحقيقية: `,
  };

  return {
    text: sanitizeNoorText(`${introByDialect[dialect]}${deep.text} ${deep.explanation}`),
    oneStep: sanitizeNoorText(deep.oneStep),
  };
}
