"use client";

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
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
import { Logo } from '@/components/icons/logo';

export function MobileHeader() {
    const { userProfile } = useAuth();
    const router = useRouter();
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
            className={`sticky top-0 z-30 flex h-14 items-center justify-between px-4 transition-all duration-200
            ${isScrolled
                    ? 'bg-background/80 backdrop-blur-md shadow-sm border-b'
                    : 'bg-transparent'
                }`}
        >
            <Logo width={100} height={26} />

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="icon" className="rounded-full shadow-sm shrink-0">
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
                        Pengaturan
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Keluar</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </header>
    );
}
