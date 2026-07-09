'use client';

import { Suspense, useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import CustomerManagementView from './_views/leader/customer-management-view';
import ReportPage from './report/page';
import OcrCaptureViewWrapper from './_views/leader/ocr-capture-view';
import DealsView from './_views/leader/deals-view';
import { MyCustomersView } from './_views/sales/my-customers-view';
import { SalesHomeView } from './_views/sales/sales-home-view';
import { UserManager } from './_views/superadmin/user-manager';
import { GlobalCustomerManager } from './_views/superadmin/global-customer-manager';

const OCR_FOCUS = (process.env.NEXT_PUBLIC_OCR_FOCUS_MODE || 'true') === 'true';
const LOADER = <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

const VALID_VIEWS = new Set(['ocr-capture', 'customer-manager', 'my-customers', 'report', 'user-manager', 'global-customers', 'deals', 'sales-home']);

function DashboardContent() {
  const { userProfile } = useAuth();
  const searchParams = useSearchParams();
  const [activeView, setActiveView] = useState('');

  const defaultView = useMemo(() => {
    if (!userProfile) return 'customer-manager';
    if (OCR_FOCUS && userProfile.role !== 'Superadmin') return userProfile.role === 'Sales' ? 'sales-home' : 'customer-manager';
    return { Leader: 'customer-manager', Sales: 'sales-home', Superadmin: 'report' }[userProfile.role] || 'customer-manager';
  }, [userProfile]);

  useEffect(() => {
    if (!userProfile) return;
    const raw = searchParams.get('view');
    // Sales: my-customers (URL basi) diarahkan ke sales-home
    const viewParam = userProfile.role === 'Sales' && raw === 'my-customers' ? 'sales-home' : raw;
    setActiveView(viewParam && VALID_VIEWS.has(viewParam) ? viewParam : defaultView);
  }, [userProfile, searchParams, defaultView]);

  const viewContent = useMemo(() => {
    if (!userProfile) return null;
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
  }, [activeView, userProfile]);

  if (!activeView) return LOADER;

  return (
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
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={LOADER}>
      <DashboardContent />
    </Suspense>
  );
}
