/**
 * @fileOverview DEPRECATED. Use extract-customer-from-form.ts instead.
 * This flow is no longer used as the system now relies on a more specific form extraction flow.
 */
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const CustomerOcrInputSchema = z.object({
  imageDataUri: z.string().describe("The customer document image (business card and/or form) as a data URI."),
});

const CustomerOcrResultSchema = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  rawText: z.string().optional(),
});
export type CustomerOcrResult = z.infer<typeof CustomerOcrResultSchema>;


export async function extractCustomerFromImage(input: z.infer<typeof CustomerOcrInputSchema>): Promise<CustomerOcrResult> {
  console.warn("[Flow: extractCustomerFromImage] This flow is deprecated and should not be used.");
  throw new Error("This OCR flow is deprecated. Please use extractCustomerFromForm for more accurate results.");
}
