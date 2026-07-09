import { callOpenAI } from '../openai-client.js';
import type { OcrProvider, OcrResult } from './types';
import { buildOcrMessages, OcrResultSchema, coerceOcrResult } from './prompt';

export function createOpenAIProvider(): OcrProvider {
  const model = process.env.OPENAI_OCR_MODEL || 'gpt-4.1';

  return {
    name: `openai:${model}`,
    async extract(imageDataUri: string, extraContext?: string): Promise<OcrResult> {
      const { systemPrompt, userPrompt } = buildOcrMessages(imageDataUri, extraContext);

      try {
        const raw = await callOpenAI({
          systemPrompt,
          userPrompt,
          schema: OcrResultSchema,
          model,
          temperature: 0,
          maxTokens: 2048,
          imageDataUri,
        });
        return coerceOcrResult(raw);
      } catch (err: any) {
        throw new Error(`OpenAI OCR gagal: ${err.message}`);
      }
    },
  };
}
