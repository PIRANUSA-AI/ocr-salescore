'use client';

import type { OcrFunnelStage } from '@/app/actions/report';
import { cn } from '@/lib/utils';

interface Props {
  funnel: OcrFunnelStage[];
  totalOcr: number;
  conversionRate: number;
}

const stageColor = (status: string) => {
  if (status === 'Won') return 'bg-emerald-500';
  if (status === 'Lost') return 'bg-red-500';
  return 'bg-primary';
};

// Label singkat untuk stage panjang
const shortLabel = (status: string) => {
  if (status === 'Leads Generation 10%') return 'Leads Gen';
  if (status === 'Initial Quotation 20%') return 'Quotation';
  if (status === 'Valid Opportunity 30%') return 'Valid Opp';
  if (status === 'Product Demo 40%') return 'Demo';
  if (status === 'Budget & Time Frame 60%') return 'Budget';
  if (status === 'Negotiation & Waiting PO 80%') return 'Negotiation';
  return status;
};

export function OcrFunnel({ funnel, totalOcr, conversionRate }: Props) {
  const maxCount = Math.max(1, ...funnel.map((f) => f.count));

  if (totalOcr === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Belum ada leads OCR pada periode ini.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">Conversion rate (Won)</span>
        <span className="text-lg font-semibold text-emerald-600">{conversionRate.toFixed(1)}%</span>
      </div>

      <div className="space-y-2">
        {funnel.map((stage) => {
          const pct = totalOcr > 0 ? (stage.count / totalOcr) * 100 : 0;
          const widthPct = (stage.count / maxCount) * 100;
          return (
            <div key={stage.status} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground/80">{shortLabel(stage.status)}</span>
                <span className="text-muted-foreground tabular-nums">
                  {stage.count} <span className="text-muted-foreground/70">({pct.toFixed(0)}%)</span>
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', stageColor(stage.status))}
                  style={{ width: `${Math.max(widthPct, stage.count > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
