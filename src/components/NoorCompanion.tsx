import { useEffect, useRef, useState } from 'react';
import {
  Check,
  HelpCircle,
  MessageCircle,
  Palette,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import type { AppState, Language, NoorDialect, NoorMode } from '../types/tracker';
import { DICTIONARY } from '../lib/i18n';
import {
  analyzeUserDataForNoor,
  buildNoorReply,
  buildNoorAiRequest,
  sanitizeNoorText,
  getNoorActionCancelledText,
  getNoorActionDoneText,
  getNoorDailyAnswerSavedText,
  getNoorDailyQuestion,
  getNoorDialectChangedMessage,
  getNoorInitialGreeting,
  getNoorPermissionAskText,
  resolveNoorDialect,
  resolveNoorMode,
  shouldShowNoorPermissionPrompt,
  type NoorChatMessage,
  type NoorProposal,
} from '../lib/noor';
import { getTodayKey } from '../lib/storage';
import { authJsonHeaders } from '../lib/firebase';

interface NoorCompanionProps {
  state: AppState;
  lang: Language;
  externalPromptRequest?: { id: number; query?: string; openMode?: NoorMode } | null;
  onDismissDailyPrompt: (todayKey: string) => void;
  onMarkPromptAccepted: (todayKey: string) => void;
  onAnswerDailyQuestion: (question: string, answer: string, todayKey: string) => void;
  onSkipDailyQuestion: (todayKey: string) => void;
  onApplyProposal: (proposal: NoorProposal) => void;
  onChangeDialect: (dialect: NoorDialect) => void;
  onChangeMode: (mode: NoorMode) => void;
  onDeclineLoggingToday: (todayKey: string) => void;
  onStartTenMinTimer: () => void;
  onStartTour: () => void;
}

function NoorMiniFace({ size = 28, accent = '#00B8A9' }: { size?: number; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#1A1A1A" stroke={accent} strokeWidth="2.2" />
      <circle cx="15" cy="18" r="2.1" fill={accent} />
      <circle cx="25" cy="18" r="2.1" fill={accent} />
      <path
        d="M 14.5 24 Q 20 28.5 25.5 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function NoorCompanion({
  state,
  lang,
  externalPromptRequest,
  onDismissDailyPrompt,
  onMarkPromptAccepted,
  onAnswerDailyQuestion,
  onSkipDailyQuestion,
  onApplyProposal,
  onChangeDialect,
  onChangeMode,
  onDeclineLoggingToday,
  onStartTenMinTimer,
  onStartTour,
}: NoorCompanionProps) {
  const t = DICTIONARY[lang];
  const todayKey = getTodayKey();
  const accent = state.accentColor || '#00B8A9';
  const isQuiet = state.noorPreference === 'quiet';
  const activeDialect = resolveNoorDialect(state, lang);
  const stateMode = resolveNoorMode(state);

  const [chatOpen, setChatOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<NoorMode>(() =>
    stateMode === 'quiet' ? 'chat' : stateMode
  );
  const [messages, setMessages] = useState<NoorChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  // Optional model-backed replies. Off by default and only turned on after an explicit
  // consent prompt. Free Gemini terms allow human review of inputs, so the prompt says not to
  // write names or private details. The server route also requires Google sign-in.
  const aiExperiment = false;
  const [aiEnabled, setAiEnabled] = useState<boolean>(() => {
    if (!aiExperiment) return false;
    try {
      return window.localStorage.getItem('noor_ai_enabled') === '1';
    } catch {
      return false;
    }
  });
  const [aiConsentOpen, setAiConsentOpen] = useState(false);
  const aiConsentText =
    lang === 'ar'
      ? 'تشغيل الذكاء الاصطناعي: الرسائل اللي نور ما فهمتهاش بتتبعت لخدمة Gemini المجانية من جوجل (الاسم واللهجة وآخر رسائل الشات بس). جوجل ممكن يراجعها بشر. ما تكتبش أسماء أو تفاصيل خاصة. محتاج تسجيل دخول بجوجل. موافق؟'
      : 'Turn on AI: messages Noor does not understand are sent to the free Google Gemini service (your name, dialect and the last chat turns only). Humans at Google may review them. Do not write names or private details. Google sign-in is required. Continue?';
  const toggleAi = () => {
    if (!aiEnabled) {
      setAiConsentOpen(true);
      return;
    }
    setAiEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('noor_ai_enabled', next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };
  const endRef = useRef<HTMLDivElement>(null);
  const handledExternalIdRef = useRef<number | null>(null);
  const prevDialectRef = useRef<NoorDialect>(activeDialect);
  const prevUserRef = useRef<string>(state.userName);

  const showPermissionPrompt =
    !chatOpen && shouldShowNoorPermissionPrompt(state, todayKey);
  const dailyQuestion =
    activeMode === 'help' ? getNoorDailyQuestion(state, lang, todayKey) : null;
  const permissionAskText = getNoorPermissionAskText(activeDialect);

  // Seed friendly opening greeting when user opens Noor Chat
  const openChatWithInitialInsight = (modeOverride?: NoorMode) => {
    const targetMode =
      modeOverride ?? (stateMode === 'quiet' ? 'chat' : stateMode);
    if (modeOverride && modeOverride !== activeMode) {
      setActiveMode(targetMode);
      onChangeMode(targetMode);
    }
    if (messages.length === 0) {
      setMessages([getNoorInitialGreeting(state, lang, targetMode, todayKey)]);
    }
    setChatOpen(true);
  };

  useEffect(() => {
    if (chatOpen) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatOpen]);

  // Reset chat only when switching to a different account/username
  useEffect(() => {
    if (prevUserRef.current !== state.userName) {
      prevUserRef.current = state.userName;
      setMessages([]);
    }
  }, [state.userName]);

  // When dialect changes via Settings while conversation exists, switch immediately in the same chat
  useEffect(() => {
    if (prevDialectRef.current === activeDialect) return;
    prevDialectRef.current = activeDialect;
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last?.switchedDialect === activeDialect) return prev;
      return [
        ...prev,
        {
          id: `dialect_switch_${Date.now()}`,
          sender: 'noor',
          text: getNoorDialectChangedMessage(activeDialect, state.userName),
          switchedDialect: activeDialect,
        },
      ];
    });
  }, [activeDialect, state.userName]);

  // Open chat & answer immediately when triggered from Weekly Report or Home
  useEffect(() => {
    if (!externalPromptRequest) return;
    if (handledExternalIdRef.current === externalPromptRequest.id) return;
    handledExternalIdRef.current = externalPromptRequest.id;

    const requestedMode = externalPromptRequest.openMode;
    const query = externalPromptRequest.query?.trim() ?? '';

    if (requestedMode && !query) {
      const targetMode = requestedMode === 'quiet' ? 'chat' : requestedMode;
      setActiveMode(targetMode);
      onChangeMode(targetMode);
      setChatOpen(true);
      setMessages((prev) =>
        prev.length === 0
          ? [getNoorInitialGreeting(state, lang, targetMode, todayKey)]
          : prev
      );
      return;
    }

    if (!query) return;
    const userMsg: NoorChatMessage = {
      id: `usr_${externalPromptRequest.id}`,
      sender: 'user',
      text: query,
    };
    const prevNoorTexts = messages
      .filter((m) => m.sender === 'noor')
      .map((m) => m.text);
    const reply = buildNoorReply(state, query, lang, {
      mode: requestedMode ?? activeMode,
      previousNoorTexts: prevNoorTexts,
      referenceKey: todayKey,
    });
    if (reply.switchedDialect && reply.switchedDialect !== activeDialect) {
      prevDialectRef.current = reply.switchedDialect;
      onChangeDialect(reply.switchedDialect);
    }
    if (reply.switchedMode) {
      setActiveMode(reply.switchedMode);
      onChangeMode(reply.switchedMode);
    }
    setChatOpen(true);
    setMessages((prev) => [...prev, userMsg, reply]);
  }, [
    externalPromptRequest,
    state,
    lang,
    todayKey,
    activeDialect,
    activeMode,
    messages,
    onChangeDialect,
    onChangeMode,
  ]);

  const handleSend = (textOverride?: string) => {
    const query = (textOverride ?? input).trim();
    if (!query) return;

    const userMsg: NoorChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: query,
    };
    const prevNoorTexts = messages
      .filter((m) => m.sender === 'noor')
      .map((m) => m.text);
    const reply = buildNoorReply(state, query, lang, {
      mode: activeMode,
      previousNoorTexts: prevNoorTexts,
      referenceKey: todayKey,
    });
    if (reply.switchedDialect && reply.switchedDialect !== activeDialect) {
      prevDialectRef.current = reply.switchedDialect;
      onChangeDialect(reply.switchedDialect);
    }
    if (reply.switchedMode) {
      setActiveMode(reply.switchedMode);
      onChangeMode(reply.switchedMode);
    }
    if (reply.declinedLogToday) {
      onDeclineLoggingToday(todayKey);
    }
    if (reply.triggerTenMinTimer) {
      onStartTenMinTimer();
    }
    setMessages((prev) => [...prev, userMsg, reply]);
    if (!textOverride) setInput('');

    // Optional AI conversation: only when no built-in rule understood the message.
    if (aiExperiment && aiEnabled && reply.isFallback) {
      const aiReq = buildNoorAiRequest(state.userName, activeDialect, messages, query);
      authJsonHeaders()
        .then(async (headers) => {
          const call = (model?: string) =>
            fetch('/api/gemini/chat', {
              method: 'POST',
              headers,
              body: JSON.stringify({ ...aiReq, grounding: 'none', ...(model ? { model } : {}) }),
            });
          const first = await call();
          if (first.status === 503 || first.status === 404) {
            // One bounded retry on the lighter model when the default one is unavailable.
            return call('gemini-3.1-flash-lite');
          }
          return first;
        })
        .then(async (res) => {
          if (!res.ok) throw new Error('ai_http_' + res.status);
          const data = (await res.json()) as { text?: string };
          const aiText = sanitizeNoorText(data.text ?? '');
          if (!aiText) throw new Error('ai_empty');
          setMessages((prev) =>
            prev.map((m) => (m.id === reply.id ? { ...m, text: aiText, isFallback: false } : m))
          );
        })
        .catch((err: unknown) => {
          // Keep the built-in reply if the AI is unavailable, and say so (no message content).
          const code = err instanceof Error ? err.message : 'ai_error';
          const note =
            lang === 'ar'
              ? `(الذكاء الاصطناعي مش متاح دلوقتي: ${code}. ده رد نور العادي.)`
              : `(AI is unavailable right now: ${code}. This is Noor's built-in reply.)`;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === reply.id && !m.text.includes(note)
                ? { ...m, text: `${m.text}\n${note}` }
                : m
            )
          );
        });
    }
  };

  const handleConfirmProposal = (msgId: string, proposal: NoorProposal) => {
    onApplyProposal(proposal);
    setMessages((prev) => [
      ...prev.map((m) =>
        m.id === msgId ? { ...m, proposalStatus: 'confirmed' as const } : m
      ),
      {
        id: `done_${Date.now()}`,
        sender: 'noor',
        text: getNoorActionDoneText(activeDialect),
      },
    ]);
  };

  const handleCancelProposal = (msgId: string) => {
    setMessages((prev) => [
      ...prev.map((m) =>
        m.id === msgId ? { ...m, proposalStatus: 'cancelled' as const } : m
      ),
      {
        id: `cancel_${Date.now()}`,
        sender: 'noor',
        text: getNoorActionCancelledText(activeDialect),
      },
    ]);
  };

  return (
    <>
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex flex-col items-end gap-2.5 no-print">

        <button
          type="button"
          data-tour-target="noor-bubble"
          onClick={() => {
            if (chatOpen) {
              setChatOpen(false);
            } else {
              if (showPermissionPrompt) onMarkPromptAccepted(todayKey);
              openChatWithInitialInsight();
            }
          }}
          aria-label={t.noorBubbleAria}
          className="relative flex items-center justify-center rounded-full bg-[#1A1A1A] border-2 shadow-xl transition hover:scale-105 active:scale-95"
          style={{
            width: isQuiet ? 42 : 54,
            height: isQuiet ? 42 : 54,
            borderColor: accent,
          }}
        >
          {showPermissionPrompt && !chatOpen && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#1A1A1A]"
              style={{ backgroundColor: accent }}
            />
          )}
          {isQuiet ? (
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden="true"
            />
          ) : (
            <NoorMiniFace size={34} accent={accent} />
          )}
        </button>
      </div>

      {chatOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.noorChatTitle}
          className="fixed bottom-20 right-4 md:bottom-24 md:right-6 z-50 w-[calc(100vw-2rem)] max-w-[390px] max-h-[74vh] flex flex-col bg-[#1A1A1A] border-2 rounded-[22px] shadow-2xl overflow-hidden no-print"
          style={{ borderColor: accent }}
        >
          <div className="px-4 py-3 bg-[#0F0F0F] border-b border-[#2A2A2A] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <NoorMiniFace size={32} accent={accent} />
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-white truncate">
                    {t.noorChatTitle}
                  </div>
                  <div className="text-[10px] text-[#A1A1AA] truncate">
                    {isQuiet
                      ? t.noorChatSubtitleQuiet
                      : activeMode === 'chat'
                      ? t.noorChatSubtitleChat
                      : t.noorChatSubtitleTalk}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label={t.close}
                className="w-8 h-8 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[#A1A1AA] hover:text-white shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            {aiExperiment && (
            <button
              type="button"
              data-noor-ai-toggle
              onClick={toggleAi}
              aria-pressed={aiEnabled}
              className="w-full text-[10px] font-bold py-1.5 px-3 rounded-full border border-[#2A2A2A] text-[#A1A1AA] hover:text-white text-start"
            >
              {aiEnabled
                ? 'الذكاء الاصطناعي: شغال. رسائلك اللي نور ما فهمتهاش بتتبعت لـ Gemini (الاسم واللهجة وآخر رسائل الشات بس). اضغط للإيقاف'
                : 'الذكاء الاصطناعي: متوقف. اضغط لتشغيله ليفهم نور كلامك أحسن (رسائل الشات هتتبعت لـ Gemini)'}
            </button>
            )}
            {aiExperiment && aiConsentOpen && !aiEnabled && (
              <div
                data-noor-ai-consent
                className="w-full rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] p-3 text-[11px] text-[#D4D4D8] leading-relaxed"
              >
                <p>{aiConsentText}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    data-noor-ai-consent-yes
                    onClick={() => {
                      setAiEnabled(true);
                      setAiConsentOpen(false);
                      try {
                        window.localStorage.setItem('noor_ai_enabled', '1');
                      } catch {
                        // ignore storage errors
                      }
                    }}
                    className="px-3 py-1.5 rounded-full text-[11px] font-extrabold"
                    style={{ backgroundColor: accent, color: '#0F0F0F' }}
                  >
                    {lang === 'ar' ? 'موافق، شغّله' : 'I agree, turn on'}
                  </button>
                  <button
                    type="button"
                    data-noor-ai-consent-no
                    onClick={() => setAiConsentOpen(false)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-bold border border-[#2A2A2A] text-[#A1A1AA]"
                  >
                    {lang === 'ar' ? 'لا' : 'No'}
                  </button>
                </div>
              </div>
            )}

            {/* Mode Switcher: Chat Mode / Help Mode */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A]">
              <button
                type="button"
                data-noor-mode="chat"
                onClick={() => {
                  setActiveMode('chat');
                  onChangeMode('chat');
                }}
                className="py-1.5 rounded-full text-[11px] font-extrabold flex items-center justify-center gap-1 transition"
                style={{
                  backgroundColor: activeMode === 'chat' ? accent : 'transparent',
                  color: activeMode === 'chat' ? '#0F0F0F' : '#A1A1AA',
                }}
              >
                <MessageCircle size={12} />
                <span>{t.noorModeChat}</span>
              </button>
              <button
                type="button"
                data-noor-mode="help"
                onClick={() => {
                  setActiveMode('help');
                  onChangeMode('help');
                }}
                className="py-1.5 rounded-full text-[11px] font-extrabold flex items-center justify-center gap-1 transition"
                style={{
                  backgroundColor: activeMode === 'help' ? accent : 'transparent',
                  color: activeMode === 'help' ? '#0F0F0F' : '#A1A1AA',
                }}
              >
                <HelpCircle size={12} />
                <span>{t.noorModeHelp}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {dailyQuestion && (
              <div className="p-3 rounded-2xl bg-[#0F0F0F] border border-[#A855F7]/50 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-[#A855F7] flex items-center gap-1">
                    <Sparkles size={12} />
                    {t.noorDailyQuestionTitle}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSkipDailyQuestion(todayKey)}
                    className="text-[11px] font-bold text-[#A1A1AA] hover:text-white"
                  >
                    {t.noorSkipBtn}
                  </button>
                </div>
                <p className="text-xs font-bold text-white">{dailyQuestion}</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!questionInput.trim()) return;
                    onAnswerDailyQuestion(dailyQuestion, questionInput.trim(), todayKey);
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: `qans_${Date.now()}`,
                        sender: 'noor',
                        text: getNoorDailyAnswerSavedText(activeDialect),
                      },
                    ]);
                    setQuestionInput('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    placeholder={t.noorDailyQuestionPlaceholder}
                    className="flex-1 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] px-2.5 py-1.5 text-xs text-white placeholder-[#71717A] focus:outline-none focus:border-[#A855F7]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-xl bg-[#A855F7] text-[#0F0F0F] text-xs font-extrabold shrink-0"
                  >
                    {t.noorSaveAnswerBtn}
                  </button>
                </form>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                } space-y-1.5`}
              >
                <div
                  className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs md:text-[13px] leading-relaxed font-semibold"
                  style={
                    msg.sender === 'user'
                      ? { backgroundColor: accent, color: '#0F0F0F' }
                      : {
                          backgroundColor: '#0F0F0F',
                          color: '#FFFFFF',
                          border: '1px solid #2A2A2A',
                        }
                  }
                >
                  {msg.text}
                </div>

                {msg.oneStep && (
                  <div
                    className="max-w-[88%] rounded-xl px-3 py-2 text-[11px] font-bold bg-[#0F0F0F] border"
                    style={{ borderColor: `${accent}66`, color: accent }}
                  >
                    {msg.oneStep}
                  </div>
                )}

                {msg.showTourButton && (
                  <button
                    type="button"
                    data-testid="noor-show-me-btn"
                    onClick={() => {
                      setChatOpen(false);
                      onStartTour();
                    }}
                    className="px-4 py-2 rounded-full text-[#0F0F0F] text-xs font-extrabold inline-flex items-center gap-1.5 min-h-[36px]"
                    style={{ backgroundColor: accent }}
                  >
                    <Sparkles size={13} />
                    <span>{t.noorShowMeBtn}</span>
                  </button>
                )}

                {msg.proposal && (
                  <div className="w-[92%] rounded-2xl bg-[#0F0F0F] border border-[#FF6B35]/60 p-3 space-y-2.5">
                    <div className="text-xs font-extrabold text-white">
                      {msg.proposal.summary}
                    </div>
                    <div className="text-[11px] font-bold text-[#FF6B35]">
                      {t.noorConfirmAsk}
                    </div>

                    {msg.proposalStatus === 'pending' ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleConfirmProposal(msg.id, msg.proposal!)}
                          className="flex-1 py-2 rounded-full text-[#0F0F0F] text-xs font-extrabold flex items-center justify-center gap-1 min-h-[36px]"
                          style={{ backgroundColor: accent }}
                        >
                          <Check size={13} />
                          <span>{t.noorConfirmDoIt}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelProposal(msg.id)}
                          className="flex-1 py-2 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#A1A1AA] hover:text-white text-xs font-bold min-h-[36px]"
                        >
                          {t.noorConfirmCancel}
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] font-bold text-[#A1A1AA]">
                        {msg.proposalStatus === 'confirmed'
                          ? t.noorActionDone
                          : t.noorActionCancelled}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="px-3 py-2 bg-[#0F0F0F] border-t border-[#2A2A2A] space-y-2">
            {activeMode === 'chat' ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSend(t.noorQuickChatHi)}
                  className="px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-[11px] font-bold text-white inline-flex items-center gap-1"
                >
                  <MessageCircle size={11} className="text-[#00B8A9]" />
                  <span>{t.noorQuickChatHi}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSend(t.noorQuickChatBored)}
                  className="px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-[11px] font-bold text-white inline-flex items-center gap-1"
                >
                  <Sparkles size={11} className="text-[#FF6B35]" />
                  <span>{t.noorQuickChatBored}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSend(t.noorQuickChatTellMe)}
                  className="px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-[11px] font-bold text-white inline-flex items-center gap-1"
                >
                  <Sparkles size={11} className="text-[#A855F7]" />
                  <span>{t.noorQuickChatTellMe}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSend(t.noorQuickHelpMe)}
                  className="px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-[11px] font-bold text-white inline-flex items-center gap-1"
                >
                  <HelpCircle size={11} className="text-[#00B8A9]" />
                  <span>{t.noorQuickHelpMe}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSend(t.noorQuickImLost)}
                  className="px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-[11px] font-bold text-white inline-flex items-center gap-1"
                >
                  <HelpCircle size={11} className="text-[#FF6B35]" />
                  <span>{t.noorQuickImLost}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSend(t.noorQuickExplainRec)}
                  className="px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-[11px] font-bold text-white inline-flex items-center gap-1"
                >
                  <Sparkles size={11} className="text-[#FF6B35]" />
                  <span>{t.noorQuickExplainRec}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSend(t.noorQuickExplain)}
                  className="px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-[11px] font-bold text-white inline-flex items-center gap-1"
                >
                  <Sparkles size={11} style={{ color: accent }} />
                  <span>{t.noorQuickExplain}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSend(t.noorQuickAddAction)}
                  className="px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-[11px] font-bold text-white inline-flex items-center gap-1"
                >
                  <Plus size={11} className="text-[#00B8A9]" />
                  <span>{t.noorQuickAddAction}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSend(t.noorQuickEditAction)}
                  className="px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-[11px] font-bold text-white inline-flex items-center gap-1"
                >
                  <Settings2 size={11} className="text-[#FF6B35]" />
                  <span>{t.noorQuickEditAction}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSend(t.noorQuickColors)}
                  className="px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-[11px] font-bold text-white inline-flex items-center gap-1"
                >
                  <Palette size={11} className="text-[#A855F7]" />
                  <span>{t.noorQuickColors}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSend(t.noorQuickFeature)}
                  className="px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-[11px] font-bold text-white inline-flex items-center gap-1"
                >
                  <Wand2 size={11} className="text-[#00B8A9]" />
                  <span>{t.noorQuickFeature}</span>
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t.noorInputPlaceholder}
                aria-label={t.noorInputPlaceholder}
                className="flex-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] px-3.5 py-2 text-xs text-white placeholder-[#71717A] focus:outline-none focus:border-[#00B8A9]"
              />
              <button
                type="submit"
                aria-label={t.noorSendBtn}
                className="w-9 h-9 rounded-full flex items-center justify-center text-[#0F0F0F] shrink-0"
                style={{ backgroundColor: accent }}
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
