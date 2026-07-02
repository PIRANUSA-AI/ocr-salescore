
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getReportData, type ReportData } from '@/app/actions/report';
import { Loader2, Users, UserPlus, DollarSign, TrendingUp } from 'lucide-react';
import { StatCard } from './stat-card';
import { RevenueTrendChart } from './revenue-trend-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { FadeIn } from '@/components/ui/fade-in';
import { AnalyticsExportButton } from '@/components/dashboard/analytics-export-button';

const getInitials = (name: string) => {
  if (!name || name === 'Belum Ditugaskan') return '??';
  const names = name.split(' ');
  if (names.length > 1) {
    return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};


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
          setError('Gagal memuat data laporan. Silakan coba lagi nanti.');
        })
        .finally(() => setIsLoading(false));
    }
  }, [userProfile]);

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center text-destructive">{error}</div>;
  }

  if (!data) {
    return <div className="text-center text-muted-foreground">Tidak ada data untuk ditampilkan.</div>;
  }

  const { stats, salesDistribution } = data;
  const totalCustomersForDistribution = salesDistribution.reduce((acc, curr) => acc + curr.customerCount, 0);


  return (
    <FadeIn className="w-full space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">Analytics Report</h2>
        <AnalyticsExportButton data={data} />
      </div>
      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Pelanggan"
          value={stats.totalCustomers}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          change={calculateChange(stats.totalCustomers, stats.totalCustomersLastMonth)}
          changeLabel="dari bulan lalu"
          description="Jumlah total pelanggan yang terdaftar di dalam sistem untuk tim Anda."
        />
        <StatCard
          title="Pelanggan Baru (Hari Ini)"
          value={stats.newCustomersToday}
          icon={<UserPlus className="h-4 w-4 text-muted-foreground" />}
          change={calculateChange(stats.newCustomersToday, stats.newCustomersYesterday)}
          changeLabel="dari kemarin"
          description="Jumlah pelanggan baru yang ditambahkan dalam 24 jam terakhir."
        />
        <StatCard
          title="Total Revenue (Won)"
          value={stats.totalRevenue}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          format="currency"
          change={calculateChange(stats.totalRevenue, stats.totalRevenueLastMonth)}
          changeLabel="dari bulan lalu"
          description="Total pendapatan dari semua deal yang berhasil dimenangkan (status 'Won')."
        />
        <StatCard
          title="Deal Dimenangkan (Hari Ini)"
          value={stats.wonDealsToday}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          description="Jumlah deal yang statusnya diubah menjadi 'Won' dalam 24 jam terakhir."
        />
      </div>

      {/* Main Chart and Distribution Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Revenue Trend Chart */}
        <div className="lg:col-span-2 rounded-xl border bg-card text-card-foreground shadow-sm">
          <RevenueTrendChart data={data.revenueTrend} />
        </div>

        {/* Sales Distribution */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-headline text-3xl font-bold w-fit">Distribusi Pelanggan</CardTitle>
            <CardDescription>
              Jumlah pelanggan yang ditangani oleh setiap anggota tim sales.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {salesDistribution.length > 0 ? (
              salesDistribution.map((sales) => {
                const percentage = totalCustomersForDistribution > 0 ? (sales.customerCount / totalCustomersForDistribution) * 100 : 0;
                return (
                  <div key={sales.salesId || 'unassigned'} className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6 text-xs">
                          <AvatarFallback>{getInitials(sales.salesName)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{sales.salesName}</span>
                      </div>
                      <span className="text-muted-foreground">{sales.customerCount} pelanggan</span>
                    </div>
                    <Progress value={percentage} aria-label={`${percentage.toFixed(0)}%`} />
                  </div>
                );
              })
            ) : (
              <p className='text-sm text-center text-muted-foreground py-4'>Tidak ada data distribusi sales.</p>
            )}
          </CardContent>
        </Card>
      </div>

    </FadeIn>
  );
}
