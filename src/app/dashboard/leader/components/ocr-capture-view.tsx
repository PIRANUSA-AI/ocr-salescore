'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Camera, Upload, ScanLine, Check, RotateCcw, ChevronRight, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { compressImageToDataUri, dataUriToBlob } from '@/lib/image-compress';
import { getUploadUrl, getR2PresignedUrl } from '@/app/actions/storage';
import { extractCustomerVision } from '@/ai/flows/extract-customer-vision';
import { createManualCustomer } from '@/app/actions/leader';
import type { ExtractResult } from '@/lib/ocr/extract';
import type { Confidence } from '@/lib/ocr/types';
import type { Customer } from '@/types';

const SALES_CODES = ['A-1', 'B-1', 'C-1', 'D-1', 'E-1', 'F-1', 'G-1'];

type Status = 'idle' | 'reading' | 'result' | 'saving';

const CONFIDENCE_STYLE: Record<Confidence, { ring: string; label: string; text: string }> = {
  high: { ring: 'border-green-500/40 bg-green-500/5', label: 'Yakin', text: 'text-green-600' },
  medium: { ring: 'border-yellow-500/40 bg-yellow-500/5', label: 'Kurang yakin, cek lagi', text: 'text-yellow-600' },
  low: { ring: 'border-red-500/40 bg-red-500/5', label: 'Ragu, wajib dicek', text: 'text-red-600' },
  empty: { ring: 'border-muted', label: 'Kosong', text: 'text-muted-foreground' },
};

interface Props {
  /** Recent OCR customers to show under the capture card. */
  recentCustomers: Customer[];
}

