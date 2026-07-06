export type Confidence = 'high' | 'medium' | 'low' | 'empty';

export interface OcrField {
  value: string;
  alternatives: string[];
  confidence: Confidence;
}

export interface FormAnswer {
  question: string;
  answer: string;
}

export interface OcrResult {
  name: OcrField;
  company: OcrField;
  jobTitle: OcrField;
  division: OcrField;
  phone: OcrField;
  email: OcrField;
  softwareNeeds: OcrField;
  formAnswers?: FormAnswer[];
}

export const OCR_FIELDS: (keyof OcrResult)[] = [
  'name',
  'company',
  'jobTitle',
  'division',
  'phone',
  'email',
  'softwareNeeds',
];

export const OCR_FIELD_LABELS: Record<string, string> = {
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
  extract(imageDataUri: string, extraContext?: string): Promise<OcrResult>;
}

export const VALID_CONFIDENCE: Confidence[] = ['high', 'medium', 'low', 'empty'];
