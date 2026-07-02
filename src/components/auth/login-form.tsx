
'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation'; // Pastikan pakai next/navigation untuk App Router
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signInWithEmailAndPassword, type AuthError } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { loginLocal, signupLocal } from '@/app/actions/auth-local';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { handleSignupAction } from '@/app/actions/auth';
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field"

// --- ZOD SCHEMAS ---
const loginSchema = z.object({
  email: z.string().email({ message: 'Email tidak valid.' }),
  password: z.string().min(6, { message: 'Minimal 6 karakter.' }),
});

const leaderSignupSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi.'),
  email: z.string().email('Email tidak valid.'),
  password: z.string().min(6, 'Minimal 6 karakter.'),
  team: z.enum(['AEC', 'MFG'], { required_error: 'Tim harus dipilih.' }),
  specialKey: z.string().refine(val => val === "LeadPira", { message: "Kunci khusus tidak valid." }),
  role: z.literal('Leader'),
});

const salesSignupSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi.'),
  email: z.string().email('Email tidak valid.'),
  password: z.string().min(6, 'Minimal 6 karakter.'),
  team: z.enum(['AEC', 'MFG'], { required_error: 'Tim harus dipilih.' }),
  role: z.literal('Sales'),
});

const superadminSignupSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi.'),
  email: z.string().email('Email tidak valid.'),
  password: z.string().min(6, 'Minimal 6 karakter.'),
  team: z.enum(['AEC', 'MFG'], { required_error: 'Tim harus dipilih.' }),
  specialKey: z.string().refine(val => val === "SuperPira", { message: "Kunci khusus tidak valid." }),
  role: z.literal('Superadmin'),
});

const signupSchema = z.union([leaderSignupSchema, salesSignupSchema, superadminSignupSchema]);
type SignupFormData = z.infer<typeof signupSchema>;

// When Firebase is not configured we run MySQL-backed auth (local mode).
const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || 'local';




interface LoginFormProps {
  isSignup: boolean;
  setIsSignup: (value: boolean) => void;
}

