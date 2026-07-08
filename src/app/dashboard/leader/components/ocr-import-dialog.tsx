'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Camera, Upload, Check, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { extractCustomerVision } from '@/ai/flows/extract-customer-vision';
import type { ExtractResult } from '@/lib/ocr/extract';
import { createManualCustomer } from '@/app/actions/leader';
import { compressImageToDataUri } from '@/lib/image-compress';
import { useDashboard } from '@/app/dashboard/dashboard-context';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

interface OcrImportDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCustomerAdded: () => void;
  capturedImage?: string | null;
  startInCameraMode?: boolean;
}

export function OcrImportDialog({ isOpen, onOpenChange, onCustomerAdded, capturedImage = null, startInCameraMode = false }: OcrImportDialogProps) {
  const { userProfile } = useDashboard();
  const { toast } = useToast();

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
  const [readingStep, setReadingStep] = useState(0);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [creatorTeam, setCreatorTeam] = useState<'AEC' | 'MFG'>('AEC');

  useEffect(() => {
    if (userProfile?.team) {
      setCreatorTeam(userProfile.team);
    }
  }, [userProfile]);

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

      const fa = res.formAnswers ?? [];

      const byQuestion = (keywords: string[]) => {
        for (const k of keywords) {
          const m = fa.find(f => f.question.toLowerCase().includes(k));
          if (m?.answer) return m.answer;
        }
        return '';
      };

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

      const indQ = byQuestion(['industri']);
      const indA = byAnswer(INDUSTRI_OPTIONS);
      const ind = matchOptions(indQ || indA.join(', '), INDUSTRI_OPTIONS);
      setIndustri(ind.matched.length > 0 ? ind.matched : indA);
      if (ind.other) setOtherIndustri(ind.other);

      const piQ = byQuestion(['produk', 'minat']);
      const piA = byAnswer(PRODUCT_INTEREST);
      const pi = matchOptions(piQ || piA.join(', ') || res.softwareNeeds.value, PRODUCT_INTEREST);
      setProductInterest(pi.matched.length > 0 ? pi.matched : piA);
      if (pi.other) setOtherProduct(pi.other);

      const swQ = byQuestion(['software', 'saat ini', 'digunakan']);
      const swA = byAnswer(SOFTWARE_OPTIONS);
      const sw = matchOptions(swQ || swA.join(', ') || res.softwareNeeds.value, SOFTWARE_OPTIONS);
      setCurrentSoftware(sw.matched.length > 0 ? sw.matched : swA);
      if (sw.other) setOtherSoftware(sw.other);

      const tl = byQuestion(['rencana', 'pembelian', 'kapan']);
      if (tl) {
        for (const o of TIMELINE_OPTIONS) {
          if (tl.toLowerCase().includes(o.toLowerCase().split(' ')[0]) || o.toLowerCase().includes(tl.toLowerCase())) {
            setPurchaseTimeline(o); break;
          }
        }
      } else {
        for (const f of fa) {
          for (const o of TIMELINE_OPTIONS) {
            if (f.answer.toLowerCase().includes(o.toLowerCase().split(' ')[0]) || o.toLowerCase().includes(f.answer.toLowerCase())) {
              setPurchaseTimeline(o); break;
            }
          }
        }
      }

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

      // Catatan sales — auto-fill from form answers
      const notesAns = fa.find((f: any) => f.question.toLowerCase().includes('catatan') || f.question.toLowerCase().includes('kendala') || f.question.toLowerCase().includes('notes'));
      if (notesAns?.answer && !salesNotes) setSalesNotes(notesAns.answer);

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
      resetState();
    }
  }, [toast, resetState]);

  useEffect(() => {
    if (isOpen && capturedImage && status === 'idle') {
      processImage(capturedImage);
    }
  }, [isOpen, capturedImage, status, processImage]);

  useEffect(() => {
    if (isOpen && startInCameraMode && !capturedImage && status === 'idle') {
      setStatus('camera');
    }
  }, [isOpen, startInCameraMode, capturedImage, status]);

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
        notes: `Sales: ${salesCode}${salesNotes ? `\n\nCatatan Sales:\n${salesNotes}` : ''}`,
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
      onCustomerAdded();
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

  if (!isOpen) return null;

  const renderContent = () => {
    switch (status) {
      case 'idle':
        return (
          <div className="flex flex-col gap-3">
            <Button size="lg" className="h-20 text-base active:translate-y-px" onClick={() => cameraInputRef.current?.click()}>
              <Camera className="h-6 w-6 mr-3" /> Foto Kartu Nama
            </Button>
            <Button size="lg" variant="outline" className="h-14 active:translate-y-px" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-5 w-5 mr-2" /> Unggah Gambar
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-1">
              Foto kartu nama — data akan diekstrak otomatis.
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
          </div>
        );
      case 'reading':
        return (
          <div className="flex flex-col items-center justify-center min-h-[300px] md:min-h-[400px] w-full max-w-md mx-auto">
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
          </div>
        );
      case 'result':
      case 'saving': {
        const bcFields: { key: string; label: string }[] = [
          { key: 'name', label: 'Nama' },
          { key: 'company', label: 'Perusahaan' },
          { key: 'jobTitle', label: 'Jabatan' },
          { key: 'phone', label: 'Telepon' },
          { key: 'email', label: 'Email' },
        ];
        const hasBcData = bcFields.some(f => fields[f.key]?.trim());

        return (
          <div className="flex flex-col gap-4">
            {imagePreview && (
              <div className="w-full h-44 sm:h-52 rounded-md overflow-hidden border bg-muted">
                <img src={imagePreview} alt="Pratinjau" className="w-full h-full object-contain" />
              </div>
            )}

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
                      {p.code}
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
                      <RadioGroupItem value={t} id={`dlg-tl-${t}`} />
                      <Label htmlFor={`dlg-tl-${t}`} className="font-normal">{t}</Label>
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
                      <RadioGroupItem value={f} id={`dlg-fu-${f}`} />
                      <Label htmlFor={`dlg-fu-${f}`} className="font-normal">{f}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Skor</Label>
                <RadioGroup value={skor} onValueChange={setSkor} className="flex gap-4">
                  {SKOR_OPTIONS.map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <RadioGroupItem value={s} id={`dlg-sk-${s}`} />
                      <Label htmlFor={`dlg-sk-${s}`} className="font-normal">{s}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="salesNotes">Catatan Sales</Label>
                <Textarea id="salesNotes" value={salesNotes} onChange={(e) => setSalesNotes(e.target.value)} placeholder="Kendala / kebutuhan / catatan lain..." disabled={status === 'saving'} rows={3} />
              </div>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <Card className="w-full mt-4">
      <CardHeader>
        <CardTitle>Capture Lead (OCR)</CardTitle>
        <CardDescription>
          Foto kartu nama untuk mengekstrak data pelanggan secara otomatis.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileSelected} />
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
        {renderContent()}
      </CardContent>

      <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
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
              Simpan Lead
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
