

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UploadCloud, ArrowLeft, Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { extractCustomerFromForm } from '@/ai/flows/extract-customer-from-form';
import { createManualCustomer } from '@/app/actions/leader';
import { compressImageToDataUri } from '@/lib/image-compress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CUSTOMER_SOURCES, CustomerSource } from '@/types';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDashboard } from '../context/dashboard-context';
import { DatePicker } from '@/components/ui/date-picker';


// Define a specific list of sources for OCR context
const OCR_INTERACTION_SOURCES: CustomerSource[] = ['Pameran', 'Workshop', 'Visit', 'Training', 'Troubleshoot', 'Lainnya'];

const FormAnswerSchema = z.object({
    question: z.string(),
    answer: z.string(),
});

// Define the shape of the data for the final customer creation
const FinalCustomerSchema = z.object({
    name: z.string().min(1, 'Nama wajib diisi.'),
    email: z.string().email('Email tidak valid.').optional().or(z.literal('')),
    phone: z.string().optional(),
    company: z.string().optional(),
    jobTitle: z.string().optional(),

    // New acquisition context
    acquisitionContext: z.object({
        source: z.enum(CUSTOMER_SOURCES, { required_error: "Sumber interaksi harus dipilih." }),
        eventName: z.string().min(1, "Nama/Konteks Acara wajib diisi."),
        eventDate: z.date({ required_error: 'Tanggal Acara/Interaksi wajib diisi.' }),
    }),

    formAnswers: z.array(FormAnswerSchema).optional(),
});

type FormData = z.infer<typeof FinalCustomerSchema>;

interface OcrImportDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onCustomerAdded: () => void;
}

