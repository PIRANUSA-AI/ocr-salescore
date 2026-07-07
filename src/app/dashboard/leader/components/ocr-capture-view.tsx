'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Camera, Upload, ScanLine, Check, RotateCcw, ChevronRight, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { compressImageToDataUri } from '@/lib/image-compress';
import { extractCustomerVision } from '@/ai/flows/extract-customer-vision';
import { createManualCustomer } from '@/app/actions/leader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { ExtractResult } from '@/lib/ocr/extract';
import type { Confidence } from '@/lib/ocr/types';
import type { Customer } from '@/types';

const SALES_CODES = ['A-1', 'B-1', 'C-1', 'D-1', 'E-1', 'F-1', 'G-1'];

const READING_STEPS = [
  'Memproses & mengompres gambar',
  'Menganalisis struktur dokumen',
  'Mengenali teks (OCR)',
  'Mengekstrak nama & kontak',
  'Menyusun data pelanggan',
];

type Status = 'idle' | 'camera' | 'reading' | 'result' | 'saving';

const CONFIDENCE_STYLE: Record<Confidence, { ring: string; label: string; text: string }> = {
  high: { ring: 'border-green-500/40 bg-green-500/5', label: 'Yakin', text: 'text-green-600' },
  medium: { ring: 'border-yellow-500/40 bg-yellow-500/5', label: 'Kurang yakin, cek lagi', text: 'text-yellow-600' },
  low: { ring: 'border-red-500/40 bg-red-500/5', label: 'Ragu, wajib dicek', text: 'text-red-600' },
  empty: { ring: 'border-muted', label: 'Kosong', text: 'text-muted-foreground' },
};

interface Props {
  recentCustomers: Customer[];
}

