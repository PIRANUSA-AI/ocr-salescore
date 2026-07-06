"use client";

import { useRouter } from 'next/navigation';
import { LogOut, ScanLine } from 'lucide-react';
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
import { Logo } from '@/components/icons/logo';

export function MobileHeader() {
    const { userProfile } = useAuth();
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
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur-md px-4">
            <Logo width={100} height={26} />

            <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <ScanLine className="h-4 w-4" />
                    Pindai
                </Button>

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
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
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
        </header>
    );
}
