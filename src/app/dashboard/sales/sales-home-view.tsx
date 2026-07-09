'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { FadeIn } from '@/components/ui/fade-in';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, MessageCircle, Mail, Eye, Sparkles, Copy, ArrowRight } from 'lucide-react';
import { getSalesHome, type SalesHomeData, type SalesHomeLead } from '@/app/actions/sales-home';
import { generateLeadActionAI } from '@/app/actions/lead-action-ai';
import { PRIORITY_CONFIG, PRIORITY_ORDER, formatWaLink, type LeadPriority } from '@/lib/lead-scoring';
import { EmailClientDialog } from '../components/email-client-dialog';

const formatCurrency = (v: number | null | undefined) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v || 0);

const shortStage = (s: string) => {
    if (s.startsWith('Leads')) return 'Leads';
    if (s.startsWith('Initial')) return 'Quotation';
    if (s.startsWith('Valid')) return 'Valid Opp';
    if (s.startsWith('Product')) return 'Demo';
    if (s.startsWith('Budget')) return 'Budget';
    if (s.startsWith('Negotiation')) return 'Negotiation';
    return s;
};

const daysLabel = (d: number | null): string => {
    if (d === null) return '';
    if (d === 0) return 'hari ini';
    if (d === 1) return 'kemarin';
    return `${d} hari lalu`;
};

type AiState = Record<string, { loading: boolean; result?: { action: string; reason: string; message: string }; error?: string }>;

export function SalesHomeView() {
    const { userProfile } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [data, setData] = useState<SalesHomeData | null>(null);
    const [loading, setLoading] = useState(true);
    const [ai, setAi] = useState<AiState>({});
    const [emailState, setEmailState] = useState({ isOpen: false, email: '' });

    useEffect(() => {
        if (!userProfile) return;
        setLoading(true);
        getSalesHome(userProfile)
            .then(setData)
            .catch(() => toast({ variant: 'destructive', title: 'Gagal memuat beranda' }))
            .finally(() => setLoading(false));
    }, [userProfile, toast]);

    const handleAi = async (lead: SalesHomeLead) => {
        const id = lead.customer.id;
        setAi((prev) => ({ ...prev, [id]: { loading: true } }));
        try {
            const result = await generateLeadActionAI(id);
            setAi((prev) => ({ ...prev, [id]: { loading: false, result } }));
        } catch (err) {
            setAi((prev) => ({ ...prev, [id]: { loading: false, error: (err as Error).message } }));
        }
    };

    const copyText = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Tersalin', description: 'Draf pesan disalin.' });
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
            </div>
        );
    }
    if (!data) return null;

    const { stats, leads } = data;
    const firstName = userProfile?.name?.split(' ')[0] || '';

    const byPriority = (p: LeadPriority) => leads.filter((l) => l.priority === p);

    const quickActions = (lead: SalesHomeLead) => {
        const c = lead.customer;
        const hasPhone = !!(c.phone && c.phone.replace(/\D/g, '').length >= 8);
        const hasEmail = !!c.email;
        return (
            <>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 disabled:opacity-30" disabled={!hasPhone} onClick={() => window.open(formatWaLink(c.phone), '_blank')} title="WhatsApp">
                    <MessageCircle className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary disabled:opacity-30" disabled={!hasEmail} onClick={() => setEmailState({ isOpen: true, email: c.email })} title="Email">
                    <Mail className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push(`/dashboard/customer/${c.id}`)} title="Detail">
                    <Eye className="h-4 w-4" />
                </Button>
            </>
        );
    };

    const leadCard = (lead: SalesHomeLead) => {
        const c = lead.customer;
        const st = ai[c.id];
        return (
            <div key={c.id} className="rounded-lg border bg-card p-3.5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <button className="block font-semibold text-sm text-left hover:text-primary truncate" onClick={() => router.push(`/dashboard/customer/${c.id}`)}>
                            {c.name}
                        </button>
                        <div className="text-xs text-muted-foreground truncate">{c.company || '-'}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                            {shortStage(c.pipelineStatus)} · {daysLabel(lead.daysSinceUpdate) || 'baru'}
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="font-semibold text-sm">{formatCurrency(c.potentialRevenue)}</div>
                    </div>
                </div>

                <div className="flex items-center gap-1 pt-0.5 border-t">
                    {quickActions(lead)}
                    <Button variant="default" size="sm" className="ml-auto h-8 gap-1.5" disabled={st?.loading} onClick={() => handleAi(lead)}>
                        {st?.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Saran AI
                    </Button>
                </div>

                {st?.error && (
                    <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded px-2 py-1.5">
                        AI gagal: {st.error}
                    </div>
                )}
                {st?.result && (
                    <div className="rounded-md bg-muted/60 p-2.5 space-y-1.5 text-xs">
                        <p className="font-semibold text-foreground">{st.result.action}</p>
                        <p className="text-muted-foreground">{st.result.reason}</p>
                        <div className="flex items-start gap-2 pt-1">
                            <p className="flex-1 whitespace-pre-wrap text-foreground/90 leading-relaxed">{st.result.message}</p>
                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyText(st.result!.message)} title="Salin pesan">
                                <Copy className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const section = (p: LeadPriority, count: number) => {
        if (count === 0) return null;
        const cfg = PRIORITY_CONFIG[p];
        const items = byPriority(p);
        return (
            <section key={p} className="space-y-2">
                <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                    <h2 className="font-semibold text-sm">{cfg.label}</h2>
                    <span className="text-xs text-muted-foreground">— {count}</span>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">{cfg.desc}</p>
                <div className="space-y-2">{items.map(leadCard)}</div>
            </section>
        );
    };

    const todayCount = stats.today;
    const activeCount = stats.active;
    const newCount = stats.newCount;

    return (
        <FadeIn className="space-y-6">
            <EmailClientDialog isOpen={emailState.isOpen} onOpenChange={(o) => setEmailState({ isOpen: o, email: '' })} email={emailState.email} />

            {/* Header — tujuan halaman */}
            <header className="space-y-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">Beranda</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Halo {firstName}, kamu punya <span className="font-semibold text-foreground">{todayCount} lead yang perlu ditindak hari ini</span>. Mulai dari bagian paling atas.
                </p>
            </header>

            {/* Summary strip */}
            <div className="grid grid-cols-4 gap-2">
                {[
                    { label: 'Tindak Hari Ini', value: todayCount, cls: 'text-red-600' },
                    { label: 'Berjalan', value: activeCount, cls: 'text-amber-600' },
                    { label: 'Baru', value: newCount, cls: 'text-sky-600' },
                    { label: 'Won', value: stats.won, cls: 'text-emerald-600' },
                ].map((s) => (
                    <div key={s.label} className="rounded-lg border bg-card py-2.5 text-center">
                        <div className={`text-xl font-bold leading-none ${s.cls}`}>{s.value}</div>
                        <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* 3 bucket prioritas */}
            {leads.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-12 border rounded-lg border-dashed">
                    Belum ada lead aktif. Scan kartu nama atau tambah pelanggan untuk mulai.
                </div>
            ) : (
                <div className="space-y-6">
                    {PRIORITY_ORDER.map((p) => {
                        const count = p === 'today' ? todayCount : p === 'active' ? activeCount : newCount;
                        return section(p, count);
                    })}
                </div>
            )}
        </FadeIn>
    );
}
