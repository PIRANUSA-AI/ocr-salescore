'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { updateProfileAction, changePasswordAction } from '@/app/actions/profile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Camera, User, Lock, Save, ArrowLeft } from 'lucide-react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from '@/lib/firebase';

const storage = getStorage(app);

export default function ProfilePage() {
    const { userProfile } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    // Profile State
    const [name, setName] = useState(userProfile?.name || '');
    const [team, setTeam] = useState(userProfile?.team || 'AEC');
    const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || '');
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Password State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userProfile) return;

        setUploadingPhoto(true);
        try {
            const storageRef = ref(storage, `profile_pictures/${userProfile.uid}/${Date.now()}-${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            setPhotoURL(downloadURL);
            toast({ title: "Foto Diunggah", description: "Jangan lupa simpan perubahan profil Anda." });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Gagal Upload", description: "Terjadi kesalahan saat mengunggah foto." });
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleUpdateProfile = async () => {
        if (!userProfile) return;
        setIsLoading(true);
        try {
            const result = await updateProfileAction({
                uid: userProfile.uid,
                name,
                team: team as 'AEC' | 'MFG',
                photoURL
            });

            if (result.success) {
                toast({ title: "Sukses", description: "Profil berhasil diperbarui." });
            } else {
                toast({ variant: "destructive", title: "Gagal", description: result.error });
            }
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Terjadi kesalahan sistem." });
        } finally {
            setIsLoading(false);
        }
    };

    const handleChangePassword = async () => {
        if (!userProfile) return;
        if (newPassword !== confirmPassword) {
            toast({ variant: "destructive", title: "Password Tidak Cocok", description: "Konfirmasi password baru tidak sesuai." });
            return;
        }
        if (newPassword.length < 6) {
            toast({ variant: "destructive", title: "Password Lemah", description: "Password minimal 6 karakter." });
            return;
        }

        setIsLoading(true);
        try {
            const result = await changePasswordAction({
                uid: userProfile.uid,
                newPassword
            });

            if (result.success) {
                toast({ title: "Sukses", description: "Password berhasil diubah. Silakan login ulang nanti." });
                setNewPassword('');
                setConfirmPassword('');
            } else {
                toast({ variant: "destructive", title: "Gagal", description: result.error });
            }
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Terjadi kesalahan sistem." });
        } finally {
            setIsLoading(false);
        }
    };

    if (!userProfile) {
        return <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="space-y-6 pt-6 px-6 md:px-8 pb-12 max-w-7xl mx-auto">
            <Button variant="ghost" className="pl-0 hover:pl-2 transition-all" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Kembali ke Dashboard
            </Button>

            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-bold tracking-tight text-gray-900">Pengaturan Profil</h2>
                <p className="text-muted-foreground">Kelola informasi akun dan preferensi keamanan Anda.</p>
            </div>

            <Tabs defaultValue="general" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="general" className="flex items-center gap-2"><User className="h-4 w-4" /> Umum</TabsTrigger>
                    <TabsTrigger value="security" className="flex items-center gap-2"><Lock className="h-4 w-4" /> Keamanan</TabsTrigger>
                </TabsList>

                <TabsContent value="general">
                    <Card>
                        <CardHeader>
                            <CardTitle>Informasi Profil</CardTitle>
                            <CardDescription>Perbarui foto profil dan detail pribadi Anda.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-col items-center sm:flex-row gap-6">
                                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                    <Avatar className="h-24 w-24 border-2 border-gray-100">
                                        <AvatarImage src={photoURL || userProfile.photoURL || ''} className="object-cover" />
                                        <AvatarFallback className="text-lg bg-primary/10 text-primary">
                                            {userProfile.name.charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        {uploadingPhoto ? <Loader2 className="h-6 w-6 text-white animate-spin" /> : <Camera className="h-6 w-6 text-white" />}
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handlePhotoUpload}
                                        disabled={uploadingPhoto}
                                    />
                                </div>
                                <div className="space-y-1 text-center sm:text-left">
                                    <h3 className="font-medium text-lg">Foto Profil</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Klik pada foto untuk mengganti.<br />
                                        Format: JPG, PNG, GIF. Max 5MB.
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nama Lengkap</Label>
                                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" value={userProfile.email} disabled className="bg-muted" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="team">Tim</Label>
                                    <Select value={team} onValueChange={(val) => setTeam(val as "AEC" | "MFG")}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Pilih Tim" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="AEC">AEC (Architecture, Eng & Construction)</SelectItem>
                                            <SelectItem value="MFG">MFG (Manufacturing)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="role">Peran</Label>
                                    <Input id="role" value={userProfile.role} disabled className="bg-muted" />
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button onClick={handleUpdateProfile} disabled={isLoading || uploadingPhoto}>
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Simpan Perubahan
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="security">
                    <Card>
                        <CardHeader>
                            <CardTitle>Ubah Password</CardTitle>
                            <CardDescription>Pastikan akun Anda aman dengan menggunakan password yang kuat.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 max-w-md">
                            <div className="space-y-2">
                                <Label htmlFor="new-password">Password Baru</Label>
                                <Input
                                    id="new-password"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Minimal 6 karakter"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirm-password">Konfirmasi Password Baru</Label>
                                <Input
                                    id="confirm-password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Ulangi password baru"
                                />
                            </div>
                            <div className="flex justify-end pt-4">
                                <Button onClick={handleChangePassword} disabled={isLoading || !newPassword}>
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Update Password
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
