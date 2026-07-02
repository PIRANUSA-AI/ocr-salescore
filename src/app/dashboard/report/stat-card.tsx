
'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle, TrendingUp, TrendingDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number;
  icon?: React.ReactNode;
  format?: 'currency' | 'percentage' | 'number';
  className?: string;
  description?: string;
  change?: number;
  changeLabel?: string;
}

const formatValue = (value: number, format: StatCardProps['format']) => {
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    case 'percentage':
      return `${value.toFixed(1)}%`;
    default:
      return value.toLocaleString('id-ID');
  }
};

export function StatCard({ title, value, icon, format = 'number', className, description, change, changeLabel }: StatCardProps) {
  const hasChange = typeof change === 'number' && isFinite(change);
  
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="flex flex-col flex-1 justify-end">
        <div className="text-2xl font-bold">{formatValue(value, format)}</div>
        <div className="flex justify-between items-end min-h-[1.25rem]">
            {hasChange ? (
                <p className="text-xs text-muted-foreground mt-1 flex items-center">
                    <span className={cn(
                        "font-semibold flex items-center mr-1",
                        change >= 0 ? "text-green-600" : "text-destructive"
                    )}>
                        {change >= 0 ? <TrendingUp className="h-4 w-4 mr-0.5"/> : <TrendingDown className="h-4 w-4 mr-0.5"/>}
                        {change.toFixed(1)}%
                    </span>
                     {changeLabel}
                </p>
            ) : <div/>} 
            {description && (
                <TooltipProvider>
                    <Tooltip>
                    <TooltipTrigger className="self-end">
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{description}</p>
                    </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
