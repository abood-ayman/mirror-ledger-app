import { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Globe,
  Lock,
  MapPin,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Send,
  Sparkles,
  Square,
  Volume2,
  Zap,
} from 'lucide-react';
import type { Language, NoorDialect } from '../types/tracker';
import {
  float32ToInt16PcmBase64,
  int16PcmBase64ToFloat32,
  type GroundingSource,
} from '../lib/studioHelpers';
import { authJsonHeaders } from '../lib/firebase';

const GEMINI_FEATURES_ENABLED = false;

interface ChatMessageItem {
  id: string;
  role: 'user' | 'model';
  text: string;
  sources?: GroundingSource[];
  modelUsed?: string;
}

interface GeminiStudioPanelProps {
  lang: Language;
  dialect: NoorDialect;
  userName?: string;
  prefillPrompt?: {
    id: number;
    text: string;
    grounding?: 'none' | 'search' | 'maps';
    latLng?: { latitude: number; longitude: number } | null;
  } | null;
}

const DIALECT_INSTRUCTION_HINTS: Record<NoorDialect, string> = {
  egyptian: 'Speak strictly in warm Egyptian Arabic ("ازيك", "عامل ايه", "يلا", "عشان"). Never mix Gulf or Levantine words.',
  gulf: 'Speak strictly in warm Gulf Arabic ("هلا", "وش اخبارك", "ابشر", "زين").',
  levantine: 'Speak strictly in warm Levantine Arabic ("كيفك", "شو", "بدي", "هيك").',
  maghrebi: 'Speak strictly in warm Maghrebi Arabic ("لاباس", "كيداير", "بغيت", "بزاف").',
  fusha: 'Speak in clear, gentle Modern Standard Arabic.',
  english: 'Speak in warm, concise, supportive English.',
};

