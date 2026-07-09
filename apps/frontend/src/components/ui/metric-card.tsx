import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string;
  icon?: React.ReactNode;
  change?: number;
  changeLabel?: string;
  className?: string;
}

export function MetricCard({ title, value, icon, change, changeLabel, className }: MetricCardProps) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-lg border bg-card p-4', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
      {typeof change === 'number' && (
        <div className="flex items-center gap-1 text-xs">
          <span className={cn('inline-flex items-center gap-0.5 font-medium', change >= 0 ? 'text-emerald-600' : 'text-red-600')}>
            {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(change).toFixed(1)}%
          </span>
          {changeLabel && <span className="text-muted-foreground">{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}