export function OcrCaptureView({ recentCustomers }: Props) {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [status, setStatus] = useState<Status>('idle');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrImageKey, setOcrImageKey] = useState<string>('');
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [salesCode, setSalesCode] = useState<string>('');
  const [eventName, setEventName] = useState('');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const recentThree = useMemo(() => recentCustomers.slice(0, 3), [recentCustomers]);

  const reset = useCallback(() => {
    setStatus('idle');
    setImagePreview(null);
    setOcrImageKey('');
    setResult(null);
    setFields({});
    setSalesCode('');
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const processImage = useCallback(async (dataUri: string) => {
    setStatus('reading');
    try {
      const compressed = await compressImageToDataUri(dataUri);
      // Step 1: Get presigned upload URL (tiny call — no image data)
      const contentType = 'image/jpeg';
      const { uploadUrl, key } = await getUploadUrl(contentType);
      // Step 2: Upload langsung ke R2 — gak lewat Vercel
      const blob = dataUriToBlob(compressed);
      const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: blob });
      if (!uploadRes.ok) throw new Error('Gagal upload gambar ke Cloudflare R2.');
      // Step 3: Get presigned view URL
      const { url } = await getR2PresignedUrl(key);
      setImagePreview(url);
      setOcrImageKey(key);
      // Step 4: Analyze pakai R2 URL
      const res = await extractCustomerVision({ imageUrl: url });
      setResult(res);
      setFields({
        name: res.name.value,
        company: res.company.value,
        jobTitle: res.jobTitle.value,
        division: res.division.value,
        phone: res.phone.value,
        email: res.email.value,
        softwareNeeds: res.softwareNeeds.value,
      });
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

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>, fromCamera: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      setImagePreview(dataUri);
      processImage(dataUri);
    };
    reader.readAsDataURL(file);
    void fromCamera;
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
      const formAnswers = [
        { question: 'Divisi', answer: fields.division || '' },
        { question: 'Kebutuhan Software', answer: fields.softwareNeeds || '' },
        { question: 'Kode Tim Sales', answer: salesCode },
      ].filter((qa) => qa.answer);

      await createManualCustomer({
        name: fields.name.trim(),
        company: fields.company?.trim() || '',
        jobTitle: fields.jobTitle?.trim() || '',
        phone: fields.phone?.trim() || '',
        email: fields.email?.trim() || '',
        creatorTeam: (userProfile.team === 'MFG' ? 'MFG' : 'AEC'),
        products: [],
        assignedSalesId: null,
        assignedSalesName: null,
        notes: `Kode sales: ${salesCode}`,
        imageUrl: result?.imageUrl || '',
        imageKey: ocrImageKey,
        acquisitionContext: {
          source: 'OCR',
          eventName: eventName.trim(),
          eventDate: new Date(),
        },
        formAnswers,
      } as any);

      toast({ title: 'Tersimpan', description: `Kontak ${fields.name} berhasil ditambahkan.` });
      reset();
      // Trigger a refresh of the dashboard data so the new entry appears.
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
            <Button
              size="lg"
              className="h-20 text-base active:translate-y-px"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="h-6 w-6 mr-3" /> Foto Langsung
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 active:translate-y-px"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-5 w-5 mr-2" /> Unggah Gambar
            </Button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onFileSelected(e, true)}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFileSelected(e, false)}
            />
            <p className="text-xs text-muted-foreground text-center pt-1">
              Foto kartu nama atau form customer. AI akan mengekstrak datanya.
            </p>
          </CardContent>
        </Card>

        {recentThree.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Hasil Terbaru</h3>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => router.push('/dashboard?view=history')}>
                Lihat Semua <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {recentThree.map((c) => (
                <RecentCard key={c.id} customer={c} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (status === 'reading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto w-full gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground text-center">AI sedang membaca gambar...</p>
        {imagePreview && (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border bg-muted">
            <img src={imagePreview} alt="Pratinjau" className="w-full h-full object-contain" />
          </div>
        )}
      </div>
    );
  }

  // status === 'result' || 'saving'
  const fieldConfig: { key: string; label: string; conf: Confidence; alternatives: string[] }[] = [
    { key: 'name', label: 'Nama', conf: result?.name.confidence ?? 'high', alternatives: result?.name.alternatives ?? [] },
    { key: 'company', label: 'Perusahaan', conf: result?.company.confidence ?? 'high', alternatives: result?.company.alternatives ?? [] },
    { key: 'jobTitle', label: 'Jabatan', conf: result?.jobTitle.confidence ?? 'high', alternatives: result?.jobTitle.alternatives ?? [] },
    { key: 'division', label: 'Divisi', conf: result?.division.confidence ?? 'empty', alternatives: result?.division.alternatives ?? [] },
    { key: 'phone', label: 'No. Telepon', conf: result?.phone.confidence ?? 'high', alternatives: result?.phone.alternatives ?? [] },
    { key: 'email', label: 'Email', conf: result?.email.confidence ?? 'high', alternatives: result?.email.alternatives ?? [] },
    { key: 'softwareNeeds', label: 'Kebutuhan Software', conf: result?.softwareNeeds.confidence ?? 'high', alternatives: result?.softwareNeeds.alternatives ?? [] },
  ];

  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
      {imagePreview && (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden border bg-muted">
          <img src={imagePreview} alt="Pratinjau" className="w-full h-full object-contain" />
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Verifikasi & Lengkapi Data</CardTitle>
          {result && result.overriddenFields.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Beberapa field ditinjau ulang oleh AI pembanding.
            </p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eventName">Nama Event / Acara <span className="text-red-500">*</span></Label>
            <Input id="eventName" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Contoh: Pameran MFI 2026" disabled={status === 'saving'} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="salesCode">Kode Tim Sales <span className="text-red-500">*</span></Label>
            <div className="grid grid-cols-4 gap-2">
              {SALES_CODES.map((code) => (
                <Button
                  key={code}
                  type="button"
                  variant={salesCode === code ? 'default' : 'outline'}
                  size="sm"
                  className="active:translate-y-px"
                  disabled={status === 'saving'}
                  onClick={() => setSalesCode(code)}
                >
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
                  <Input
                    id={key}
                    value={fields[key] || ''}
                    onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value }))}
                    disabled={status === 'saving'}
                    className="h-9 border-0 bg-transparent px-0 focus-visible:ring-0"
                  />
                  {hasAlt && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {alternatives.map((alt, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setFields((p) => ({ ...p, [key]: alt }))}
                          className="text-[11px] px-2 py-0.5 rounded-full border border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                        >
                          {alt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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

function RecentCard({ customer }: { customer: Customer }) {
  const salesCode = customer.formAnswers?.find((qa) => qa.question.toLowerCase().includes('kode'))?.answer;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card active:translate-y-px transition-transform">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
        {salesCode || (customer.name?.slice(0, 2).toUpperCase() ?? '??')}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{customer.name || '(tanpa nama)'}</p>
        <p className="text-xs text-muted-foreground truncate">{customer.company || customer.phone || '-'}</p>
      </div>
    </div>
  );
}
