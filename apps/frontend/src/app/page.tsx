'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Logo } from '@/components/icons/logo';
import { LoginForm } from '@/components/auth/login-form';
import { QuickOcrDialog } from '@/components/auth/quick-ocr-dialog';
import { Button } from '@/components/ui/button';
import { ScanLine } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

  if (loading || user) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
        <Logo width={160} height={40} className="text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">
          {loading ? 'Memeriksa sesi...' : 'Mengalihkan ke dasbor...'}
        </p>
      </div>
    );
  }

  return (
    <>
      <QuickOcrDialog isOpen={isOcrOpen} onOpenChange={setIsOcrOpen} />
      <main className="flex min-h-screen w-full bg-background">
        <div className="flex w-full flex-col lg:flex-row">
          {/* Left - Brand Panel */}
          <div className="relative hidden w-[45%] bg-gradient-to-br from-primary/5 via-primary/[0.02] to-background lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-1/2 -right-1/2 h-[800px] w-[800px] rounded-full bg-primary/[0.03]" />
              <div className="absolute -bottom-1/2 -left-1/2 h-[600px] w-[600px] rounded-full bg-primary/[0.02]" />
            </div>

            <div className="relative z-10 max-w-md text-center">
              <Logo width={180} height={45} className="mx-auto text-primary" />
              <h1 className="mt-8 text-3xl font-semibold tracking-tight text-foreground">
                Sales Intelligence Platform
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Kelola pelanggan, lacak pipeline penjualan, dan tingkatkan performa tim dengan analisis AI cerdas.
              </p>

              <div className="mt-12 space-y-6 text-left">
                {[
                  { label: 'OCR Otomatis', desc: 'Pindai kartu nama dan dokumen dengan AI' },
                  { label: 'Pipeline Visual', desc: 'Kanban deals dengan drag-and-drop' },
                  { label: 'Analisis Cerdas', desc: 'Wawasan bisnis berbasis AI real-time' },
                ].map((item, i) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right - Form Panel */}
          <div className="flex flex-1 items-center justify-center p-4 lg:p-8">
            <div className="w-full max-w-sm">
              <div className="mb-8 lg:hidden">
                <Logo width={120} height={30} className="text-primary" />
              </div>

              <div className="flex items-center gap-2 mb-6">
                <button
                  onClick={() => setIsSignup(false)}
                  className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                    !isSignup ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Masuk
                </button>
                <button
                  onClick={() => setIsSignup(true)}
                  className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                    isSignup ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Daftar
                </button>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={isSignup ? 'signup' : 'login'}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <LoginForm isSignup={isSignup} setIsSignup={setIsSignup} />
                </motion.div>
              </AnimatePresence>

              <div className="relative my-6 flex items-center">
                <div className="flex-grow border-t" />
                <span className="mx-3 text-xs text-muted-foreground">ATAU</span>
                <div className="flex-grow border-t" />
              </div>

              <Button variant="outline" className="w-full gap-2" onClick={() => setIsOcrOpen(true)}>
                <ScanLine className="h-4 w-4" />
                Pindai Cepat
              </Button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
