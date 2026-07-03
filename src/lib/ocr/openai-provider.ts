import axios from 'axios';
import type { OcrProvider, OcrResult } from './types';
import { buildExtractionPrompt, extractJsonObject, coerceOcrResult } from './prompt';

/**
 * Primary OCR provider: OpenAI gpt-4.1.
 * Benchmark winner: ~1.3s, accurate, ~$1.15 per 400 scans.
 * Non-reasoning model, so we use temperature 0 and max_tokens 512.
 */
export function createOpenAIProvider(): OcrProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_OCR_MODEL || 'gpt-4.1';
  const endpoint = 'https://api.openai.com/v1/chat/completions';

  return {
    name: `openai:${model}`,
    async extract(imageDataUri: string): Promise<OcrResult> {
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY belum diset. OCR tidak dapat dijalankan.');
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
        throw new Error('OpenAI tidak mengembalikan JSON yang valid.');
      }
      return coerceOcrResult(JSON.parse(jsonStr));
    },
  };
}
