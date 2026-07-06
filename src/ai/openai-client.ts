import { z } from 'zod';
import axios from 'axios';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export interface OpenAICallParams<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  imageDataUri?: string;
}

export async function callOpenAI<T>(params: OpenAICallParams<T>): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY belum diset.');
  }

  const model = params.model || process.env.OPENAI_OCR_MODEL || 'gpt-4.1';
  const temperature = params.temperature ?? 0;
  const maxTokens = params.maxTokens ?? 2048;

  const messages: any[] = [
    { role: 'system', content: params.systemPrompt },
  ];

  const userContent: any[] = [{ type: 'text', text: params.userPrompt }];
  if (params.imageDataUri) {
    userContent.push({ type: 'image_url', image_url: { url: params.imageDataUri } });
  }
  messages.push({ role: 'user', content: userContent });

  const response = await axios.post(
    OPENAI_ENDPOINT,
    {
      model,
      temperature,
      max_tokens: maxTokens,
      messages,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 90000,
    },
  );

  const raw = response.data?.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenAI tidak mengembalikan response.');
  }

  try {
    const parsed = JSON.parse(raw);
    return params.schema.parse(parsed);
  } catch (err) {
    console.error('[OpenAI] Failed to parse response:', raw.slice(0, 300));
    throw err;
  }
}

export async function callOpenAIText(params: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  imageDataUri?: string;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY belum diset.');
  }

  const model = params.model || process.env.OPENAI_OCR_MODEL || 'gpt-4.1';

  const messages: any[] = [
    { role: 'system', content: params.systemPrompt },
  ];

  const userContent: any[] = [{ type: 'text', text: params.userPrompt }];
  if (params.imageDataUri) {
    userContent.push({ type: 'image_url', image_url: { url: params.imageDataUri } });
  }
  messages.push({ role: 'user', content: userContent });

  const response = await axios.post(
    OPENAI_ENDPOINT,
    {
      model,
      temperature: params.temperature ?? 0,
      max_tokens: params.maxTokens ?? 2048,
      messages,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 90000,
    },
  );

  const raw = response.data?.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenAI tidak mengembalikan response.');
  }

  return raw.trim();
}
