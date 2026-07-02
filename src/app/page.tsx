'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import Image from 'next/image';
import { Logo } from '@/components/icons/logo';
import { LoginForm } from '@/components/auth/login-form';
import { QuickOcrDialog } from '@/components/auth/quick-ocr-dialog';
import { Button } from '@/components/ui/button';
import { ScanLine } from 'lucide-react';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(false);
  const [isOcrOpen, setIsOcrOpen] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Loading or Authenticated State
  if (loading || user) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-primary">
        <Logo width={200} height={50} className="brightness-0 invert animate-pulse" />
        <p className="mt-4 text-primary-foreground">
          {loading ? 'Memeriksa sesi...' : 'Mengalihkan ke dasbor...'}
        </p>
      </div>
    );
  }

  // Unauthenticated State
  return (
    <>
      <QuickOcrDialog isOpen={isOcrOpen} onOpenChange={setIsOcrOpen} />
      <main className="flex min-h-screen w-full items-center justify-center p-4 bg-background" suppressHydrationWarning={true}>
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 rounded-2xl shadow-2xl overflow-hidden bg-card" suppressHydrationWarning={true}>
          {/* Left Side: Form */}
          <div className="p-6 sm:p-8 flex flex-col justify-center" suppressHydrationWarning={true}>
            <LoginForm isSignup={isSignup} setIsSignup={setIsSignup} />

            <div className="relative my-4 flex items-center">
              <div className="flex-grow border-t border-muted"></div>
              <span className="flex-shrink mx-4 text-xs text-muted-foreground">ATAU</span>
              <div className="flex-grow border-t border-muted"></div>
            </div>

            <Button variant="outline" onClick={() => setIsOcrOpen(true)}>
              <ScanLine className="mr-2 h-4 w-4" />
              Pindai Cepat
            </Button>

          </div>

          {/* Right Side: Image with Logo */}
          <div className="hidden md:block relative" suppressHydrationWarning={true}>
            <Image
              src={isSignup ? "/Signup.png" : "/Login.png"}
              alt="Decorative background"
              fill
              sizes="50vw"
              className="pointer-events-none object-cover"
              priority
            />
            <div className="absolute inset-0 bg-primary/50" suppressHydrationWarning={true}></div>

            {/* Centered Logo */}
            <div className="absolute inset-0 flex items-center justify-center z-10" suppressHydrationWarning={true}>
              <Logo width={200} height={50} className="brightness-0 invert" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
