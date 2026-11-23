import { GoogleGenAI } from '@google/genai';

interface WorkerEnv {
  GEMINI_API_KEY?: string;
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

type AiEnhanceMode = 'watermark' | 'hd' | 'both';

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_MODES = new Set(['watermark', 'hd', 'both']);

function getConfiguredApiKey(env: WorkerEnv): string | null {
  const raw = (env.GEMINI_API_KEY || '').trim();
  if (!raw || raw === 'MY_GEMINI_API_KEY') return null;
  return raw;
}

function buildDocumentPrompt(mode: AiEnhanceMode): string {
  const preservationRules =
    'CRITICAL RULES: Preserve every single word, character (Chinese, English, symbols, punctuation, numbers), equation, table line, layout position, and formatting with 100% accuracy. Do NOT invent, alter, translate, rephrase, or drop any text. Output a clean, flat, print-ready document page with uniform paper background.';

  if (mode === 'watermark') {
    return [
      'Remove all visible watermarks, diagonal tiled text watermarks, translucent logo overlays, background patterns, and distracting light stamps from this document image.',
      'Reconstruct any text strokes and table lines that sit underneath the watermarks cleanly and faithfully.',
      'Keep the document background clean, even, and crisp white/light paper without smudges.',
      preservationRules,
    ].join(' ');
  }

  if (mode === 'hd') {
    return [
      'Perform ultra-high-definition document super-resolution and restoration on this text document image.',
      'Eliminate blur, JPEG compression artifacts, camera noise, uneven shadows, and paper yellowing.',
      'Reconstruct razor-sharp, high-contrast, crisp printed text edges, fine strokes, and clean diagrams while making the paper background spotless and evenly lit.',
      preservationRules,
    ].join(' ');
  }

  return [
    'Perform both deep watermark removal AND ultra-high-definition document restoration on this image.',
    '1) Completely remove all translucent/tiled/colored watermarks, background gridlines, and distracting overlays while cleanly restoring covered text strokes.',
    '2) Eliminate blur, compression artifacts, noise, shadows, and yellowing, reconstructing razor-sharp, crisp high-resolution text on a clean uniform white paper background.',
    preservationRules,
  ].join(' ');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function handleAiEnhance(request: Request, env: WorkerEnv): Promise<Response> {
  try {
    const apiKey = getConfiguredApiKey(env);
    if (!apiKey) {
      return jsonResponse(
        {
          errorCode: 'API_KEY_MISSING',
          error:
            'Gemini API Key is not configured yet. Please set GEMINI_API_KEY in your Worker Secrets / Settings > Secrets before using AI restoration.',
        },
        503
      );
    }

    const body = (await request.json().catch(() => null)) as {
      imageBase64?: unknown;
      mimeType?: unknown;
      mode?: unknown;
    } | null;

    const imageBase64 = body?.imageBase64;
    const mimeType = body?.mimeType;
    const mode = body?.mode;

    if (typeof imageBase64 !== 'string' || imageBase64.length < 32) {
      return jsonResponse({ errorCode: 'INVALID_IMAGE', error: 'Invalid or empty image payload.' }, 400);
    }
    if (imageBase64.length > 20 * 1024 * 1024) {
      return jsonResponse(
        { errorCode: 'IMAGE_TOO_LARGE', error: 'Image payload exceeds 20MB limit.' },
        413
      );
    }

    const normalizedMime = typeof mimeType === 'string' ? mimeType.toLowerCase() : 'image/jpeg';
    if (!ALLOWED_MIMES.has(normalizedMime)) {
      return jsonResponse(
        { errorCode: 'UNSUPPORTED_MIME', error: 'Unsupported image MIME type.' },
        400
      );
    }

    const normalizedMode: AiEnhanceMode =
      typeof mode === 'string' && ALLOWED_MODES.has(mode) ? (mode as AiEnhanceMode) : 'both';

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const modelName =
      normalizedMode === 'watermark'
        ? 'gemini-3.1-flash-lite-image'
        : 'gemini-nano-banana-2.1';

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: normalizedMime,
            },
          },
          {
            text: buildDocumentPrompt(normalizedMode),
          },
        ],
      },
      ...(modelName === 'gemini-nano-banana-2.1'
        ? {
            config: {
              imageConfig: {
                imageSize: '2K',
              },
            },
          }
        : {}),
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    let outBase64: string | null = null;
    let outMime = 'image/png';
    let noteText = '';

    for (const part of parts) {
      if (part.inlineData?.data) {
        outBase64 = part.inlineData.data;
        outMime = part.inlineData.mimeType || 'image/png';
        break;
      }
      if (part.text) {
        noteText += part.text;
      }
    }

    if (!outBase64) {
      return jsonResponse(
        {
          errorCode: 'NO_IMAGE_RETURNED',
          error: noteText
            ? `Model returned text instead of an edited image: ${noteText.slice(0, 180)}`
            : 'The AI model did not return an edited image. Please retry.',
        },
        502
      );
    }

    return jsonResponse({
      imageDataUrl: `data:${outMime};base64,${outBase64}`,
      mimeType: outMime,
      model: modelName,
    });
  } catch (err: unknown) {
    const e = err as { status?: number; code?: number; message?: string };
    const status = Number(e?.status || e?.code || 500);
    const msg = e?.message || 'AI enhancement request failed.';

    if (status === 400 || status === 401 || status === 403 || /API_KEY|PERMISSION_DENIED/i.test(msg)) {
      return jsonResponse(
        {
          errorCode: 'API_KEY_INVALID',
          error:
            'Gemini API key permission denied or invalid. Please check your GEMINI_API_KEY secret.',
        },
        status === 403 ? 403 : 400
      );
    }

    if (status === 429 || /RESOURCE_EXHAUSTED|QUOTA/i.test(msg)) {
      return jsonResponse(
        {
          errorCode: 'QUOTA_EXCEEDED',
          error: 'API quota exceeded or billing-enabled key required.',
        },
        429
      );
    }

    return jsonResponse({ errorCode: 'UPSTREAM_ERROR', error: msg }, 500);
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return jsonResponse({
        ok: true,
        aiConfigured: Boolean(getConfiguredApiKey(env)),
      });
    }

    if (url.pathname === '/api/ai-enhance' && request.method === 'POST') {
      return handleAiEnhance(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
