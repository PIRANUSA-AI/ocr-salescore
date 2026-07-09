'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const loginSchema = z.object({
  email: z.string().email({ message: 'Email tidak valid.' }),
  password: z.string().min(1, { message: 'Minimal 1 karakter.' }),
});

const leaderSignupSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi.'),
  email: z.string().email('Email tidak valid.'),
  password: z.string().min(1, 'Minimal 1 karakter.'),
  team: z.enum(['AEC', 'MFG'], { required_error: 'Tim harus dipilih.' }),
  specialKey: z.string().refine(val => val === "LeadPira", { message: "Kunci khusus tidak valid." }),
  role: z.literal('Leader'),
});

const salesSignupSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi.'),
  email: z.string().email('Email tidak valid.'),
  password: z.string().min(1, 'Minimal 1 karakter.'),
  team: z.enum(['AEC', 'MFG'], { required_error: 'Tim harus dipilih.' }),
  role: z.literal('Sales'),
});

const superadminSignupSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi.'),
  email: z.string().email('Email tidak valid.'),
  password: z.string().min(1, 'Minimal 1 karakter.'),
  team: z.enum(['AEC', 'MFG'], { required_error: 'Tim harus dipilih.' }),
  specialKey: z.string().refine(val => val === "SuperPira", { message: "Kunci khusus tidak valid." }),
  role: z.literal('Superadmin'),
});

const signupSchema = z.union([leaderSignupSchema, salesSignupSchema, superadminSignupSchema]);
type SignupFormData = z.infer<typeof signupSchema>;

const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || 'local';

interface LoginFormProps {
  isSignup: boolean;
  setIsSignup: (value: boolean) => void;
}

export function LoginForm({ isSignup, setIsSignup }: LoginFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { refreshLocalSession } = useAuth();

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: '', email: '', password: '',
      role: 'Sales', team: undefined, specialKey: undefined,
    } as any,
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

  const handleSignup = async (data: SignupFormData) => {
    setIsLoading(true);
    // Pad password shorter than 6 chars
    const finalPassword = data.password.length < 6 ? data.password.repeat(6).slice(0, 6) : data.password;
    const submissionData = { ...data, password: finalPassword };

    const result = await api.auth.signup(submissionData).then(() => ({ success: true as const, error: null }))
      .catch((e: Error) => ({ success: false as const, error: e.message }));
    setIsLoading(false);
    if (result.success) {
      toast({ title: 'Pendaftaran Berhasil', description: 'Silakan masuk untuk melanjutkan.' });
      setIsSignup(false);
    } else {
      toast({ variant: 'destructive', title: 'Pendaftaran Gagal', description: result.error });
    }
  };

  const watchedRole = signupForm.watch('role');

  if (isSignup) {
    return (
      <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="signup-name">Nama Lengkap</Label>
          <Input id="signup-name" placeholder="Nama Anda" {...signupForm.register('name')} disabled={isLoading} />
          {signupForm.formState.errors.name && <p className="text-xs text-destructive">{signupForm.formState.errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signup-email">Email</Label>
          <Input id="signup-email" type="email" placeholder="nama@contoh.com" {...signupForm.register('email')} disabled={isLoading} />
          {signupForm.formState.errors.email && <p className="text-xs text-destructive">{signupForm.formState.errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signup-password">Kata Sandi</Label>
          <Input id="signup-password" type="password" {...signupForm.register('password')} disabled={isLoading} />
          {signupForm.formState.errors.password && <p className="text-xs text-destructive">{signupForm.formState.errors.password.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Peran</Label>
          <Controller
            control={signupForm.control}
            name="role"
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                <SelectTrigger><SelectValue placeholder="Pilih peran..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sales">Sales</SelectItem>
                  <SelectItem value="Leader">Leader</SelectItem>
                  <SelectItem value="Superadmin">Superadmin</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Tim</Label>
          <Controller
            control={signupForm.control}
            name="team"
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                <SelectTrigger><SelectValue placeholder="Pilih tim..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AEC">AEC (Architecture)</SelectItem>
                  <SelectItem value="MFG">MFG (Manufacturing)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {signupForm.formState.errors.team && <p className="text-xs text-destructive">{signupForm.formState.errors.team.message}</p>}
        </div>
        {(watchedRole === 'Leader' || watchedRole === 'Superadmin') && (
          <div className="space-y-1.5">
            <Label htmlFor="specialKey">Kunci Rahasia</Label>
            <Input id="specialKey" type="password" {...signupForm.register('specialKey')} disabled={isLoading} />
            {(signupForm.formState.errors as any).specialKey && <p className="text-xs text-destructive">{(signupForm.formState.errors as any).specialKey?.message}</p>}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Daftar
        </Button>
      </form>
    );
  }

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
