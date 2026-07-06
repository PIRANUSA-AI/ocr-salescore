"use client";

import { useRouter } from 'next/navigation';
import { Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavbarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const NAV_ITEMS = [
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'profile', label: 'Akun', icon: Settings },
];

export function BottomNavbar({ activeView, onViewChange }: BottomNavbarProps) {
  const router = useRouter();

  const handleClick = (item: typeof NAV_ITEMS[number]) => {
    if (item.id === 'profile') {
      router.push('/dashboard/profile');
      return;
    }
    onViewChange(item.id);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.id === 'customers'
              ? activeView !== 'profile'
              : activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleClick(item)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[11px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
