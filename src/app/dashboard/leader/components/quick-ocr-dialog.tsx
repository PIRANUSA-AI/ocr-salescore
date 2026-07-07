'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, UploadCloud, Camera, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { extractCustomerFromForm } from '@/ai/flows/extract-customer-from-form';
import { createManualCustomer } from '@/app/actions/leader';
import { getAssignableUsers } from '@/app/actions/user';
import { compressImageToDataUri } from '@/lib/image-compress';
import type { UserProfile } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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

interface QuickOcrDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function QuickOcrDialog({ isOpen, onOpenChange }: QuickOcrDialogProps) {
  const [status, setStatus] = useState<'idle' | 'reading' | 'mapping' | 'saving' | 'camera'>('idle');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [assignableUsers, setAssignableUsers] = useState<UserProfile[]>([]);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

  const [selectedSalesId, setSelectedSalesId] = useState('');
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
  const [eventName, setEventName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const resetState = useCallback(() => {
    setStatus('idle');
    setImagePreview(null);
    setFields({});
    setSelectedSalesId('');
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
    setEventName('');
    stopCamera();
    if (fileInputRef.current) { fileInputRef.current.value = ''; }
  }, [stopCamera]);

  const handleClose = () => {
    if (status === 'saving') return;
    onOpenChange(false);
    setTimeout(resetState, 300);
  };

  const processImage = useCallback(async (imageDataUri: string) => {
    setStatus('reading');
    try {
      const compressed = await compressImageToDataUri(imageDataUri);
      const result = await extractCustomerFromForm({ imageDataUri: compressed });
      setImagePreview(result._fullResult?.imageUrl || '');
      setFields({
        name: result.name || '',
        company: result.company || '',
        jobTitle: result.jobTitle || '',
        phone: result.phone || '',
        email: result.email || '',
      });

      const full = result._fullResult;
      const fa: { question: string; answer: string }[] = full?.formAnswers ?? result.formAnswers ?? [];
      const answerFor = (keywords: string[]) => {
        for (const k of keywords) {
          const match = fa.find((f: any) => f.question.toLowerCase().includes(k));
          if (match?.answer) return match.answer;
        }
        return '';
      };
      const sw = full?.softwareNeeds?.value ?? '';
      const ind = matchOptions(answerFor(['industri']), INDUSTRI_OPTIONS);
      setIndustri(ind.matched);
      if (ind.other) setOtherIndustri(ind.other);
      const pi = matchOptions(answerFor(['produk', 'minat']) || sw, PRODUCT_INTEREST);
      setProductInterest(pi.matched);
      if (pi.other) setOtherProduct(pi.other);
      const s = matchOptions(answerFor(['software', 'saat ini', 'digunakan']) || sw, SOFTWARE_OPTIONS);
      setCurrentSoftware(s.matched);
      if (s.other) setOtherSoftware(s.other);
      const tl = answerFor(['rencana', 'pembelian', 'kapan']);
      for (const o of TIMELINE_OPTIONS) {
        if (tl.toLowerCase().includes(o.toLowerCase().split(' ')[0]) || o.toLowerCase().includes(tl.toLowerCase())) {
          setPurchaseTimeline(o); break;
        }
      }
      const fu = answerFor(['tindak', 'follow', 'lanjut']);
      for (const o of FOLLOWUP_OPTIONS) {
        if (fu.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(fu.toLowerCase())) {
          setFollowUp(o); break;
        }
      }
      const sk = answerFor(['skor']);
      for (const o of SKOR_OPTIONS) {
        if (sk.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(sk.toLowerCase())) {
          setSkor(o); break;
        }
      }

      setStatus('mapping');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal Ekstraksi OCR',
        description: error instanceof Error ? error.message : 'Terjadi kesalahan tidak diketahui.',
      });
      resetState();
    }
  }, [toast, resetState]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
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
      stopCamera();
      processImage(imageDataUri);
    }
  };

  const onSubmit = async () => {
    const selectedUser = assignableUsers.find(s => s.uid === selectedSalesId);
    if (!selectedUser) {
      toast({ variant: 'destructive', title: 'Pilih nama Anda sebagai pemilik lead.' });
      return;
    }
    if (!fields.name?.trim()) {
      toast({ variant: 'destructive', title: 'Nama dari kartu nama wajib ada.' });
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
    const isLeaderAssigningToSelf = selectedUser.role === 'Leader';
    try {
      await createManualCustomer({
        name: fields.name,
        company: fields.company || '',
        jobTitle: fields.jobTitle || '',
        phone: fields.phone || '',
        email: fields.email || '',
        creatorTeam: selectedUser.team,
        imageUrl: imagePreview || '',
        imageKey: '',
        acquisitionContext: {
          source: 'OCR',
          eventName: eventName || 'Quick OCR',
          eventDate: new Date(),
        },
        assignedSalesId: isLeaderAssigningToSelf ? null : selectedUser.uid,
        assignedSalesName: isLeaderAssigningToSelf ? null : selectedUser.name,
        notes: salesNotes || undefined,
        formAnswers,
      } as any);
      toast({ title: 'Sukses!', description: `Lead "${fields.name}" berhasil dibuat.` });
      handleClose();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal Menyimpan',
        description: error instanceof Error ? error.message : 'Terjadi kesalahan tidak diketahui.',
      });
      setStatus('mapping');
    }
  };

  useEffect(() => {
    if (isOpen) {
      getAssignableUsers().then(setAssignableUsers).catch(() => {
        toast({ variant: 'destructive', title: 'Gagal Memuat Pengguna', description: 'Tidak dapat memuat daftar sales.' });
      });
    }
    if (isOpen && status === 'camera') {
      const getCameraPermission = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
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
    return () => { stopCamera(); };
  }, [isOpen, status, stopCamera, toast]);

  const bcFields = [
    { key: 'name', label: 'Nama' },
    { key: 'company', label: 'Perusahaan' },
    { key: 'jobTitle', label: 'Jabatan' },
    { key: 'phone', label: 'Telepon' },
    { key: 'email', label: 'Email' },
  ];

  const renderContent = () => {
    switch (status) {
      case 'camera':
        return (
          <div className="flex flex-col items-center justify-center space-y-4">
            {hasCameraPermission === false ? (
              <Alert variant="destructive">
                <AlertTitle>Akses Kamera Ditolak</AlertTitle>
                <AlertDescription>Izinkan akses kamera di pengaturan browser Anda untuk menggunakan fitur ini.</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="w-full max-w-[280px] aspect-[9/16] bg-black rounded-lg overflow-hidden relative">
                  <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                  <div className="absolute inset-0 border-4 md:border-[1rem] border-black/30 rounded-lg box-border"></div>
                </div>
                <Button onClick={handleCaptureImage}>Ambil Gambar</Button>
              </>
            )}
            <Button variant="outline" onClick={() => setStatus('idle')}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Button>
          </div>
        );
      case 'idle':
        return (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-lg p-12 space-y-4 min-h-[400px]">
            <p className="text-muted-foreground text-center">Foto kartu nama untuk mengekstrak data secara otomatis.</p>
            <div className='flex flex-col sm:flex-row gap-4'>
              <Button type="button" onClick={() => fileInputRef.current?.click()}>
                <UploadCloud className="mr-2 h-4 w-4" /> Pilih Gambar
              </Button>
              <Button type="button" variant="outline" onClick={() => setStatus('camera')}>
                <Camera className="mr-2 h-4 w-4" /> Gunakan Kamera
              </Button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" className="hidden" />
          </div>
        );
      case 'reading':
        return (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">AI sedang memindai kartu nama...</p>
          </div>
        );
      case 'mapping':
      case 'saving':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="space-y-4">
              <div className="relative w-full aspect-[9/16] rounded-md overflow-hidden border bg-muted">
                {imagePreview && <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />}
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-2">
              {bcFields.some(f => fields[f.key]?.trim()) && (
                <div className="rounded-md border bg-muted/20 p-3 text-sm space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Data Kartu Nama</p>
                  {bcFields.map(f => fields[f.key]?.trim() ? (
                    <p key={f.key}><span className="text-muted-foreground">{f.label}:</span> {fields[f.key]}</p>
                  ) : null)}
                </div>
              )}

              <div>
                <Label htmlFor="assignedSalesId">Nama Anda (Pemilik Lead) <span className="text-red-500">*</span></Label>
                <Select value={selectedSalesId} onValueChange={setSelectedSalesId}>
                  <SelectTrigger><SelectValue placeholder="Pilih nama Anda..." /></SelectTrigger>
                  <SelectContent>
                    {assignableUsers.map(s => <SelectItem key={s.uid} value={s.uid}>{s.name} ({s.role})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="eventName">Event / Konteks</Label>
                <Input id="eventName" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Contoh: Pameran MFI 2026" disabled={status === 'saving'} />
              </div>

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
                      <RadioGroupItem value={t} id={`q-tl-${t}`} />
                      <Label htmlFor={`q-tl-${t}`} className="font-normal">{t}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Tindak lanjut</Label>
                <RadioGroup value={followUp} onValueChange={setFollowUp} className="grid grid-cols-2 gap-2">
                  {FOLLOWUP_OPTIONS.map((f) => (
                    <div key={f} className="flex items-center gap-2">
                      <RadioGroupItem value={f} id={`q-fu-${f}`} />
                      <Label htmlFor={`q-fu-${f}`} className="font-normal">{f}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Skor</Label>
                <RadioGroup value={skor} onValueChange={setSkor} className="flex gap-4">
                  {SKOR_OPTIONS.map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <RadioGroupItem value={s} id={`q-sk-${s}`} />
                      <Label htmlFor={`q-sk-${s}`} className="font-normal">{s}</Label>
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
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl grid-rows-[auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle>Capture Lead Cepat</DialogTitle>
          <DialogDescription>
            Foto kartu nama, pilih nama Anda, qualify lead — selesai.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 pr-3 overflow-y-auto" style={{ maxHeight: '75vh' }}>
          <canvas ref={canvasRef} className="hidden" />
          {renderContent()}
        </div>
        <DialogFooter>
          {status !== 'idle' && status !== 'camera' && (
            <Button type="button" variant="ghost" onClick={resetState} disabled={status === 'saving' || status === 'reading'}>Pindai Lagi</Button>
          )}
          <Button type="button" variant="outline" onClick={handleClose} disabled={status === 'saving'}>Tutup</Button>
          {(status === 'mapping' || status === 'saving') && (
            <Button type="button" onClick={onSubmit} disabled={status === 'saving'}>
              {status === 'saving' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan Lead
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
