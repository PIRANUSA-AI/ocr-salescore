'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import type { OcrReportData } from '@/lib/report-types';

interface Props {
  ocrData: OcrReportData;
  periodeLabel: string;
  timLabel: string;
  excelTeam?: 'AEC' | 'MFG';
}

const currency = (v: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

export function OcrReportExport({ ocrData, periodeLabel, timLabel, excelTeam }: Props) {
  const [loading, setLoading] = useState<'pdf' | 'excel' | null>(null);
  const { toast } = useToast();

  const handleExportPDF = async () => {
    setLoading('pdf');
    try {
      const doc = new jsPDF();
      const dateStr = format(new Date(), 'dd MMMM yyyy HH:mm');

      // Header
      doc.setFontSize(18);
      doc.text('Laporan Aktivitas OCR', 14, 18);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Dibuat: ${dateStr}`, 14, 25);
      doc.text(`Periode: ${periodeLabel}   |   Tim: ${timLabel}`, 14, 30);
      doc.setTextColor(0);

      // 1. Ringkasan KPI
      doc.setFontSize(12);
      doc.setTextColor(44, 62, 80);
      doc.text('Ringkasan', 14, 40);
      const statsBody = [
        ['Total Leads OCR', ocrData.stats.totalOcr.toString()],
        ['Baru Hari Ini', ocrData.stats.newToday.toString()],
        ['Belum Di-assign', ocrData.stats.unassigned.toString()],
        ['Won', ocrData.stats.won.toString()],
        ['Conversion Rate', `${ocrData.stats.conversionRate.toFixed(1)}%`],
      ];
      autoTable(doc, {
        startY: 43,
        head: [['Metric', 'Nilai']],
        body: statsBody,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 0: { cellWidth: 80 } },
      });

      // 2. Distribusi per Sales
      let y = (doc as any).lastAutoTable.finalY + 12;
      doc.setFontSize(12);
      doc.setTextColor(44, 62, 80);
      doc.text('Distribusi per Sales', 14, y);
      const salesBody = ocrData.perSales.map((r) => [
        r.salesName,
        r.total.toString(),
        r.newToday.toString(),
        r.won.toString(),
        `${r.conversionRate.toFixed(0)}%`,
        currency(r.potentialRevenue),
      ]);
      autoTable(doc, {
        startY: y + 3,
        head: [['Sales', 'Total', 'Baru Hr Ini', 'Won', 'Konversi', 'Potensi Revenue']],
        body: salesBody,
        theme: 'grid',
        headStyles: { fillColor: [142, 68, 173], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
      });

      // 3. Funnel Konversi
      y = (doc as any).lastAutoTable.finalY + 12;
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(12);
      doc.setTextColor(44, 62, 80);
      doc.text('Funnel Konversi', 14, y);
      const funnelBody = ocrData.funnel.map((f) => {
        const pct = ocrData.stats.totalOcr > 0 ? (f.count / ocrData.stats.totalOcr) * 100 : 0;
        return [f.status, f.count.toString(), `${pct.toFixed(0)}%`];
      });
      autoTable(doc, {
        startY: y + 3,
        head: [['Stage Pipeline', 'Jumlah', '% dari Total']],
        body: funnelBody,
        theme: 'striped',
        headStyles: { fillColor: [39, 174, 96], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
      });

      // 4. Kualitas Data
      y = (doc as any).lastAutoTable.finalY + 12;
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(12);
      doc.setTextColor(44, 62, 80);
      doc.text('Kualitas Data OCR', 14, y);
      const q = ocrData.quality;
      const pctOf = (n: number) => (q.total > 0 ? `${((n / q.total) * 100).toFixed(0)}%` : '0%');
      const qualityBody = [
        ['Tanpa Email', q.noEmail.toString(), pctOf(q.noEmail)],
        ['Tanpa Telepon', q.noPhone.toString(), pctOf(q.noPhone)],
        ['Email Invalid', q.invalidEmail.toString(), pctOf(q.invalidEmail)],
      ];
      autoTable(doc, {
        startY: y + 3,
        head: [['Indikator', 'Jumlah', '% dari Total']],
        body: qualityBody,
        theme: 'striped',
        headStyles: { fillColor: [192, 57, 43], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
      });

      // Footer page numbers
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Halaman ${i} dari ${pageCount}`, 196, 290, { align: 'right' });
        doc.text('SalesCore - Laporan OCR', 14, 290);
      }

      doc.save(`Laporan_OCR_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'PDF Berhasil', description: 'Laporan OCR berhasil didownload.' });
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Export Gagal', description: 'Gagal membuat PDF.' });
    } finally {
      setLoading(null);
    }
  };

  const handleExportExcel = async () => {
    setLoading('excel');
    try {
      const result = await api.exports.customersToExcel({ team: excelTeam });
      if (!result.success || !result.data || result.data.length === 0) {
        toast({ variant: 'destructive', title: 'Export Gagal', description: 'Tidak ada data untuk diekspor.' });
        return;
      }
      const worksheet = XLSX.utils.json_to_sheet(result.data);
      // Set lebar kolom agar rapi
      worksheet['!cols'] = [
        { wch: 24 }, // Nama
        { wch: 28 }, // Email
        { wch: 18 }, // Telepon
        { wch: 22 }, // Perusahaan
        { wch: 18 }, // Jabatan
        { wch: 8 },  // Tim
        { wch: 26 }, // Pipeline Status
        { wch: 20 }, // Sales
        { wch: 12 }, // Kode Sales
        { wch: 16 }, // Potensi Revenue
        { wch: 26 }, // Produk
        { wch: 12 }, // Sumber
        { wch: 20 }, // Dibuat
        { wch: 20 }, // Diupdate
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
      const fileName = `SalesCore_Customers_${excelTeam || 'All'}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast({ title: 'Excel Berhasil', description: `${result.data.length} data customer berhasil didownload.` });
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Export Gagal', description: 'Terjadi kesalahan saat export Excel.' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button onClick={handleExportPDF} disabled={loading !== null} variant="outline" size="sm">
        {loading === 'pdf' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4 text-red-600" />}
        Export PDF
      </Button>
      <Button onClick={handleExportExcel} disabled={loading !== null} variant="outline" size="sm">
        {loading === 'excel' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />}
        Export Excel
      </Button>
    </div>
  );
}
