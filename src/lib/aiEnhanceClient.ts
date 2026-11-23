import type { ImageItem } from './pdfSplitter';
import {
  AiEnhanceMode,
  AiEnhancedResult,
  renderProcessedImageCanvas,
} from './imageProcessor';

export interface AiEnhanceClientError {
  errorCode:
    | 'API_KEY_MISSING'
    | 'API_KEY_INVALID'
    | 'QUOTA_EXCEEDED'
    | 'NO_IMAGE_RETURNED'
    | 'ABORTED'
    | 'NETWORK_ERROR'
    | 'UPSTREAM_ERROR';
  message: string;
}

export async function requestAiEnhancement(
  item: ImageItem,
  mode: AiEnhanceMode,
  signal?: AbortSignal
): Promise<AiEnhancedResult> {
  // Bake current crop/perspective/polygon + orientation before sending so AI sees upright, cropped text
  const bakedCanvas = await renderProcessedImageCanvas(item, {
    maxDim: 2048,
    skipAiLayer: true,
    skipEnhancements: true,
    backgroundFill: '#FFFFFF',
  });

  const dataUrl = bakedCanvas.toDataURL('image/jpeg', 0.92);
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  let response: Response;
  try {
    response = await fetch('/api/ai-enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: 'image/jpeg',
        mode,
      }),
      signal,
    });
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw { errorCode: 'ABORTED', message: 'Request cancelled' } as AiEnhanceClientError;
    }
    throw {
      errorCode: 'NETWORK_ERROR',
      message: 'Failed to reach the server AI endpoint.',
    } as AiEnhanceClientError;
  }

  let payload: { imageDataUrl?: string; errorCode?: string; error?: string } = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.imageDataUrl) {
    const code = (payload.errorCode || 'UPSTREAM_ERROR') as AiEnhanceClientError['errorCode'];
    throw {
      errorCode: code,
      message: payload.error || `Server returned HTTP ${response.status}`,
    } as AiEnhanceClientError;
  }

  // Read natural dimensions of returned AI image
  const dims = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: bakedCanvas.width, h: bakedCanvas.height });
    img.src = payload.imageDataUrl!;
  });

  return {
    url: payload.imageDataUrl,
    mode,
    width: dims.w,
    height: dims.h,
    active: true,
  };
}
