import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────
export const PIPELINE_STAGES = [
  'Leads Generation 10%',
  'Initial Quotation 20%',
  'Valid Opportunity 30%',
  'Product Demo 40%',
  'Budget & Time Frame 60%',
  'Negotiation & Waiting PO 80%',
  'Won',
  'Lost',
] as const;

export type PipelineStatus = (typeof PIPELINE_STAGES)[number];

export const PRODUCT_LIST = [
  'ZWCAD', 'ZWCAD MFG', 'ZW3D', 'Archicad', 'Sketchup',
  'D5 Render', 'Chaos Vray', 'Chaos Enscape', 'Chaos Corona', 'Eptar',
] as const;

export type ProductName = (typeof PRODUCT_LIST)[number];

export const CUSTOMER_SOURCES = [
  'Webinar', 'Excel', 'OCR', 'Reply Assistant', 'Pameran',
  'Workshop', 'Visit', 'Training', 'Troubleshoot', 'Telepon Masuk',
  'Rekomendasi', 'Lainnya',
] as const;

export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];

export type UserRole = 'Leader' | 'Sales' | 'Superadmin';
export type Team = 'AEC' | 'MFG';

// ─── Domain Types ─────────────────────────────────────
export type Product = {
  id: string;
  name: ProductName;
  version: string;
  purchaseDate: string;
  quantity: number;
  renewalDate?: string;
};

export type FormAnswer = {
  question: string;
  answer: string;
};

export type AcquisitionContext = {
  source: CustomerSource;
  eventName: string;
  eventDate: string;
};

export type CustomerNoteHistoryItem = {
  text: string;
  createdAt: string;
};

export type CustomerNotes = {
  manual?: string;
  webinar?: CustomerNoteHistoryItem[];
  replyAssistant?: CustomerNoteHistoryItem[];
};

export type GenerationHistoryItem = {
  generationSource: 'AI Assistant' | 'Reply Assistant';
  type: 'whatsapp' | 'email';
  userInput: { mode: 'text' | 'image'; text: string; context: string };
  conversationContext: string;
  recommendations: string[];
  createdAt: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  team: Team;
  products: Product[];
  assignedSalesId: string | null;
  assignedSalesName: string | null;
  pipelineStatus: PipelineStatus;
  acquisitionContext: AcquisitionContext;
  createdAt: string;
  updatedAt: string;
  webinarHistory: { webinarId: string; webinarTitle: string }[];
  potentialRevenue?: number;
  notes?: CustomerNotes;
  generationHistory?: GenerationHistoryItem[];
  formAnswers?: FormAnswer[];
  imageUrl?: string;
  imageKey?: string;
  address?: string;
};

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  team: Team;
  photoURL?: string;
  salesCode?: string | null;
};

export type ActivityLog = {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId: string;
  targetName: string;
  createdAt: string;
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'deal_won' | 'assignment';
  isRead: boolean;
  createdAt: string;
  link?: string;
  relatedId?: string;
};

export type MediaAsset = {
  id: string;
  assetName: string;
  fileName: string;
  imageUrl: string;
  uploadedBy: { uid: string; name: string };
  createdAt: string;
  tags: string[];
};

export type CompanyProfile = {
  id: string;
  name: string;
  website?: string;
  industry?: string;
  employeeCount?: string;
  address?: string;
  techStack: string[];
  potentialTier: 'Enterprise' | 'SMB' | 'Startup';
  keyProjects: string[];
  lastAnalysisDate: string;
  summary: string;
  riskAssessment?: string;
  relatedCustomerIds?: string[];
};

export type AnalysisHistoryEntry = {
  id: string;
  webinarTitle: string;
  webinarDate: string;
  createdAt: string;
  prospects: any[];
  analysis: { insights?: any; topicRecommendation: any | null };
  topicsGenerated: boolean;
  insightsGenerated: boolean;
};

export type EmailBlast = {
  id: string;
  subject: string;
  content: string;
  recipientFilter: Record<string, any>;
  sentCount: number;
  clickCount: number;
  status: 'draft' | 'sent';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type FeatureFlag = {
  id: 'webinar' | 'renewal' | 'aftersales' | 'opportunity' | 'update';
  name: string;
  description: string;
  isEnabled: boolean;
};

export type SystemQuota = {
  id: string;
  dailyUsed: number;
  monthlyUsed: number;
  lastResetDate: string;
};

// ─── Session ──────────────────────────────────────────
export type SessionPayload = {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  team: Team;
  photoURL?: string;
  salesCode?: string | null;
};
