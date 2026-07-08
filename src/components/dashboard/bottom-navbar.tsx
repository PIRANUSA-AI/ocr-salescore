"use client";

import { useRouter } from 'next/navigation';
import { ScanLine, Users, Settings, ShieldCheck, BarChart3, Kanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

interface BottomNavbarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export function BottomNavbar({ activeView, onViewChange }: BottomNavbarProps) {
  const router = useRouter();
  const { userProfile } = useAuth();

  const isSuperadmin = userProfile?.role === 'Superadmin';
  const navItems = [
    { id: 'ocr-capture', label: 'Scan', icon: ScanLine },
    { id: isSuperadmin ? 'global-customers' : 'customer-manager', label: 'Customers', icon: Users },
  ];
  if (userProfile?.role === 'Leader' || userProfile?.role === 'Sales') {
    navItems.push({ id: 'deals', label: 'Pipeline', icon: Kanban });
  }
  if (userProfile?.role === 'Leader' || userProfile?.role === 'Superadmin') {
    navItems.push({ id: 'report', label: 'Laporan', icon: BarChart3 });
  }
  if (userProfile?.role === 'Superadmin') {
    navItems.push({ id: 'user-manager', label: 'User', icon: ShieldCheck });
  }
  navItems.push({ id: 'profile', label: 'Akun', icon: Settings });

  const handleClick = (id: string) => {
    if (id === 'profile') {
      router.push('/dashboard/profile');
      return;
    }
    onViewChange(id);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex h-14 max-w-sm items-stretch">
        {navItems.map((item) => {
          const isActive =
            item.id === 'profile'
              ? activeView === 'profile'
              : item.id === 'customer-manager' || item.id === 'global-customers'
                ? activeView === 'customer-manager' || activeView === 'my-customers' || activeView === 'global-customers'
                : activeView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleClick(item.id)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
