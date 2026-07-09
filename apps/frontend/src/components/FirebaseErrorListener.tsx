'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { useToast } from '@/hooks/use-toast';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * This component listens for custom Firestore permission errors and displays them
 * in a more developer-friendly way during development. In production, it will
 * show a generic error to the user.
 */
export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      console.error('Caught a Firestore Permission Error:', error);

      // In a real app, you might use different logic for production
      if (process.env.NODE_ENV === 'development') {
        // For development, we want to show the detailed error.
        // We throw it so Next.js can catch it and display its error overlay.
        throw error;
      } else {
        // In production, show a generic toast to the user
        toast({
          variant: 'destructive',
          title: 'Akses Ditolak',
          description:
            'Anda tidak memiliki izin untuk melakukan tindakan ini.',
        });
      }
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, [toast]);

  // This component does not render anything itself
  return null;
}
