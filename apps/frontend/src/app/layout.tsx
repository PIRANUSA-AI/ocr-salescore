import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { AuthWrapper } from '@/components/providers/auth-wrapper';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: 'SalesCore - CRM & Sales Intelligence',
  description: 'Aplikasi CRM cerdas untuk memberdayakan tim sales dengan analisis AI dan manajemen prospek yang efisien.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={cn(geist.variable, geistMono.variable, 'font-sans antialiased bg-background')} suppressHydrationWarning>
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  );
}
