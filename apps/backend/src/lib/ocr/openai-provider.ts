import { callOpenAI } from '../openai-client.js';
import type { OcrProvider, OcrResult } from './types.js';
import { buildOcrMessages, OcrResultSchema, coerceOcrResult } from './prompt/index.js';
import type { FormTeam } from './types.js';

export function createOpenAIProvider(): OcrProvider {
  const model = process.env.OPENAI_OCR_MODEL || 'gpt-4.1';

  return {
    name: `openai:${model}`,
    async extract(imageDataUri: string, extraContext?: string, team?: FormTeam): Promise<OcrResult> {
      const { systemPrompt, userPrompt } = buildOcrMessages(imageDataUri, extraContext, team);

      try {
        const raw = await callOpenAI({
          systemPrompt,
          userPrompt,
          schema: OcrResultSchema,
          model,
          temperature: 0,
          maxTokens: 2048,
          imageDataUri,
          imageDetail: 'high', // base read butuh teks tajam
        });
        return coerceOcrResult(raw);
      } catch (err: any) {
        throw new Error(`OpenAI OCR gagal: ${err.message}`);
      }
    },
  };
}
