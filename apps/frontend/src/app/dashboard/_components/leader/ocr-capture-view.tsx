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
import { Loader2, Camera, Upload, ScanLine, Check, RotateCcw, ChevronRight, XCircle, Clock, Image as ImageIcon, ChevronLeft, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useDashboard } from '@/app/dashboard/dashboard-context';
import { compressImageToDataUri } from '@/lib/image-compress';
import { api } from '@/lib/api-client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ExtractResult } from '@/lib/ocr/extract';
import type { Confidence } from '@/lib/ocr/types';
import type { Customer } from '@/types';

const INDUSTRI_OPTIONS = ['Arsitek', 'Interior Design', 'Kontraktor', 'Developer'] as const;
const PRODUCT_INTEREST = ['ZWCAD', 'SketchUp', 'Archicad', 'Rendering'] as const;
const SOFTWARE_OPTIONS = ['AutoCAD', 'SketchUp', 'Revit', 'Archicad', 'ZWCAD'] as const;
const TIMELINE_OPTIONS = ['< 3 bulan', '3–6 bulan', '> 6 bulan', 'Belum ada'] as const;
const FOLLOWUP_OPTIONS = ['Demo', 'Penawaran', 'Kunjungan', 'Follow-up Call'] as const;
const SKOR_OPTIONS = ['High', 'Medium', 'Low'] as const;

interface OcrJobData {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
  imageUrl?: string | null;
  result?: {
    name: { value: string; alternatives: string[]; confidence: Confidence };
    company: { value: string; alternatives: string[]; confidence: Confidence };
    jobTitle: { value: string; alternatives: string[]; confidence: Confidence };
    phone: { value: string; alternatives: string[]; confidence: Confidence };
    email: { value: string; alternatives: string[]; confidence: Confidence };
    softwareNeeds: { value: string; alternatives: string[]; confidence: Confidence };
    address: { value: string; alternatives: string[]; confidence: Confidence };
    formAnswers: { question: string; answer: string }[];
    imageUrl: string;
  };
}

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

interface Props {
  recentCustomers: Customer[];
}

