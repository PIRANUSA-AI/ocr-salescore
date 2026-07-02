"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { PanelLeft, LogOut, Settings } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { logoutLocal } from '@/app/actions/auth-local';
import { useState, useEffect } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ActivitySheet } from '@/components/dashboard/activity-sheet';
import { useSidebar } from "@/components/ui/sidebar";
import { GlobalSearch } from "./global-search";
import { NotificationBell } from './notification-bell';

export function DashboardHeader() {
    const { user, userProfile } = useAuth();
    const { toggleSidebar } = useSidebar();
    const router = useRouter();
    const searchParams = useSearchParams();
    const view = searchParams.get('view');
    const isComplexView = view === 'deals' || view === 'sales-assistant';
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const mainContent = document.getElementById('dashboard-main');
        if (!mainContent) return;

        const handleScroll = () => {
            setIsScrolled(mainContent.scrollTop > 10);
        };

        mainContent.addEventListener('scroll', handleScroll);
        return () => mainContent.removeEventListener('scroll', handleScroll);
    }, []);

    const handleLogout = async () => {
        if ((process.env.NEXT_PUBLIC_AUTH_MODE || 'local') === 'local') {
            await logoutLocal();
        } else {
            await signOut(auth);
        }
        router.push('/');
    };

    const getInitials = (name: string | null | undefined) => {
        if (!name) return 'A';
        const names = name.split(' ');
        if (names.length > 1) {
            return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
        }
        return name[0].toUpperCase();
    };

    return (
        <header
            className={`absolute top-0 right-0 left-0 z-30 flex h-14 items-center gap-4 px-6 lg:h-[72px] lg:px-8 transition-all duration-200 
            ${isScrolled || isComplexView
                    ? 'bg-background/80 backdrop-blur-md shadow-sm border-b'
                    : 'bg-transparent'
                }`}
        >
            <Button
                variant="outline"
                size="icon"
                className="shrink-0 md:hidden bg-background/50"
                onClick={toggleSidebar}
            >
                <PanelLeft className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
            </Button>
            <div className="w-full flex-1 flex items-center justify-between gap-2">
                <div className="flex-1 max-w-md">
                    <GlobalSearch />
                </div>
                <div className="flex items-center gap-2">
                    <NotificationBell />
                    {(userProfile?.role === 'Leader' || userProfile?.role === 'Superadmin') && (
                        <ActivitySheet />
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="secondary" size="icon" className="rounded-full shadow-sm">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={userProfile?.photoURL ?? ''} alt={userProfile?.name} />
                                    <AvatarFallback className="bg-primary text-primary-foreground">
                                        {getInitials(userProfile?.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="sr-only">Toggle user menu</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium leading-none">{userProfile?.name}</p>
                                    <p className="text-xs leading-none text-muted-foreground">
                                        {userProfile?.email}
                                    </p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <div className='flex gap-2 px-2 py-1.5'>
                                <Badge variant="outline">{userProfile?.role}</Badge>
                                {userProfile?.team && <Badge variant="secondary">{userProfile?.team}</Badge>}
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
                                <Settings className="mr-2 h-4 w-4" />
                                <span>Pengaturan</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleLogout}>
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Keluar</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
}
