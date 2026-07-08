'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Camera, Upload, ScanLine, Check, RotateCcw, ChevronRight, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { compressImageToDataUri } from '@/lib/image-compress';
import { extractCustomerVision } from '@/ai/flows/extract-customer-vision';
import { createManualCustomer } from '@/app/actions/leader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { ExtractResult } from '@/lib/ocr/extract';
import type { Customer } from '@/types';

const SALES_PEOPLE = [
  { code: 'LN', name: 'Lukman' },
  { code: 'LS', name: 'Lody' },
  { code: 'NU', name: 'Nurhayati' },
  { code: 'RU', name: 'Rustini' },
  { code: 'TK', name: 'Tika' },
  { code: 'TA', name: 'Ita' },
  { code: 'BR', name: 'Brist' },
  { code: 'RQ', name: 'Rizqi' },
];
const SALES_CODE_SET = new Set(SALES_PEOPLE.map(p => p.code));

function matchOptions(answer: string, options: readonly string[]): { matched: string[]; other: string } {
  if (!answer) return { matched: [], other: '' };
  const parts = answer.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  const matched: string[] = [];
  let other = '';
  for (const part of parts) {
    const m = part.match(/^Lainnya:\s*(.+)/i);
    if (m) { matched.push('Lainnya'); other = m[1]; continue; }
    if (part.toLowerCase() === 'lainnya') { matched.push('Lainnya'); continue; }
    const exact = options.find(o => o.toLowerCase() === part.toLowerCase());
    if (exact) { matched.push(exact); continue; }
    other = part;
  }
  return { matched: [...new Set(matched)], other };
}

const INDUSTRI_OPTIONS = ['Arsitek', 'Interior Design', 'Kontraktor', 'Developer'] as const;
const PRODUCT_INTEREST = ['ZWCAD', 'SketchUp', 'Archicad', 'Rendering'] as const;
const SOFTWARE_OPTIONS = ['AutoCAD', 'SketchUp', 'Revit', 'Archicad', 'ZWCAD'] as const;
const TIMELINE_OPTIONS = ['< 3 bulan', '3–6 bulan', '> 6 bulan', 'Belum ada'] as const;
const FOLLOWUP_OPTIONS = ['Demo', 'Penawaran', 'Kunjungan', 'Follow-up Call'] as const;
const SKOR_OPTIONS = ['High', 'Medium', 'Low'] as const;

const READING_STEPS = [
  'Memproses gambar',
  'Membaca kartu nama',
  'Menyiapkan form',
];

