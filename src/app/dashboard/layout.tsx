'use client';

import { ReactNode } from 'react';
import { DashboardProvider } from './leader/context/dashboard-context';

// The auth protection logic is handled by the page.tsx component.
// This layout now wraps all dashboard pages with the necessary context provider.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardProvider>{children}</DashboardProvider>;
}
