import { z } from 'zod';
import axios from 'axios';

const DEFAULT_OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

function getOpenAIEndpoint(): string {
  return process.env.OPENAI_ENDPOINT || DEFAULT_OPENAI_ENDPOINT;
}

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
    userContent.push({ type: 'image_url', image_url: { url: normalizeImageUrl(params.imageDataUri) } });
  }
  messages.push({ role: 'user', content: userContent });

  const response = await postOpenAI(buildChatCompletionsPayload({
    model,
    temperature,
    maxTokens,
    messages,
    response_format: { type: 'json_object' },
  }), apiKey);

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
    userContent.push({ type: 'image_url', image_url: { url: normalizeImageUrl(params.imageDataUri) } });
  }
  messages.push({ role: 'user', content: userContent });

  const response = await postOpenAI({
    model,
    temperature: params.temperature ?? 0,
    maxTokens: params.maxTokens ?? 2048,
    messages,
  }, apiKey);

  const raw = response.data?.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenAI tidak mengembalikan response.');
  }

  return raw.trim();
}

async function postOpenAI(payload: Record<string, any>, apiKey: string) {
  if (isResponsesOnlyModel(String(payload.model || ''))) {
    throw new Error(`OpenAI model ${payload.model} hanya support /v1/responses, bukan /v1/chat/completions.`);
  }

  const requestPayload = buildChatCompletionsPayload(payload);

  try {
    return await axios.post(
      getOpenAIEndpoint(),
      requestPayload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 90000,
      },
    );
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const providerMessage = err.response?.data?.error?.message || err.response?.data?.message || JSON.stringify(err.response?.data);
      throw new Error(`OpenAI ${status || 'request'} error (${requestPayload.model}): ${providerMessage || err.message}`);
    }
    throw err;
  }
}

function buildChatCompletionsPayload(input: Record<string, any>): Record<string, any> {
  const { maxTokens, ...payload } = input;
  const model = String(payload.model || '');

  if (usesCompletionTokens(model)) {
    payload.max_completion_tokens = maxTokens ?? payload.max_completion_tokens ?? payload.max_tokens ?? 2048;
    delete payload.max_tokens;
    delete payload.temperature;
  } else if (maxTokens !== undefined) {
    payload.max_tokens = maxTokens;
  }

  return payload;
}

function usesCompletionTokens(model: string): boolean {
  return /^gpt-5(\.|-|$)/.test(model) || /^o\d/.test(model);
}

function isResponsesOnlyModel(model: string): boolean {
  return /^gpt-5-pro($|-)/.test(model) || /^gpt-5\.\d+-pro($|-)/.test(model);
}

function normalizeImageUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) return trimmed;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && trimmed.length > 100) {
    return `data:image/jpeg;base64,${trimmed.replace(/\s/g, '')}`;
  }
  return trimmed;
}