export function OcrCaptureView({ recentCustomers }: Props) {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [status, setStatus] = useState<Status>('idle');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formAnswers, setFormAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [salesCode, setSalesCode] = useState<string>('');
  const [eventName, setEventName] = useState('IBT 2026');
  const [creatorTeam, setCreatorTeam] = useState<'AEC' | 'MFG'>('AEC');
  const [readingStep, setReadingStep] = useState(0);

  useEffect(() => {
    if (userProfile?.team) {
      setCreatorTeam(userProfile.team);
    }
  }, [userProfile]);

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

  const recentThree = useMemo(() => recentCustomers.slice(0, 3), [recentCustomers]);

  const reset = useCallback(() => {
    setStatus('idle');
    setImagePreview(null);
    setResult(null);
    setFields({});
    setFormAnswers([]);
    setSalesCode('');
    setEventName('IBT 2026');
    setCreatorTeam(userProfile?.team || 'AEC');
    setReadingStep(0);
    setHasCameraPermission(null);
    stopCamera();
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [userProfile, stopCamera]);

  useEffect(() => {
    if (status !== 'reading') { setReadingStep(0); return; }
    const interval = setInterval(() => {
      setReadingStep(prev => (prev < READING_STEPS.length - 1 ? prev + 1 : prev));
    }, 1500);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (status === 'camera') {
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
  }, [status, stopCamera]);

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

  const processImage = useCallback(async (dataUri: string) => {
    setStatus('reading');
    try {
      // Step 1: Compress client-side → smaller base64 for server action
      const compressed = await compressImageToDataUri(dataUri);
      // Step 2: Upload to R2 + AI analyze (server-side, one call)
      const res = await extractCustomerVision({ imageDataUri: compressed });
      if ('rejected' in res) {
        toast({
          variant: 'destructive',
          title: 'Gambar tidak diproses',
          description: res.message,
        });
        reset();
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
      reset();
    }
  }, [toast, reset]);

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
    if (!userProfile) return;
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
      toast({
        variant: 'destructive',
        title: 'Email tidak valid.',
        description: 'Perbaiki atau kosongkan field email sebelum menyimpan.',
      });
      return;
    }

    setStatus('saving');
    try {
      await createManualCustomer({
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
        imageKey: '',
        acquisitionContext: {
          source: 'OCR',
          eventName: eventName.trim(),
          eventDate: new Date(),
        },
        formAnswers,
      } as any);

      toast({ title: 'Tersimpan', description: `Kontak ${fields.name} berhasil ditambahkan.` });
      reset();
      window.location.reload();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Gagal Menyimpan',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan.',
      });
      setStatus('result');
    }
  };

  // ============ RENDER ============

  if (status === 'idle') {
    return (
      <div className="flex flex-col gap-6 max-w-md mx-auto w-full">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ScanLine className="h-5 w-5" /> Pindai Kartu / Form
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button size="lg" className="h-20 text-base active:translate-y-px" onClick={() => setStatus('camera')}>
              <Camera className="h-6 w-6 mr-3" /> Foto Langsung
            </Button>
            <Button size="lg" variant="outline" className="h-14 active:translate-y-px" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-5 w-5 mr-2" /> Unggah Gambar
            </Button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFileSelected(e)} />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFileSelected(e)} />
            <p className="text-xs text-muted-foreground text-center pt-1">
              Foto kartu nama atau form customer. AI akan mengekstrak datanya.
            </p>
          </CardContent>
        </Card>

        {recentThree.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Hasil Terbaru</h3>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => router.push('/dashboard?view=customer-manager')}>
                Lihat Semua <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {recentThree.map((c) => (
                <RecentCard key={c.id} customer={c} onClick={() => router.push(`/dashboard/customer/${c.id}`)} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (status === 'camera') {
    return (
      <div className="flex flex-col gap-6 max-w-md mx-auto w-full">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Camera className="h-5 w-5" /> Ambil Foto Kartu Nama
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-4 min-h-[300px] md:min-h-[400px]">
            <canvas ref={canvasRef} className="hidden" />
            {hasCameraPermission === false ? (
              <Alert variant="destructive">
                <AlertTitle>Akses Kamera Ditolak</AlertTitle>
                <AlertDescription>Izinkan akses kamera di pengaturan browser Anda.</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="w-full aspect-[4/3] bg-black rounded-lg overflow-hidden relative border">
                  <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                </div>
                <Button onClick={handleCaptureImage} size="lg" className="w-full active:translate-y-px">
                  <Camera className="mr-2 h-5 w-5" /> Ambil Gambar
                </Button>
              </>
            )}
            <Button variant="outline" className="w-full active:translate-y-px" onClick={() => setStatus('idle')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'reading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto w-full gap-6">
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
        {imagePreview && (
          <div className="w-full aspect-video rounded-lg overflow-hidden border bg-muted">
            <img src={imagePreview} alt="Pratinjau" className="w-full h-full object-contain" />
          </div>
        )}
      </div>
    );
  }

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

  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
      {imagePreview && (
        <div className="w-full aspect-video rounded-lg overflow-hidden border bg-muted">
          <img src={imagePreview} alt="Pratinjau" className="w-full h-full object-contain" />
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Verifikasi & Lengkapi Data</CardTitle>
          {result && result.overriddenFields.length > 0 && (
            <p className="text-xs text-muted-foreground">Beberapa field ditinjau ulang oleh AI pembanding.</p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 p-3 border rounded-md bg-muted/20">
            <Label htmlFor="creatorTeam">Tim Pengguna <span className="text-red-500">*</span></Label>
            <Select value={creatorTeam} onValueChange={(val: any) => setCreatorTeam(val)} disabled={status === 'saving'}>
              <SelectTrigger id="creatorTeam">
                <SelectValue placeholder="Pilih tim..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AEC">AEC (Architecture)</SelectItem>
                <SelectItem value="MFG">MFG (Manufacturing)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eventName">Nama Event / Acara <span className="text-red-500">*</span></Label>
            <Input id="eventName" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Contoh: Pameran MFI 2026" disabled={status === 'saving'} />
          </div>

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
            {fieldConfig.map(({ key, label, conf, alternatives }) => {
              const style = CONFIDENCE_STYLE[conf];
              const needsCheck = conf === 'medium' || conf === 'low';
              const hasAlt = alternatives.length > 0;
              return (
                <div key={key} className={`flex flex-col gap-1 rounded-md border p-2 ${style.ring}`}>
                  <div className="flex items-center justify-between">
                    <Label htmlFor={key} className="text-xs">{label}</Label>
                    {needsCheck && (
                      <span className={`text-[10px] flex items-center gap-0.5 ${style.text}`}>
                        <AlertTriangle className="h-3 w-3" /> {style.label}
                      </span>
                    )}
                  </div>
                  <Input id={key} value={fields[key] || ''} onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value }))} disabled={status === 'saving'} className="h-9 border-0 bg-transparent px-0 focus-visible:ring-0" />
                  {hasAlt && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {alternatives.map((alt, i) => (
                        <button key={i} type="button" onClick={() => setFields((p) => ({ ...p, [key]: alt }))} className="text-[11px] px-2 py-0.5 rounded-full border border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors">
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

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={reset} disabled={status === 'saving'}>
              <RotateCcw className="h-4 w-4 mr-1" /> Foto Ulang
            </Button>
            <Button className="flex-1" onClick={onSave} disabled={status === 'saving'}>
              {status === 'saving' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Simpan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RecentCard({ customer, onClick }: { customer: Customer; onClick: () => void }) {
  const salesCode = customer.formAnswers?.find((qa) => qa.question.toLowerCase().includes('kode'))?.answer;
  const timeAgo = customer.createdAt ? getTimeAgo(customer.createdAt) : '';
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-lg border bg-card active:translate-y-px transition-all hover:border-primary/30 hover:shadow-sm w-full text-left cursor-pointer"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
        {salesCode || (customer.name?.slice(0, 2).toUpperCase() ?? '??')}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{customer.name || '(tanpa nama)'}</p>
        <p className="text-xs text-muted-foreground truncate">{customer.company || customer.phone || '-'}</p>
      </div>
      {timeAgo && <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo}</span>}
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

function getTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'baru saja';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}j lalu`;
  const days = Math.floor(hours / 24);
  return `${days}h lalu`;
}
