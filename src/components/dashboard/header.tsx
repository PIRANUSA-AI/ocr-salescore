"use client";

import { useRouter } from 'next/navigation';
import { LogOut, Settings, PanelLeft } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { logoutLocal } from '@/app/actions/auth-local';
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
        <header className="flex h-14 items-center gap-3 border-b bg-background/95 px-4 lg:h-16 lg:px-6">
            <Button
                variant="ghost"
                size="icon"
                className="shrink-0 md:hidden"
                onClick={toggleSidebar}
            >
                <PanelLeft className="h-5 w-5" />
            </Button>

            <div className="flex flex-1 items-center justify-between gap-3">
                <div className="max-w-md flex-1">
                    <GlobalSearch />
                </div>

                <div className="flex items-center gap-1.5">
                    <NotificationBell />
                    {(userProfile?.role === 'Leader' || userProfile?.role === 'Superadmin') && (
                        <ActivitySheet />
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-full">
                                <Avatar className="h-7 w-7">
                                    <AvatarImage src={userProfile?.photoURL ?? ''} alt={userProfile?.name} />
                                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                                        {getInitials(userProfile?.name)}
                                    </AvatarFallback>
                                </Avatar>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>
                                <div className="flex flex-col gap-1">
                                    <p className="text-sm font-medium">{userProfile?.name}</p>
                                    <div className="flex gap-1.5">
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{userProfile?.role}</Badge>
                                        {userProfile?.team && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{userProfile?.team}</Badge>}
                                    </div>
                                    <p className="text-xs text-muted-foreground">{userProfile?.email}</p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
                                <Settings className="mr-2 h-4 w-4" />
                                Pengaturan
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleLogout}>
                                <LogOut className="mr-2 h-4 w-4" />
                                Keluar
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
}
