import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_MODES = new Set(['watermark', 'hd', 'both']);

type AiEnhanceMode = 'watermark' | 'hd' | 'both';

function getConfiguredApiKey(): string | null {
  const raw = (process.env.GEMINI_API_KEY || '').trim();
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

function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      aiConfigured: Boolean(getConfiguredApiKey()),
    });
  });

  app.post('/api/ai-enhance', async (req, res) => {
    try {
      const apiKey = getConfiguredApiKey();
      if (!apiKey) {
        res.status(503).json({
          errorCode: 'API_KEY_MISSING',
          error:
            'Gemini API Key is not configured yet. Please set GEMINI_API_KEY in Settings > Secrets before using AI restoration.',
        });
        return;
      }

      const { imageBase64, mimeType, mode } = req.body ?? {};

      if (typeof imageBase64 !== 'string' || imageBase64.length < 32) {
        res.status(400).json({ errorCode: 'INVALID_IMAGE', error: 'Invalid or empty image payload.' });
        return;
      }

      if (imageBase64.length > 20 * 1024 * 1024) {
        res.status(413).json({ errorCode: 'IMAGE_TOO_LARGE', error: 'Image payload exceeds 20MB limit.' });
        return;
      }

      const normalizedMime = typeof mimeType === 'string' ? mimeType.toLowerCase() : 'image/jpeg';
      if (!ALLOWED_MIMES.has(normalizedMime)) {
        res.status(400).json({ errorCode: 'UNSUPPORTED_MIME', error: 'Unsupported image MIME type.' });
        return;
      }

      const normalizedMode: AiEnhanceMode = ALLOWED_MODES.has(mode) ? mode : 'both';

      const ai = createGeminiClient(apiKey);
      const modelName =
        normalizedMode === 'watermark'
          ? 'gemini-3.1-flash-lite-image'
          : 'gemini-nano-banana-2.1';

      const prompt = buildDocumentPrompt(normalizedMode);

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
              text: prompt,
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
        res.status(502).json({
          errorCode: 'NO_IMAGE_RETURNED',
          error: noteText
            ? `Model returned text instead of an edited image: ${noteText.slice(0, 180)}`
            : 'The AI model did not return an edited image. Please retry.',
        });
        return;
      }

      res.json({
        imageDataUrl: `data:${outMime};base64,${outBase64}`,
        mimeType: outMime,
        model: modelName,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; code?: number; message?: string };
      const status = Number(e?.status || e?.code || 500);
      const msg = e?.message || 'AI enhancement request failed.';

      if (status === 400 || status === 401 || status === 403 || /API_KEY|PERMISSION_DENIED/i.test(msg)) {
        res.status(status === 403 ? 403 : 400).json({
          errorCode: 'API_KEY_INVALID',
          error:
            'Gemini API key permission denied or invalid. Please check or select a valid billing-enabled key in Settings > Secrets.',
        });
        return;
      }

      if (status === 429 || /RESOURCE_EXHAUSTED|QUOTA/i.test(msg)) {
        res.status(429).json({
          errorCode: 'QUOTA_EXCEEDED',
          error:
            'API quota exceeded or paid tier required for this image model. Please check your key in Settings > Secrets.',
        });
        return;
      }

      console.error('[/api/ai-enhance] Error:', err);
      res.status(500).json({
        errorCode: 'UPSTREAM_ERROR',
        error: msg,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PDF Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
