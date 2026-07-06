"use client";

import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
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
    useSidebar,
} from "@/components/ui/sidebar";
import { ScanLine, Users, BarChart3, Settings } from 'lucide-react';

interface AppSidebarProps {
    activeView: string;
    onViewChange: (view: string) => void;
    featureConfig: Record<string, boolean>;
}

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
    const { userProfile } = useAuth();
    const { state } = useSidebar();
    const isCollapsed = state === 'collapsed';

    const menuItems = useMemo(() => {
        if (!userProfile) return [];
        const base = [
            { id: 'ocr-capture', label: 'Scan', icon: ScanLine },
            { id: 'customer-manager', label: 'Customers', icon: Users },
        ];
        if (userProfile.role === 'Leader') {
            base.push({ id: 'report', label: 'Laporan', icon: BarChart3 });
        }
        return base;
    }, [userProfile]);

    return (
        <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar z-40">
            <SidebarHeader className={isCollapsed ? 'flex items-center justify-center p-4' : 'p-5'}>
                {isCollapsed ? (
                    <div className="relative h-7 w-7">
                        <img src="/Logo_Icon.svg" alt="SalesCore" className="object-contain" />
                    </div>
                ) : (
                    <div className="flex items-center gap-2.5">
                        <Logo width={110} height={28} />
                    </div>
                )}
            </SidebarHeader>

            <SidebarContent className="px-3 py-1">
                <SidebarMenu className="gap-0.5">
                    {menuItems.map((item) => (
                        <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton
                                onClick={() => onViewChange(item.id)}
                                isActive={activeView === item.id}
                                tooltip={item.label}
                                size="lg"
                                className="relative rounded-lg data-[active=true]:text-primary data-[active=true]:font-semibold transition-colors hover:bg-sidebar-accent"
                            >
                                {activeView === item.id && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
                                )}
                                <item.icon className={isCollapsed ? "h-5 w-5" : "h-4 w-4"} />
                                <span className="text-sm">{item.label}</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
            </SidebarContent>

            <SidebarFooter className="border-t border-sidebar-border p-3">
                <button
                    onClick={() => onViewChange('profile')}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent transition-colors ${isCollapsed ? 'justify-center' : ''}`}
                >
                    <Settings className="h-4 w-4" />
                    {!isCollapsed && <span>Pengaturan</span>}
                </button>
            </SidebarFooter>
        </Sidebar>
    );
}
