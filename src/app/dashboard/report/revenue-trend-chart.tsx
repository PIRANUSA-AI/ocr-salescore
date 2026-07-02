'use client';
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { HelpCircle } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


interface RevenueTrendChartProps {
    data: { name: string; revenue: number }[];
}

const formatCurrency = (value: number) => {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} Miliar`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Juta`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} Ribu`;
  return value.toString();
};

export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
    return (
        <>
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div>
                        <CardTitle>Tren Pendapatan (6 Bulan Terakhir)</CardTitle>
                        <CardDescription>Total pendapatan dari deal yang dimenangkan setiap bulan.</CardDescription>
                    </div>
                     <TooltipProvider>
                        <UITooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Grafik ini melacak total nilai deal berstatus 'Won' <br /> selama enam bulan terakhir untuk melihat tren pertumbuhan.</p>
                            </TooltipContent>
                        </UITooltip>
                    </TooltipProvider>
                </div>
            </CardHeader>
            <div className="p-4 pt-0">
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                        <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={formatCurrency} />
                        <Tooltip
                            contentStyle={{
                                background: "hsl(var(--background))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "var(--radius)",
                            }}
                            labelStyle={{ color: "hsl(var(--foreground))" }}
                            formatter={(value: number) => [new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(value), "Pendapatan"]}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#colorRevenue)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </>
    );
}
