// src/ai/genkit.ts
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("WARNING: GEMINI_API_KEY is not set. AI features will not work.");
}

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY!, // Prevent crash on init, will fail on use
    }),
  ],
  model: 'googleai/gemini-2.5-flash', // Corrected model version
});
