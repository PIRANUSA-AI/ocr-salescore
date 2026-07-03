"use client";

import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { UserProfile } from '@/types';
import { Logo } from '@/components/icons/logo';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
    SidebarTrigger,
    useSidebar,
} from "@/components/ui/sidebar";
import { ListChecks, Send } from 'lucide-react';
import Image from 'next/image';

// Import constants
import { baseLeaderMenuItems, baseSalesMenuItems, superadminMenuItems as baseSuperadminMenuItems } from '@/lib/constants';

interface AppSidebarProps {
    activeView: string;
    onViewChange: (view: string) => void;
    featureConfig: Record<string, boolean>;
}

export function AppSidebar({ activeView, onViewChange, featureConfig }: AppSidebarProps) {
    const { userProfile } = useAuth();
    const { state } = useSidebar();

    // --- Memoized Menu Calculations ---
    const leaderMenuItems = useMemo(() => {
        const isAnyTaskFeatureEnabled =
            featureConfig.renewal ||
            featureConfig.aftersales ||
            featureConfig.update ||
            featureConfig.opportunity;

        let menu = [...baseLeaderMenuItems];

        // Add Task Management if enabled
        if (isAnyTaskFeatureEnabled) {
            const webinarIndex = menu.findIndex(item => item.id === 'analysis');
            if (webinarIndex !== -1) {
                menu.splice(webinarIndex + 1, 0, { id: 'tugas', label: 'Manajemen Tugas', icon: ListChecks, description: 'Lihat dan kelola tugas untuk tim sales.' });
            }
        }

        return menu;
    }, [featureConfig]);

    const salesMenuItems = useMemo(() => {
        const isAnyTaskFeatureEnabled =
            featureConfig.renewal ||
            featureConfig.aftersales ||
            featureConfig.update ||
            featureConfig.opportunity;

        let menu = [...baseSalesMenuItems];
        if (isAnyTaskFeatureEnabled) {
            menu.unshift({ id: 'tasks', label: 'Tugas Saya', icon: ListChecks, description: 'Lihat daftar tugas yang perlu ditindaklanjuti.' });
        }

        return menu;
    }, [featureConfig]);

    // New memoized superadmin menu items to include Email Blast
    const superadminMenuItems = useMemo(() => {
        const menu = [...baseSuperadminMenuItems];
        return menu;
    }, []);

    const menuItems = useMemo(() => {
        if (!userProfile) return [];
        const full = {
            'Leader': leaderMenuItems,
            'Sales': salesMenuItems,
            'Superadmin': superadminMenuItems,
        }[userProfile.role] || [];

        // OCR focus mode (exhibition): show only the Customers view, which holds
        // both the OCR scan button and the resulting leads list. Reversible —
        // flip NEXT_PUBLIC_OCR_FOCUS_MODE off to restore the full sidebar.
        if ((process.env.NEXT_PUBLIC_OCR_FOCUS_MODE || 'false') === 'true') {
            const ocrViewIds = ['ocr-capture', 'history', 'customer-manager', 'my-customers'];
            return full.filter(item => ocrViewIds.includes(item.id));
        }

        return full;
    }, [userProfile, leaderMenuItems, salesMenuItems, superadminMenuItems]);

    return (
        <Sidebar collapsible="icon" className="border-r-0 bg-sidebar shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-40">
            <SidebarHeader className={state === 'expanded' ? 'p-6' : 'p-6 flex items-center justify-center'}>
                {state === 'expanded' ? (
                    <Logo width={120} height={30} />
                ) : (
                    <div className="relative h-8 w-8">
                        <Image src="/Logo_Icon.svg" alt="SalesCore" fill className="object-contain" />
                    </div>
                )}
            </SidebarHeader>
            <SidebarContent className='px-4 py-2 gap-2'> {/* Gap 2 for vertical rhythm */}
                <SidebarMenu>
                    {menuItems.map((item) => (
                        <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton
                                onClick={() => onViewChange(item.id)}
                                isActive={activeView === item.id}
                                tooltip={item.label}
                                size="lg"
                                className="rounded-xl data-[active=true]:bg-primary/10 data-[active=true]:text-primary font-medium transition-all duration-200 hover:bg-gray-100 hover:text-foreground hover:translate-x-1" // Custom cleaner active state
                            >
                                <item.icon className={state === 'collapsed' ? "h-6 w-6" : "h-5 w-5"} /> {/* Larger icon when collapsed */}
                                <span className="text-sm">{item.label}</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
            </SidebarContent>
            <SidebarFooter className="p-4">
                <SidebarTrigger tooltip="Collapse" className="text-muted-foreground hover:text-foreground" />
            </SidebarFooter>
        </Sidebar>
    );
}

// Export a helper to determine duplicate view logic if needed elsewhere, 
// though for now it stays internal logic or can be exposed if the dashboard page needs it for redirects.
export function useDashboardMenu(userProfile: UserProfile | null, featureConfig: Record<string, boolean>) {
    // This hook logic duplicates the memoization above. 
    // Ideally, we'd refactor to use this hook inside the component, but for now we'll keep the component self-contained
    // or refactor completely.
    // Let's stick to the component approach first.
    return [];
}
