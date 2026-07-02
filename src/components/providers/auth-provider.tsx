'use client';

import { createContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { getSessionLocal } from '@/app/actions/auth-local';

// When Firebase is not configured we run in 'local' mode (MySQL auth).
const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || 'local';

interface AuthContextType {
  // In local mode `user` is a lightweight stand-in carrying uid (the shape the
  // rest of the app reads). In firebase mode it's the real FirebaseUser.
  user: { uid: string } | FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  refreshLocalSession?: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ uid: string } | FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // --- LOCAL (MySQL) MODE ---
  const loadLocalSession = async () => {
    const profile = await getSessionLocal();
    if (profile) {
      setUser({ uid: profile.uid });
      setUserProfile(profile);
    } else {
      setUser(null);
      setUserProfile(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (AUTH_MODE === 'local') {
      loadLocalSession();
      return;
    }

    // --- FIREBASE MODE (original path, untouched) ---
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const userDocRef = doc(db, 'users', firebaseUser.uid);

        try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                setUserProfile(docSnap.data() as UserProfile);
            } else {
                 console.log("No such user profile!");
                 setUserProfile(null);
            }
        } catch (error: any) {
            console.error("Error fetching user profile:", error);
            if (error.code === 'permission-denied') {
                 const permissionError = new FirestorePermissionError({
                    path: userDocRef.path,
                    operation: 'get',
                }, error);
                errorEmitter.emit('permission-error', permissionError);
            }
             setUserProfile(null);
        } finally {
            setLoading(false);
        }

      } else {
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, refreshLocalSession: loadLocalSession }}>
      {children}
    </AuthContext.Provider>
  );
}
