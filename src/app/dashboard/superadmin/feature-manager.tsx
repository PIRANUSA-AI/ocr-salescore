'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { FadeIn } from '@/components/ui/fade-in';


type MaintenanceFeature = 'webinar' | 'renewal' | 'aftersales' | 'opportunity' | 'update';

type MaintenanceConfig = {
    id: string;
    features: Record<MaintenanceFeature, boolean>;
};


type FeatureDisplayInfo = {
    key: MaintenanceFeature;
    label: string;
    description: string;
};

// Disesuaikan dengan permintaan untuk hanya mengelola sub-menu Follow Up
const FEATURES: FeatureDisplayInfo[] = [
    { key: 'webinar', label: 'Tugas Webinar Baru', description: 'Menyembunyikan tugas follow-up untuk prospek yang baru ikut webinar.' },
    { key: 'renewal', label: 'Tugas Renewal', description: 'Menyembunyikan tab dan tugas renewal dari dasbor Leader dan Sales.' },
    { key: 'aftersales', label: 'Tugas Aftersales', description: 'Menyembunyikan tab dan tugas aftersales dari dasbor Leader dan Sales.' },
    { key: 'opportunity', label: 'Tugas Peluang (AI)', description: 'Menonaktifkan analisis AI untuk peluang dan menyembunyikan tabnya.' },
    { key: 'update', label: 'Kampanye Update Produk', description: 'Menyembunyikan tab dan tugas kampanye update dari dasbor Leader.' },
];

export function FeatureManager() {
    const [config, setConfig] = useState<MaintenanceConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState<Partial<Record<MaintenanceFeature, boolean>>>({});
    const { toast } = useToast();

    useEffect(() => {
        const fetchConfig = async () => {
            setIsLoading(true);
            try {
                const configRef = doc(db, 'appConfig', 'maintenance');
                const docSnap = await getDoc(configRef);

                const defaultConfig: MaintenanceConfig['features'] = {
                    webinar: true,
                    renewal: true,
                    aftersales: true,
                    opportunity: true,
                    update: true,
                };

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    // Gabungkan default dengan data yang ada untuk memastikan semua kunci ada
                    const features = { ...defaultConfig, ...data?.features };
                    setConfig({ id: 'config', features });
                } else {
                    // Jika dokumen tidak ada, gunakan default
                    setConfig({ id: 'config', features: defaultConfig });
                }
            } catch (err: any) {
                console.error("Gagal memuat konfigurasi fitur:", err);
                if (err.code === 'permission-denied') {
                    const permissionError = new FirestorePermissionError({
                        path: doc(db, 'appConfig', 'maintenance').path,
                        operation: 'get',
                    }, err);
                    errorEmitter.emit('permission-error', permissionError);
                } else {
                    toast({ variant: 'destructive', title: 'Error', description: 'Gagal memuat konfigurasi fitur.' });
                }
            } finally {
                setIsLoading(false);
            }
        }
        fetchConfig();
    }, [toast]);


    const handleToggle = async (feature: MaintenanceFeature, isEnabled: boolean) => {
        setIsUpdating(prev => ({ ...prev, [feature]: true }));

        try {
            const configRef = doc(db, 'appConfig', 'maintenance');
            await setDoc(configRef, {
                features: {
                    [feature]: isEnabled,
                },
            }, { merge: true });

            setConfig(prevConfig => {
                if (!prevConfig) return null;
                return {
                    ...prevConfig,
                    features: {
                        ...prevConfig.features,
                        [feature]: isEnabled,
                    },
                };
            });
            const featureLabel = FEATURES.find(f => f.key === feature)?.label || 'Fitur';
            toast({
                title: 'Sukses',
                description: `Fitur ${featureLabel} telah ${isEnabled ? 'diaktifkan' : 'dinonaktifkan'}.`,
            });
        } catch (error: any) {
            if (error.code === 'permission-denied') {
                const permissionError = new FirestorePermissionError({
                    path: doc(db, 'appConfig', 'maintenance').path,
                    operation: 'write',
                }, error);
                errorEmitter.emit('permission-error', permissionError);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Gagal Memperbarui',
                    description: error instanceof Error ? error.message : 'Gagal mengubah status fitur. Periksa izin akses Anda.',
                });
            }
        } finally {
            setIsUpdating(prev => ({ ...prev, [feature]: false }));
        }
    };

    if (isLoading) {
        return (
            <FadeIn>
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline text-2xl font-bold w-fit">Manajemen Fitur (Mode Maintenance)</CardTitle>
                        <CardDescription>Aktifkan atau nonaktifkan fitur tertentu di seluruh aplikasi untuk semua pengguna.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-48 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </CardContent>
                </Card>
            </FadeIn>
        );
    }

    return (
        <FadeIn>
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline text-3xl font-bold w-fit">Manajemen Fitur (Mode Maintenance)</CardTitle>
                    <CardDescription>Aktifkan atau nonaktifkan fitur tertentu di seluruh aplikasi untuk semua pengguna.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {FEATURES.map(({ key, label, description }) => (
                        <div key={key} className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor={`maintenance-${key}`} className="text-base">{label}</Label>
                                <p className="text-sm text-muted-foreground">{description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {isUpdating[key] && <Loader2 className="h-4 w-4 animate-spin" />}
                                <Switch
                                    id={`maintenance-${key}`}
                                    checked={config?.features[key] ?? true}
                                    onCheckedChange={(checked) => handleToggle(key, checked)}
                                    disabled={isUpdating[key]}
                                />
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </FadeIn>
    );
};
