export interface GroundingSource {
  kind: 'web' | 'maps';
  title: string;
  uri: string;
  reviewSnippets?: string[];
}

interface RawGroundingChunk {
  web?: { uri?: string; title?: string };
  maps?: {
    uri?: string;
    title?: string;
    placeAnswerSources?: {
      reviewSnippets?: Array<{ content?: string }>;
    };
  };
}

interface RawCandidate {
  groundingMetadata?: {
    groundingChunks?: RawGroundingChunk[];
  };
}

export function extractGroundingSources(
  candidates?: RawCandidate[] | null
): GroundingSource[] {
  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }
  const chunks = candidates[0]?.groundingMetadata?.groundingChunks;
  if (!chunks || !Array.isArray(chunks)) {
    return [];
  }

  const seen = new Set<string>();
  const sources: GroundingSource[] = [];

  for (const chunk of chunks) {
    if (chunk.web?.uri) {
      const key = `web:${chunk.web.uri}`;
      if (!seen.has(key)) {
        seen.add(key);
        sources.push({
          kind: 'web',
          title: chunk.web.title?.trim() || chunk.web.uri,
          uri: chunk.web.uri,
        });
      }
    }
    if (chunk.maps?.uri) {
      const key = `maps:${chunk.maps.uri}`;
      if (!seen.has(key)) {
        seen.add(key);
        const snippets =
          chunk.maps.placeAnswerSources?.reviewSnippets
            ?.map((r) => r.content?.trim() ?? '')
            .filter(Boolean) ?? [];
        sources.push({
          kind: 'maps',
          title: chunk.maps.title?.trim() || 'Google Maps Place',
          uri: chunk.maps.uri,
          reviewSnippets: snippets.length > 0 ? snippets.slice(0, 3) : undefined,
        });
      }
    }
  }

  return sources;
}

export function float32ToInt16PcmBase64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function int16PcmBase64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const byteLength = binary.length;
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

export function classifyUpstreamError(status: number, rawMessage: string): {
  requiresPaidKey: boolean;
  quotaExceeded: boolean;
  userMessage: string;
} {
  const lower = rawMessage.toLowerCase();
  const quotaExceeded =
    status === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota');
  const requiresPaidKey =
    status === 402 ||
    status === 403 ||
    lower.includes('billing') ||
    lower.includes('paid') ||
    lower.includes('permission_denied') ||
    lower.includes('api key not valid') ||
    lower.includes('missing gemini_api_key');

  const isUnavailable =
    status === 503 ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded');

  if (requiresPaidKey) {
    return {
      requiresPaidKey: true,
      quotaExceeded,
      userMessage:
        'This capability requires a valid or billing-enabled API key in AI Studio Settings > Secrets.',
    };
  }
  if (isUnavailable) {
    return {
      requiresPaidKey: false,
      quotaExceeded: false,
      userMessage:
        'Gemini is experiencing temporary high demand right now. Try switching to Flash-Lite or retrying in a few seconds.',
    };
  }
  if (quotaExceeded) {
    return {
      requiresPaidKey: false,
      quotaExceeded: true,
      userMessage: 'Rate limit or quota reached temporarily. Please try again shortly.',
    };
  }
  return {
    requiresPaidKey: false,
    quotaExceeded: false,
    userMessage: 'Could not complete request right now. Please try again.',
  };
}