export function GeminiStudioPanel({
  lang,
  dialect,
  userName,
  prefillPrompt,
}: GeminiStudioPanelProps) {
  const isAr = lang === 'ar';
  const [model, setModel] = useState<'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'>(
    'gemini-4-hydrogen'
  );
  const [grounding, setGrounding] = useState<'none' | 'search' | 'maps'>('none');
  const [messages, setMessages] = useState<ChatMessageItem[]>(() => [
    {
      id: 'welcome',
      role: 'model',
      text: isAr
        ? `أهلاً${userName ? ` يا ${userName}` : ''}! اسألني عن أي خطة تركيز، بحث على جوجل، أو أماكن هادية قريبة على الخرائط.`
        : `Hi${userName ? ` ${userName}` : ''}! Ask me about focus habits, Search-grounded tips, or quiet nearby spots on Google Maps.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(
    null
  );

  // Audio transcription state (gemini-3.5-transcribe)
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Live API WebSocket voice state (gemini-3.8-live)
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveTranscripts, setLiveTranscripts] = useState<
    Array<{ who: 'you' | 'noor'; text: string }>
  >([]);
  const wsRef = useRef<WebSocket | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  useEffect(() => {
    if (!prefillPrompt) return;
    setInput(prefillPrompt.text);
    if (prefillPrompt.grounding) {
      setGrounding(prefillPrompt.grounding);
    }
    if (prefillPrompt.latLng) {
      setUserCoords(prefillPrompt.latLng);
    }
  }, [prefillPrompt]);

  useEffect(() => {
    return () => {
      disconnectLiveVoice();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const requestLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {
        // Default fallback center (Cairo)
        setUserCoords({ latitude: 30.0444, longitude: 31.2357 });
      },
      { timeout: 6000 }
    );
  };

  const handleSend = async (overrideText?: string) => {
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessageItem = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!overrideText) setInput('');
    setSending(true);
    setChatError(null);

    try {
      const apiMessages = nextHistory
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, text: m.text }));

      const systemInstruction = `You are Noor, a concise, grounded productivity companion inside Mirror + Ledger.${
        userName ? ` User name: ${userName}.` : ''
      } ${DIALECT_INSTRUCTION_HINTS[dialect]}`;

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          model,
          messages: apiMessages,
          systemInstruction,
          grounding,
          latLng: grounding === 'maps' ? userCoords ?? { latitude: 30.0444, longitude: 31.2357 } : null,
        }),
      });

      const data = (await res.json()) as {
        text?: string;
        sources?: GroundingSource[];
        modelUsed?: string;
        error?: string;
      };

      if (!res.ok) {
        setChatError(
          data.error ||
            (isAr
              ? 'تعذر الوصول إلى Gemini API حالياً.'
              : 'Could not reach Gemini API right now.')
        );
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `m_${Date.now()}`,
          role: 'model',
          text: data.text?.trim() || (isAr ? 'تم الرد بدون نص.' : 'Received empty response.'),
          sources: data.sources,
          modelUsed: data.modelUsed,
        },
      ]);
    } catch {
      setChatError(
        isAr
          ? 'حدث خطأ في الاتصال بالخادم.'
          : 'Network error communicating with backend.'
      );
    } finally {
      setSending(false);
    }
  };

  // Audio recording & transcription via gemini-3.5-transcribe
  const handleToggleClipRecord = async () => {
    if (isRecordingClip) {
      mediaRecorderRef.current?.stop();
      setIsRecordingClip(false);
      return;
    }
    setChatError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size < 100) return;
        setTranscribing(true);
        try {
          const buf = await blob.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          const step = 0x8000;
          for (let i = 0; i < bytes.length; i += step) {
            binary += String.fromCharCode(...bytes.subarray(i, i + step));
          }
          const base64Audio = btoa(binary);
          const res = await fetch('/api/gemini/transcribe', {
            method: 'POST',
            headers: await authJsonHeaders(),
            body: JSON.stringify({
              base64Audio,
              mimeType: recorder.mimeType || 'audio/webm',
              languageHint: lang,
            }),
          });
          const data = (await res.json()) as { text?: string; error?: string };
          if (!res.ok) {
            setChatError(data.error || 'Transcription unavailable.');
          } else if (data.text) {
            setInput((prev) => (prev ? `${prev} ${data.text}` : data.text!));
          }
        } catch {
          setChatError(isAr ? 'فشل تفريغ الصوت.' : 'Audio transcription failed.');
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setIsRecordingClip(true);
    } catch {
      setChatError(
        isAr
          ? 'يرجى السماح بصلاحية الميكروفون لتسجيل ملاحظة صوتية.'
          : 'Please grant microphone permission to record audio.'
      );
    }
  };

  // Live API Voice Connection
  const clearPlaybackQueue = () => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped
      }
    }
    activeSourcesRef.current.clear();
    if (playbackCtxRef.current) {
      nextPlayTimeRef.current = playbackCtxRef.current.currentTime;
    }
  };

  const schedulePcmPlayback = (base64: string) => {
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
    const samples = int16PcmBase64ToFloat32(base64);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.02, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  };

  const disconnectLiveVoice = () => {
    clearPlaybackQueue();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (captureCtxRef.current) {
      captureCtxRef.current.close().catch(() => {});
      captureCtxRef.current = null;
    }
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close().catch(() => {});
      playbackCtxRef.current = null;
    }
    setLiveStatus('idle');
  };

  const connectLiveVoice = async () => {
    if (liveStatus !== 'idle') {
      disconnectLiveVoice();
      return;
    }
    setLiveError(null);
    setLiveStatus('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
      });
      micStreamRef.current = stream;

      const playbackCtx = new AudioContext({ sampleRate: 24000 });
      playbackCtxRef.current = playbackCtx;
      nextPlayTimeRef.current = playbackCtx.currentTime;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/live`);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string) as {
            type: string;
            data?: string;
            text?: string;
            message?: string;
          };
          if (msg.type === 'ready') {
            setLiveStatus('connected');
            // Start mic capture at 16kHz
            const capCtx = new AudioContext({ sampleRate: 16000 });
            captureCtxRef.current = capCtx;
            const source = capCtx.createMediaStreamSource(stream);
            const processor = capCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              if (ws.readyState !== WebSocket.OPEN) return;
              const channel = e.inputBuffer.getChannelData(0);
              const b64 = float32ToInt16PcmBase64(channel);
              ws.send(JSON.stringify({ type: 'audio', data: b64 }));
            };
            source.connect(processor);
            processor.connect(capCtx.destination);
          } else if (msg.type === 'audio' && msg.data) {
            schedulePcmPlayback(msg.data);
          } else if (msg.type === 'interrupted') {
            clearPlaybackQueue();
          } else if (msg.type === 'input_transcript' && msg.text) {
            setLiveTranscripts((prev) => [...prev.slice(-7), { who: 'you', text: msg.text! }]);
          } else if (msg.type === 'output_transcript' && msg.text) {
            setLiveTranscripts((prev) => [...prev.slice(-7), { who: 'noor', text: msg.text! }]);
          } else if (msg.type === 'error') {
            setLiveError(msg.message || 'Live voice session error.');
            disconnectLiveVoice();
          } else if (msg.type === 'closed') {
            disconnectLiveVoice();
          }
        } catch {
          // Ignore malformed frames
        }
      };

      ws.onerror = () => {
        setLiveError(
          isAr ? 'تعذر بدء الاتصال الصوتي المباشر.' : 'Unable to connect Live Voice WebSocket.'
        );
        disconnectLiveVoice();
      };
      ws.onclose = () => {
        disconnectLiveVoice();
      };
    } catch {
      setLiveError(
        isAr
          ? 'يرجى تفعيل صلاحية الميكروفون للمكالمة الصوتية.'
          : 'Microphone access is required for Live Voice.'
      );
      disconnectLiveVoice();
    }
  };

  if (!GEMINI_FEATURES_ENABLED) {
    return (
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-5 text-sm text-[#D4D4D8] leading-relaxed">
        {isAr
          ? 'ميزات الذكاء الاصطناعي متوقفة في النسخة العامة حالياً. بياناتك وكلامك مش بيتبعتوا لأي خدمة ذكاء اصطناعي. باقي المميزات شغالة على جهازك.'
          : 'AI features are turned off in this public version. Nothing you write or say is sent to any AI service. All other features work on your device.'}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Multi-turn Gemini Chat + Grounding + Audio Transcribe */}
      <section
        aria-label={isAr ? 'محادثة Gemini الذكية' : 'Gemini Companion Chat'}
        className="lg:col-span-7 bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-4 md:p-5 flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <Sparkles size={17} className="text-[#00B8A9]" />
              <span>{isAr ? 'محادثة نور بذكاء Gemini' : 'Noor Powered by Gemini'}</span>
            </h2>
            <p className="text-[11px] text-[#A1A1AA]">
              {isAr
                ? 'محادثة متعددة الأدوار مع بحث جوجل وخرائط جوجل وتفريغ الصوت'
                : 'Multi-turn chat with Search Grounding, Maps Grounding & Voice Dictation'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-[#0F0F0F] border border-[#2A2A2A] rounded-full p-1">
            <button
              type="button"
              onClick={() => setModel('gemini-4-hydrogen')}
              aria-pressed={model === 'gemini-4-hydrogen'}
              className="px-3 py-1 rounded-full text-[11px] font-extrabold transition"
              style={{
                backgroundColor: model === 'gemini-4-hydrogen' ? '#00B8A9' : 'transparent',
                color: model === 'gemini-4-hydrogen' ? '#0F0F0F' : '#A1A1AA',
              }}
            >
              Hydrogen
            </button>
            <button
              type="button"
              onClick={() => setModel('gemini-3.1-flash-lite')}
              aria-pressed={model === 'gemini-3.1-flash-lite'}
              className="px-3 py-1 rounded-full text-[11px] font-extrabold transition flex items-center gap-1"
              style={{
                backgroundColor: model === 'gemini-3.1-flash-lite' ? '#FF6B35' : 'transparent',
                color: model === 'gemini-3.1-flash-lite' ? '#0F0F0F' : '#A1A1AA',
              }}
            >
              <Zap size={11} />
              <span>Flash-Lite</span>
            </button>
          </div>
        </div>

        {/* Grounding controls */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'none', labelAr: 'بدون أدوات', labelEn: 'Standard', icon: Sparkles },
              { id: 'search', labelAr: 'بحث جوجل', labelEn: 'Google Search', icon: Globe },
              { id: 'maps', labelAr: 'خرائط جوجل', labelEn: 'Google Maps', icon: MapPin },
            ] as const
          ).map((opt) => {
            const Icon = opt.icon;
            const active = grounding === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setGrounding(opt.id);
                  if (opt.id === 'maps' && !userCoords) requestLocation();
                }}
                className="px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 transition"
                style={{
                  borderColor: active ? '#00B8A9' : '#2A2A2A',
                  backgroundColor: active ? '#00B8A918' : '#0F0F0F',
                  color: active ? '#00B8A9' : '#A1A1AA',
                }}
              >
                <Icon size={13} />
                <span>{isAr ? opt.labelAr : opt.labelEn}</span>
              </button>
            );
          })}
        </div>

        {/* Chat Thread */}
        <div
          data-testid="gemini-chat-thread"
          className="bg-[#0F0F0F] border border-[#2A2A2A] rounded-2xl p-3.5 h-[300px] overflow-y-auto space-y-3"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col gap-1.5 ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs md:text-sm leading-relaxed whitespace-pre-wrap"
                style={{
                  backgroundColor: msg.role === 'user' ? '#00B8A9' : '#1A1A1A',
                  color: msg.role === 'user' ? '#0F0F0F' : '#E4E4E7',
                  border: msg.role === 'model' ? '1px solid #2A2A2A' : 'none',
                  fontWeight: msg.role === 'user' ? 700 : 500,
                }}
              >
                {msg.text}
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="max-w-[92%] space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {msg.sources.map((src, idx) => (
                      <a
                        key={`${src.uri}_${idx}`}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00B8A9] text-[11px] font-bold text-[#00B8A9]"
                      >
                        {src.kind === 'maps' ? <MapPin size={11} /> : <Globe size={11} />}
                        <span className="truncate max-w-[180px]">{src.title}</span>
                        <ExternalLink size={10} />
                      </a>
                    ))}
                  </div>
                  {msg.sources.some((s) => s.reviewSnippets && s.reviewSnippets.length > 0) && (
                    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-2 space-y-1">
                      {msg.sources.flatMap((s) => s.reviewSnippets ?? []).slice(0, 2).map((snip, idx) => (
                        <p key={idx} className="text-[11px] text-[#A1A1AA] italic">
                          “{snip}”
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="text-xs text-[#00B8A9] font-bold animate-pulse">
              {isAr ? 'جاري التفكير...' : 'Gemini is thinking...'}
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {chatError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[#FF6B35]/10 border border-[#FF6B35]/60 text-xs font-bold text-[#FF6B35]"
          >
            {chatError}
          </div>
        )}

        {/* Composer + Mic Transcribe */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <button
            type="button"
            onClick={handleToggleClipRecord}
            disabled={transcribing}
            aria-label={isAr ? 'تسجيل وتفريغ صوتي' : 'Record audio to transcribe'}
            title={isAr ? 'تفريغ الصوت بـ Gemini 3.5 Transcribe' : 'Transcribe via Gemini 3.5 Transcribe'}
            className="w-11 h-11 rounded-full border flex items-center justify-center shrink-0 transition"
            style={{
              backgroundColor: isRecordingClip ? '#FF6B35' : '#0F0F0F',
              borderColor: isRecordingClip ? '#FF6B35' : '#2A2A2A',
              color: isRecordingClip ? '#0F0F0F' : '#E4E4E7',
            }}
          >
            {isRecordingClip ? <Square size={15} /> : <Mic size={16} />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              transcribing
                ? isAr
                  ? 'جاري تفريغ الصوت...'
                  : 'Transcribing audio...'
                : isAr
                ? 'اسأل نور أي سؤال أو ابحث عن مكان...'
                : 'Ask Noor anything or search places...'
            }
            className="flex-1 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] px-4 py-2.5 text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#00B8A9] min-h-[44px]"
          />

          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label={isAr ? 'إرسال' : 'Send'}
            className="w-11 h-11 rounded-full bg-[#00B8A9] text-[#0F0F0F] flex items-center justify-center shrink-0 disabled:opacity-40 transition"
          >
            <Send size={16} />
          </button>
        </form>
      </section>

      {/* Right Column: Live Voice API + Paid-Key Model Status */}
      <div className="lg:col-span-5 flex flex-col gap-5">
        {/* Gemini 3.8 Live Real-time Voice */}
        <section
          aria-label={isAr ? 'المكالمة الصوتية المباشرة' : 'Real-Time Live Voice'}
          className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-4 md:p-5 space-y-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Volume2 size={16} className="text-[#00B8A9]" />
                <span>{isAr ? 'مكالمة صوتية مباشرة (Live)' : 'Live Voice Conversation'}</span>
              </h3>
              <p className="text-[11px] text-[#A1A1AA] mt-0.5">
                {isAr
                  ? 'تحدث بالصوت لحظياً مع Gemini 3.8 Live — 16kHz إدخال / 24kHz صوت طبيعي'
                  : 'Real-time voice streaming over WebSocket (gemini-3.8-live)'}
              </p>
            </div>
            <span
              className="text-[11px] font-extrabold px-2.5 py-1 rounded-full shrink-0"
              style={{
                backgroundColor:
                  liveStatus === 'connected'
                    ? '#00B8A922'
                    : liveStatus === 'connecting'
                    ? '#F59E0B22'
                    : '#0F0F0F',
                color:
                  liveStatus === 'connected'
                    ? '#00B8A9'
                    : liveStatus === 'connecting'
                    ? '#F59E0B'
                    : '#71717A',
              }}
            >
              {liveStatus === 'connected'
                ? isAr
                  ? 'متصل'
                  : 'Connected'
                : liveStatus === 'connecting'
                ? isAr
                  ? 'جاري الاتصال'
                  : 'Connecting'
                : isAr
                ? 'جاهز'
                : 'Ready'}
            </span>
          </div>

          <button
            type="button"
            data-testid="live-voice-toggle-btn"
            onClick={connectLiveVoice}
            className="w-full py-3 rounded-full font-extrabold text-xs md:text-sm flex items-center justify-center gap-2 min-h-[44px] transition"
            style={{
              backgroundColor: liveStatus === 'idle' ? '#00B8A9' : '#FF6B35',
              color: '#0F0F0F',
            }}
          >
            {liveStatus === 'idle' ? <PhoneCall size={16} /> : <PhoneOff size={16} />}
            <span>
              {liveStatus === 'idle'
                ? isAr
                  ? 'ابدأ مكالمة صوتية مع نور'
                  : 'Start Live Voice Call'
                : isAr
                ? 'إنهاء المكالمة'
                : 'End Voice Call'}
            </span>
          </button>

          {liveError && (
            <p className="text-[11px] font-bold text-[#FF6B35] bg-[#FF6B35]/10 border border-[#FF6B35]/40 rounded-xl p-2.5">
              {liveError}
            </p>
          )}

          {liveTranscripts.length > 0 && (
            <div className="bg-[#0F0F0F] border border-[#2A2A2A] rounded-xl p-3 space-y-1.5 max-h-[140px] overflow-y-auto">
              {liveTranscripts.map((item, idx) => (
                <div key={idx} className="text-[11px] leading-snug">
                  <span
                    className="font-extrabold me-1.5"
                    style={{ color: item.who === 'you' ? '#FF6B35' : '#00B8A9' }}
                  >
                    {item.who === 'you' ? (isAr ? 'أنت:' : 'You:') : isAr ? 'نور:' : 'Noor:'}
                  </span>
                  <span className="text-[#E4E4E7]">{item.text}</span>
                </div>
              ))}
            </div>
          )}

          {liveStatus === 'idle' && liveTranscripts.length === 0 && (
            <div className="bg-[#0F0F0F] border border-[#2A2A2A] rounded-xl p-3 flex items-center gap-2.5 text-[11px] text-[#A1A1AA]">
              <MicOff size={15} className="text-[#71717A] shrink-0" />
              <span>
                {isAr
                  ? 'اضغط لفتح جلسة صوتية ثنائية الاتجاه — تقدر تقاطع نور في أي وقت.'
                  : 'Press to start a two-way low-latency audio stream with interruption support.'}
              </span>
            </div>
          )}
        </section>

        {/* Paid-Tier Creative Models Notice (No Mocked Generation) */}
        <section
          aria-label={isAr ? 'أدوات الإبداع المدفوعة' : 'Paid-Key Creative Models'}
          className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-4 md:p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Lock size={15} className="text-[#F59E0B]" />
              <span>{isAr ? 'نماذج الإبداع والذكاء المتقدم' : 'Creative & Pro Models'}</span>
            </h3>
            <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#F59E0B]/15 text-[#F59E0B]">
              {isAr ? 'يتطلب مفتاح مدفوع' : 'Paid API Key'}
            </span>
          </div>

          <p className="text-xs text-[#A1A1AA] leading-relaxed">
            {isAr
              ? 'الوضع المجاني مفعّل حالياً (الشات، بحث جوجل، الخرائط، تفريغ الصوت، والمكالمة المباشرة متاحون بالكامل). نماذج الصور، الفيديو، الموسيقى، والتحليل العميق تتطلب تفعيل مفتاح مدفوع في إعدادات الخادم.'
              : 'Free-tier mode is active (Chat, Google Search, Maps grounding, Voice Dictation & Live Voice are ready). Image, Video, Music, and Pro Reasoning models require a billing-enabled API key on the server.'}
          </p>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {[
              isAr ? 'توليد وتعديل الصور' : 'Image Create & Edit',
              isAr ? 'تحليل وتوليد الفيديو' : 'Video & Animate',
              isAr ? 'توليد موسيقى Lyria 3' : 'Lyria 3 Music',
              isAr ? 'تفكير Carbon / Neon' : 'Carbon / Neon Deep Think',
            ].map((label) => (
              <div
                key={label}
                className="px-3 py-2 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] text-[#71717A] font-bold flex items-center justify-between gap-1.5"
              >
                <span className="truncate">{label}</span>
                <Lock size={11} className="shrink-0 text-[#F59E0B]" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
