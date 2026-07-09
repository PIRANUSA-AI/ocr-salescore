'use client';

import { ReactNode, useEffect, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Loader2 } from 'lucide-react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DashboardHeader } from '@/components/shell/header';
import { AppSidebar } from '@/components/shell/app-sidebar';
import { BottomNavbar } from '@/components/shell/bottom-navbar';
import { MobileHeader } from '@/components/shell/mobile-header';

const OCR_FOCUS = (process.env.NEXT_PUBLIC_OCR_FOCUS_MODE || 'true') === 'true';
const VALID_VIEWS = new Set(['ocr-capture', 'customer-manager', 'my-customers', 'report', 'user-manager', 'global-customers', 'deals', 'sales-home', 'profile']);

function defaultNavView(role?: string) {
    if (!role) return 'customer-manager';
    if (OCR_FOCUS && role !== 'Superadmin') return role === 'Sales' ? 'sales-home' : 'customer-manager';
    return ({ Leader: 'customer-manager', Sales: 'sales-home', Superadmin: 'report' } as Record<string, string>)[role] || 'customer-manager';
}

/**
 * Shell navigasi yang dipakai semua route /dashboard/*
 * (desktop: sidebar + header; mobile: header + bottom navbar).
 * Ditaruh di layout biar profile, customer detail, dll. juga dapat nav.
 */
export function AppShell({ children }: { children: ReactNode }) {
    const { user, loading, userProfile } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isDesktop = useMediaQuery('(min-width: 1024px)');

    useEffect(() => {
        if (!loading && !user) router.push('/');
    }, [loading, user, router]);

    // Active view untuk NAV HIGHLIGHTING, diderive dari URL
    const activeView = useMemo(() => {
        if (pathname === '/dashboard/profile') return 'profile';
        if (pathname?.startsWith('/dashboard/customer/')) return 'customer-manager';
        const viewParam = searchParams.get('view');
        if (viewParam && VALID_VIEWS.has(viewParam)) {
            return userProfile?.role === 'Sales' && viewParam === 'my-customers' ? 'sales-home' : viewParam;
        }
        return defaultNavView(userProfile?.role);
    }, [pathname, searchParams, userProfile]);

    const handleViewChange = (view: string) => {
        if (view === 'profile') router.push('/dashboard/profile');
        else router.push(`/dashboard?view=${view}`, { scroll: false });
    };

    if (loading) {
        return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }
    if (!user) return null;

    if (!isDesktop) {
        return (
            <div className="flex h-screen w-full flex-col bg-background">
                <MobileHeader />
                <main className="flex-1 overflow-auto px-4 pb-16 pt-2 scrollbar-thin">{children}</main>
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
                    <main className="flex-1 overflow-auto p-4 lg:p-6 scrollbar-thin">{children}</main>
                </div>
            </div>
        </SidebarProvider>
    );
}
