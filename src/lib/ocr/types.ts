/**
 * Shared types for the OCR pipeline.
 * The pipeline runs a primary model (gpt-4.1) then optionally a second-opinion
 * fallback for fields the primary is unsure about.
 */

export type Confidence = 'high' | 'medium' | 'low' | 'empty';

export interface OcrField {
  /** Extracted text value, empty string when the field is not found. */
  value: string;
  /** Model's self-assessed confidence for this field. */
  confidence: Confidence;
}

export interface OcrResult {
  name: OcrField;
  company: OcrField;
  jobTitle: OcrField;
  division: OcrField;
  phone: OcrField;
  email: OcrField;
  softwareNeeds: OcrField;
}

/** Flat list of the 7 business-card / form fields, in stable order. */
export const OCR_FIELDS: (keyof OcrResult)[] = [
  'name',
  'company',
  'jobTitle',
  'division',
  'phone',
  'email',
  'softwareNeeds',
];

export const OCR_FIELD_LABELS: Record<keyof OcrResult, string> = {
  name: 'Nama',
  company: 'Perusahaan',
  jobTitle: 'Jabatan',
  division: 'Divisi',
  phone: 'No. Telepon',
  email: 'Email',
  softwareNeeds: 'Kebutuhan Software',
};

export interface OcrProvider {
  name: string;
  /** Extract the 7 fields from an image data URI. */
  extract(imageDataUri: string): Promise<OcrResult>;
}
