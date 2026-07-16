'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Camera, Upload, Check, RotateCcw, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { extractCustomerVision } from '@/ai/flows/extract-customer-vision';
import type { ExtractResult } from '@/lib/ocr/extract';
import type { Confidence } from '@/lib/ocr/types';
import { api } from '@/lib/api-client';
import { compressImageToDataUri } from '@/lib/image-compress';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEFAULT_EVENT_BY_TEAM, EVENT_OPTIONS, EVENT_TO_TEAM, getDefaultDayIndex, eventDateForDay } from '@/types';
import { EventDaySelect } from '@/components/ui/event-day-select';

const SALES_CODES = ['A-1', 'B-1', 'C-1', 'D-1', 'E-1', 'F-1', 'G-1'];

const READING_STEPS = [
    'Memproses & mengompres gambar',
    'Menganalisis struktur dokumen',
    'Mengenali teks (OCR)',
    'Mengekstrak nama & kontak',
    'Menyusun data pelanggan',
];

const CONFIDENCE_STYLE: Record<Confidence, { ring: string; label: string; text: string }> = {
    high: { ring: 'border-green-500/40 bg-green-500/5', label: 'Yakin', text: 'text-green-600' },
    medium: { ring: 'border-yellow-500/40 bg-yellow-500/5', label: 'Kurang yakin, cek lagi', text: 'text-yellow-600' },
    low: { ring: 'border-red-500/40 bg-red-500/5', label: 'Ragu, wajib dicek', text: 'text-red-600' },
    empty: { ring: 'border-muted', label: 'Kosong', text: 'text-muted-foreground' },
};

type Status = 'idle' | 'camera' | 'reading' | 'result' | 'saving';

interface QuickOcrDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
}

