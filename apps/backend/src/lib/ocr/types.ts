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
  address: OcrField;
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
  'address',
];

export const OCR_FIELD_LABELS: Record<string, string> = {
  name: 'Nama',
  company: 'Perusahaan',
  jobTitle: 'Jabatan',
  division: 'Divisi',
  phone: 'No. Telepon',
  email: 'Email',
  softwareNeeds: 'Kebutuhan Software',
  address: 'Alamat',
};

export type FormTeam = 'AEC' | 'MFG';

export interface OcrProvider {
  name: string;
  extract(imageDataUri: string, extraContext?: string, team?: FormTeam): Promise<OcrResult>;
}

export const VALID_CONFIDENCE: Confidence[] = ['high', 'medium', 'low', 'empty'];
