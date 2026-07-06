import { ReactNode } from 'react';
import { DashboardProvider } from './dashboard-context';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardProvider>{children}</DashboardProvider>;
}
