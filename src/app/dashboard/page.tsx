'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import type { UserProfile } from '@/types';
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardHeader } from '@/components/dashboard/header';
import { AppSidebar } from '@/components/dashboard/app-sidebar';
import { BottomNavbar } from '@/components/dashboard/bottom-navbar';
import { MobileHeader } from '@/components/dashboard/mobile-header';
import { baseLeaderMenuItems, baseSalesMenuItems, superadminMenuItems } from '@/lib/constants';

import AnalysisView from './leader/views/analysis-view';
import TasksView from './leader/views/tasks-view';
import SalesAssistantView from './leader/views/sales-assistant-view';
import CustomerManagementView from './leader/views/customer-management-view';
import DealsView from './leader/views/deals-view';
import ReportPage from './report/page';
import MediaLibraryView from './leader/views/media-library-view';
import CompanyView from './leader/views/company-view';
import EmailBlastView from './leader/views/email-blast-view';
import OcrCaptureViewWrapper from './leader/views/ocr-capture-view';
import HistoryViewWrapper from './leader/views/history-view';
import { MyCustomersView } from './sales/my-customers-view';
import { FeatureManager } from './superadmin/feature-manager';
import { UserManager } from './superadmin/user-manager';
import { GlobalCustomerManager } from './superadmin/global-customer-manager';

const OCR_FOCUS = (process.env.NEXT_PUBLIC_OCR_FOCUS_MODE || 'true') === 'true';
const LOADER = <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

function DashboardUI() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [featureConfig, setFeatureConfig] = useState<Record<string, boolean>>({});
  const [featuresLoading, setFeaturesLoading] = useState(true);
  const [activeView, setActiveView] = useState('');

  useEffect(() => {
    setFeaturesLoading(true);
    const configRef = doc(db, 'appConfig', 'maintenance');
    getDoc(configRef).then(docSnap => {
      if (docSnap.exists()) {
        setFeatureConfig(docSnap.data().features || {});
      }
    }).catch(console.error).finally(() => setFeaturesLoading(false));
  }, []);

  const defaultView = useMemo(() => {
    if (!userProfile) return 'customer-manager';
    if (OCR_FOCUS) {
      return userProfile.role === 'Sales' ? 'my-customers' : 'customer-manager';
    }
    return { Leader: 'customer-manager', Sales: 'my-customers', Superadmin: 'report' }[userProfile.role] || 'customer-manager';
  }, [userProfile]);

  useEffect(() => {
    if (!loading && !featuresLoading && userProfile) {
      const viewParam = searchParams.get('view');
      const allPossibleIds = [
        ...baseLeaderMenuItems.map(i => i.id),
        ...baseSalesMenuItems.map(i => i.id),
        ...superadminMenuItems.map(i => i.id),
        'tugas', 'tasks'
      ];
      setActiveView(viewParam && allPossibleIds.includes(viewParam) ? viewParam : defaultView);
    }
  }, [loading, featuresLoading, userProfile, searchParams, defaultView]);

  const handleViewChange = (view: string) => {
    setActiveView(view);
    router.push(`/dashboard?view=${view}`, { scroll: false });
  };

  const viewContent = useMemo(() => {
    if (loading || featuresLoading || !userProfile) return null;

    const shared = {
      'ocr-capture': <OcrCaptureViewWrapper />,
      'history': <HistoryViewWrapper />,
      'sales-assistant': <SalesAssistantView />,
      'company': <CompanyView />,
      'media-library': <MediaLibraryView />,
      'email-blast': <EmailBlastView />,
    } as Record<string, React.ReactNode>;

    const roleViews: Record<string, Record<string, React.ReactNode>> = {
      Leader: {
        ...shared,
        'customer-manager': <CustomerManagementView />,
        'analysis': <AnalysisView />,
        'tugas': <TasksView />,
        'deals': <DealsView />,
        'report': <ReportPage />,
      },
      Sales: {
        ...shared,
        'my-customers': <MyCustomersView />,
        'deals': <DealsView />,
        'tasks': <TasksView />,
      },
      Superadmin: {
        'report': <ReportPage />,
        'features': <FeatureManager />,
        'users': <UserManager />,
        'customers': <GlobalCustomerManager />,
      },
    };

    const views = roleViews[userProfile.role] || roleViews.Leader;
    return views[activeView] || views[Object.keys(views)[0]];
  }, [activeView, loading, featuresLoading, userProfile]);

  if (OCR_FOCUS) {
    return (
      <div className="flex h-screen w-full flex-col bg-background">
        <MobileHeader />
        <main className="flex-1 overflow-auto px-4 pb-20 pt-3 scrollbar-thin">
          <Suspense fallback={LOADER}>{viewContent}</Suspense>
        </main>
        <BottomNavbar activeView={activeView} onViewChange={handleViewChange} />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar activeView={activeView} onViewChange={handleViewChange} featureConfig={featureConfig} />
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