export function QuickOcrDialog({ isOpen, onOpenChange }: QuickOcrDialogProps) {
    const { toast } = useToast();

    const [status, setStatus] = useState<Status>('idle');
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [result, setResult] = useState<ExtractResult | null>(null);
    const [fields, setFields] = useState<Record<string, string>>({});
    const [formAnswers, setFormAnswers] = useState<{ question: string; answer: string }[]>([]);
    const [salesCode, setSalesCode] = useState<string>('');
    const [eventName, setEventName] = useState(DEFAULT_EVENT_BY_TEAM.MFG);
    const [dayIndex, setDayIndex] = useState(() => getDefaultDayIndex(DEFAULT_EVENT_BY_TEAM.MFG));
    const [creatorTeam, setCreatorTeam] = useState<'AEC' | 'MFG'>('MFG');
    const [readingStep, setReadingStep] = useState(0);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const stopCamera = useCallback(() => {
        if (videoRef.current?.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
    }, []);

    const resetState = useCallback(() => {
        setStatus('idle');
        setImagePreview(null);
        setResult(null);
        setFields({});
        setFormAnswers([]);
        setSalesCode('');
        setEventName(DEFAULT_EVENT_BY_TEAM.MFG);
        setCreatorTeam('MFG');
        setReadingStep(0);
        setHasCameraPermission(null);
        stopCamera();
    }, [stopCamera]);

    useEffect(() => {
        if (!isOpen) {
            const timer = setTimeout(() => { resetState(); }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen, resetState]);

    useEffect(() => {
        if (status !== 'reading') { setReadingStep(0); return; }
        const interval = setInterval(() => {
            setReadingStep(prev => (prev < READING_STEPS.length - 1 ? prev + 1 : prev));
        }, 1500);
        return () => clearInterval(interval);
    }, [status]);

    const handleClose = () => {
        if (status === 'saving') return;
        onOpenChange(false);
    };

    const processImage = useCallback(async (dataUri: string) => {
        setStatus('reading');
        setImagePreview(dataUri);
        try {
            const compressed = await compressImageToDataUri(dataUri);
            const res = await extractCustomerVision({ imageDataUri: compressed });
            if ('rejected' in res) {
                toast({
                    variant: 'destructive',
                    title: 'Gambar tidak diproses',
                    description: res.message,
                });
                resetState();
                return;
            }
            setImagePreview(res.imageUrl || compressed);
            setResult(res);
            setFields({
                name: res.name.value,
                company: res.company.value,
                jobTitle: res.jobTitle.value,
                division: res.division.value,
                phone: res.phone.value,
                email: res.email.value,
                softwareNeeds: res.softwareNeeds.value,
                address: res.address.value,
            });
            setFormAnswers(res.formAnswers || []);
            setStatus('result');
        } catch (err) {
            toast({
                variant: 'destructive',
                title: 'Gagal Ekstraksi OCR',
                description: err instanceof Error ? err.message : 'Terjadi kesalahan.',
            });
            resetState();
        }
    }, [toast, resetState]);

    useEffect(() => {
        if (isOpen && status === 'camera') {
            const enableCamera = async () => {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                    setHasCameraPermission(true);
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        videoRef.current.play().catch(() => {});
                    }
                } catch (err) {
                    console.error('Camera error:', err);
                    setHasCameraPermission(false);
                }
            };
            enableCamera();
        }
        return () => { stopCamera(); };
    }, [isOpen, status, stopCamera]);

    const handleCaptureImage = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video.videoWidth) {
            toast({ variant: 'destructive', title: 'Kamera Belum Siap', description: 'Tunggu hingga tampilan kamera muncul.' });
            return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const dataUri = canvas.toDataURL('image/jpeg');
        stopCamera();
        processImage(dataUri);
    };

    const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUri = reader.result as string;
            setImagePreview(dataUri);
            processImage(dataUri);
        };
        reader.readAsDataURL(file);
    };

    const onSave = async () => {
        if (!fields.name?.trim()) {
            toast({ variant: 'destructive', title: 'Nama wajib diisi.' });
            return;
        }
        if (!salesCode) {
            toast({ variant: 'destructive', title: 'Pilih kode tim sales.' });
            return;
        }
        if (!eventName.trim()) {
            toast({ variant: 'destructive', title: 'Nama event wajib diisi.' });
            return;
        }
        const emailValue = fields.email?.trim();
        if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
            toast({ variant: 'destructive', title: 'Email tidak valid.', description: 'Perbaiki atau kosongkan field email sebelum menyimpan.' });
            return;
        }

        setStatus('saving');
        try {
            await api.customers.createManual({
                name: fields.name.trim(),
                company: fields.company?.trim() || '',
                jobTitle: fields.jobTitle?.trim() || '',
                phone: fields.phone?.trim() || '',
                email: fields.email?.trim() || '',
                address: fields.address?.trim() || '',
                creatorTeam,
                products: [],
                assignedSalesId: null,
                assignedSalesName: null,
                notes: `Kode sales: ${salesCode}`,
                imageUrl: result?.imageUrl || '',
                imageKey: result?.imageKey || '',
                acquisitionContext: {
                    source: 'OCR',
                    eventName: eventName.trim(),
                    eventDate: eventDateForDay(eventName, dayIndex),
                },
                formAnswers,
            } as any);

            toast({ title: 'Tersimpan', description: `Kontak ${fields.name} berhasil ditambahkan.` });
            handleClose();
        } catch (err) {
            toast({
                variant: 'destructive',
                title: 'Gagal Menyimpan',
                description: err instanceof Error ? err.message : 'Terjadi kesalahan.',
            });
            setStatus('result');
        }
    };

    const fieldConfig: { key: string; label: string; conf: Confidence; alternatives: string[] }[] = [
        { key: 'name', label: 'Nama', conf: result?.name.confidence ?? 'high', alternatives: result?.name.alternatives ?? [] },
        { key: 'company', label: 'Perusahaan', conf: result?.company.confidence ?? 'high', alternatives: result?.company.alternatives ?? [] },
        { key: 'jobTitle', label: 'Jabatan', conf: result?.jobTitle.confidence ?? 'high', alternatives: result?.jobTitle.alternatives ?? [] },
        { key: 'division', label: 'Divisi', conf: result?.division.confidence ?? 'empty', alternatives: result?.division.alternatives ?? [] },
        { key: 'phone', label: 'No. Telepon', conf: result?.phone.confidence ?? 'high', alternatives: result?.phone.alternatives ?? [] },
        { key: 'email', label: 'Email', conf: result?.email.confidence ?? 'high', alternatives: result?.email.alternatives ?? [] },
        { key: 'softwareNeeds', label: 'Kebutuhan Software', conf: result?.softwareNeeds.confidence ?? 'high', alternatives: result?.softwareNeeds.alternatives ?? [] },
        { key: 'address', label: 'Alamat', conf: result?.address.confidence ?? 'empty', alternatives: result?.address.alternatives ?? [] },
    ];

    const renderContent = () => {
        switch (status) {
            case 'idle':
                return (
                    <div className="flex flex-col gap-3 py-4">
                        <Button size="lg" className="h-20 text-base active:translate-y-px" onClick={() => cameraInputRef.current?.click()}>
                            <Camera className="h-6 w-6 mr-3" /> Foto Langsung
                        </Button>
                        <Button size="lg" variant="outline" className="h-14 active:translate-y-px" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="h-5 w-5 mr-2" /> Unggah Gambar
                        </Button>
                        <p className="text-xs text-muted-foreground text-center pt-1">
                            Foto kartu nama atau form customer. AI akan mengekstrak datanya.
                        </p>
                    </div>
                );
            case 'camera':
                return (
                    <div className="flex flex-col items-center justify-center gap-4 min-h-[300px] md:min-h-[400px]">
                        <canvas ref={canvasRef} className="hidden" />
                        {hasCameraPermission === false ? (
                            <Alert variant="destructive">
                                <AlertTitle>Akses Kamera Ditolak</AlertTitle>
                                <AlertDescription>Izinkan akses kamera di pengaturan browser Anda.</AlertDescription>
                            </Alert>
                        ) : (
                            <>
                                <div className="w-full max-w-xs aspect-[4/3] bg-black rounded-lg overflow-hidden relative">
                                    <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                                </div>
                                <Button onClick={handleCaptureImage} size="lg"><Camera className="mr-2 h-5 w-5" /> Ambil Gambar</Button>
                            </>
                        )}
                        <Button variant="outline" onClick={() => setStatus('idle')}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Button>
                    </div>
                );
            case 'reading':
                return (
                    <div className="flex flex-col items-center justify-center min-h-[300px] md:min-h-[400px] w-full max-w-md mx-auto py-4">
                        <div className="w-full space-y-3">
                            <p className="text-center text-sm font-medium text-muted-foreground mb-4">AI sedang membaca dokumen...</p>
                            {READING_STEPS.map((label, i) => {
                                const isDone = i < readingStep;
                                const isActive = i === readingStep;
                                return (
                                    <div key={label} className={cn(
                                        "flex items-center gap-3 rounded-md border p-3 transition-colors",
                                        isActive ? "border-primary bg-primary/5" : isDone ? "border-transparent opacity-60" : "border-transparent opacity-40"
                                    )}>
                                        <span className="flex h-6 w-6 items-center justify-center flex-shrink-0">
                                            {isDone ? (
                                                <Check className="h-5 w-5 text-green-600" />
                                            ) : isActive ? (
                                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                            ) : (
                                                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                                            )}
                                        </span>
                                        <span className={cn("text-sm", isActive && "font-medium text-foreground")}>{label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            case 'result':
            case 'saving':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start py-2">
                        {/* Kiri - Pratinjau Image */}
                        <div className="space-y-4">
                            {imagePreview && (
                                <div className="relative w-full aspect-[4/3] rounded-md overflow-hidden border bg-muted">
                                    <img src={imagePreview} alt="Pratinjau" className="w-full h-full object-contain" />
                                </div>
                            )}
                            {result && result.overriddenFields.length > 0 && (
                                <p className="text-xs text-muted-foreground">Beberapa field ditinjau ulang oleh AI pembanding.</p>
                            )}

                            {/* Pilih Tim yang sebelumnya hanya ada di dashboard userProfile */}
                            <div className="flex flex-col gap-1.5 p-3 border rounded-md bg-muted/20">
                                <Label htmlFor="creatorTeam">Tim Pengguna <span className="text-red-500">*</span></Label>
                                <Select value={creatorTeam} onValueChange={(val: any) => {
                                    setCreatorTeam(val);
                                    setSalesCode('');
                                }} disabled={status === 'saving'}>
                                    <SelectTrigger id="creatorTeam">
                                        <SelectValue placeholder="Pilih tim..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AEC">AEC (Architecture)</SelectItem>
                                        <SelectItem value="MFG">MFG (Manufacturing)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Kanan - Form Editor */}
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="eventName">Nama Event / Acara <span className="text-red-500">*</span></Label>
                                <Select value={eventName} onValueChange={(val) => {
                                    setEventName(val);
                                    setDayIndex(getDefaultDayIndex(val));
                                    const team = EVENT_TO_TEAM[val];
                                    if (team) {
                                        setCreatorTeam(team);
                                        setSalesCode('');
                                    }
                                }} disabled={status === 'saving'}>
                                    <SelectTrigger id="eventName"><SelectValue placeholder="Pilih event..." /></SelectTrigger>
                                    <SelectContent>
                                        {EVENT_OPTIONS.map((e) => (
                                            <SelectItem key={e} value={e}>{e}</SelectItem>
                                        ))}
                                    </SelectContent>
                            </Select>
                        </div>

                        <EventDaySelect eventName={eventName} dayIndex={dayIndex} onDayChange={setDayIndex} />

                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="salesCode">Kode Tim Sales <span className="text-red-500">*</span></Label>
                                <div className="grid grid-cols-4 gap-2">
                                    {SALES_CODES.map((code) => (
                                        <Button key={code} type="button" variant={salesCode === code ? 'default' : 'outline'} size="sm" className="active:translate-y-px" disabled={status === 'saving'} onClick={() => setSalesCode(code)}>
                                            {code}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <div className="border-t pt-3 flex flex-col gap-2.5">
                                <p className="text-xs text-muted-foreground">Verifikasi hasil ekstraksi AI. Ketuk alternatif di bawah input jika ada.</p>
                                {fieldConfig.map(({ key, label, conf, alternatives }) => {
                                    const style = CONFIDENCE_STYLE[conf];
                                    const needsCheck = conf === 'medium' || conf === 'low';
                                    const hasAlt = alternatives.length > 0;
                                    return (
                                        <div key={key} className={cn("flex flex-col gap-1 rounded-md border p-2", style.ring)}>
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor={key} className="text-xs font-semibold">{label}</Label>
                                                {needsCheck && (
                                                    <span className={cn("text-[10px] flex items-center gap-0.5 font-medium", style.text)}>
                                                        <AlertTriangle className="h-3 w-3" /> {style.label}
                                                    </span>
                                                )}
                                            </div>
                                            <Input id={key} value={fields[key] || ''} onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value }))} disabled={status === 'saving'} className="h-9 border-0 bg-transparent px-0 focus-visible:ring-0" />
                                            {hasAlt && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {alternatives.map((alt, i) => (
                                                        <button key={i} type="button" onClick={() => setFields((p) => ({ ...p, [key]: alt }))}
                                                            className="text-[10px] px-2 py-0.5 rounded-full border border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors">
                                                            {alt}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {formAnswers.length > 0 && (
                                <div className="border-t pt-3 flex flex-col gap-2.5">
                                    <Label className="font-medium text-sm">Jawaban Form</Label>
                                    {formAnswers.map((qa, i) => (
                                        <div key={i} className="flex flex-col gap-1">
                                            <Label className="text-xs text-muted-foreground">{qa.question}</Label>
                                            <Input
                                                value={qa.answer}
                                                onChange={(e) => setFormAnswers((prev) =>
                                                    prev.map((item, idx) => idx === i ? { ...item, answer: e.target.value } : item)
                                                )}
                                                disabled={status === 'saving'}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className={cn("sm:max-w-4xl grid-rows-[auto_1fr_auto]", status === 'idle' && 'sm:max-w-md')}>
                <DialogHeader>
                    <DialogTitle>Pindai Cepat</DialogTitle>
                    <DialogDescription>
                        Unggah gambar kartu nama atau form customer. AI akan mengekstrak datanya dan mendeteksi tingkat keyakinan (confidence).
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2 pr-1">
                    <canvas ref={canvasRef} className="hidden" />
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileSelected} />
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
                    {renderContent()}
                </div>

                <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end border-t pt-3">
                    {status !== 'idle' && (
                        <Button type="button" variant="ghost" onClick={resetState} disabled={status === 'saving' || status === 'reading'} className="w-full sm:w-auto">
                            <RotateCcw className="h-4 w-4 mr-1" /> Mulai Ulang
                        </Button>
                    )}
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button type="button" variant="outline" onClick={handleClose} disabled={status === 'saving'} className="flex-1 sm:flex-initial">Batal</Button>
                        {(status === 'result' || status === 'saving') && (
                            <Button type="button" onClick={onSave} disabled={status === 'saving'} className="flex-1 sm:flex-initial">
                                {status === 'saving' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                Simpan Pelanggan
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
