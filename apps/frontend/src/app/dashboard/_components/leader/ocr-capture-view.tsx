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
import { Loader2, Camera, Upload, ScanLine, Check, RotateCcw, ChevronRight, XCircle, Clock, Image as ImageIcon, ChevronLeft, X, RefreshCw } from 'lucide-react';
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
import { DEFAULT_EVENT_BY_TEAM, EVENT_OPTIONS, EVENT_TO_TEAM } from '@/types';

type ProductGroup = { label: string | null; options: readonly string[] };
type TeamFormOptions = {
  industri: readonly string[];
  productGroups: readonly ProductGroup[];
  software: readonly string[];
  followUp: readonly string[];
};

const TEAM_FORM_OPTIONS: Record<'AEC' | 'MFG', TeamFormOptions> = {
  AEC: {
    industri: ['Arsitek', 'Interior Design', 'Kontraktor', 'Developer'],
    productGroups: [
      { label: null, options: ['ZWCAD', 'SketchUp', 'Archicad', 'Rendering'] },
    ],
    software: ['AutoCAD', 'SketchUp', 'Revit', 'Archicad', 'ZWCAD'],
    followUp: ['Demo', 'Penawaran', 'Kunjungan', 'Follow-up Call'],
  },
  MFG: {
    industri: ['Otomotif & Komponen', 'Elektronik & Elektrikal', 'Logam & Fabrikasi', 'Alat Berat & Machinery', 'Plastik, Kimia & Kemasan'],
    productGroups: [
      { label: 'Software', options: ['ZWCAD (2D/3D CAD)', 'ZW3D (Desain 3D & CAM)', 'SketchUp', 'ANSYS (Simulasi/CAE)'] },
      { label: 'Hardware', options: ['3D Scanner (Scanology/Shining)'] },
    ],
    software: ['AutoCAD', 'SolidWorks', 'Autodesk Inventor/Fusion 360', 'ANSYS/software simulasi lain', 'ZWCAD/ZW3D/SketchUp'],
    followUp: ['Demo', 'Trial/POC', 'Penawaran', 'Kunjungan', 'Follow-up Call'],
  },
};

const TIMELINE_OPTIONS = ['< 3 bulan', '3–6 bulan', '> 6 bulan', 'Belum ada'] as const;
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

// Label MFG panjang & bertanda kurung/slash (mis. "ZW3D (Desain 3D & CAM)",
// "3D Scanner (Scanology/Shining)", "Autodesk Inventor/Fusion 360"). Turunkan
// jadi keyword khas supaya jawaban OCR yang ringkas tetap cocok. Untuk label
// pendek AEC (mis. "ZWCAD") keyword = label itu sendiri, jadi perilaku AEC sama.
function optionKeywords(label: string): string[] {
  const base = label.toLowerCase();
  const outside = base.replace(/\([^)]*\)/g, ' '); // teks di luar kurung
  const inside = (base.match(/\(([^)]*)\)/g) ?? []).map(s => s.replace(/[()]/g, ''));
  const kws = new Set<string>();
  kws.add(base.trim());
  for (const chunk of [outside, ...inside]) {
    for (const tok of chunk.split(/[/&,]/)) {
      const t = tok.trim();
      if (t.length >= 3) kws.add(t);
    }
  }
  return [...kws].filter(Boolean);
}

// Cocok kalau teks mengandung salah satu keyword opsi (bukan harus label penuh).
function optionMatches(text: string, option: string): boolean {
  const t = text.toLowerCase();
  return optionKeywords(option).some(kw => t.includes(kw));
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
    const kw = options.find(o => optionMatches(part, o));
    if (kw) { matched.push(kw); continue; }
    other = part;
  }
  return { matched: [...new Set(matched)], other };
}

interface Props {
  recentCustomers: Customer[];
}

