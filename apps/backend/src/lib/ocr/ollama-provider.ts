import axios from 'axios';
import type { OcrProvider, OcrResult } from './types.js';
import { buildOcrMessages, extractJsonObject, coerceOcrResult } from './prompt/index.js';
import type { FormTeam } from './types.js';

export function createOllamaProvider(): OcrProvider {
  const apiKey = process.env.OLLAMA_API_KEY;
  const model = process.env.OLLAMA_OCR_MODEL || 'gemma3:12b';
  const endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/v1/chat/completions';

  return {
    name: `ollama:${model}`,
    async extract(imageDataUri: string, extraContext?: string, team?: FormTeam): Promise<OcrResult> {
      if (!apiKey) {
        throw new Error('OLLAMA_API_KEY belum diset.');
      }

      const { systemPrompt, userPrompt } = buildOcrMessages(imageDataUri, extraContext, team);

      const response = await axios.post(
        endpoint,
        {
          model,
          temperature: 0,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: userPrompt },
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
