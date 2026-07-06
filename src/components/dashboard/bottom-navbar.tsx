"use client";

import { useRouter } from 'next/navigation';
import { ScanLine, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavbarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const NAV_ITEMS = [
  { id: 'ocr-capture', label: 'Scan', icon: ScanLine },
  { id: 'customer-manager', label: 'Customers', icon: Users },
  { id: 'profile', label: 'Akun', icon: Settings },
];

export function BottomNavbar({ activeView, onViewChange }: BottomNavbarProps) {
  const router = useRouter();

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
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.id === 'profile'
              ? activeView === 'profile'
              : item.id === 'customer-manager'
                ? activeView === 'customer-manager' || activeView === 'my-customers'
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
