import type { AppState, Language } from '../types/tracker';
import type { WeeklyReportData } from './report';
import { formatWeekRange, getInitialState } from './storage';

export function exportStateAsJson(state: AppState): void {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `mirror-ledger-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseImportedJson(raw: string): AppState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.actions) || typeof parsed.logs !== 'object' || parsed.logs === null) {
      return null;
    }
    const base = getInitialState();
    return {
      ...base,
      ...parsed,
      onboarded: true,
      language: parsed.language === 'en' ? 'en' : 'ar',
    };
  } catch {
    return null;
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

/**
 * Generates a 1080x1080 square Story PNG completely offline via HTML5 Canvas
 */
export function exportWeeklyStoryImage(
  report: WeeklyReportData,
  lang: Language,
  balanceScore: number
): void {
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const isAr = lang === 'ar';
  ctx.direction = isAr ? 'rtl' : 'ltr';

  ctx.fillStyle = '#0F0F0F';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#00B8A9';
  ctx.beginPath();
  ctx.arc(isAr ? 960 : 120, 100, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FF6B35';
  ctx.beginPath();
  ctx.arc(isAr ? 912 : 168, 100, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 40px Cairo, sans-serif';
  ctx.textAlign = isAr ? 'right' : 'left';
  ctx.fillText(isAr ? 'مراية + دفتر' : 'Mirror + Ledger', isAr ? 875 : 205, 114);

  ctx.fillStyle = '#A1A1AA';
  ctx.font = '600 28px Cairo, sans-serif';
  ctx.fillText(formatWeekRange(report.weekDates, lang), isAr ? 980 : 100, 178);

  ctx.fillStyle = '#1A1A1A';
  drawRoundedRect(ctx, 80, 220, 920, 390, 28);
  ctx.fill();
  ctx.strokeStyle = '#2A2A2A';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px Cairo, sans-serif';
  ctx.fillText(
    isAr ? 'أرقامي الأسبوع ده' : 'My Numbers This Week',
    isAr ? 955 : 125,
    280
  );

  const topRows = report.numbersRows.slice(0, 3);
  topRows.forEach((row, i) => {
    const comp = report.comparisonRows[i];
    const rowY = 350 + i * 85;
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(isAr ? 950 : 130, rowY - 10, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px Cairo, sans-serif';
    ctx.textAlign = isAr ? 'right' : 'left';
    ctx.fillText(`${row.name}: ${row.total} ${row.unit}`, isAr ? 920 : 160, rowY);

    const dayWord = isAr ? 'يوم' : row.activeDays === 1 ? 'day' : 'days';
    const compLabel =
      row.activeDays > 0
        ? isAr
          ? `${row.activeDays} ${dayWord} متسجل · متوسط اليوم ${row.avgPerLoggedDay} (آخر 14 يوم متسجل: ${comp?.avg14 ?? 0})`
          : `${row.activeDays} ${dayWord} logged · ${row.avgPerLoggedDay}/day (last 14 logged days: ${comp?.avg14 ?? 0})`
        : isAr
        ? 'لسه متسجلش'
        : 'not logged yet';

    ctx.fillStyle = '#A1A1AA';
    ctx.font = '600 22px Cairo, sans-serif';
    ctx.textAlign = isAr ? 'right' : 'left';
    ctx.fillText(compLabel, isAr ? 920 : 160, rowY + 36);
  });

  ctx.fillStyle = '#71717A';
  ctx.font = '600 20px Cairo, sans-serif';
  ctx.textAlign = isAr ? 'right' : 'left';
  ctx.fillText(
    isAr ? 'متوسط آخر 14 يوم متسجل بيشمل أيام الأسبوع ده (مش فترة قبله)' : 'The 14-logged-day average includes this week (not a separate earlier period)',
    isAr ? 955 : 125,
    590
  );

  ctx.fillStyle = '#1A1A1A';
  drawRoundedRect(ctx, 80, 640, 440, 175, 28);
  ctx.fill();
  ctx.strokeStyle = '#00B8A9';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#A1A1AA';
  ctx.font = '600 26px Cairo, sans-serif';
  ctx.fillText(isAr ? 'توازن الأسبوع' : 'Weekly Balance', 300, 705);
  const balanceText = balanceScore < 0 ? (isAr ? 'لسه بدري' : 'Too early') : `${balanceScore}%`;
  ctx.fillStyle = '#00B8A9';
  ctx.font = 'bold 54px Cairo, sans-serif';
  ctx.fillText(balanceText, 300, 775);

  ctx.fillStyle = '#1A1A1A';
  drawRoundedRect(ctx, 560, 640, 440, 175, 28);
  ctx.fill();
  ctx.strokeStyle = '#A855F7';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#A1A1AA';
  ctx.font = '600 26px Cairo, sans-serif';
  ctx.fillText(isAr ? 'متوسط الطاقة' : 'Avg Energy', 780, 705);
  ctx.fillStyle = '#A855F7';
  ctx.font = 'bold 54px Cairo, sans-serif';
  ctx.fillText(`${report.energyAvg}/10`, 780, 775);

  ctx.fillStyle = '#1A1A1A';
  drawRoundedRect(ctx, 80, 845, 920, 150, 28);
  ctx.fill();
  ctx.strokeStyle = '#FF6B35';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.textAlign = isAr ? 'right' : 'left';
  ctx.fillStyle = '#FF6B35';
  ctx.font = 'bold 26px Cairo, sans-serif';
  ctx.fillText(isAr ? 'الخطوة الجاية' : 'ONE Next Step', isAr ? 955 : 125, 900);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 27px Cairo, sans-serif';
  ctx.fillText(report.oneNextStep.slice(0, 62), isAr ? 955 : 125, 952);

  const link = document.createElement('a');
  link.download = `mirror-ledger-story-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
