import type { Timestamp } from 'firebase-admin/firestore';
import type { WebinarAnalysisOutput } from "@/ai/flows/analyze-webinar-feedback";
import type { TopicRecommendation } from "@/ai/flows/recommend-next-topic";
import { z } from 'zod';

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
    "ZWCAD", "ZWCAD MFG", "ZW3D", "Archicad", "Sketchup",
    "D5 Render", "Chaos Vray", "Chaos Enscape", "Chaos Corona", "Eptar"
] as const;

export const SUBSCRIPTION_PRODUCTS = [
    "Archicad", "Sketchup", "D5 Render", "Chaos Vray", "Chaos Enscape", "Chaos Corona", "Eptar"
] as const;


export type ProductName = (typeof PRODUCT_LIST)[number];

export const CUSTOMER_SOURCES = [
    'Webinar', 'Excel', 'OCR', 'Reply Assistant', 'Pameran', 'Workshop', 'Visit', 'Training', 'Troubleshoot', 'Telepon Masuk', 'Rekomendasi', 'Lainnya'
] as const;

export const DEFAULT_EVENT_BY_TEAM: Record<'AEC' | 'MFG', string> = {
    AEC: 'IBT 2026',
    MFG: 'Manufacturing Surabaya 2026',
};

export const EVENT_OPTIONS = [
    'IBT 2026',
    'Manufacturing Surabaya 2026',
] as const;

export const EVENT_TO_TEAM: Record<string, 'AEC' | 'MFG'> = {
    [DEFAULT_EVENT_BY_TEAM.AEC]: 'AEC',
    [DEFAULT_EVENT_BY_TEAM.MFG]: 'MFG',
};

// Mapping event → tanggal per hari (YYYY-MM-DD).
// Index 0 = Day 1. Jumlah hari = panjang array.
export const EVENT_DAYS: Record<string, string[]> = {
    'IBT 2026': ['2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12'],
    'Manufacturing Surabaya 2026': ['2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19'],
};

// Date object untuk suatu tanggal "YYYY-MM-DD", di local noon (tahan timezone edge-case).
export function eventDayDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
}

// Index hari (0-based) untuk tanggal tertentu dalam event, atau -1 kalau di luar rentang.
export function getEventDayIndex(eventName: string, date: Date): number {
    const days = EVENT_DAYS[eventName];
    if (!days) return -1;
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return days.indexOf(iso);
}

// Default day index: selalu Day 1 (index 0). Tidak berpatokan tanggal — operator OCR yang menentukan manual.
export function getDefaultDayIndex(_eventName: string): number {
    return 0;
}

// Format panjang, mis. "Rabu, 8 Juli 2026".
export function formatEventDay(eventName: string, dayIndex: number): string {
    const days = EVENT_DAYS[eventName];
    if (!days || !days[dayIndex]) return '';
    return eventDayDate(days[dayIndex]).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Tanggal ISO untuk index hari tertentu (untuk disimpan ke acquisitionContext.eventDate).
export function eventDateForDay(eventName: string, dayIndex: number): Date {
    const days = EVENT_DAYS[eventName];
    const dateStr = days && days[dayIndex] ? days[dayIndex] : null;
    return dateStr ? eventDayDate(dateStr) : new Date();
}

export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];


export type Product = {
    id: string;
    name: ProductName;
    version: string;

    purchaseDate: string;
    quantity: number;
    renewalDate?: string;
};

// Company Intelligence Types
export type CompanyProfile = {
    id: string; // specialized ID (e.g. slugified name)
    name: string;
    website?: string;
    industry?: string;
    employeeCount?: string; // Estimated range
    address?: string;

    // AI Analysis Results
    techStack: string[]; // e.g., ["AutoCAD", "SketchUp"]
    potentialTier: 'Enterprise' | 'SMB' | 'Startup';
    keyProjects: string[]; // Extracted from news/portfolio
    lastAnalysisDate: string; // ISO Date
    summary: string;     // Short AI summary
    riskAssessment?: string; // e.g. "Low Risk - Stable history"

    // Relations (Computed on fetch)
    relatedCustomerIds?: string[];
};


// This is the rich history item for the Communication Generator
export type GenerationHistoryItem = {
    generationSource: 'AI Assistant' | 'Reply Assistant';
    type: 'whatsapp' | 'email';
    userInput: {
        mode: 'text' | 'image';
        text: string;
        context: string;
    };
    conversationContext: string;
    recommendations: string[];
    createdAt: string;
};


// Definisi baru untuk catatan agar lebih terstruktur
export type CustomerNoteHistoryItem = {
    text: string;
    createdAt: string;
};

export type CustomerNotes = {
    manual?: string;
    webinar?: CustomerNoteHistoryItem[];
    replyAssistant?: CustomerNoteHistoryItem[];
};

export type FormAnswer = {
    question: string;
    answer: string;
};

