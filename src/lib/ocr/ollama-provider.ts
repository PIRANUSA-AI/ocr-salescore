import axios from 'axios';
import type { OcrProvider, OcrResult } from './types';
import { buildExtractionPrompt, extractJsonObject, coerceOcrResult } from './prompt';

/**
 * Free fallback provider for second-opinion on low-confidence fields.
 * Uses Ollama Cloud (gemma3) via the OpenAI-compatible endpoint.
 * Only specific fields are re-sent (see orchestrator), but this provider can
 * also run a full extraction when needed.
 */
export function createOllamaProvider(): OcrProvider {
  const apiKey = process.env.OLLAMA_API_KEY;
  const model = process.env.OLLAMA_OCR_MODEL || 'gemma3:12b';
  const endpoint = process.env.OLLAMA_ENDPOINT || 'https://ollama.com/v1/chat/completions';

  return {
    name: `ollama:${model}`,
    async extract(imageDataUri: string): Promise<OcrResult> {
      if (!apiKey) {
        throw new Error('OLLAMA_API_KEY belum diset.');
      }

      const response = await axios.post(
        endpoint,
        {
          model,
          temperature: 0,
          max_tokens: 512,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: buildExtractionPrompt() },
                { type: 'image_url', image_url: { url: imageDataUri } },
              ],
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        },
      );

      const raw = response.data?.choices?.[0]?.message?.content;
      const jsonStr = extractJsonObject(raw);
      if (!jsonStr) {
        throw new Error('Ollama fallback tidak mengembalikan JSON yang valid.');
      }
      return coerceOcrResult(JSON.parse(jsonStr));
    },
  };
}
