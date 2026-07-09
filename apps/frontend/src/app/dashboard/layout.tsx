import { ReactNode, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { DashboardProvider } from './dashboard-context';
import { AppShell } from '@/components/shell/app-shell';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <Suspense fallback={<div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
        <AppShell>{children}</AppShell>
      </Suspense>
    </DashboardProvider>
  );
}
