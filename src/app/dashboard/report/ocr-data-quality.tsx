'use client';

import type { OcrQualityReport } from '@/app/actions/report';
import { MailX, PhoneOff, MailWarning } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  quality: OcrQualityReport;
}

const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);

export function OcrDataQuality({ quality }: Props) {
  const { total, noEmail, noPhone, invalidEmail } = quality;

  const items = [
    {
      icon: MailX,
      label: 'Tanpa Email',
      count: noEmail,
      danger: pct(noEmail, total) >= 30,
    },
    {
      icon: PhoneOff,
      label: 'Tanpa Telepon',
      count: noPhone,
      danger: pct(noPhone, total) >= 30,
    },
    {
      icon: MailWarning,
      label: 'Email Invalid',
      count: invalidEmail,
      danger: pct(invalidEmail, total) >= 15,
    },
  ];

  if (total === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Belum ada leads OCR pada periode ini.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const percent = pct(item.count, total);
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-foreground/80">
                <item.icon className={cn('h-3.5 w-3.5', item.danger ? 'text-red-500' : 'text-muted-foreground')} />
                {item.label}
              </span>
              <span className={cn('tabular-nums', item.danger ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
                {item.count} <span className="opacity-70">({percent.toFixed(0)}%)</span>
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full', item.danger ? 'bg-red-500' : 'bg-amber-400')}
                style={{ width: `${Math.max(percent, item.count > 0 ? 4 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
