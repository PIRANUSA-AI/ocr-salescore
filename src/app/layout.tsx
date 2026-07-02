import type { Metadata } from 'next';
import './globals.css';
import { cn } from '@/lib/utils';
import { AuthWrapper } from '@/components/providers/auth-wrapper';

export const metadata: Metadata = {
  title: 'SalesCore',
  description:
    'Aplikasi CRM cerdas untuk memberdayakan tim sales Anda dengan analisis AI dan manajemen prospek yang efisien.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={cn('font-body antialiased bg-background')} suppressHydrationWarning>
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  );
}
