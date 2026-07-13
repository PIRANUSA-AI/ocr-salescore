'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signInWithEmailAndPassword, type AuthError } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email({ message: 'Email tidak valid.' }),
  password: z.string().min(1, { message: 'Minimal 1 karakter.' }),
});

const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || 'local';

export function LoginForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { refreshLocalSession } = useAuth();

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const handleAuthError = (error: AuthError) => {
    let message = 'Terjadi kesalahan tak terduga.';
    switch (error.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        message = 'Email atau kata sandi tidak valid.';
        break;
      case 'auth/email-already-in-use':
        message = 'Email ini sudah terdaftar. Silakan masuk.';
        break;
      default:
        console.error('Kesalahan Firebase Auth:', error);
    }
    toast({ variant: 'destructive', title: 'Autentikasi Gagal', description: message });
  };

  const handleLogin = async (data: z.infer<typeof loginSchema>) => {
    setIsLoading(true);
    // Pad password shorter than 6 chars (e.g. "1" -> "111111")
    const finalPassword = data.password.length < 6 ? data.password.repeat(6).slice(0, 6) : data.password;

    try {
      if (AUTH_MODE === 'local') {
        try {
          await api.auth.login(data.email, finalPassword);
        } catch (e: any) {
          toast({ variant: 'destructive', title: 'Autentikasi Gagal', description: e.message });
          setIsLoading(false);
          return;
        }
        await refreshLocalSession?.();
        toast({ title: 'Login Berhasil', description: 'Mengalihkan ke dasbor...' });
        router.push('/dashboard');
        return;
      }
      await signInWithEmailAndPassword(auth, data.email, finalPassword);
      toast({ title: "Login Berhasil", description: "Mengalihkan ke dasbor..." });
      router.push('/dashboard');
    } catch (error: any) {
      handleAuthError(error as AuthError);
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input id="login-email" type="email" placeholder="nama@contoh.com" {...loginForm.register('email')} disabled={isLoading} />
        {loginForm.formState.errors.email && <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="login-password">Kata Sandi</Label>
        <Input id="login-password" type="password" {...loginForm.register('password')} disabled={isLoading} />
        {loginForm.formState.errors.password && <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Masuk
      </Button>
    </form>
  );
}
