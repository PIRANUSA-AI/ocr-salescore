'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getReportData, type ReportData } from '@/app/actions/report';
import { Loader2, Users, UserPlus, DollarSign, TrendingUp } from 'lucide-react';
import { MetricCard } from '@/components/ui/metric-card';
import { PageHeader } from '@/components/ui/page-header';
import { RevenueTrendChart } from './revenue-trend-chart';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { FadeIn } from '@/components/ui/fade-in';
import { AnalyticsExportButton } from '@/components/dashboard/analytics-export-button';
import { motion } from 'framer-motion';

const getInitials = (name: string) => {
  if (!name || name === 'Belum Ditugaskan') return '??';
  const names = name.split(' ');
  if (names.length > 1) return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 h-80 rounded-lg bg-muted" />
        <div className="h-80 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

export default function ReportPage() {
  const { userProfile } = useAuth();
  const [data, setData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile) {
      setIsLoading(true);
      getReportData(userProfile)
        .then(setData)
        .catch((err) => {
          console.error(err);
          setError('Gagal memuat data laporan.');
        })
        .finally(() => setIsLoading(false));
    }
  }, [userProfile]);

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  if (isLoading) return <Skeleton />;
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Tidak ada data untuk ditampilkan.</div>;

  const { stats, salesDistribution } = data;
  const totalCustomersForDistribution = salesDistribution.reduce((acc, curr) => acc + curr.customerCount, 0);

  const formatCurrency = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

  return (
    <FadeIn className="space-y-6">
      <PageHeader title="Laporan" description="Analisis kinerja tim dan kesehatan bisnis">
        <AnalyticsExportButton data={data} />
      </PageHeader>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          title="Total Pelanggan"
          value={stats.totalCustomers.toLocaleString('id-ID')}
          icon={<Users className="h-4 w-4" />}
          change={calculateChange(stats.totalCustomers, stats.totalCustomersLastMonth)}
          changeLabel="dari bulan lalu"
        />
        <MetricCard
          title="Pelanggan Baru (Hari Ini)"
          value={stats.newCustomersToday.toLocaleString('id-ID')}
          icon={<UserPlus className="h-4 w-4" />}
          change={calculateChange(stats.newCustomersToday, stats.newCustomersYesterday)}
          changeLabel="dari kemarin"
        />
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          icon={<DollarSign className="h-4 w-4" />}
          change={calculateChange(stats.totalRevenue, stats.totalRevenueLastMonth)}
          changeLabel="dari bulan lalu"
        />
        <MetricCard
          title="Deal Dimenangkan (Hari Ini)"
          value={stats.wonDealsToday.toLocaleString('id-ID')}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="grid grid-cols-1 gap-6 lg:grid-cols-3"
      >
        <div className="lg:col-span-2 rounded-lg border bg-card p-4 lg:p-6">
          <RevenueTrendChart data={data.revenueTrend} />
        </div>

        <div className="rounded-lg border bg-card p-4 lg:p-6">
          <h3 className="text-sm font-semibold">Distribusi Pelanggan</h3>
          <p className="mt-1 text-xs text-muted-foreground">Jumlah pelanggan per anggota tim sales.</p>
          <div className="mt-4 space-y-3">
            {salesDistribution.length > 0 ? salesDistribution.map((sales, i) => {
              const percentage = totalCustomersForDistribution > 0 ? (sales.customerCount / totalCustomersForDistribution) * 100 : 0;
              return (
                <motion.div
                  key={sales.salesId || 'unassigned'}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[10px]">{getInitials(sales.salesName)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{sales.salesName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{sales.customerCount}</span>
                  </div>
                  <Progress value={percentage} className="h-1.5" />
                </motion.div>
              );
            }) : (
              <p className="py-4 text-center text-sm text-muted-foreground">Tidak ada data.</p>
            )}
          </div>
        </div>
      </motion.div>
    </FadeIn>
  );
}
