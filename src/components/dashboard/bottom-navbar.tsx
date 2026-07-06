"use client";

import { useRouter } from 'next/navigation';
import { ScanLine, Users, Kanban, BarChart3, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavbarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const NAV_ITEMS = [
  { id: 'ocr-capture', label: 'Pindai', icon: ScanLine },
  { id: 'customer-manager', label: 'Customers', icon: Users },
  { id: 'deals', label: 'Deals', icon: Kanban },
  { id: 'report', label: 'Laporan', icon: BarChart3 },
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex h-16 max-w-lg items-stretch">
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
                'relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 bg-primary rounded-full" />
              )}
              <item.icon className={cn("h-5 w-5 transition-transform", isActive && "scale-110")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
