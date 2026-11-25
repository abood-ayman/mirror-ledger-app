import { GoogleGenAI, Modality } from '@google/genai';
import {
  classifyUpstreamError,
  extractGroundingSources,
  type GroundingSource,
} from '../lib/studioHelpers.ts';

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  }
  return cachedClient;
}

export const FREE_CHAT_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
export type FreeChatModel = (typeof FREE_CHAT_MODELS)[number];

export interface ChatTurnInput {
  role: 'user' | 'model';
  text: string;
}

export async function runGeminiChat(params: {
  model: string;
  messages: ChatTurnInput[];
  systemInstruction?: string;
  grounding?: 'none' | 'search' | 'maps';
  latLng?: { latitude: number; longitude: number } | null;
}): Promise<{
  text: string;
  sources: GroundingSource[];
  modelUsed: string;
}> {
  const ai = getGeminiClient();
  if (!ai) {
    const err = classifyUpstreamError(403, 'Missing GEMINI_API_KEY');
    throw Object.assign(new Error(err.userMessage), { statusCode: 403, details: err });
  }

  const allowedModel: FreeChatModel = FREE_CHAT_MODELS.includes(
    params.model as FreeChatModel
  )
    ? (params.model as FreeChatModel)
    : 'gemini-4-hydrogen';

  const contents = params.messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  const config: Record<string, unknown> = {};
  if (params.systemInstruction?.trim()) {
    config.systemInstruction = params.systemInstruction.trim();
  }

  if (params.grounding === 'search') {
    config.tools = [{ googleSearch: {} }];
  } else if (params.grounding === 'maps') {
    config.tools = [{ googleMaps: {} }];
    if (
      params.latLng &&
      Number.isFinite(params.latLng.latitude) &&
      Number.isFinite(params.latLng.longitude)
    ) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: params.latLng.latitude,
            longitude: params.latLng.longitude,
          },
        },
      };
    }
  }

  let response;
  try {
    response = await ai.models.generateContent({
      model: allowedModel,
      contents,
      config,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    const msg = (err as { message?: string })?.message ?? '';
    if (status === 503 || /unavailable|high demand/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 500));
      response = await ai.models.generateContent({
        model: allowedModel,
        contents,
        config,
      });
    } else {
      throw err;
    }
  }

  const sources = extractGroundingSources(
    response.candidates as Parameters<typeof extractGroundingSources>[0]
  );

  return {
    text: response.text ?? '',
    sources,
    modelUsed: allowedModel,
  };
}

export async function runAudioTranscription(params: {
  base64Audio: string;
  mimeType: string;
  languageHint?: string;
}): Promise<{ text: string }> {
  const ai = getGeminiClient();
  if (!ai) {
    const err = classifyUpstreamError(403, 'Missing GEMINI_API_KEY');
    throw Object.assign(new Error(err.userMessage), { statusCode: 403, details: err });
  }

  const prompt =
    params.languageHint === 'ar'
      ? 'Transcribe the spoken audio accurately in its original Arabic dialect or English words. Output only the clean transcript text.'
      : 'Transcribe the spoken audio accurately. Output only the clean transcript text.';

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType || 'audio/webm',
              data: params.base64Audio,
            },
          },
          { text: prompt },
        ],
      },
    ],
  });

  return { text: (response.text ?? '').trim() };
}

export { Modality };
