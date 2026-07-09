"use client";

import { useRouter } from 'next/navigation';
import { LogOut, PanelLeft } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api-client';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useSidebar } from "@/components/ui/sidebar";

export function DashboardHeader() {
    const { userProfile } = useAuth();
    const { toggleSidebar } = useSidebar();
    const router = useRouter();

    const handleLogout = async () => {
        if ((process.env.NEXT_PUBLIC_AUTH_MODE || 'local') === 'local') {
            await api.auth.logout();
        } else {
            await signOut(auth);
        }
        router.push('/');
    };

    const getInitials = (name: string | null | undefined) => {
        if (!name) return 'A';
        const names = name.split(' ');
        return names.length > 1 ? `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase() : name[0].toUpperCase();
    };

    return (
        <header className="flex h-12 items-center justify-between border-b bg-background px-4 lg:px-6">
            <Button variant="ghost" size="icon" className="shrink-0 md:hidden h-8 w-8" onClick={toggleSidebar}>
                <PanelLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-2 ml-auto">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                            <Avatar className="h-7 w-7">
                                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-medium">
                                    {getInitials(userProfile?.name)}
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>
                            <p className="text-sm font-medium">{userProfile?.name}</p>
                            <p className="text-xs text-muted-foreground">{userProfile?.email}</p>
                            <div className="flex gap-1 mt-1">
                                <Badge variant="outline" className="text-[10px] px-1 py-0">{userProfile?.role}</Badge>
                                {userProfile?.team && <Badge variant="secondary" className="text-[10px] px-1 py-0">{userProfile?.team}</Badge>}
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => router.push('/dashboard/profile')} className="text-sm">
                            Pengaturan
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout} className="text-sm">
                            <LogOut className="mr-2 h-4 w-4" />
                            Keluar
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}
