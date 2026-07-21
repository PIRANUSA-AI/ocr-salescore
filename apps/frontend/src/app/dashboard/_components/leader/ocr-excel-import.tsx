'use client';

import { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import {
  EVENT_OPTIONS,
  EVENT_TO_TEAM,
  eventDateForDay,
  formatEventDay,
} from '@/types';
import { EventDaySelect } from '@/components/ui/event-day-select';

type Team = 'AEC' | 'MFG';

interface SalesPerson { code: string; name: string; uid: string; team: Team }

interface ParsedLead {
  id: string;          // unique across sheets (e.g. "Day 2#121")
  rowIndex: number;    // Excel row number, for display only
  sheetName: string;
  sheetDayIndex: number;
  name: string;
  phone: string;
  email: string;
  jobTitle: string;
  company: string;
  softwareFallback: string;
  industri: string;
  produk: string;
  software: string;
  rencana: string;
  catatan: string;
  sales: string;
  followUp: string;
  skor: string;
}

interface RowResult { status: 'pending' | 'saving' | 'ok' | 'error'; message?: string }

// Header yang harus ada minimal di baris pertama supaya kita yakin ini Excel visitor.
const REQUIRED_HEADERS = ['nama', 'company'];

// Cell → string aman. Handle number (phone bisa terbaca numerik), null, '-' (konvensi kosong).
function readCell(v: unknown): string {
  if (v == null) return '';
  let s: string;
  if (typeof v === 'number') s = Number.isFinite(v) ? String(v) : '';
  else s = String(v);
  s = s.trim();
  // '-' sering dipakai sebagai penanda "kosong" di excel manual visitor ini
  if (s === '-' || s === '—' || s.toLowerCase() === 'none' || s.toLowerCase() === 'null') return '';
  return s;
}

// Match nama sales dari Excel (biasanya nama panggilan: "Tika", "Lody", dst) ke daftar sales.
// Strategi: first-word exact (case-insensitive) → fallback contains dua arah (min 3 huruf).
function matchSalesByName(excelName: string, pool: SalesPerson[]): SalesPerson | null {
  const target = excelName.trim().toLowerCase();
  if (!target) return null;
  let m = pool.find(s => (s.name.trim().toLowerCase().split(/\s+/)[0] || '') === target);
  if (m) return m;
  m = pool.find(s => {
    const n = s.name.trim().toLowerCase();
    if (target.length < 3 && n.length < 3) return false;
    return n.includes(target) || target.includes(n);
  });
  return m ?? null;
}

function dayIndexFromSheet(sheetName: string): number | null {
  const m = sheetName.match(/day\s*(\d+)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n - 1 : null;
}

async function parseVisitorExcel(file: File): Promise<ParsedLead[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const leads: ParsedLead[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    // header: 1 → array-of-arrays supaya kolom duplikat (No Telp, Email) tidak overwrite
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false });
    if (rows.length < 2) continue;

    const headerRow = (rows[0] ?? []).map(h => readCell(h).toLowerCase());
    const hasRequired = REQUIRED_HEADERS.every(h => headerRow.some(hr => hr.includes(h)));
    if (!hasRequired) continue; // sheet dengan layout berbeda → skip, bukan error fatal

    const sheetDayIndex = dayIndexFromSheet(sheetName) ?? 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const nama = readCell(r[1]);
      if (!nama) continue; // baris kosong / placeholder "No" tanpa data
      // Skip baris yang isinya hanya angka urut di kolom No
      const others = [2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 16, 17].map(idx => readCell(r[idx])).filter(Boolean);
      if (others.length === 0 && !nama) continue;

      leads.push({
        id: `${sheetName}#${i + 1}`,
        rowIndex: i + 1,
        sheetName,
        sheetDayIndex,
        name: nama,
        phone: readCell(r[5]),
        email: readCell(r[6]),
        jobTitle: readCell(r[7]),
        company: readCell(r[8]),
        softwareFallback: readCell(r[9]),
        industri: readCell(r[10]),
        produk: readCell(r[11]),
        software: readCell(r[12]),
        rencana: readCell(r[13]),
        catatan: readCell(r[14]),
        sales: readCell(r[15]),
        followUp: readCell(r[16]),
        skor: readCell(r[17]),
      });
    }
  }
  return leads;
}