export function LoginForm({ isSignup, setIsSignup }: LoginFormProps) {
  const router = useRouter(); // <--- Tambahkan ini
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
      name: '',
      email: '',
      password: '',
      role: 'Sales',
      team: undefined,
      specialKey: undefined,
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
    try {
      if (AUTH_MODE === 'local') {
        const result = await loginLocal(data.email, data.password);
        if (!result.success) {
          toast({ variant: 'destructive', title: 'Autentikasi Gagal', description: result.error });
          setIsLoading(false);
          return;
        }
        await refreshLocalSession?.();
        toast({ title: 'Login Berhasil', description: 'Mengalihkan ke dasbor...' });
        router.push('/dashboard');
        return;
      }

      await signInWithEmailAndPassword(auth, data.email, data.password);
      toast({ title: "Login Berhasil", description: "Mengalihkan ke dasbor..." });
      router.push('/dashboard');

    } catch (error: any) {
      handleAuthError(error as AuthError);
      setIsLoading(false);
    }
  };

  const handleSignup = async (data: SignupFormData) => {
    setIsLoading(true);
    const result =
      AUTH_MODE === 'local'
        ? await signupLocal({
            name: data.name,
            email: data.email,
            password: data.password,
            role: data.role,
            team: data.team,
          })
        : await handleSignupAction(data);
    setIsLoading(false);
    if (result.success) {
      toast({ title: 'Pendaftaran Berhasil', description: 'Silakan masuk untuk melanjutkan.' });
      setIsSignup(false); // Switch to login form
    } else {
      toast({ variant: 'destructive', title: 'Pendaftaran Gagal', description: result.error });
    }
  };

  const watchedRole = signupForm.watch('role');

  return (
    <>
      {isSignup ? (
        // --- SIGNUP FORM ---
        <>
          <CardHeader suppressHydrationWarning>
            <CardTitle>Buat Akun</CardTitle>
            <CardDescription>Isi detail di bawah untuk membuat akun baru.</CardDescription>
          </CardHeader>
          <form onSubmit={signupForm.handleSubmit(handleSignup)} suppressHydrationWarning>
            <CardContent suppressHydrationWarning>
              <FieldSet>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="signup-name">Nama Lengkap</FieldLabel>
                    <Input id="signup-name" placeholder="Nama Anda" {...signupForm.register('name')} disabled={isLoading} />
                    {signupForm.formState.errors.name && <p className="text-xs text-destructive">{signupForm.formState.errors.name.message}</p>}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                    <Input id="signup-email" type="email" placeholder="nama@contoh.com" {...signupForm.register('email')} disabled={isLoading} />
                    {signupForm.formState.errors.email && <p className="text-xs text-destructive">{signupForm.formState.errors.email.message}</p>}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="signup-password">Kata Sandi</FieldLabel>
                    <Input id="signup-password" type="password" {...signupForm.register('password')} disabled={isLoading} />
                    {signupForm.formState.errors.password && <p className="text-xs text-destructive">{signupForm.formState.errors.password.message}</p>}
                  </Field>
                  <Field>
                    <FieldLabel>Peran</FieldLabel>
                    <Controller
                      control={signupForm.control}
                      name="role"
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih peran Anda..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Sales">Sales</SelectItem>
                            <SelectItem value="Leader">Leader</SelectItem>
                            <SelectItem value="Superadmin">Superadmin</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Tim</FieldLabel>
                    <Controller
                      control={signupForm.control}
                      name="team"
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih tim Anda..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AEC">AEC (Architecture)</SelectItem>
                            <SelectItem value="MFG">MFG (Manufacturing)</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {signupForm.formState.errors.team && <p className="text-xs text-destructive">{signupForm.formState.errors.team.message}</p>}
                  </Field>
                  {(watchedRole === 'Leader' || watchedRole === 'Superadmin') && (
                    <Field>
                      <FieldLabel htmlFor="specialKey">Kunci Rahasia</FieldLabel>
                      <Input id="specialKey" type="password" {...signupForm.register('specialKey')} disabled={isLoading} />
                      {(signupForm.formState.errors as any).specialKey && <p className="text-xs text-destructive">{(signupForm.formState.errors as any).specialKey?.message}</p>}
                    </Field>
                  )}
                </FieldGroup>
              </FieldSet>
            </CardContent>
            <CardFooter className="flex-col gap-4" suppressHydrationWarning>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Daftar
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                Sudah punya akun?{' '}
                <button type="button" onClick={() => setIsSignup(false)} className="font-semibold text-primary hover:underline focus:outline-none">
                  Masuk
                </button>
              </p>
            </CardFooter>
          </form>
        </>
      ) : (
        // --- LOGIN FORM ---
        <form onSubmit={loginForm.handleSubmit(handleLogin)} suppressHydrationWarning>
          <CardHeader suppressHydrationWarning>
            <CardTitle>Masuk</CardTitle>
            <CardDescription>Masukkan email dan kata sandi Anda untuk melanjutkan.</CardDescription>
          </CardHeader>
          <CardContent suppressHydrationWarning>
            <FieldSet>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="login-email">Email</FieldLabel>
                  <Input id="login-email" type="email" placeholder="nama@contoh.com" {...loginForm.register('email')} disabled={isLoading} />
                  {loginForm.formState.errors.email && <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="login-password">Kata Sandi</FieldLabel>
                  <Input id="login-password" type="password" {...loginForm.register('password')} disabled={isLoading} />
                  {loginForm.formState.errors.password && <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>}
                </Field>
              </FieldGroup>
            </FieldSet>
          </CardContent>
          <CardFooter className="flex-col gap-4" suppressHydrationWarning>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Masuk
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Belum punya akun?{' '}
              <button type="button" onClick={() => setIsSignup(true)} className="font-semibold text-primary hover:underline focus:outline-none">
                Daftar
              </button>
            </p>
          </CardFooter>
        </form>
      )}
    </>
  );
}
