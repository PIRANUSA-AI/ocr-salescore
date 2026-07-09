'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Crown, AlertTriangle } from 'lucide-react';
import type { OcrSalesRow } from '@/lib/report-types';

interface Props {
  rows: OcrSalesRow[];
}

const getInitials = (name: string) => {
  if (!name || name === 'Belum Ditugaskan') return '??';
  const names = name.split(' ');
  if (names.length > 1)
    return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

export function OcrSalesRanking({ rows }: Props) {
  const assignedRows = rows.filter((r) => r.salesId !== null);
  const unassignedRow = rows.find((r) => r.salesId === null);
  const maxTotal = Math.max(1, ...assignedRows.map((r) => r.total));

  // Terbanyak = urutan pertama (rows sudah di-sort desc). Terkecil = non-zero terakhir.
  const topId = assignedRows[0]?.salesId;
  const fewestRow = [...assignedRows].reverse().find((r) => r.total > 0);
  const fewestId = assignedRows.length > 1 ? fewestRow?.salesId : undefined;

  const renderRow = (row: OcrSalesRow, isUnassigned = false) => {
    const widthPct = isUnassigned ? 0 : (row.total / maxTotal) * 100;
    return (
      <div
        key={row.salesId || 'unassigned'}
        className={`space-y-1.5 ${isUnassigned ? 'pt-3 mt-3 border-t border-dashed' : ''}`}
      >
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarFallback className="text-[10px]">
                {getInitials(row.salesName)}
              </AvatarFallback>
            </Avatar>
            <span className={`truncate ${isUnassigned ? 'text-muted-foreground italic' : 'font-medium'}`}>
              {row.salesName}
            </span>
            {row.salesId === topId && row.total > 0 && (
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 shrink-0">
                <Crown className="h-3 w-3 mr-1" />Terbanyak
              </Badge>
            )}
            {row.salesId === fewestId && row.total > 0 && (
              <Badge variant="destructive" className="shrink-0">
                <AlertTriangle className="h-3 w-3 mr-1" />Paling sedikit
              </Badge>
            )}
          </div>
          <span className="font-semibold tabular-nums shrink-0">{row.total}</span>
        </div>

        {/* Bar */}
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${isUnassigned ? 'bg-muted-foreground/40' : 'bg-primary'}`}
            style={{ width: `${Math.max(widthPct, row.total > 0 ? 4 : 0)}%` }}
          />
        </div>

        {/* Sub-stats */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span>Baru hari ini: <span className="font-medium text-foreground/80">{row.newToday}</span></span>
            <span>Won: <span className="font-medium text-foreground/80">{row.won}</span></span>
            <span>Konversi: <span className="font-medium text-foreground/80">{row.conversionRate.toFixed(0)}%</span></span>
          </div>
          <span className="font-medium text-foreground/80 shrink-0">{formatCurrency(row.potentialRevenue)}</span>
        </div>
      </div>
    );
  };

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Belum ada leads OCR pada periode ini.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {assignedRows.map((r) => renderRow(r))}
      {unassignedRow && renderRow(unassignedRow, true)}
    </div>
  );
}
