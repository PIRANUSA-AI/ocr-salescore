'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search, ArrowLeft, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import type { Customer } from '@/types';

interface Props {
  customers: Customer[];
}

export function OcrHistoryView({ customers }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.name, c.company, c.phone, c.email].filter(Boolean).some((v) => v!.toLowerCase().includes(q))
    );
  }, [customers, query]);

  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard?view=ocr-capture')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold">Riwayat Scan</h2>
        <span className="text-sm text-muted-foreground">({filtered.length})</span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama, perusahaan, telp..."
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <ScanLine className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {customers.length === 0 ? 'Belum ada scan. Mulai dari halaman pindai.' : 'Tidak ada hasil untuk pencarian ini.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => {
            const salesCode = c.formAnswers?.find((qa) => qa.question.toLowerCase().includes('kode'))?.answer;
            return (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                  {salesCode || (c.name?.slice(0, 2).toUpperCase() ?? '??')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.name || '(tanpa nama)'}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.company || c.phone || '-'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