type Status = 'idle' | 'camera' | 'reading' | 'result' | 'saving';

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

  const [industri, setIndustri] = useState<string[]>([]);
  const [otherIndustri, setOtherIndustri] = useState('');
  const [productInterest, setProductInterest] = useState<string[]>([]);
  const [otherProduct, setOtherProduct] = useState('');
  const [currentSoftware, setCurrentSoftware] = useState<string[]>([]);
  const [otherSoftware, setOtherSoftware] = useState('');
  const [purchaseTimeline, setPurchaseTimeline] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [skor, setSkor] = useState('');
  const [salesNotes, setSalesNotes] = useState('');

  const [salesCode, setSalesCode] = useState('');
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
    setIndustri([]);
    setOtherIndustri('');
    setProductInterest([]);
    setOtherProduct('');
    setCurrentSoftware([]);
    setOtherSoftware('');
    setPurchaseTimeline('');
    setFollowUp('');
    setSkor('');
    setSalesNotes('');
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
      const compressed = await compressImageToDataUri(dataUri);
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

      const fa = res.formAnswers ?? [];

      // Strategy 1: Match by question keywords
      const byQuestion = (keywords: string[]) => {
        for (const k of keywords) {
          const m = fa.find(f => f.question.toLowerCase().includes(k));
          if (m?.answer) return m.answer;
        }
        return '';
      };

      // Strategy 2: Scan ALL answer texts directly for known option values
      const byAnswer = (options: readonly string[]) => {
        const found: string[] = [];
        for (const f of fa) {
          for (const opt of options) {
            if (f.answer.toLowerCase().includes(opt.toLowerCase())) {
              found.push(opt);
            }
          }
        }
        return found;
      };

      // Industri — try question match first, then direct answer scan
      const indQ = byQuestion(['industri']);
      const indA = byAnswer(INDUSTRI_OPTIONS);
      const ind = matchOptions(indQ || indA.join(', '), INDUSTRI_OPTIONS);
      setIndustri(ind.matched.length > 0 ? ind.matched : indA);
      if (ind.other) setOtherIndustri(ind.other);

      // Produk — try question, then direct scan, then fallback to softwareNeeds from BC
      const piQ = byQuestion(['produk', 'minat']);
      const piA = byAnswer(PRODUCT_INTEREST);
      const pi = matchOptions(piQ || piA.join(', ') || res.softwareNeeds.value, PRODUCT_INTEREST);
      setProductInterest(pi.matched.length > 0 ? pi.matched : piA);
      if (pi.other) setOtherProduct(pi.other);

      // Software — try question, then direct scan, then fallback to softwareNeeds
      const swQ = byQuestion(['software', 'saat ini', 'digunakan']);
      const swA = byAnswer(SOFTWARE_OPTIONS);
      const sw = matchOptions(swQ || swA.join(', ') || res.softwareNeeds.value, SOFTWARE_OPTIONS);
      setCurrentSoftware(sw.matched.length > 0 ? sw.matched : swA);
      if (sw.other) setOtherSoftware(sw.other);

      // Timeline — try question match
      const tl = byQuestion(['rencana', 'pembelian', 'kapan']);
      if (tl) {
        for (const o of TIMELINE_OPTIONS) {
          if (tl.toLowerCase().includes(o.toLowerCase().split(' ')[0]) || o.toLowerCase().includes(tl.toLowerCase())) {
            setPurchaseTimeline(o); break;
          }
        }
      } else {
        // Try direct answer scan
        for (const f of fa) {
          for (const o of TIMELINE_OPTIONS) {
            if (f.answer.toLowerCase().includes(o.toLowerCase().split(' ')[0]) || o.toLowerCase().includes(f.answer.toLowerCase())) {
              setPurchaseTimeline(o); break;
            }
          }
        }
      }

      // Follow-up — try question match
      const fu = byQuestion(['tindak', 'follow', 'lanjut']);
      if (fu) {
        for (const o of FOLLOWUP_OPTIONS) {
          if (fu.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(fu.toLowerCase())) {
            setFollowUp(o); break;
          }
        }
      } else {
        for (const f of fa) {
          for (const o of FOLLOWUP_OPTIONS) {
            if (f.answer.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(f.answer.toLowerCase())) {
              setFollowUp(o); break;
            }
          }
        }
      }

      // Skor — try question match
      const sk = byQuestion(['skor']);
      if (sk) {
        for (const o of SKOR_OPTIONS) {
          if (sk.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(sk.toLowerCase())) {
            setSkor(o); break;
          }
        }
      } else {
        for (const f of fa) {
          for (const o of SKOR_OPTIONS) {
            if (f.answer.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(f.answer.toLowerCase())) {
              setSkor(o); break;
            }
          }
        }
      }

      // Sales code — auto-detect isolated initials from all extracted text
      if (!salesCode) {
        const allText = [fields.name, fields.company, fields.jobTitle, fields.division, fields.phone, fields.email, fields.softwareNeeds, fields.address, ...fa.map(f => f.question + ' ' + f.answer)].join(' ');
        const words = allText.split(/[\s,;:/()]+/).filter(Boolean);
        for (const word of words) {
          const clean = word.replace(/[^A-Za-z]/g, '').toUpperCase();
          if (SALES_CODE_SET.has(clean) && word.length <= 3) {
            setSalesCode(clean);
            break;
          }
        }
      }

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
      toast({ variant: 'destructive', title: 'Nama wajib diisi (dari kartu nama).' });
      return;
    }
    if (!salesCode) {
      toast({ variant: 'destructive', title: 'Pilih sales.' });
      return;
    }
    if (!eventName.trim()) {
      toast({ variant: 'destructive', title: 'Nama event wajib diisi.' });
      return;
    }

    const selectedIndustri = industri.includes('Lainnya')
      ? [...industri.filter(i => i !== 'Lainnya'), `Lainnya: ${otherIndustri}`].filter(Boolean)
      : industri;
    const selectedProducts = productInterest.includes('Lainnya')
      ? [...productInterest.filter(p => p !== 'Lainnya'), `Lainnya: ${otherProduct}`].filter(Boolean)
      : productInterest;
    const selectedSoftware = currentSoftware.includes('Lainnya')
      ? [...currentSoftware.filter(s => s !== 'Lainnya'), `Lainnya: ${otherSoftware}`].filter(Boolean)
      : currentSoftware;

    const formAnswers = [
      { question: 'Industri', answer: selectedIndustri.join(', ') },
      { question: 'Produk diminati', answer: selectedProducts.join(', ') },
      { question: 'Software saat ini', answer: selectedSoftware.join(', ') },
      { question: 'Rencana pembelian', answer: purchaseTimeline },
      { question: 'Tindak lanjut', answer: followUp },
      { question: 'Skor', answer: skor },
    ].filter(qa => qa.answer);

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
        notes: `Sales: ${SALES_PEOPLE.find(p => p.code === salesCode)?.name ?? salesCode} (${salesCode})${salesNotes ? `\n\nCatatan Sales:\n${salesNotes}` : ''}`,
        imageUrl: result?.imageUrl || '',
        imageKey: '',
        acquisitionContext: {
          source: 'OCR',
          eventName: eventName.trim(),
          eventDate: new Date(),
        },
        formAnswers,
      } as any);

      toast({ title: 'Tersimpan', description: `Lead ${fields.name} berhasil ditambahkan.` });
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

  if (status === 'idle') {
    return (
      <div className="flex flex-col gap-6 max-w-md mx-auto w-full">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ScanLine className="h-5 w-5" /> Capture Lead
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button size="lg" className="h-20 text-base active:translate-y-px" onClick={() => cameraInputRef.current?.click()}>
              <Camera className="h-6 w-6 mr-3" /> Foto Kartu Nama
            </Button>
            <Button size="lg" variant="outline" className="h-14 active:translate-y-px" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-5 w-5 mr-2" /> Unggah Gambar
            </Button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFileSelected(e)} />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFileSelected(e)} />
            <p className="text-xs text-muted-foreground text-center pt-1">
              Foto kartu nama — data akan diekstrak otomatis.
            </p>
          </CardContent>
        </Card>

        {recentThree.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Lead Terbaru</h3>
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
          <p className="text-center text-sm font-medium text-muted-foreground mb-4">Memproses kartu nama...</p>
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

  const bcFields: { key: string; label: string }[] = [
    { key: 'name', label: 'Nama' },
    { key: 'company', label: 'Perusahaan' },
    { key: 'jobTitle', label: 'Jabatan' },
    { key: 'phone', label: 'Telepon' },
    { key: 'email', label: 'Email' },
  ];
  const hasBcData = bcFields.some(f => fields[f.key]?.trim());

  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
      {imagePreview && (
        <div className="w-full aspect-video rounded-lg overflow-hidden border bg-muted">
          <img src={imagePreview} alt="Pratinjau" className="w-full h-full object-contain" />
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Qualify Lead</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasBcData && (
            <div className="rounded-md border bg-muted/20 p-3 text-sm space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Data Kartu Nama</p>
              {bcFields.map(f => fields[f.key]?.trim() ? (
                <p key={f.key}><span className="text-muted-foreground">{f.label}:</span> {fields[f.key]}</p>
              ) : null)}
            </div>
          )}
          {(result?.overriddenFields?.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">Beberapa field diverifikasi ulang oleh AI.</p>
          )}

          <div className="flex flex-col gap-1.5 p-3 border rounded-md bg-muted/20">
            <Label htmlFor="creatorTeam">Tim</Label>
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
            <Label htmlFor="eventName">Event <span className="text-red-500">*</span></Label>
            <Input id="eventName" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Contoh: IBT 2026" disabled={status === 'saving'} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="salesCode">Sales <span className="text-red-500">*</span></Label>
            <div className="grid grid-cols-4 gap-2">
              {SALES_PEOPLE.map((p) => (
                <Button key={p.code} type="button" variant={salesCode === p.code ? 'default' : 'outline'} size="sm" className="active:translate-y-px text-xs" disabled={status === 'saving'} onClick={() => setSalesCode(p.code)}>
                  {p.name} ({p.code})
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t pt-3 space-y-4">
            <div className="space-y-2">
              <Label>Industri</Label>
              <div className="grid grid-cols-2 gap-2">
                {INDUSTRI_OPTIONS.map((i) => (
                  <label key={i} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={industri.includes(i)} onCheckedChange={(checked) => setIndustri(prev => checked ? [...prev, i] : prev.filter(x => x !== i))} />
                    <span className="text-sm font-normal">{i}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={industri.includes('Lainnya')} onCheckedChange={(checked) => setIndustri(prev => checked ? [...prev, 'Lainnya'] : prev.filter(x => x !== 'Lainnya'))} />
                  <span className="text-sm font-normal">Lainnya</span>
                </label>
              </div>
              {industri.includes('Lainnya') && (
                <Input value={otherIndustri} onChange={(e) => setOtherIndustri(e.target.value)} placeholder="Sebutkan..." disabled={status === 'saving'} className="mt-1" />
              )}
            </div>

            <div className="space-y-2">
              <Label>Produk yang diminati</Label>
              <div className="grid grid-cols-2 gap-2">
                {PRODUCT_INTEREST.map((p) => (
                  <label key={p} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={productInterest.includes(p)} onCheckedChange={(checked) => setProductInterest(prev => checked ? [...prev, p] : prev.filter(x => x !== p))} />
                    <span className="text-sm font-normal">{p}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={productInterest.includes('Lainnya')} onCheckedChange={(checked) => setProductInterest(prev => checked ? [...prev, 'Lainnya'] : prev.filter(x => x !== 'Lainnya'))} />
                  <span className="text-sm font-normal">Lainnya</span>
                </label>
              </div>
              {productInterest.includes('Lainnya') && (
                <Input value={otherProduct} onChange={(e) => setOtherProduct(e.target.value)} placeholder="Sebutkan..." disabled={status === 'saving'} className="mt-1" />
              )}
            </div>

            <div className="space-y-2">
              <Label>Software yang digunakan saat ini</Label>
              <div className="grid grid-cols-2 gap-2">
                {SOFTWARE_OPTIONS.map((s) => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={currentSoftware.includes(s)} onCheckedChange={(checked) => setCurrentSoftware(prev => checked ? [...prev, s] : prev.filter(x => x !== s))} />
                    <span className="text-sm font-normal">{s}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={currentSoftware.includes('Lainnya')} onCheckedChange={(checked) => setCurrentSoftware(prev => checked ? [...prev, 'Lainnya'] : prev.filter(x => x !== 'Lainnya'))} />
                  <span className="text-sm font-normal">Lainnya</span>
                </label>
              </div>
              {currentSoftware.includes('Lainnya') && (
                <Input value={otherSoftware} onChange={(e) => setOtherSoftware(e.target.value)} placeholder="Sebutkan..." disabled={status === 'saving'} className="mt-1" />
              )}
            </div>

            <div className="space-y-2">
              <Label>Kapan rencana pembelian?</Label>
              <RadioGroup value={purchaseTimeline} onValueChange={setPurchaseTimeline} className="grid grid-cols-2 gap-2">
                {TIMELINE_OPTIONS.map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <RadioGroupItem value={t} id={`tl-${t}`} />
                    <Label htmlFor={`tl-${t}`} className="font-normal">{t}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>

          <div className="border-t pt-3 space-y-3">
            <div className="space-y-2">
              <Label>Tindak lanjut</Label>
              <RadioGroup value={followUp} onValueChange={setFollowUp} className="grid grid-cols-2 gap-2">
                {FOLLOWUP_OPTIONS.map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <RadioGroupItem value={f} id={`fu-${f}`} />
                    <Label htmlFor={`fu-${f}`} className="font-normal">{f}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Skor</Label>
              <RadioGroup value={skor} onValueChange={setSkor} className="flex gap-4">
                {SKOR_OPTIONS.map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <RadioGroupItem value={s} id={`sk-${s}`} />
                    <Label htmlFor={`sk-${s}`} className="font-normal">{s}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="salesNotes">Catatan Sales</Label>
              <Textarea id="salesNotes" value={salesNotes} onChange={(e) => setSalesNotes(e.target.value)} placeholder="Kendala / kebutuhan / catatan lain..." disabled={status === 'saving'} rows={3} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={reset} disabled={status === 'saving'}>
              <RotateCcw className="h-4 w-4 mr-1" /> Foto Ulang
            </Button>
            <Button className="flex-1" onClick={onSave} disabled={status === 'saving'}>
              {status === 'saving' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Simpan Lead
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RecentCard({ customer, onClick }: { customer: Customer; onClick: () => void }) {
  const salesCode = customer.notes && typeof customer.notes === 'object' && 'manual' in customer.notes
    ? (customer.notes as any).manual?.match(/Sales: .+\((\w+)\)/)?.[1]
    : null;
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
