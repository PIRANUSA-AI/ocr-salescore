'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import LeaderDashboardPage from './leader/leader-dashboard';
import SalesDashboard from './sales-dashboard';
import SuperadminDashboard from './superadmin/superadmin-dashboard';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import type { UserProfile } from '@/types';
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardHeader } from '@/components/dashboard/header';
import { AppSidebar } from '@/components/dashboard/app-sidebar';
import { BottomNavbar } from '@/components/dashboard/bottom-navbar';
import { MobileHeader } from '@/components/dashboard/mobile-header';
import { baseLeaderMenuItems, baseSalesMenuItems, superadminMenuItems } from '@/lib/constants';

const OCR_FOCUS = (process.env.NEXT_PUBLIC_OCR_FOCUS_MODE || 'false') === 'true';

// --- Main UI component, only rendered on the client ---
function DashboardUI() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [featureConfig, setFeatureConfig] = useState<Record<string, boolean>>({});
  const [featuresLoading, setFeaturesLoading] = useState(true);
  const [activeView, setActiveView] = useState('');

  // --- Data Fetching Effects ---
  useEffect(() => {
    setFeaturesLoading(true);
    const configRef = doc(db, 'appConfig', 'maintenance');
    getDoc(configRef).then(docSnap => {
      if (docSnap.exists()) {
        setFeatureConfig(docSnap.data().features || {});
      }
    }).catch(err => {
      console.error("Failed to fetch feature config:", err)
    }).finally(() => {
      setFeaturesLoading(false);
    });
  }, []);

  const getDefaultViewForRole = (role: UserProfile['role']) => {
    if (OCR_FOCUS) {
      switch (role) {
        case 'Sales': return 'my-customers';
        default: return 'customer-manager';
      }
    }
    switch (role) {
      case 'Leader': return 'customer-manager';
      case 'Sales': return 'my-customers';
      case 'Superadmin': return 'report';
      default: return 'analysis'; // Fail-safe default
    }
  };

  // --- View and Animation Logic ---
  useEffect(() => {
    if (!loading && !featuresLoading && userProfile) {
      const viewParam = searchParams.get('view');

      // Simple valid check - strict check would require recalculating the exact menu items here
      // or passing that logic up. For now, we trust the param or fallback.
      const allPossibleIds = [
        ...baseLeaderMenuItems.map(i => i.id),
        ...baseSalesMenuItems.map(i => i.id),
        ...superadminMenuItems.map(i => i.id),
        'tugas', 'tasks' // Dynamic IDs
      ];
      const isValidView = viewParam && allPossibleIds.includes(viewParam);

      const getDefaultView = () => getDefaultViewForRole(userProfile.role);

      setActiveView(isValidView ? viewParam! : getDefaultView());
    }
  }, [loading, featuresLoading, userProfile, searchParams]);

  const handleViewChange = (view: string) => {
    setActiveView(view);
    router.push(`/dashboard?view=${view}`, { scroll: false });
  }

  // --- Render Logic ---

  const renderDashboardContent = () => {
    if (loading || featuresLoading || !userProfile) {
      return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    switch (userProfile.role) {
      case 'Leader':
        return <LeaderDashboardPage activeView={activeView} />;
      case 'Sales':
        return <SalesDashboard activeView={activeView} />;
      case 'Superadmin':
        return <SuperadminDashboard activeView={activeView} />;
      default:
        return <p>Peran tidak diketahui.</p>;
    }
  };

  if (OCR_FOCUS) {
    return (
      <div className="flex h-screen w-full flex-col bg-muted/40 overflow-hidden">
        <MobileHeader />
        <main
          id="dashboard-main"
          className="flex flex-1 flex-col gap-4 px-4 pb-24 overflow-auto pt-3"
        >
          <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
            {renderDashboardContent()}
          </Suspense>
        </main>
        <BottomNavbar activeView={activeView} onViewChange={handleViewChange} />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-muted/40 overflow-hidden">
        <AppSidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          featureConfig={featureConfig}
        />
        <div className="relative flex flex-col flex-1 min-w-0 overflow-hidden">
          <DashboardHeader />
          <main
            id="dashboard-main"
            className="flex flex-1 flex-col gap-4 px-4 pb-4 lg:gap-6 lg:px-6 lg:pb-6 overflow-auto pt-20 md:pt-24"
          >
            <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
              {renderDashboardContent()}
            </Suspense>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}


// --- Component that handles initial loading and auth ---
function DashboardPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Auth redirect logic
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // While checking auth state, show a simplified loader
  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If user is authenticated, render the full dashboard UI
  if (user) {
    return <DashboardUI />;
  }

  // If not loading and no user, this will be briefly rendered before redirect kicks in.
  return null;
}


// --- MAIN DASHBOARD PAGE ---
export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardPageContent />
    </Suspense>
  );
}
