'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { exportCustomersToExcel, generatePipelineReportData } from '@/app/actions/export-actions';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ExportButtonProps {
    team?: 'AEC' | 'MFG';
    className?: string;
    iconOnly?: boolean;
}

export function ExportButton({ team, className, iconOnly = false }: ExportButtonProps) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleExportExcel = async () => {
        setLoading(true);
        try {
            const result = await exportCustomersToExcel({ team });
            if (result.success && result.data) {
                const worksheet = XLSX.utils.json_to_sheet(result.data);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");

                const fileName = `SalesCore_Customers_${team || 'All'}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
                XLSX.writeFile(workbook, fileName);

                toast({ title: "Export Berhasil", description: "File Excel berhasil didownload." });
            }
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Export Gagal", description: "Terjadi kesalahan saat export Excel." });
        } finally {
            setLoading(false);
        }
    };

    const handleExportPDF = async () => {
        setLoading(true);
        try {
            const result = await generatePipelineReportData(team);
            if (result.success && result.report) {
                const doc = new jsPDF();
                const report = result.report;

                // Header
                doc.setFontSize(18);
                doc.text(`Pipeline Report - ${report.team} Team`, 14, 20);

                doc.setFontSize(10);
                doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 28);

                // Summary Stats
                doc.setFontSize(12);
                doc.text("Executive Summary", 14, 40);

                const summaryData = [
                    ['Total Customers', report.summary.totalCustomers.toString()],
                    ['Total Value', new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(report.summary.totalValue)],
                    ['Won Deals', report.summary.wonDeals.toString()],
                    ['Won Value', new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(report.summary.wonValue)],
                    ['Conversion Rate', `${report.summary.conversionRate}%`],
                ];

                autoTable(doc, {
                    startY: 45,
                    head: [['Metric', 'Value']],
                    body: summaryData,
                    theme: 'grid',
                    headStyles: { fillColor: [41, 128, 185] },
                });

                // Pipeline Breakdown
                doc.text("Pipeline Breakdown", 14, (doc as any).lastAutoTable.finalY + 15);

                const pipelineData = Object.entries(report.pipelineBreakdown).map(([stage, data]) => [
                    stage,
                    data.count,
                    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(data.value),
                    data.customers.slice(0, 5).join(', ') + (data.customers.length > 5 ? '...' : '')
                ]);

                autoTable(doc, {
                    startY: (doc as any).lastAutoTable.finalY + 20,
                    head: [['Stage', 'Count', 'Value', 'Top Customers']],
                    body: pipelineData,
                    theme: 'striped',
                    headStyles: { fillColor: [52, 73, 94] },
                });

                doc.save(`SalesCore_Report_${team || 'All'}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
                toast({ title: "Report Berhasil", description: "Laporan PDF berhasil didownload." });
            }
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Generate Report Gagal", description: "Terjadi kesalahan saat membuat PDF." });
        } finally {
            setLoading(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size={iconOnly ? "icon" : "default"} className={className} disabled={loading}>
                    {loading ? (
                        <Loader2 className={cn("h-4 w-4 animate-spin", !iconOnly && "mr-2")} />
                    ) : (
                        <Download className={cn("h-4 w-4", !iconOnly && "mr-2")} />
                    )}
                    {!iconOnly && 'Export Data'}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportExcel}>
                    <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
                    Export Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF}>
                    <FileText className="mr-2 h-4 w-4 text-red-600" />
                    Laporan PDF (.pdf)
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