export function OcrImportDialog({ isOpen, onOpenChange, onCustomerAdded }: OcrImportDialogProps) {
    const [status, setStatus] = useState<'idle' | 'reading' | 'mapping' | 'saving' | 'camera'>('idle');
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { toast } = useToast();
    const { userProfile } = useDashboard();

    const form = useForm<FormData>({
        resolver: zodResolver(FinalCustomerSchema),
        defaultValues: {
            formAnswers: [],
        }
    });

    const { fields: formAnswerFields, replace: replaceFormAnswers } = useFieldArray({
        control: form.control,
        name: "formAnswers"
    });


    const stopCamera = useCallback(() => {
        if (videoRef.current?.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
    }, []);

    const resetState = useCallback(() => {
        setStatus('idle');
        setImagePreview(null);
        stopCamera();
        form.reset();
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [form, stopCamera]);

    // Effect to reset state when dialog closes
    useEffect(() => {
        if (!isOpen) {
            const timer = setTimeout(() => {
                resetState();
            }, 300); // Delay reset to allow for closing animation
            return () => clearTimeout(timer);
        }
    }, [isOpen, resetState]);


    const handleClose = () => {
        if (status === 'saving') return;
        onOpenChange(false);
    }

    const processImage = useCallback(async (imageDataUri: string) => {
        try {
            const compressed = await compressImageToDataUri(imageDataUri);
            const result = await extractCustomerFromForm({ imageDataUri: compressed });

            form.reset({
                name: result.name || '',
                company: result.company || '',
                jobTitle: result.jobTitle || '',
                email: result.email || '',
                phone: result.phone || '',
                acquisitionContext: {
                    source: 'Pameran', // Default source
                    eventName: '',
                    eventDate: new Date(),
                },
                formAnswers: result.formAnswers || [],
            });

            // useFieldArray is better managed with 'replace'
            replaceFormAnswers(result.formAnswers || []);

            setStatus('mapping');
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Gagal Ekstraksi OCR',
                description: error instanceof Error ? error.message : 'Terjadi kesalahan tidak diketahui.',
            });
            resetState();
        }
    }, [form, resetState, toast, replaceFormAnswers]);


    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setStatus('reading');
        setImagePreview(URL.createObjectURL(file));

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = async () => {
            const imageDataUri = reader.result as string;
            await processImage(imageDataUri);
        };
    };

    const handleCaptureImage = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const videoEl = videoRef.current;
        if (!videoEl.videoWidth) {
            toast({ variant: 'destructive', title: 'Kamera Belum Siap', description: 'Tunggu hingga tampilan kamera muncul, lalu coba lagi.' });
            return;
        }
        setStatus('reading');
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (context) {
            context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            const imageDataUri = canvas.toDataURL('image/jpeg');
            setImagePreview(imageDataUri);
            stopCamera(); // Stop camera after capture
            processImage(imageDataUri);
        }
    };

    const onSubmit = async (data: FormData) => {
        if (!userProfile) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Profil pengguna tidak teridentifikasi. Gagal menyimpan.',
            });
            return;
        }

        setStatus('saving');
        try {
            await createManualCustomer({
                ...data,
                creatorTeam: userProfile.team,
                products: [],
                // Source is now part of acquisitionContext
                assignedSalesId: null, // Leaders add customers as unassigned
                assignedSalesName: null,
            });

            toast({ title: 'Sukses', description: `Pelanggan "${data.name}" berhasil ditambahkan dari gambar.` });
            onCustomerAdded();
            handleClose();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Gagal Menyimpan Pelanggan',
                description: error instanceof Error ? error.message : 'Terjadi kesalahan tidak diketahui.',
            });
            setStatus('mapping');
        }
    };

    useEffect(() => {
        if (isOpen && status === 'camera') {
            const getCameraPermission = async () => {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            facingMode: 'environment',
                        }
                    });
                    setHasCameraPermission(true);
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        videoRef.current.play().catch(() => {});
                    }
                } catch (error) {
                    console.error('Error accessing camera:', error);
                    setHasCameraPermission(false);
                }
            };
            getCameraPermission();

        } else {
            stopCamera();
        }

        return () => {
            stopCamera();
        }
    }, [isOpen, status, stopCamera]);


    const renderContent = () => {
        switch (status) {
            case 'camera':
                return (
                    <div className="flex flex-col items-center justify-center space-y-4 min-h-[300px] md:min-h-[400px]">
                        {hasCameraPermission === false ? (
                            <Alert variant="destructive">
                                <AlertTitle>Akses Kamera Ditolak</AlertTitle>
                                <AlertDescription>
                                    Izinkan akses kamera di pengaturan browser Anda untuk menggunakan fitur ini.
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <>
                                <div className="w-full max-w-[280px] aspect-[9/16] bg-black rounded-lg overflow-hidden relative">
                                    <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                                    <div className="absolute inset-0 border-4 md:border-[1rem] border-black/30 rounded-lg box-border"></div>
                                </div>
                                <Button onClick={handleCaptureImage} size="lg">Ambil Gambar</Button>
                            </>
                        )}
                        <Button variant="outline" onClick={() => setStatus('idle')}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Button>
                    </div>
                );
            case 'idle':
                return (
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-lg p-12 space-y-6 min-h-[300px] md:min-h-[400px]">
                        <div className="text-center">
                            <h3 className="text-lg font-medium">Pindai Dokumen</h3>
                            <p className="text-muted-foreground text-sm mt-1">Gunakan kamera atau unggah gambar form/kartu nama untuk memulai.</p>
                        </div>

                        <div className='flex flex-col sm:flex-row gap-4 pt-6'>
                            <Button type="button" onClick={() => fileInputRef.current?.click()}>
                                <UploadCloud className="mr-2 h-4 w-4" /> Unggah Gambar
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => setStatus('camera')}>
                                <Camera className="mr-2 h-4 w-4" /> Gunakan Kamera
                            </Button>
                        </div>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" className="hidden" />
                    </div>
                );
            case 'reading':
                return (
                    <div className="flex flex-col items-center justify-center min-h-[300px] md:min-h-[400px]">
                        <Loader2 className="w-12 h-12 animate-spin text-primary" />
                        <p className="mt-4 text-muted-foreground">AI sedang membaca dokumen...</p>
                    </div>
                );
            case 'mapping':
            case 'saving':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <div className="space-y-4">
                            <div className="relative w-full aspect-[9/16] sm:aspect-video rounded-md overflow-hidden border">
                                {imagePreview && <Image src={imagePreview} alt="Preview Dokumen" fill objectFit="contain" />}
                            </div>
                        </div>

                        <form id="ocr-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 overflow-y-auto max-h-[60vh] md:max-h-none pr-2">
                            <p className="text-sm text-muted-foreground">Verifikasi hasil ekstraksi AI dan tambahkan konteks sebelum menyimpan.</p>

                            {/* --- New Acquisition Context Fields --- */}
                            <div className="p-4 border rounded-md space-y-3 bg-muted/20">
                                <h4 className="font-medium text-sm">Konteks Akuisisi</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <Label>Sumber Interaksi</Label>
                                        <Controller
                                            name="acquisitionContext.source"
                                            control={form.control}
                                            render={({ field }) => (
                                                <Select onValueChange={field.onChange} value={field.value} disabled={status === 'saving'}>
                                                    <SelectTrigger><SelectValue placeholder="Pilih sumber..." /></SelectTrigger>
                                                    <SelectContent>
                                                        {OCR_INTERACTION_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </div>
                                    <div>
                                        <Label>Tanggal Interaksi</Label>
                                        <Controller
                                            name="acquisitionContext.eventDate"
                                            control={form.control}
                                            render={({ field }) => <DatePicker date={field.value} setDate={field.onChange} disabled={status === 'saving'} />}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <Label>Nama Event / Konteks</Label>
                                        <Input {...form.register('acquisitionContext.eventName')} placeholder="Contoh: Pameran MFI 2025" disabled={status === 'saving'} />
                                        {form.formState.errors.acquisitionContext?.eventName && <p className="text-sm text-destructive">{form.formState.errors.acquisitionContext.eventName.message}</p>}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="col-span-1 sm:col-span-2">
                                        <Label htmlFor="name">Nama Lengkap</Label>
                                        <Input id="name" {...form.register('name')} disabled={status === 'saving'} />
                                        {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
                                    </div>
                                    <div className="col-span-1 sm:col-span-2">
                                        <Label htmlFor="company">Perusahaan</Label>
                                        <Input id="company" {...form.register('company')} disabled={status === 'saving'} />
                                    </div>
                                    <div>
                                        <Label htmlFor="jobTitle">Jabatan</Label>
                                        <Input id="jobTitle" {...form.register('jobTitle')} disabled={status === 'saving'} />
                                    </div>
                                    <div>
                                        <Label htmlFor="phone">No. Telepon</Label>
                                        <Input id="phone" {...form.register('phone')} disabled={status === 'saving'} />
                                    </div>
                                    <div className="col-span-1 sm:col-span-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input id="email" type="email" {...form.register('email')} disabled={status === 'saving'} />
                                        {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
                                    </div>
                                </div>
                                <div className="col-span-2 space-y-3 pt-2">
                                    <Label className="font-medium">Jawaban Form</Label>
                                    {formAnswerFields.map((field, index) => {
                                        const isPriorityField = field.question.toLowerCase().includes('prioritas');
                                        return (
                                            <div key={field.id} className="space-y-1">
                                                <Label htmlFor={`form-q-${index}`} className="text-xs text-muted-foreground">{field.question}</Label>
                                                {isPriorityField ? (
                                                    <Controller
                                                        control={form.control}
                                                        name={`formAnswers.${index}.answer`}
                                                        render={({ field: controllerField }) => (
                                                            <Select onValueChange={controllerField.onChange} value={controllerField.value} disabled={status === 'saving'}>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Pilih prioritas..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="none">(Kosong)</SelectItem>
                                                                    <SelectItem value="Low">Low</SelectItem>
                                                                    <SelectItem value="Medium">Medium</SelectItem>
                                                                    <SelectItem value="High">High</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                ) : (
                                                    <Input
                                                        id={`form-q-${index}`}
                                                        {...form.register(`formAnswers.${index}.answer`)}
                                                        disabled={status === 'saving'}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                    {formAnswerFields.length === 0 && <p className="text-xs text-center text-muted-foreground py-2 border rounded-md">Tidak ada jawaban form yang terdeteksi.</p>}
                                </div>
                            </div>
                        </form>
                    </div>
                )
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-4xl grid-rows-[auto_1fr_auto]">
                <DialogHeader>
                    <DialogTitle>Impor Pelanggan dari Gambar (OCR)</DialogTitle>
                    <DialogDescription>
                        Unggah gambar kartu nama atau formulir untuk mengekstrak informasi pelanggan secara otomatis.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 pr-3 overflow-y-auto" style={{ maxHeight: '75vh' }}>
                    <canvas ref={canvasRef} className="hidden" />
                    {renderContent()}
                </div>

                <DialogFooter>
                    {status !== 'idle' && status !== 'camera' && (
                        <Button type="button" variant="ghost" onClick={resetState} disabled={status === 'saving' || status === 'reading'}>Mulai Ulang</Button>
                    )}
                    <Button type="button" variant="outline" onClick={handleClose} disabled={status === 'saving'}>Batal</Button>
                    {(status === 'mapping' || status === 'saving') && (
                        <Button type="submit" form="ocr-form" disabled={status === 'saving'}>
                            {status === 'saving' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Simpan Pelanggan
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}