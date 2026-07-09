'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api-client';
import type { OcrReportData, OcrTimeRange, OcrTeamFilter } from '@/lib/report-types';
import { Loader2, ScanLine, Zap, UserX, Trophy } from 'lucide-react';
import { MetricCard } from '@/components/ui/metric-card';
import { PageHeader } from '@/components/ui/page-header';
import { OcrSalesRanking } from './ocr-sales-ranking';
import { OcrFunnel } from './ocr-funnel';
import { OcrDataQuality } from './ocr-data-quality';
import { OcrReportExport } from './ocr-report-export';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FadeIn } from '@/components/ui/fade-in';
import { cn } from '@/lib/utils';

const RANGE_OPTIONS: { value: OcrTimeRange; label: string }[] = [
  { value: 'today', label: 'Hari Ini' },
  { value: '7d', label: '7 Hari' },
  { value: '30d', label: '30 Hari' },
  { value: 'all', label: 'Semua' },
];

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 h-80 rounded-lg bg-muted" />
        <div className="h-80 rounded-lg bg-muted" />
        <div className="h-80 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

export default function ReportPage() {
  const { userProfile } = useAuth();
  const isSuperadmin = userProfile?.role === 'Superadmin';
  const [ocrRange, setOcrRange] = useState<OcrTimeRange>('30d');
  const [ocrTeam, setOcrTeam] = useState<OcrTeamFilter>('all');
  const [ocrData, setOcrData] = useState<OcrReportData | null>(null);
  const [ocrLoading, setOcrLoading] = useState(true);

  useEffect(() => {
    if (!userProfile) return;
    setOcrLoading(true);
    const team = userProfile.role === 'Leader' ? userProfile.team : ocrTeam;
    api.reports.ocr({ range: ocrRange, team })
      .then((res) => setOcrData(res.report as OcrReportData))
      .catch((err) => {
        console.error('[OCR Report]', err);
        setOcrData(null);
      })
      .finally(() => setOcrLoading(false));
  }, [userProfile, ocrRange, ocrTeam]);

  if (ocrLoading && !ocrData) return <Skeleton />;
  if (!ocrData) {
    return <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Gagal memuat data laporan.</div>;
  }

  // Label & param untuk export
  const periodeLabel = RANGE_OPTIONS.find((o) => o.value === ocrRange)?.label || ocrRange;
  const timLabel =
    userProfile?.role === 'Leader'
      ? `Tim ${userProfile.team}`
      : ocrTeam === 'all'
      ? 'Semua Tim'
      : `Tim ${ocrTeam}`;
  const excelTeam: 'AEC' | 'MFG' | undefined =
    userProfile?.role === 'Leader' ? userProfile.team : ocrTeam === 'all' ? undefined : ocrTeam;

  return (
    <FadeIn className="space-y-6">
      <PageHeader title="Laporan" description="Aktivitas & performa leads hasil scan OCR">
        <OcrReportExport ocrData={ocrData} periodeLabel={periodeLabel} timLabel={timLabel} excelTeam={excelTeam} />
      </PageHeader>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center rounded-lg border bg-card p-0.5 w-fit">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setOcrRange(opt.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                ocrRange === opt.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {ocrLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {isSuperadmin && (
            <Select value={ocrTeam} onValueChange={(v) => setOcrTeam(v as OcrTeamFilter)}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tim</SelectItem>
                <SelectItem value="AEC">Tim AEC</SelectItem>
                <SelectItem value="MFG">Tim MFG</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* OCR KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          title="Total Leads OCR"
          value={ocrData.stats.totalOcr.toLocaleString('id-ID')}
          icon={<ScanLine className="h-4 w-4" />}
        />
        <MetricCard
          title="Baru Hari Ini"
          value={ocrData.stats.newToday.toLocaleString('id-ID')}
          icon={<Zap className="h-4 w-4" />}
        />
        <MetricCard
          title="Belum Di-assign"
          value={ocrData.stats.unassigned.toLocaleString('id-ID')}
          icon={<UserX className="h-4 w-4" />}
        />
        <MetricCard
          title="Won (Konversi)"
          value={`${ocrData.stats.won} (${ocrData.stats.conversionRate.toFixed(0)}%)`}
          icon={<Trophy className="h-4 w-4" />}
        />
      </div>

      {/* Blocks */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 lg:p-6">
          <h3 className="text-sm font-semibold">Distribusi per Sales</h3>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">Ranking leads OCR per sales rep (periode terpilih).</p>
          <OcrSalesRanking rows={ocrData.perSales} />
        </div>
        <div className="rounded-lg border bg-card p-4 lg:p-6">
          <h3 className="text-sm font-semibold">Funnel Konversi</h3>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">Sebaran leads OCR per stage pipeline.</p>
          <OcrFunnel
            funnel={ocrData.funnel}
            totalOcr={ocrData.stats.totalOcr}
            conversionRate={ocrData.stats.conversionRate}
          />
        </div>
        <div className="rounded-lg border bg-card p-4 lg:p-6">
          <h3 className="text-sm font-semibold">Kualitas Data OCR</h3>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">Data kosong/invalid dari hasil scan.</p>
          <OcrDataQuality quality={ocrData.quality} />
        </div>
      </div>
    </FadeIn>
  );
}