export function OcrCaptureView({ recentCustomers }: Props) {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // Semua sales dari kedua tim — supaya bisa pilih sales sesuai tim yang di-switch.
  const [allSales, setAllSales] = useState<{ code: string; name: string; uid: string; team: 'AEC' | 'MFG' }[]>([]);
  useEffect(() => {
    api.users.listSales().then(r => {
      setAllSales(
        r.users
          .filter((u: any) => !!u.salesCode)
          .map((u: any) => ({ code: u.salesCode as string, name: u.name, uid: u.uid, team: u.team }))
      );
    }).catch(() => {});
  }, []);

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
  const [eventName, setEventName] = useState(DEFAULT_EVENT_BY_TEAM.AEC);
  const [creatorTeam, setCreatorTeam] = useState<'AEC' | 'MFG'>('AEC');

  const salesPeople = useMemo(
    () => allSales.filter(s => s.team === creatorTeam),
    [allSales, creatorTeam]
  );
  const salesCodeSet = useMemo(() => new Set(salesPeople.map(p => p.code)), [salesPeople]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userProfile?.team) {
      setCreatorTeam(userProfile.team);
      setEventName(DEFAULT_EVENT_BY_TEAM[userProfile.team]);
    }
  }, [userProfile]);

  // Poll OCR jobs from backend API.
  // Interval hanya jalan saat ADA job aktif (pending/processing) — kalau idle,
  // polling 5-detik dihentikan supaya tidak spam GET /ocr/jobs terus-menerus.
  // `hasActiveJobs` jadi dependency: sekali scan baru masuk, efek re-run & interval nyala lagi.
  const hasActiveJobs = useMemo(
    () => jobs.some(j => j.status === 'pending' || j.status === 'processing'),
    [jobs]
  );
  useEffect(() => {
    if (!userProfile?.uid) return;
    const poll = () => {
      api.ocr.listJobs(20).then(r => {
        setJobs(prevJobs => {
          // Skip updating from backend if there are active local uploads to prevent doubling
          const hasActiveUploads = prevJobs.some(
            j => j.id.startsWith('temp-') && (j.status === 'pending' || j.status === 'processing')
          );
          if (hasActiveUploads) {
            return prevJobs;
          }
          const tempJobs = prevJobs.filter(j => j.id.startsWith('temp-'));
          const backendJobs = r.jobs as OcrJobData[];
          return [...tempJobs, ...backendJobs.filter(bj => !tempJobs.some(tj => tj.id === bj.id))];
        });
      }).catch(() => {});
    };
    poll(); // sekali saat mount / saat status berubah — ambil state terbaru
    if (!hasActiveJobs) return; // idle: tidak usah interval
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [userProfile, hasActiveJobs]);

  const activeJob = jobs.find(j => j.id === activeJobId) ?? null;

  const recentThree = useMemo(() => recentCustomers.slice(0, 3), [recentCustomers]);

  const formOptions = TEAM_FORM_OPTIONS[creatorTeam];
  const productOptionsFlat = useMemo(
    () => formOptions.productGroups.flatMap(g => g.options),
    [formOptions]
  );

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
    // Scope ke pertanyaan yang cocok — cegah keyword satu kategori (mis. "ZW3D"
    // di Produk) bocor mencentang opsi kategori lain (mis. Software).
    const byAnswer = (questionKeywords: string[], options: readonly string[]) => {
      const found: string[] = [];
      for (const f of fa) {
        if (!questionKeywords.some(k => f.question.toLowerCase().includes(k))) continue;
        for (const opt of options) if (optionMatches(f.answer, opt)) found.push(opt);
      }
      return found;
    };

    const indQ = byQuestion(['industri']); const indA = byAnswer(['industri'], formOptions.industri);
    const ind = matchOptions(indQ || indA.join(', '), formOptions.industri);
    setIndustri(ind.matched.length ? ind.matched : indA);
    if (ind.other) setOtherIndustri(ind.other);

    const piQ = byQuestion(['produk', 'minat']); const piA = byAnswer(['produk', 'minat'], productOptionsFlat);
    const pi = matchOptions(piQ || piA.join(', '), productOptionsFlat);
    setProductInterest(pi.matched.length ? pi.matched : piA);
    if (pi.other) setOtherProduct(pi.other);

    const swQ = byQuestion(['software', 'saat ini', 'digunakan']); const swA = byAnswer(['software', 'saat ini', 'digunakan'], formOptions.software);
    const sw = matchOptions(swQ || swA.join(', '), formOptions.software);
    setCurrentSoftware(sw.matched.length ? sw.matched : swA);
    if (sw.other) setOtherSoftware(sw.other);

    const tl = byQuestion(['rencana', 'pembelian', 'kapan']);
    if (tl) TIMELINE_OPTIONS.forEach(o => { if (tl.toLowerCase().includes(o.toLowerCase().split(' ')[0])) setPurchaseTimeline(o); });
    else fa.forEach(f => TIMELINE_OPTIONS.forEach(o => { if (f.answer.toLowerCase().includes(o.toLowerCase().split(' ')[0])) setPurchaseTimeline(o); }));

    const fu = byQuestion(['tindak', 'follow', 'lanjut']);
    const fuMatches: string[] = [];
    if (fu) formOptions.followUp.forEach(o => { if (optionMatches(fu, o)) fuMatches.push(o); });
    else fa.forEach(f => formOptions.followUp.forEach(o => { if (optionMatches(f.answer, o)) fuMatches.push(o); }));
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
    // Deps = [id, status]: re-populate saat job GANTI (switch sidebar) ATAU saat
    // status berubah jadi 'done' (result baru datang lewat poll pada job yang sama).
    // TIDAK depend `activeJob.result` (object) — poll bikin object baru tiap 5s;
    // kalau ikut object identity, effect re-run terus & menimpa editan manual user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.id, activeJob?.status]);

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
    // event & creatorTeam dikontrol switcher pre-scan, jangan di-reset per foto.
  }, []);

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
      
      const { job } = await api.ocr.process(compressed, creatorTeam);
      
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

  const cycleEvent = () => {
    const idx = EVENT_OPTIONS.indexOf(eventName as (typeof EVENT_OPTIONS)[number]);
    const next = EVENT_OPTIONS[(idx + 1) % EVENT_OPTIONS.length];
    setEventName(next);
    const team = EVENT_TO_TEAM[next];
    if (team) setCreatorTeam(team);
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
          if (optionMatches(f.answer, opt)) found.push(opt);
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
              <ContactField label="Nama" value={editableName} onChange={setEditableName} field={fields.name} />
              <ContactField label="Perusahaan" value={editableCompany} onChange={setEditableCompany} field={fields.company} />
              <ContactField label="Jabatan" value={editableJobTitle} onChange={setEditableJobTitle} field={fields.jobTitle} />
              <ContactField label="Telepon" value={editablePhone} onChange={setEditablePhone} field={fields.phone} />
              <ContactField label="Email" value={editableEmail} onChange={setEditableEmail} field={fields.email} />
            </div>

            <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">Event</p>
              <p className="text-sm font-medium">{eventName}</p>
            </div>

            <div>
              <Label>Tim</Label>
              <Select value={creatorTeam} onValueChange={(val: 'AEC' | 'MFG') => {
                setCreatorTeam(val);
                setSalesCode('');
              }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AEC">AEC (Architecture)</SelectItem>
                  <SelectItem value="MFG">MFG (Manufacturing)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Sales <span className="text-red-500">*</span></Label>
              {salesPeople.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {salesPeople.map((p) => (
                    <Button key={p.code} type="button" variant={salesCode === p.code ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setSalesCode(p.code)}>
                      {p.code}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Belum ada sales untuk tim {creatorTeam}.</p>
              )}
            </div>

            <div className="border-t pt-3 space-y-4">
              <div>
                <Label>Industri</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {formOptions.industri.map((i) => (
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
                {formOptions.productGroups.map((group) => (
                  <div key={group.label ?? '_'} className="mt-1">
                    {group.label && <p className="text-xs text-muted-foreground mb-1">{group.label}</p>}
                    <div className="grid grid-cols-2 gap-2">
                      {group.options.map((p) => (
                        <label key={p} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={productInterest.includes(p)} onCheckedChange={(c) => setProductInterest(prev => c ? [...prev, p] : prev.filter(x => x !== p))} />
                          <span className="text-sm font-normal">{p}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <Checkbox checked={productInterest.includes('Lainnya')} onCheckedChange={(c) => setProductInterest(prev => c ? [...prev, 'Lainnya'] : prev.filter(x => x !== 'Lainnya'))} />
                  <span className="text-sm font-normal">Lainnya</span>
                </label>
                {productInterest.includes('Lainnya') && <Input value={otherProduct} onChange={(e) => setOtherProduct(e.target.value)} placeholder="Sebutkan..." className="mt-1" />}
              </div>

              <div>
                <Label>Software yang digunakan saat ini</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {formOptions.software.map((s) => (
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
                  {formOptions.followUp.map((f) => (
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
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ScanLine className="h-5 w-5" /> Capture Lead
                </CardTitle>
                <button
                  type="button"
                  onClick={cycleEvent}
                  className="group flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-muted"
                  title="Ganti event"
                >
                  <RefreshCw className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-active:-rotate-180" />
                  <span key={eventName} className="text-xs text-muted-foreground animate-in fade-in slide-in-from-right-2 duration-300">
                    {eventName}
                  </span>
                </button>
              </div>
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
              <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/30 p-2.5">
                <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Lead akan dicatat untuk event <span className="font-medium text-foreground">{eventName}</span> (tim {creatorTeam}).
                  Salah event? Ketuk ikon <RefreshCw className="inline h-3 w-3 -mt-0.5" /> di pojok kanan atas untuk ganti sebelum foto.
                </p>
              </div>
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

// Field kartu nama dengan indikator keyakinan OCR. Untuk data tulisan tangan
// (phone/email sering meleset) model menurunkan confidence & menyertakan bacaan
// alternatif — tampilkan supaya sales tahu mana yang perlu dicek dan bisa 1-klik ganti.
function ContactField({
  label, value, onChange, field,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  field?: { alternatives: string[]; confidence: Confidence };
}) {
  const conf = field?.confidence;
  const uncertain = conf === 'low' || conf === 'medium';
  const alts = (field?.alternatives ?? []).filter(a => a && a !== value);
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {uncertain && (
          <span className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">• perlu dicek</span>
        )}
      </div>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn('h-8 mt-0.5', uncertain && 'border-amber-400 focus-visible:ring-amber-400')}
      />
      {alts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mt-1">
          <span className="text-[10px] text-muted-foreground">Alternatif:</span>
          {alts.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange(a)}
              className="text-[10px] rounded border bg-background px-1.5 py-0.5 hover:border-primary hover:text-primary transition-colors"
            >
              {a}
            </button>
          ))}
        </div>
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
