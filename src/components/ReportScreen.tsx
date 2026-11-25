import { useMemo, useState } from 'react';
import { FileDown, FileText, ImageDown, Lightbulb, MessageCircle, Plus, Sparkles } from 'lucide-react';
import type { AppState, Language } from '../types/tracker';
import { DICTIONARY } from '../lib/i18n';
import {
  getActionMetrics,
  getBalanceData,
  getEnabledActions,
} from '../lib/analytics';
import { generateWeeklyReport } from '../lib/report';
import { exportWeeklyStoryImage } from '../lib/export';
import { formatWeekRange } from '../lib/storage';

interface ReportScreenProps {
  state: AppState;
  lang: Language;
  onAskNoorExplain?: (query: string) => void;
  onLogDay?: () => void;
}

export function ReportScreen({
  state,
  lang,
  onAskNoorExplain,
  onLogDay,
}: ReportScreenProps) {
  const t = DICTIONARY[lang];
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [toast, setToast] = useState(false);
  const loggedDaysCount = Object.keys(state.logs).length;

  const report = useMemo(() => {
    void refreshSeed;
    return generateWeeklyReport(state, lang, 0);
  }, [state, lang, refreshSeed]);

  const balanceScore = useMemo(() => {
    const enabled = getEnabledActions(state.actions);
    const metrics = enabled.map((a) => getActionMetrics(a, state.logs, 0, lang));
    return getBalanceData(metrics, lang).balanceScore;
  }, [state.actions, state.logs, lang]);

  const handleGenerate = () => {
    setRefreshSeed((n) => n + 1);
    setToast(true);
    setTimeout(() => setToast(false), 2200);
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  const handleExportStory = () => {
    exportWeeklyStoryImage(report, lang, report.isPartialWeek ? -1 : balanceScore);
  };

  if (loggedDaysCount < 3) {
    return (
      <div className="min-h-[62vh] flex items-center justify-center no-print">
        <div
          data-testid="empty-report-card"
          className="w-full max-w-[540px] bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-7 md:p-8 text-center space-y-5"
        >
          <div className="mx-auto w-14 h-14 rounded-full bg-[#A855F7]/15 border border-[#A855F7]/40 flex items-center justify-center">
            <FileText size={24} className="text-[#A855F7]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl md:text-2xl font-extrabold text-white text-balance">
              {t.emptyReportTitle}
            </h1>
            <p className="text-sm md:text-base text-[#E4E4E7] leading-relaxed">
              {t.emptyReportText}
            </p>
          </div>

          <div className="space-y-2 max-w-[300px] mx-auto">
            <div className="h-2.5 w-full rounded-full bg-[#0F0F0F] overflow-hidden border border-[#2A2A2A]">
              <div
                className="h-full rounded-full bg-[#00B8A9] transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round((loggedDaysCount / 3) * 100))}%` }}
              />
            </div>
            <div className="text-xs font-bold text-[#A1A1AA] tabular-nums">
              {t.emptyReportProgress(loggedDaysCount)}
            </div>
          </div>

          {onLogDay && (
            <button
              type="button"
              onClick={onLogDay}
              className="px-7 py-3.5 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm inline-flex items-center gap-2 min-h-[48px]"
            >
              <Plus size={18} />
              <span>{t.logTodayBtn}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-5 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white">
              {t.reportTitle}
            </h1>
            <p className="text-sm text-[#A1A1AA] mt-0.5">
              {formatWeekRange(report.weekDates, lang)}
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            className="px-5 py-3 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-xs md:text-sm flex items-center gap-2 active:scale-[0.98] transition whitespace-nowrap min-h-[44px]"
          >
            <Sparkles size={16} />
            <span>{t.generateReportBtn}</span>
          </button>
        </div>

        {toast && (
          <div className="px-4 py-2.5 rounded-2xl bg-[#1A1A1A] border border-[#00B8A9] text-xs font-bold text-[#00B8A9]">
            {t.reportRefreshed}
          </div>
        )}

        <section className="bg-[#1A1A1A] border-2 border-[#A855F7] rounded-[20px] p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-white">{t.weekSummaryTitle}</h2>
            {!report.isPartialWeek && (
              <span className="text-xs font-extrabold text-[#A855F7] tabular-nums">
                {balanceScore}% {t.balancedWord}
              </span>
            )}
          </div>

          <p className="text-sm md:text-base font-bold text-white leading-relaxed">
            {report.summaryText}
          </p>

          {report.numbersRows.length > 0 && (
            <>
              <div className="pt-2 space-y-2">
                <div className="text-xs font-extrabold text-[#A1A1AA]">
                  {t.yourNumbersTitle}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {report.numbersRows.map((row) => (
                    <div
                      key={row.actionId}
                      className="p-3 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A]"
                    >
                      <div className="text-xs font-bold" style={{ color: row.color }}>
                        {row.name}
                      </div>
                      <div className="text-lg font-extrabold text-white tabular-nums mt-0.5">
                        {row.total}{' '}
                        <span className="text-xs font-normal text-[#A1A1AA]">
                          {row.unit}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#A1A1AA] tabular-nums">
                        {row.times} {t.timesWord} • {row.activeDays}/7 {t.daysUnit}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-1 space-y-2">
                <div className="text-xs font-extrabold text-[#A1A1AA]">
                  {t.yourComparisonsTitle}
                </div>
                <div className="space-y-2">
                  {report.comparisonRows.map((c) => (
                    <div
                      key={c.actionId}
                      className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] text-xs"
                    >
                      <span className="font-extrabold" style={{ color: c.color }}>
                        {c.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-3 text-[#A1A1AA] tabular-nums">
                        <span>
                          {t.vsLastTime}:{' '}
                          <strong className="text-white">{c.lastTime ?? '—'}</strong>
                        </span>
                        <span>
                          {t.vsAverage}: <strong className="text-white">{c.avg14}</strong>
                        </span>
                        <span>
                          {t.vsFirstTime}: <strong className="text-white">{c.first3Avg}</strong>
                        </span>
                        <span
                          className="font-extrabold"
                          style={{
                            color:
                              (c.vsLastWeekPct ?? 0) >= 0 ? '#00B8A9' : '#FF6B35',
                          }}
                        >
                          {c.vsLastWeekPct !== null
                            ? `${c.vsLastWeekPct >= 0 ? '+' : ''}${c.vsLastWeekPct}%`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        <section className="bg-[#1A1A1A] border-2 border-[#00B8A9] rounded-[20px] p-5 md:p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Lightbulb size={20} className="text-[#00B8A9]" />
            <h2 className="text-lg font-extrabold text-white">{t.keyInsightsTitle}</h2>
          </div>

          <ul className="space-y-3">
            {report.keyInsights.map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm text-white leading-relaxed">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00B8A9] shrink-0 mt-1.5" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-[#1A1A1A] border-2 border-[#FF6B35] rounded-[20px] p-5 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-white">{t.recommendationsTitle}</h2>
            {onAskNoorExplain && (
              <button
                type="button"
                onClick={() => onAskNoorExplain(t.noorQuickExplainRec)}
                className="px-3.5 py-2 rounded-full bg-[#00B8A9]/15 border border-[#00B8A9] text-[#00B8A9] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap min-h-[38px]"
              >
                <MessageCircle size={14} />
                <span>{t.askNoorExplainRecBtn}</span>
              </button>
            )}
          </div>

          <div className="space-y-3">
            {report.recommendations.map((rec, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-extrabold w-fit shrink-0"
                    style={{
                      backgroundColor: `${rec.color}22`,
                      color: rec.color,
                      border: `1px solid ${rec.color}`,
                    }}
                  >
                    {rec.pillLabel}
                  </span>
                  <span className="text-sm md:text-base font-extrabold text-white leading-relaxed">
                    {rec.text}
                  </span>
                </div>
                {report.deepRecommendation.explanation !== rec.text && (
                  <p className="text-xs text-[#A1A1AA] leading-relaxed">
                    {report.deepRecommendation.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="w-full py-4 px-5 rounded-full bg-transparent border-2 border-[#A855F7] text-[#A855F7] hover:bg-[#A855F7]/10 font-extrabold text-sm flex items-center justify-center gap-2 transition min-h-[48px]"
          >
            <FileDown size={18} />
            <span>{t.downloadPdfBtn}</span>
          </button>

          <button
            type="button"
            onClick={handleExportStory}
            className="w-full py-4 px-5 rounded-full bg-transparent border-2 border-[#00B8A9] text-[#00B8A9] hover:bg-[#00B8A9]/10 font-extrabold text-sm flex items-center justify-center gap-2 transition min-h-[48px]"
          >
            <ImageDown size={18} />
            <span>{t.exportStoryBtn}</span>
          </button>
        </div>
      </div>

      <div className="hidden print-only space-y-6 text-black">
        <div className="border-b-2 border-black pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">{t.appName}</h1>
            <p className="text-sm">{t.reportTitle} — {formatWeekRange(report.weekDates, lang)}</p>
          </div>
          <div className="text-sm font-bold tabular-nums">
            {!report.isPartialWeek && <>{t.balancedWord}: {balanceScore}% | </>}{t.energy}: {report.energyAvg}/10
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-extrabold">{t.weekSummaryTitle}</h2>
          <p className="text-sm leading-relaxed">{report.summaryText}</p>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-extrabold">{t.yourNumbersTitle}</h2>
          <ul className="space-y-1 text-sm tabular-nums">
            {report.numbersRows.map((r) => (
              <li key={r.actionId}>
                <strong>{r.name}:</strong> {r.total} {r.unit} ({r.times} {t.timesWord},{' '}
                {r.activeDays}/7 {t.daysUnit})
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-extrabold">{t.keyInsightsTitle}</h2>
          <ul className="list-disc ps-5 space-y-1 text-sm">
            {report.keyInsights.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-extrabold">{t.recommendationsTitle}</h2>
          <ul className="space-y-1 text-sm">
            {report.recommendations.map((rec, i) => (
              <li key={i}>
                <strong>[{rec.pillLabel}]</strong> {rec.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