export function OcrCaptureView({ recentCustomers }: Props) {
  const { userProfile } = useAuth();
  const { salesTeam } = useDashboard();
  const { toast } = useToast();
  const router = useRouter();

  const salesPeople = useMemo(
    () => salesTeam.filter(s => !!s.salesCode).map(s => ({ code: s.salesCode as string, name: s.name, uid: s.uid })),
    [salesTeam]
  );
  const salesCodeSet = useMemo(() => new Set(salesPeople.map(p => p.code)), [salesPeople]);

  const [jobs, setJobs] = useState<OcrJobData[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'saving'>('idle');

  const [editableName, setEditableName] = useState('');
  const [editableCompany, setEditableCompany] = useState('');
  const [editableJobTitle, setEditableJobTitle] = useState('');
  const [editablePhone, setEditablePhone] = useState('');
  const [editableEmail, setEditableEmail] = useState('');
  const [industri, setIndustri] = useState<string[]>([]);
  const [otherIndustri, setOtherIndustri] = useState('');
  const [productInterest, setProductInterest] = useState<string[]>([]);
  const [otherProduct, setOtherProduct] = useState('');
  const [currentSoftware, setCurrentSoftware] = useState<string[]>([]);
  const [otherSoftware, setOtherSoftware] = useState('');
  const [purchaseTimeline, setPurchaseTimeline] = useState('');
  const [followUp, setFollowUp] = useState<string[]>([]);
  const [skor, setSkor] = useState('');
  const [salesNotes, setSalesNotes] = useState('');
  const [salesCode, setSalesCode] = useState('');
  const [eventName, setEventName] = useState('IBT 2026');
  const [creatorTeam, setCreatorTeam] = useState<'AEC' | 'MFG'>('AEC');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userProfile?.team) setCreatorTeam(userProfile.team);
  }, [userProfile]);

  // Poll OCR jobs from backend API
  useEffect(() => {
    if (!userProfile?.uid) return;
    const poll = () => {
      api.ocr.listJobs(20).then(r => {
        setJobs(prevJobs => {
          const tempJobs = prevJobs.filter(j => j.id.startsWith('temp-'));
          const backendJobs = r.jobs as OcrJobData[];
          return [...tempJobs, ...backendJobs.filter(bj => !tempJobs.some(tj => tj.id === bj.id))];
        });
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [userProfile]);

  const activeJob = jobs.find(j => j.id === activeJobId) ?? null;

  const recentThree = useMemo(() => recentCustomers.slice(0, 3), [recentCustomers]);

  // Auto-map OCR result to form fields when a done job is selected
  useEffect(() => {
    if (!activeJob || activeJob.status !== 'done' || !activeJob.result) return;
    const fields = activeJob.result;
    const fa = fields.formAnswers ?? [];
    setEditableName(fields.name.value);
    setEditableCompany(fields.company.value);
    setEditableJobTitle(fields.jobTitle.value);
    setEditablePhone(fields.phone.value);
    setEditableEmail(fields.email.value);

    const byQuestion = (keywords: string[]) => {
      for (const k of keywords) { const m = fa.find(f => f.question.toLowerCase().includes(k)); if (m?.answer) return m.answer; }
      return '';
    };
    const byAnswer = (options: readonly string[]) => {
      const found: string[] = [];
      for (const f of fa) for (const opt of options) if (f.answer.toLowerCase().includes(opt.toLowerCase())) found.push(opt);
      return found;
    };

    const indQ = byQuestion(['industri']); const indA = byAnswer(INDUSTRI_OPTIONS);
    const ind = matchOptions(indQ || indA.join(', '), INDUSTRI_OPTIONS);
    setIndustri(ind.matched.length ? ind.matched : indA);
    if (ind.other) setOtherIndustri(ind.other);

    const piQ = byQuestion(['produk', 'minat']); const piA = byAnswer(PRODUCT_INTEREST);
    const pi = matchOptions(piQ || piA.join(', ') || fields.softwareNeeds.value, PRODUCT_INTEREST);
    setProductInterest(pi.matched.length ? pi.matched : piA);
    if (pi.other) setOtherProduct(pi.other);

    const swQ = byQuestion(['software', 'saat ini', 'digunakan']); const swA = byAnswer(SOFTWARE_OPTIONS);
    const sw = matchOptions(swQ || swA.join(', ') || fields.softwareNeeds.value, SOFTWARE_OPTIONS);
    setCurrentSoftware(sw.matched.length ? sw.matched : swA);
    if (sw.other) setOtherSoftware(sw.other);

    const tl = byQuestion(['rencana', 'pembelian', 'kapan']);
    if (tl) TIMELINE_OPTIONS.forEach(o => { if (tl.toLowerCase().includes(o.toLowerCase().split(' ')[0])) setPurchaseTimeline(o); });
    else fa.forEach(f => TIMELINE_OPTIONS.forEach(o => { if (f.answer.toLowerCase().includes(o.toLowerCase().split(' ')[0])) setPurchaseTimeline(o); }));

    const fu = byQuestion(['tindak', 'follow', 'lanjut']);
    const fuMatches: string[] = [];
    if (fu) FOLLOWUP_OPTIONS.forEach(o => { if (fu.toLowerCase().includes(o.toLowerCase())) fuMatches.push(o); });
    else fa.forEach(f => FOLLOWUP_OPTIONS.forEach(o => { if (f.answer.toLowerCase().includes(o.toLowerCase())) fuMatches.push(o); }));
    if (fuMatches.length) setFollowUp([...new Set(fuMatches)]);

    const sk = byQuestion(['skor']);
    if (sk) SKOR_OPTIONS.forEach(o => { if (sk.toLowerCase().includes(o.toLowerCase())) setSkor(o); });
    else fa.forEach(f => SKOR_OPTIONS.forEach(o => { if (f.answer.toLowerCase().includes(o.toLowerCase())) setSkor(o); }));

    // Catatan sales — auto-fill from form answers
    const notes = byQuestion(['catatan', 'kendala', 'notes', 'note']);
    if (notes && !salesNotes) setSalesNotes(notes);

    if (!salesCode) {
      const allText = [fields.name.value, fields.company.value, fields.jobTitle.value, fields.phone.value, fields.email.value, fields.softwareNeeds.value, ...fa.map(f => f.question + ' ' + f.answer)].join(' ');
      const words = allText.split(/[\s,;:/()]+/).filter(Boolean);
      for (const word of words) { const clean = word.replace(/[^A-Za-z]/g, '').toUpperCase(); if (salesCodeSet.has(clean) && word.length <= 3) { setSalesCode(clean); break; } }
    }
  }, [activeJobId]);

  const resetForm = useCallback(() => {
    setIndustri([]);
    setOtherIndustri('');
    setProductInterest([]);
    setOtherProduct('');
    setCurrentSoftware([]);
    setOtherSoftware('');
    setPurchaseTimeline('');
    setFollowUp([]);
    setSkor('');
    setSalesNotes('');
    setSalesCode('');
    setEventName('IBT 2026');
    setCreatorTeam(userProfile?.team || 'AEC');
  }, [userProfile]);

  const processImage = useCallback(async (dataUri: string) => {
    if (!userProfile?.uid) return;
    
    const tempId = `temp-${Date.now()}`;
    const tempJob: OcrJobData = {
      id: tempId,
      userId: userProfile.uid,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    setJobs(prev => [tempJob, ...prev]);
    setPreviews(prev => ({ ...prev, [tempId]: dataUri }));
    setActiveJobId(tempId);
    resetForm();

    try {
      const compressed = await compressImageToDataUri(dataUri);
      setJobs(prev => prev.map(j => j.id === tempId ? { ...j, status: 'processing' } : j));
      
      const { job } = await api.ocr.process(compressed);
      
      setPreviews(prev => ({ ...prev, [job.id]: dataUri }));
      setJobs(prev => prev.map(j => j.id === tempId ? (job as OcrJobData) : j));
      setActiveJobId(prev => prev === tempId ? job.id : prev);
    } catch (err: any) {
      console.error('[OCR] process error:', err);
      const errMsg = err.message || 'Terjadi kesalahan saat memproses gambar.';
      toast({ variant: 'destructive', title: 'OCR Gagal', description: errMsg });
      setJobs(prev => prev.map(j => j.id === tempId ? { ...j, status: 'error', errorMessage: errMsg } : j));
    }
  }, [userProfile, resetForm, toast]);

  const handleDeleteJob = async (id: string) => {
    if (id.startsWith('temp-')) {
      setJobs(prev => prev.filter(j => j.id !== id));
      if (activeJobId === id) setActiveJobId(null);
      return;
    }

    try {
      await api.ocr.deleteJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
      if (activeJobId === id) setActiveJobId(null);
      toast({ title: 'Berhasil dihapus', description: 'Job OCR berhasil dihapus.' });
    } catch (err: any) {
      console.error('[OCR] delete error:', err);
      toast({ variant: 'destructive', title: 'Gagal menghapus', description: err.message || 'Terjadi kesalahan.' });
    }
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => processImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    if (!userProfile || !activeJob?.result) return;
    const jobFields = activeJob.result;
    if (!editableName.trim()) {
      toast({ variant: 'destructive', title: 'Nama wajib diisi.' });
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
      { question: 'Tindak lanjut', answer: followUp.join(', ') },
      { question: 'Skor', answer: skor },
    ].filter(qa => qa.answer);

    const matchedSales = salesPeople.find(p => p.code === salesCode);

    setStatus('saving');
    try {
      await api.customers.create({
        name: editableName.trim(),
        company: editableCompany.trim(),
        jobTitle: editableJobTitle.trim(),
        phone: editablePhone.trim(),
        email: editableEmail.trim(),
        address: activeJob.result.address.value?.trim() || '',
        team: creatorTeam,
        pipelineStatus: 'Leads Generation 10%',
        products: [],
        assignedSalesId: matchedSales?.uid ?? null,
        assignedSalesName: matchedSales?.name ?? null,
        imageUrl: jobFields.imageUrl || '',
        imageKey: activeJob.result.imageUrl || '',
        acquisitionContext: {
          source: 'OCR',
          eventName: eventName.trim(),
          eventDate: new Date(),
        },
        formAnswers,
      } as any);

      toast({ title: 'Tersimpan', description: `Lead ${editableName} berhasil ditambahkan.` });
      setActiveJobId(null);
      window.location.reload();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Gagal Menyimpan',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan.',
      });
      setStatus('idle');
    }
  };

  // ─── Render: Qualification form for a done job ───
  if (activeJob?.status === 'done' && activeJob.result) {
    const fields = activeJob.result;
    const fa = fields.formAnswers ?? [];

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
          if (f.answer.toLowerCase().includes(opt.toLowerCase())) found.push(opt);
        }
      }
      return found;
    };


    return (
      <div className="flex flex-col gap-3 max-w-md mx-auto w-full">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setActiveJobId(null)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Kembali
          </Button>
        </div>

        {fields.imageUrl && (
          <div className="w-full aspect-video rounded-lg overflow-hidden border bg-muted">
            <img src={fields.imageUrl} alt="Scan" className="w-full h-full object-contain" />
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Qualify Lead</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-md border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data Kartu Nama</p>
              <div><Label className="text-xs text-muted-foreground">Nama</Label><Input value={editableName} onChange={e => setEditableName(e.target.value)} className="h-8 mt-0.5" /></div>
              <div><Label className="text-xs text-muted-foreground">Perusahaan</Label><Input value={editableCompany} onChange={e => setEditableCompany(e.target.value)} className="h-8 mt-0.5" /></div>
              <div><Label className="text-xs text-muted-foreground">Jabatan</Label><Input value={editableJobTitle} onChange={e => setEditableJobTitle(e.target.value)} className="h-8 mt-0.5" /></div>
              <div><Label className="text-xs text-muted-foreground">Telepon</Label><Input value={editablePhone} onChange={e => setEditablePhone(e.target.value)} className="h-8 mt-0.5" /></div>
              <div><Label className="text-xs text-muted-foreground">Email</Label><Input value={editableEmail} onChange={e => setEditableEmail(e.target.value)} className="h-8 mt-0.5" /></div>
            </div>

            <div className="flex flex-col gap-1.5 p-3 border rounded-md bg-muted/20">
              <Label>Tim</Label>
              <Select value={creatorTeam} onValueChange={(val: any) => setCreatorTeam(val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AEC">AEC (Architecture)</SelectItem>
                  <SelectItem value="MFG">MFG (Manufacturing)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="eventName">Event <span className="text-red-500">*</span></Label>
              <Input id="eventName" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Contoh: IBT 2026" />
            </div>

            <div>
              <Label>Sales <span className="text-red-500">*</span></Label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {salesPeople.map((p) => (
                  <Button key={p.code} type="button" variant={salesCode === p.code ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setSalesCode(p.code)}>
                    {p.code}
                  </Button>
                ))}
              </div>
            </div>

            <div className="border-t pt-3 space-y-4">
              <div>
                <Label>Industri</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {INDUSTRI_OPTIONS.map((i) => (
                    <label key={i} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={industri.includes(i)} onCheckedChange={(c) => setIndustri(prev => c ? [...prev, i] : prev.filter(x => x !== i))} />
                      <span className="text-sm font-normal">{i}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={industri.includes('Lainnya')} onCheckedChange={(c) => setIndustri(prev => c ? [...prev, 'Lainnya'] : prev.filter(x => x !== 'Lainnya'))} />
                    <span className="text-sm font-normal">Lainnya</span>
                  </label>
                </div>
                {industri.includes('Lainnya') && <Input value={otherIndustri} onChange={(e) => setOtherIndustri(e.target.value)} placeholder="Sebutkan..." className="mt-1" />}
              </div>

              <div>
                <Label>Produk yang diminati</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {PRODUCT_INTEREST.map((p) => (
                    <label key={p} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={productInterest.includes(p)} onCheckedChange={(c) => setProductInterest(prev => c ? [...prev, p] : prev.filter(x => x !== p))} />
                      <span className="text-sm font-normal">{p}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={productInterest.includes('Lainnya')} onCheckedChange={(c) => setProductInterest(prev => c ? [...prev, 'Lainnya'] : prev.filter(x => x !== 'Lainnya'))} />
                    <span className="text-sm font-normal">Lainnya</span>
                  </label>
                </div>
                {productInterest.includes('Lainnya') && <Input value={otherProduct} onChange={(e) => setOtherProduct(e.target.value)} placeholder="Sebutkan..." className="mt-1" />}
              </div>

              <div>
                <Label>Software yang digunakan saat ini</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {SOFTWARE_OPTIONS.map((s) => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={currentSoftware.includes(s)} onCheckedChange={(c) => setCurrentSoftware(prev => c ? [...prev, s] : prev.filter(x => x !== s))} />
                      <span className="text-sm font-normal">{s}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={currentSoftware.includes('Lainnya')} onCheckedChange={(c) => setCurrentSoftware(prev => c ? [...prev, 'Lainnya'] : prev.filter(x => x !== 'Lainnya'))} />
                    <span className="text-sm font-normal">Lainnya</span>
                  </label>
                </div>
                {currentSoftware.includes('Lainnya') && <Input value={otherSoftware} onChange={(e) => setOtherSoftware(e.target.value)} placeholder="Sebutkan..." className="mt-1" />}
              </div>

              <div>
                <Label>Kapan rencana pembelian?</Label>
                <RadioGroup value={purchaseTimeline} onValueChange={setPurchaseTimeline} className="grid grid-cols-2 gap-2 mt-1">
                  {TIMELINE_OPTIONS.map((t) => (
                    <div key={t} className="flex items-center gap-2">
                      <RadioGroupItem value={t} id={`tl-${t}`} />
                      <Label htmlFor={`tl-${t}`} className="font-normal">{t}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div>
                <Label>Tindak lanjut</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {FOLLOWUP_OPTIONS.map((f) => (
                    <div key={f} className="flex items-center gap-2">
                      <Checkbox checked={followUp.includes(f)} onCheckedChange={(c) => setFollowUp(prev => c ? [...prev, f] : prev.filter(x => x !== f))} id={`fu-${f}`} />
                      <Label htmlFor={`fu-${f}`} className="font-normal">{f}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>Skor</Label>
                <RadioGroup value={skor} onValueChange={setSkor} className="flex gap-4 mt-1">
                  {SKOR_OPTIONS.map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <RadioGroupItem value={s} id={`sk-${s}`} />
                      <Label htmlFor={`sk-${s}`} className="font-normal">{s}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div>
                <Label htmlFor="salesNotes">Catatan Sales</Label>
                <Textarea id="salesNotes" value={salesNotes} onChange={(e) => setSalesNotes(e.target.value)} placeholder="Kendala / kebutuhan / catatan lain..." rows={3} className="mt-1" />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setActiveJobId(null)}>
                Tutup
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

  // ─── Render: Queue + Camera/Upload ───
  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
      {/* Queue bar */}
      {jobs.length > 0 && (
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex gap-2 pb-1 min-w-0">
            {jobs.map((job) => {
              const isActive = job.id === activeJobId;
              const preview = previews[job.id];
              return (
                <div key={job.id} className="relative group shrink-0">
                  <button
                    onClick={() => setActiveJobId(job.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-2 min-w-[80px] w-[80px] transition-all cursor-pointer",
                      isActive ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-muted bg-card hover:border-muted-foreground/30"
                    )}
                  >
                    <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                      {preview ? (
                        <img src={preview} alt="" className="w-full h-full object-cover" />
                      ) : job.result?.imageUrl ? (
                        <img src={job.result.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {job.status === 'pending' && <Clock className="h-3 w-3 text-muted-foreground" />}
                      {job.status === 'processing' && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                      {job.status === 'done' && <Check className="h-3 w-3 text-green-600" />}
                      {job.status === 'error' && <XCircle className="h-3 w-3 text-destructive" />}
                      <span className="text-[10px] text-muted-foreground truncate">
                        {job.status === 'pending' ? 'Antri' : job.status === 'processing' ? 'Proses' : job.status === 'done' ? (job.result?.name.value?.split(' ')[0] || 'Selesai') : 'Gagal'}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteJob(job.id);
                    }}
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:bg-destructive/90 transition-opacity md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                    title="Hapus"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
          {jobs.some(j => j.status === 'pending' || j.status === 'processing') && (
            <p className="text-[10px] text-muted-foreground text-center mt-1">
              {jobs.filter(j => j.status === 'pending' || j.status === 'processing').length} sedang diproses...
            </p>
          )}
        </div>
      )}

      {/* Active job: show status, hide camera */}
      {activeJob && activeJob.status !== 'done' ? (
        activeJob.status === 'processing' || activeJob.status === 'pending' ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium">Memproses OCR...</p>
                <p className="text-sm text-muted-foreground mt-1">AI sedang membaca kartu nama</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setActiveJobId(null)}>
                Tutup
              </Button>
            </CardContent>
          </Card>
        ) : activeJob.status === 'error' ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8">
              <XCircle className="h-10 w-10 text-destructive" />
              <div className="text-center">
                <p className="font-medium">Gagal memproses</p>
                <p className="text-sm text-muted-foreground mt-1">{activeJob.errorMessage}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setActiveJobId(null)}>
                Tutup
              </Button>
            </CardContent>
          </Card>
        ) : null
      ) : (
        /* Idle state: Camera / Upload (only when no active or done-only) */
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ScanLine className="h-5 w-5" /> Capture Lead
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button size="lg" className="h-20 text-base" onClick={() => cameraInputRef.current?.click()}>
                <Camera className="h-6 w-6 mr-3" /> Foto Kartu Nama
              </Button>
              <Button size="lg" variant="outline" className="h-14" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-5 w-5 mr-2" /> Unggah Gambar
              </Button>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileSelected} />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
              <p className="text-xs text-muted-foreground text-center pt-1">
                Foto kartu nama — proses di background, bisa foto lagi.
              </p>
            </CardContent>
          </Card>

          {/* Recent customers */}
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
        </>
      )}
    </div>
  );
}

function RecentCard({ customer, onClick }: { customer: Customer; onClick: () => void }) {
  const salesCode = customer.notes && typeof customer.notes === 'object' && 'manual' in customer.notes
    ? (customer.notes as any).manual?.match(/Sales: (\w+)/)?.[1]
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
