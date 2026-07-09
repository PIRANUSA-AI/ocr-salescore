import type { Customer } from '@/types';

// ====== Kategori prioritas (transparan, berbasis aturan) ======
export type LeadPriority = 'today' | 'active' | 'new';

export interface PriorityMeta {
    priority: LeadPriority;
    daysSinceUpdate: number | null; // untuk ditampilkan "X hari lalu"
}

export interface PriorityConfig {
    label: string;
    dot: string; // tailwind bg untuk dot
    badge: string; // tailwind untuk badge
    desc: string;
}

export const PRIORITY_CONFIG: Record<LeadPriority, PriorityConfig> = {
    today: {
        label: 'Tindak Hari Ini',
        dot: 'bg-red-500',
        badge: 'bg-red-500/15 text-red-600',
        desc: 'Sudah lama diam, perlu ditutup, atau prioritas tinggi',
    },
    active: {
        label: 'Sedang Berjalan',
        dot: 'bg-amber-500',
        badge: 'bg-amber-500/15 text-amber-600',
        desc: 'Aktif di proses, masih dalam waktu normal',
    },
    new: {
        label: 'Lead Baru',
        dot: 'bg-sky-500',
        badge: 'bg-sky-500/15 text-sky-600',
        desc: 'Baru masuk, belum ada aktivitas',
    },
};

// urutan tampil: today dulu, lalu active, lalu new
export const PRIORITY_ORDER: LeadPriority[] = ['today', 'active', 'new'];

const toDateSafe = (v: any): Date | null => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const daysSince = (v: any): number | null => {
    const d = toDateSafe(v);
    if (!d) return null;
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
};

const STALE_DAYS = 7;

export function isLeadActive(c: Customer): boolean {
    return c.pipelineStatus !== 'Won' && c.pipelineStatus !== 'Lost';
}

const hasActivity = (c: Customer): boolean =>
    (!!c.notes?.manual && c.notes.manual.trim().length > 0) ||
    (!!c.generationHistory && c.generationHistory.length > 0);

const isHighPriority = (c: Customer): boolean => {
    const ans = c.formAnswers?.find((qa) => qa.question.toLowerCase().includes('prioritas'))?.answer?.toLowerCase();
    return ans === 'high';
};

/**
 * Kategorikan lead berdasarkan aturan transparan.
 * - today  : stale (>7 hari) ATAU stage negosiasi ATAU prioritas tinggi
 * - new    : belum ada aktivitas & umur <= 7 hari
 * - active : sisanya (sedang berjalan, dalam waktu normal)
 */
export function categorizeLead(c: Customer): PriorityMeta {
    const days = daysSince(c.updatedAt ?? c.createdAt);
    const stale = days !== null && days > STALE_DAYS;
    const closing = c.pipelineStatus === 'Negotiation & Waiting PO 80%';
    const young = days !== null && days <= STALE_DAYS;

    let priority: LeadPriority;
    if (stale || closing || isHighPriority(c)) {
        priority = 'today';
    } else if (!hasActivity(c) && young) {
        priority = 'new';
    } else {
        priority = 'active';
    }
    return { priority, daysSinceUpdate: days };
}

/** Comparator: urut by kategori (today→active→new), lalu within today paling lama di atas. */
export function comparePriority(a: PriorityMeta, b: PriorityMeta): number {
    const ai = PRIORITY_ORDER.indexOf(a.priority);
    const bi = PRIORITY_ORDER.indexOf(b.priority);
    if (ai !== bi) return ai - bi;
    // within 'today': paling lama (days terbesar) di atas; lainnya: terbaru (days terkecil) di atas
    if (a.priority === 'today') return (b.daysSinceUpdate ?? -1) - (a.daysSinceUpdate ?? -1);
    return (a.daysSinceUpdate ?? Infinity) - (b.daysSinceUpdate ?? Infinity);
}

export const formatWaLink = (phone: string | undefined | null): string => {
    if (!phone) return '#';
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
    else if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
    return `https://wa.me/${cleaned}`;
};
