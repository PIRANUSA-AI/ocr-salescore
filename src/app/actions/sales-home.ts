'use server';

import { getAssignedCustomers } from './sales';
import type { Customer, UserProfile } from '@/types';
import { categorizeLead, comparePriority, isLeadActive, type LeadPriority } from '@/lib/lead-scoring';

export interface SalesHomeLead {
    customer: Customer;
    priority: LeadPriority;
    daysSinceUpdate: number | null;
}

export interface SalesHomeData {
    leads: SalesHomeLead[];
    stats: {
        total: number;
        today: number;
        active: number;
        newCount: number;
        won: number;
    };
}

/**
 * Data Smart Home Sales: leads aktif dikategorikan berdasarkan aturan transparan.
 */
export async function getSalesHome(user: UserProfile): Promise<SalesHomeData> {
    console.log(`[Action: getSalesHome] Sales: ${user.name} (${user.uid})`);
    try {
        const all = await getAssignedCustomers(user.uid);
        const active = all.filter(isLeadActive);
        const wonCount = all.filter((c) => c.pipelineStatus === 'Won').length;

        const leads: SalesHomeLead[] = active.map((c) => {
            const meta = categorizeLead(c);
            return { customer: c, priority: meta.priority, daysSinceUpdate: meta.daysSinceUpdate };
        });
        leads.sort((a, b) => comparePriority(a, b));

        const stats = {
            total: all.length,
            today: leads.filter((l) => l.priority === 'today').length,
            active: leads.filter((l) => l.priority === 'active').length,
            newCount: leads.filter((l) => l.priority === 'new').length,
            won: wonCount,
        };

        console.log(`[Action: getSalesHome] SUKSES. active=${active.length}, today=${stats.today}, new=${stats.newCount}`);
        return { leads, stats };
    } catch (error) {
        console.error('[Action: getSalesHome] !!! ERROR !!!', error);
        throw error;
    }
}