interface Props {
  allSales: SalesPerson[];
  creatorTeam: Team;
  eventName: string;
  dayIndex: number;
  onImported: () => void;
}

export function OcrExcelImport({ allSales, creatorTeam, eventName, dayIndex, onImported }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [leads, setLeads] = useState<ParsedLead[] | null>(null);
  const [results, setResults] = useState<Record<string, RowResult>>({});
  const [saving, setSaving] = useState(false);

  // Konfigurasi impor; default dari state OcrCaptureView, bisa diubah user di preview dialog.
  const [impEvent, setImpEvent] = useState(eventName);
  const [impTeam, setImpTeam] = useState<Team>(creatorTeam);
  const [impDayIndex, setImpDayIndex] = useState(dayIndex);

  const salesForTeam = useMemo(() => allSales.filter(s => s.team === impTeam), [allSales, impTeam]);

  const reset = () => {
    setLeads(null);
    setResults({});
    setSaving(false);
    setImpEvent(eventName);
    setImpTeam(creatorTeam);
    setImpDayIndex(dayIndex);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset supaya bisa pilih file yang sama lagi
    if (!file) return;
    setParsing(true);
    try {
      const parsed = await parseVisitorExcel(file);
      if (parsed.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Excel tidak terbaca',
          description: 'Pastikan sheet punya kolom "Nama" dan "Company". Format visitor (Day 1, Day 2, ...) paling cocok.',
        });
        return;
      }
      setLeads(parsed);
      setResults(Object.fromEntries(parsed.map(l => [l.id, { status: 'pending' as const }])));
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Gagal membaca Excel',
        description: err instanceof Error ? err.message : 'File tidak bisa diparse.',
      });
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!leads) return;
    setSaving(true);
    let created = 0, updated = 0, failed = 0;

    for (const lead of leads) {
      setResults(prev => ({ ...prev, [lead.id]: { status: 'saving' } }));
      try {
        const matched = lead.sales ? matchSalesByName(lead.sales, salesForTeam) : null;
        const finalDayIndex = dayIndexFromSheet(lead.sheetName) ?? impDayIndex;

        // Rapatkan ke opsi form OCR (kosongkan placeholder) supaya tampil rapi di UI lead.
        const formAnswers = [
          { question: 'Industri', answer: lead.industri },
          { question: 'Produk diminati', answer: lead.produk },
          { question: 'Software saat ini', answer: lead.software || lead.softwareFallback },
          { question: 'Rencana pembelian', answer: lead.rencana },
          { question: 'Tindak lanjut', answer: lead.followUp },
          { question: 'Skor', answer: lead.skor },
        ].filter(qa => qa.answer && qa.answer.trim());

        const noteParts: string[] = [];
        if (lead.sales) noteParts.push(`Sales: ${lead.sales}${matched ? ` (${matched.code})` : ' (tidak ditemukan di daftar)'}`);
        if (lead.catatan) noteParts.push(`Catatan Sales:\n${lead.catatan}`);

        const res = await api.customers.createManual({
          name: lead.name,
          company: lead.company,
          jobTitle: lead.jobTitle,
          phone: lead.phone,
          email: lead.email,
          address: '',
          creatorTeam: impTeam,
          pipelineStatus: 'Leads Generation 10%',
          products: [],
          assignedSalesId: matched?.uid ?? null,
          assignedSalesName: matched?.name ?? null,
          notes: noteParts.join('\n\n'),
          imageUrl: '',
          imageKey: '',
          acquisitionContext: {
            source: 'Excel',
            eventName: impEvent.trim(),
            eventDate: eventDateForDay(impEvent, finalDayIndex),
          },
          formAnswers,
        } as any);

        if (res.status === 'updated') updated++; else created++;
        setResults(prev => ({ ...prev, [lead.id]: { status: 'ok' } }));
      } catch (err) {
        failed++;
        setResults(prev => ({
          ...prev,
          [lead.id]: { status: 'error', message: err instanceof Error ? err.message : 'Gagal' },
        }));
      }
    }

    setSaving(false);
    toast({
      title: 'Impor selesai',
      description: `Berhasil: ${created}${updated ? `, diperbarui: ${updated}` : ''}${failed ? `, gagal: ${failed}` : ''}.`,
      variant: failed > 0 ? 'destructive' : 'default',
    });

    if (created > 0) {
      // Beri jeda singkat supaya user sempat lihat hasil di tabel, lalu refresh & tutup.
      setTimeout(() => {
        onImported();
        reset();
      }, 1200);
    }
  };

  const okCount = Object.values(results).filter(r => r.status === 'ok').length;
  const errCount = Object.values(results).filter(r => r.status === 'error').length;
  const progressText = saving ? `Memproses... (OK: ${okCount}, Gagal: ${errCount})` : null;

  return (
    <>
      <Button
        size="lg"
        variant="secondary"
        className="h-12"
        disabled={parsing}
        onClick={() => inputRef.current?.click()}
      >
        {parsing ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <FileSpreadsheet className="h-5 w-5 mr-2" />}
        Impor dari Excel
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={onFile}
      />

      <Dialog open={!!leads} onOpenChange={(o) => { if (!saving && !o) reset(); }}>
        <DialogContent className="max-w-5xl grid-rows-[auto_auto_1fr_auto] max-h-[92vh]">
          <DialogHeader>
            <DialogTitle>Impor Lead dari Excel</DialogTitle>
            <DialogDescription>
              {leads
                ? `${leads.length} baris terbaca. Tiap baris akan disimpan sebagai lead (sama seperti hasil OCR).`
                : 'Memuat...'}
            </DialogDescription>
          </DialogHeader>

          {/* Konfigurasi impor */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border rounded-md p-3 bg-muted/30">
            <div>
              <Label>Event</Label>
              <Select
                value={impEvent}
                onValueChange={(v) => {
                  setImpEvent(v);
                  const t = EVENT_TO_TEAM[v];
                  if (t && t !== impTeam) setImpTeam(t);
                }}
                disabled={saving}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_OPTIONS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <EventDaySelect
              eventName={impEvent}
              dayIndex={impDayIndex}
              onDayChange={setImpDayIndex}
              className={saving ? 'opacity-50 pointer-events-none' : ''}
            />
            <div>
              <Label>Tim</Label>
              <Select value={impTeam} onValueChange={(v: Team) => setImpTeam(v)} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AEC">AEC</SelectItem>
                  <SelectItem value="MFG">MFG</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Sales akan di-match ke daftar tim <span className="font-medium text-foreground">{impTeam}</span> ({salesForTeam.length} sales).
              </p>
            </div>
          </div>

          <div className="overflow-auto border rounded-md" style={{ maxHeight: '40vh' }}>
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead className="w-8">Status</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Industri</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead>Software</TableHead>
                  <TableHead>Rencana</TableHead>
                  <TableHead>Tindak Lanjut</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Skor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads?.map((lead) => {
                  const matched = lead.sales ? matchSalesByName(lead.sales, salesForTeam) : null;
                  const salesUnmatched = !!lead.sales && !matched;
                  const res = results[lead.id];
                  return (
                    <TableRow key={lead.id}>
                      <TableCell className="text-xs text-muted-foreground">{lead.rowIndex}</TableCell>
                      <TableCell>
                        {res?.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                        {res?.status === 'error' && (
                          <span title={res.message}><XCircle className="h-4 w-4 text-destructive" /></span>
                        )}
                        {res?.status === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
                        {res?.status === 'pending' && (
                          <span className="text-xs text-muted-foreground">·</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-medium whitespace-nowrap">{lead.name}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{lead.company || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{lead.jobTitle || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{lead.phone || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{lead.email || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{lead.industri || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{lead.produk || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{lead.software || lead.softwareFallback || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{lead.rencana || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{lead.followUp || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap max-w-[200px] truncate" title={lead.catatan}>{lead.catatan || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {lead.sales || '-'}
                        {salesUnmatched && (
                          <span title="Sales tidak ditemukan di daftar">
                            <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />
                          </span>
                        )}
                        {matched && (
                          <span className="text-[10px] text-muted-foreground ml-1">→ {matched.code}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{lead.skor || '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {progressText ?? `Sheet "Day X" akan otomatis menentukan hari (${formatEventDay(impEvent, impDayIndex) || '-'})`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => reset()} disabled={saving}>
                Batal
              </Button>
              <Button onClick={handleConfirm} disabled={saving || !leads || leads.length === 0}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? 'Memproses...' : `Impor ${leads?.length ?? 0} Lead`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
