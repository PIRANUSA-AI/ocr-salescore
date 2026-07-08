'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { Customer, PipelineStatus } from '@/types';
import { getSalesUsers } from './user';

/**
 * Export customers to Excel format (returns JSON for client-side processing)
 */
export async function exportCustomersToExcel(filters?: {
    team?: 'AEC' | 'MFG';
    salesId?: string;
    pipelineStatus?: PipelineStatus;
}) {
    console.log('[Action: exportCustomersToExcel] Generating export data...');

    try {
        let query = adminDb.collection('customers').orderBy('createdAt', 'desc');

        const snapshot = await query.get();

        const customers: Customer[] = [];
        snapshot.forEach(doc => {
            const data = doc.data() as Customer;

            // Apply filters
            if (filters?.team && data.team !== filters.team) return;
            if (filters?.salesId && data.assignedSalesId !== filters.salesId) return;
            if (filters?.pipelineStatus && data.pipelineStatus !== filters.pipelineStatus) return;

            customers.push({ ...data, id: doc.id });
        });

        const salesUsers = await getSalesUsers();
        const salesCodeByUid = new Map(salesUsers.map(s => [s.uid, s.salesCode || '']));

        // Transform to export format
        const exportData = customers.map(c => ({
            'Nama': c.name,
            'Email': c.email,
            'Telepon': c.phone,
            'Perusahaan': c.company,
            'Jabatan': c.jobTitle,
            'Tim': c.team,
            'Pipeline Status': c.pipelineStatus,
            'Sales': c.assignedSalesName || 'Belum Ditugaskan',
            'Kode Sales': (c.assignedSalesId && salesCodeByUid.get(c.assignedSalesId)) || '',
            'Potensi Revenue': c.potentialRevenue || 0,
            'Produk': c.products?.map(p => p.name).join(', ') || '',
            'Sumber': c.acquisitionContext.source,
            'Dibuat': c.createdAt,
            'Diupdate': c.updatedAt,
        }));

        console.log(`[Action: exportCustomersToExcel] Exported ${exportData.length} records`);
        return { success: true, data: exportData };
    } catch (error) {
        console.error('[Action: exportCustomersToExcel] Error:', error);
        throw new Error('Gagal mengekspor data pelanggan.');
    }
}

/**
 * Generate Pipeline Report data for PDF
 */
export async function generatePipelineReportData(team?: 'AEC' | 'MFG') {
    console.log('[Action: generatePipelineReportData] Generating report...');

    try {
        let query = adminDb.collection('customers').orderBy('pipelineStatus');
        const snapshot = await query.get();

        const customers: Customer[] = [];
        snapshot.forEach(doc => {
            const data = doc.data() as Customer;
            if (team && data.team !== team) return;
            customers.push({ ...data, id: doc.id });
        });

        // Group by pipeline status
        const pipelineGroups: Record<string, { count: number; value: number; customers: string[] }> = {};

        customers.forEach(c => {
            const status = c.pipelineStatus;
            if (!pipelineGroups[status]) {
                pipelineGroups[status] = { count: 0, value: 0, customers: [] };
            }
            pipelineGroups[status].count++;
            pipelineGroups[status].value += c.potentialRevenue || 0;
            pipelineGroups[status].customers.push(`${c.name} (${c.company})`);
        });

        // Summary stats
        const totalCustomers = customers.length;
        const totalValue = customers.reduce((sum, c) => sum + (c.potentialRevenue || 0), 0);
        const wonDeals = customers.filter(c => c.pipelineStatus === 'Won');
        const wonValue = wonDeals.reduce((sum, c) => sum + (c.potentialRevenue || 0), 0);

        return {
            success: true,
            report: {
                generatedAt: new Date().toISOString(),
                team: team || 'All',
                summary: {
                    totalCustomers,
                    totalValue,
                    wonDeals: wonDeals.length,
                    wonValue,
                    conversionRate: totalCustomers > 0
                        ? ((wonDeals.length / totalCustomers) * 100).toFixed(1)
                        : '0.0',
                },
                pipelineBreakdown: pipelineGroups,
            }
        };
    } catch (error) {
        console.error('[Action: generatePipelineReportData] Error:', error);
        throw new Error('Gagal membuat laporan pipeline.');
    }
}
