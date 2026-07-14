'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import type { SalesHomeLead } from '@/app/actions/sales-home';

interface Props {
    leads: SalesHomeLead[];
    salesName: string;
}

const formatCurrency = (v: number | null | undefined) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v || 0);

const safeFileName = (s: string) => s.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');

export function SalesExportButton({ leads, salesName }: Props) {
    const [loading, setLoading] = useState<null | 'excel' | 'pdf'>(null);
    const { toast } = useToast();

    if (leads.length === 0) return null;

    const handleExcel = () => {
        setLoading('excel');
        try {
            const data = leads.map((l) => {
                const c = l.customer;
                return {
                    Nama: c.name,
                    Email: c.email,
                    Telepon: c.phone,
                    Perusahaan: c.company,
                    Jabatan: c.jobTitle,
                    Stage: c.pipelineStatus,
                    'Potensi Revenue': c.potentialRevenue || 0,
                    Produk: c.products?.map((p) => p.name).join(', ') || '',
                    Sumber: c.acquisitionContext?.source || '',
                    Event: c.acquisitionContext?.eventName || '',
                    Prioritas: l.priority,
                    'Update Terakhir': l.daysSinceUpdate !== null ? `${l.daysSinceUpdate} hari lalu` : '',
                };
            });
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Leads');
            XLSX.writeFile(wb, `SalesCore_Leads_${safeFileName(salesName)}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
            toast({ title: 'Export Berhasil', description: `${data.length} lead diekspor ke Excel.` });
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'Export Gagal', description: 'Terjadi kesalahan saat export Excel.' });
        } finally {
            setLoading(null);
        }
    };

    const handlePDF = () => {
        setLoading('pdf');
        try {
            const doc = new jsPDF();
            const totalValue = leads.reduce((s, l) => s + (l.customer.potentialRevenue || 0), 0);

            const stageGroups: Record<string, { count: number; value: number }> = {};
            leads.forEach((l) => {
                const st = l.customer.pipelineStatus;
                if (!stageGroups[st]) stageGroups[st] = { count: 0, value: 0 };
                stageGroups[st].count++;
                stageGroups[st].value += l.customer.potentialRevenue || 0;
            });

            doc.setFontSize(16);
            doc.text(`Pipeline Report \u2014 ${salesName}`, 14, 18);
            doc.setFontSize(9);
            doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')} \u00b7 ${leads.length} lead aktif`, 14, 25);

            autoTable(doc, {
                startY: 32,
                head: [['Ringkasan', 'Nilai']],
                body: [
                    ['Total Active Leads', leads.length.toString()],
                    ['Total Potensi Revenue', formatCurrency(totalValue)],
                    ['Stage Berbeda', Object.keys(stageGroups).length.toString()],
                ],
                theme: 'grid',
                headStyles: { fillColor: [41, 128, 185] },
            });

            autoTable(doc, {
                startY: (doc as any).lastAutoTable.finalY + 10,
                head: [['Stage', 'Jumlah', 'Potensi Revenue']],
                body: Object.entries(stageGroups).map(([s, d]) => [s, d.count.toString(), formatCurrency(d.value)]),
                theme: 'striped',
                headStyles: { fillColor: [52, 73, 94] },
            });

            const topOps = [...leads]
                .sort((a, b) => (b.customer.potentialRevenue || 0) - (a.customer.potentialRevenue || 0))
                .slice(0, 10);
            autoTable(doc, {
                startY: (doc as any).lastAutoTable.finalY + 10,
                head: [['Top 10 Opportunities', 'Perusahaan', 'Stage', 'Potensi Revenue']],
                body: topOps.map((l) => [
                    l.customer.name,
                    l.customer.company || '-',
                    l.customer.pipelineStatus,
                    formatCurrency(l.customer.potentialRevenue),
                ]),
                theme: 'striped',
                headStyles: { fillColor: [39, 174, 96] },
            });

            doc.save(`SalesCore_Report_${safeFileName(salesName)}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
            toast({ title: 'PDF Berhasil', description: 'Laporan PDF didownload.' });
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'PDF Gagal', description: 'Terjadi kesalahan saat membuat PDF.' });
        } finally {
            setLoading(null);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={loading !== null}>
                    {loading !== null ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                        <Download className="h-4 w-4 mr-2" />
                    )}
                    Export
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExcel} disabled={loading !== null}>
                    <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
                    Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePDF} disabled={loading !== null}>
                    <FileText className="mr-2 h-4 w-4 text-red-600" />
                    Laporan PDF (.pdf)
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
