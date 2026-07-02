'use client';

import { AuthProvider } from './auth-provider';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseErrorListener } from '../FirebaseErrorListener';
import { useState, useEffect } from 'react';

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <AuthProvider>
      {children}
      {/* 
        Render Toaster and FirebaseErrorListener only on the client-side 
        after the component has mounted to prevent hydration errors.
      */}
      {isMounted && (
        <>
          <Toaster />
          <FirebaseErrorListener />
        </>
      )}
    </AuthProvider>
  );
}