// New Acquisition Context Object
export type AcquisitionContext = {
    source: CustomerSource;
    eventName: string;
    eventDate: string; // ISO Date string
};

export type Customer = {
    id: string;
    name: string;
    email: string;
    phone: string;
    company: string;
    jobTitle: string;
    team: 'AEC' | 'MFG';
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
    role: 'Leader' | 'Sales' | 'Superadmin';
    team: 'AEC' | 'MFG';
    secondaryTeam?: 'AEC' | 'MFG' | null;
    photoURL?: string;
    salesCode?: string | null;
};

export type Sales = {
    id: string;
    name: string;
    team: 'AEC' | 'MFG';
}

// "Task to Do" feature — backed by MySQL (not Firebase).
export type UserTask = {
    id: number;
    userId: string;
    userName: string;
    title: string;
    description: string | null;
    status: 'todo' | 'done';
    priority: 'low' | 'medium' | 'high';
    source: 'self' | 'leader' | 'ai';
    assignedById: string | null;
    assignedByName: string | null;
    dueDate: string | null; // YYYY-MM-DD
    createdAt: string;
    updatedAt: string;
};

export type TeamMember = {
    id: string;
    name: string;
    email: string | null;
    role: 'Leader' | 'Sales' | 'Superadmin';
    team: 'AEC' | 'MFG';
    salesCode: string | null;
    leaderId: string | null;
};

// This is now a dynamic record to hold any data extracted from the CSV
export type ProspectData = {
    // We expect at least a name and company to identify the prospect
    name: string;
    company: string;
    // and the hook for the sales team
    hook_chat: string;

    // Plus any other dynamic properties from the CSV
    [key: string]: any;

    // Optional fields for assignment tracking
    assignedSalesId?: string;
    assignedSalesName?: string;
};


export type AnalysisHistoryEntry = {
    id: string;
    webinarTitle: string;
    webinarDate: string;
    createdAt: string;
    prospects: ProspectData[];
    analysis: {
        insights?: WebinarAnalysisOutput; // Now optional
        topicRecommendation: TopicRecommendation | null;
    };
    topicsGenerated: boolean;
    insightsGenerated: boolean;
}

export type ActivityLog = {
    id: string;
    actorId: string;
    actorName: string;
    action: string; // e.g., "mengubah status pipeline Huday Fathur Rahman menjadi Kebutuhan Terkonfirmasi"
    targetId: string; // customerId
    targetName: string; // customerName
    createdAt: string; // ISO String
}

export type WebinarTask = {
    customerId: string;
    customerName: string;
    customerCompany: string;
    assignedSalesId: string | null;
    webinarTitle: string;
};

export type RenewalTask = {
    customerId: string;
    customerName: string;
    customerCompany: string;
    assignedSalesId: string | null;
    productId: string;
    productName: ProductName;
    daysRemaining: number;
};

export type AftersalesTask = {
    customerId: string;
    customerName: string;
    customerCompany: string;
    assignedSalesId: string | null;
    productId: string;
    productName: ProductName;
    purchaseDate: string;
};

export type OpportunityTask = {
    id: string;
    customerId: string;
    customerName: string;
    customerCompany: string;
    assignedSalesId: string | null;
    assignedSalesName: string | null;
    triggeringProduct: ProductName;
    recommendedProduct: ProductName;
    reason: string;
};

export type UpdateTask = {
    customerId: string;
    customerName: string;
    customerCompany: string;
    assignedSalesId: string | null;
    productId: string;
    productName: ProductName;
    currentVersion: string;
}

export type FollowUpTasks = {
    webinar: WebinarTask[];
    renewal: RenewalTask[];
    aftersales: AftersalesTask[];
    update: UpdateTask[];
    opportunity: OpportunityTask[];
}

export type FeatureFlag = {
    id: 'webinar' | 'renewal' | 'aftersales' | 'opportunity' | 'update';
    name: string;
    description: string;
    isEnabled: boolean;
};

export type MediaAsset = {
    id: string;
    assetName: string;
    fileName: string;
    imageUrl: string;
    uploadedBy: {
        uid: string;
        name: string;
    };
    createdAt: string; // ISO string
    tags: string[];
};


export type { TopicRecommendation } from '@/ai/flows/recommend-next-topic';
export type { WebinarAnalysisOutput } from '@/ai/flows/analyze-webinar-feedback';
export type { OcrFormResult } from '@/ai/flows/extract-customer-from-form';
export type { GenerateWhatsappReplyOutput, GenerateWhatsappReplyInput } from '@/ai/flows/generate-whatsapp-reply-flow';

// Add new type for Sales Distribution
export type SalesDistribution = {
    salesId: string | null;
    salesName: string;
    customerCount: number;
};

export type Notification = {
    id: string;
    userId: string; // The user who *receives* the notification
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'deal_won' | 'assignment';
    isRead: boolean;
    createdAt: string; // ISO String
    link?: string; // Optional link to navigate to
    relatedId?: string; // ID of the related entity (e.g. customerId)
};