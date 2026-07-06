"use client";

import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Logo } from '@/components/icons/logo';
import Image from 'next/image';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
    useSidebar,
} from "@/components/ui/sidebar";
import { ScanLine, Users, Kanban, BarChart3, Sparkles, Bot, Building2, ImageIcon, Send, History, ListChecks, Settings } from 'lucide-react';

import { baseLeaderMenuItems, baseSalesMenuItems, superadminMenuItems as baseSuperadminMenuItems } from '@/lib/constants';

interface AppSidebarProps {
    activeView: string;
    onViewChange: (view: string) => void;
    featureConfig: Record<string, boolean>;
}

const primaryNavIds = new Set(['ocr-capture', 'customer-manager', 'my-customers', 'deals', 'report']);

export function AppSidebar({ activeView, onViewChange, featureConfig }: AppSidebarProps) {
    const { userProfile } = useAuth();
    const { state } = useSidebar();

    const menuItems = useMemo(() => {
        if (!userProfile) return [];

        const isAnyTaskFeatureEnabled =
            featureConfig.renewal || featureConfig.aftersales || featureConfig.update || featureConfig.opportunity;

        let items: typeof baseLeaderMenuItems;

        if (userProfile.role === 'Leader') {
            items = [...baseLeaderMenuItems];
            if (isAnyTaskFeatureEnabled) {
                const webinarIndex = items.findIndex(item => item.id === 'analysis');
                if (webinarIndex !== -1) {
                    items.splice(webinarIndex + 1, 0, { id: 'tugas', label: 'Manajemen Tugas', icon: ListChecks, description: 'Lihat dan kelola tugas' });
                }
            }
        } else if (userProfile.role === 'Sales') {
            items = [...baseSalesMenuItems];
            if (isAnyTaskFeatureEnabled) {
                items.unshift({ id: 'tasks', label: 'Tugas Saya', icon: ListChecks, description: 'Lihat daftar tugas' });
            }
        } else {
            items = [...baseSuperadminMenuItems] as any;
        }

        if ((process.env.NEXT_PUBLIC_OCR_FOCUS_MODE || 'false') === 'true') {
            const ocrViewIds = ['ocr-capture', 'history', 'customer-manager', 'my-customers'];
            return items.filter(item => ocrViewIds.includes(item.id));
        }

        return items;
    }, [userProfile, featureConfig]);

    const primaryItems = menuItems.filter(item => primaryNavIds.has(item.id));
    const secondaryItems = menuItems.filter(item => !primaryNavIds.has(item.id));

    const isCollapsed = state === 'collapsed';

    return (
        <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar z-40">
            <SidebarHeader className={isCollapsed ? 'flex items-center justify-center p-4' : 'p-5'}>
                {isCollapsed ? (
                    <div className="relative h-7 w-7">
                        <Image src="/Logo_Icon.svg" alt="SalesCore" fill className="object-contain" />
                    </div>
                ) : (
                    <div className="flex items-center gap-2.5">
                        <Logo width={110} height={28} />
                        <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">CRM</span>
                    </div>
                )}
            </SidebarHeader>

            <SidebarContent className="px-3 py-1">
                <SidebarMenu className="gap-0.5">
                    {primaryItems.map((item) => (
                        <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton
                                onClick={() => onViewChange(item.id)}
                                isActive={activeView === item.id}
                                tooltip={item.label}
                                size="lg"
                                className="relative rounded-lg data-[active=true]:text-primary data-[active=true]:font-semibold transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group"
                            >
                                {activeView === item.id && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
                                )}
                                <item.icon className="h-4 w-4" />
                                <span>{item.label}</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>

                {secondaryItems.length > 0 && (
                    <>
                        <SidebarSeparator className="my-2" />
                        <SidebarMenu className="gap-0.5">
                            {secondaryItems.map((item) => (
                                <SidebarMenuItem key={item.id}>
                                    <SidebarMenuButton
                                        onClick={() => onViewChange(item.id)}
                                        isActive={activeView === item.id}
                                        tooltip={item.label}
                                        size="lg"
                                        className="relative rounded-lg data-[active=true]:text-primary data-[active=true]:font-semibold transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                    >
                                        {activeView === item.id && (
                                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
                                        )}
                                        <item.icon className="h-4 w-4" />
                                        <span>{item.label}</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </>
                )}
            </SidebarContent>

            <SidebarFooter className="border-t border-sidebar-border p-3">
                <button
                    onClick={() => onViewChange('profile')}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors ${isCollapsed ? 'justify-center' : ''}`}
                >
                    <Settings className="h-4 w-4" />
                    {!isCollapsed && <span>Pengaturan</span>}
                </button>
            </SidebarFooter>
        </Sidebar>
    );
}
