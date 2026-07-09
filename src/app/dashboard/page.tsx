'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import { useMediaQuery } from '@/hooks/use-media-query';
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardHeader } from '@/components/dashboard/header';
import { AppSidebar } from '@/components/dashboard/app-sidebar';
import { BottomNavbar } from '@/components/dashboard/bottom-navbar';
import { MobileHeader } from '@/components/dashboard/mobile-header';
import CustomerManagementView from './leader/views/customer-management-view';
import ReportPage from './report/page';
import OcrCaptureViewWrapper from './leader/views/ocr-capture-view';
import DealsView from './leader/views/deals-view';
import { MyCustomersView } from './sales/my-customers-view';
import { SalesHomeView } from './sales/sales-home-view';
import { UserManager } from './superadmin/user-manager';
import { GlobalCustomerManager } from './superadmin/global-customer-manager';

const OCR_FOCUS = (process.env.NEXT_PUBLIC_OCR_FOCUS_MODE || 'true') === 'true';
const LOADER = <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

const VALID_VIEWS = new Set(['ocr-capture', 'customer-manager', 'my-customers', 'report', 'user-manager', 'global-customers', 'deals', 'sales-home']);

function DashboardUI() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [activeView, setActiveView] = useState('');

  const defaultView = useMemo(() => {
    if (!userProfile) return 'customer-manager';
    if (OCR_FOCUS && userProfile.role !== 'Superadmin') return userProfile.role === 'Sales' ? 'sales-home' : 'customer-manager';
    return { Leader: 'customer-manager', Sales: 'sales-home', Superadmin: 'report' }[userProfile.role] || 'customer-manager';
  }, [userProfile]);

  useEffect(() => {
    if (!loading && userProfile) {
      const raw = searchParams.get('view');
      // Sales: landing default kini Beranda; arahkan my-customers (URL basi/back) ke sales-home
      const viewParam = userProfile.role === 'Sales' && raw === 'my-customers' ? 'sales-home' : raw;
      setActiveView(viewParam && VALID_VIEWS.has(viewParam) ? viewParam : defaultView);
    }
  }, [loading, userProfile, searchParams, defaultView]);

  const handleViewChange = (view: string) => {
    setActiveView(view);
    router.push(`/dashboard?view=${view}`, { scroll: false });
  };

  const viewContent = useMemo(() => {
    if (loading || !userProfile) return null;

    const views: Record<string, React.ReactNode> = {
      'ocr-capture': <OcrCaptureViewWrapper />,
      'customer-manager': <CustomerManagementView />,
      'my-customers': <MyCustomersView />,
      'sales-home': <SalesHomeView />,
      'deals': <DealsView />,
      'report': <ReportPage />,
      'user-manager': <UserManager />,
      'global-customers': <GlobalCustomerManager />,
    };

    return views[activeView] || <CustomerManagementView />;
  }, [activeView, loading, userProfile]);

  if (!isDesktop) {
    return (
      <div className="flex h-screen w-full flex-col bg-background">
        <MobileHeader />
        <main className="flex-1 overflow-auto px-4 pb-16 pt-2 scrollbar-thin">
          <Suspense fallback={LOADER}>{viewContent}</Suspense>
        </main>
        <BottomNavbar activeView={activeView} onViewChange={handleViewChange} />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar activeView={activeView} onViewChange={handleViewChange} featureConfig={{}} />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardHeader />
          <main className="flex-1 overflow-auto p-4 lg:p-6 scrollbar-thin">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: 'easeInOut' }}
              >
                <Suspense fallback={LOADER}>{viewContent}</Suspense>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function DashboardPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return user ? <DashboardUI /> : null;
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardPageContent />
    </Suspense>
  );
}
