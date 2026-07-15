'use client';
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Eye, Edit, ScanLine, Trash2, Mail, Phone, PlusCircle, X, Filter, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { type Customer, PIPELINE_STAGES, PipelineStatus, EVENT_DAYS, getEventDayIndex, eventDateForDay, eventDayDate } from '@/types';
import { Badge } from '@/components/ui/badge';
import { useDashboard } from '@/app/dashboard/dashboard-context';
import { OcrImportDialog } from './ocr-import-dialog';
import * as XLSX from 'xlsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ExcelPreviewDialog } from './excel-preview-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { EmailClientDialog } from '../email-client-dialog';
import { api } from '@/lib/api-client';
import { FadeIn } from '@/components/ui/fade-in';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';

type SortOrder = 'default' | 'sales-desc' | 'sales-asc';

const getValidPhoneNumbers = (phone: string | undefined | null): { original: string, number: string; isValid: boolean }[] => {
    if (!phone) return [];
    const parts = phone.split(/[,/\n;&]+/);
    return parts.map(part => {
        let cleaned = part.replace(/[^0-9+]/g, '');
        if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
        if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
        else if (cleaned.startsWith('8') && cleaned.length >= 9 && cleaned.length <= 13 && !cleaned.startsWith('62')) cleaned = '62' + cleaned;
        if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
        return { original: part.trim(), number: `+${cleaned}`, isValid: cleaned.startsWith('628') && cleaned.length >= 12 && cleaned.length <= 16 };
    }).filter(r => r.number.length > 5);
};

export const CustomerManager = () => {
    const { toast } = useToast();
    const router = useRouter();
    const isMobile = useMediaQuery("(max-width: 768px)");
    const { customers, isLoading, refreshAllData, handleAssignSalesToEntity, openCustomerEditDialog, userProfile, handleBulkDelete, salesTeam } = useDashboard();

    const [isOcrDialogOpen, setIsOcrDialogOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
    const [navigatingToId, setNavigatingToId] = useState<string | null>(null);
    const [emailClientState, setEmailClientState] = useState({ isOpen: false, email: '' });

    const searchParams = useSearchParams();
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [pipelineFilter, setPipelineFilter] = useState('all');
    const [salesFilter, setSalesFilter] = useState('all');
    const [eventFilter, setEventFilter] = useState('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [sortOrder, setSortOrder] = useState<SortOrder>('default');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    useEffect(() => {
        const query = searchParams.get('search');
        if (query !== null) { setSearchTerm(query); setCurrentPage(1); }
    }, [searchParams]);

    // Map sales code (mis. "TK") -> nama lengkap, agar kolom Sales konsisten
    const salesNameByCode = useMemo(() => {
        const m = new Map<string, string>();
        salesTeam?.forEach(s => { if (s.salesCode) m.set(s.salesCode.toUpperCase(), s.name); });
        return m;
    }, [salesTeam]);

    // Resolve sales rep ke NAMA lengkap (assignedSalesName / lookup uid / decode kode dari OCR form)
    const getSalesDisplayName = useCallback((c: Customer): string | null => {
        if (c.assignedSalesName) return c.assignedSalesName;
        if (c.assignedSalesId) {
            const rep = salesTeam?.find(s => s.uid === c.assignedSalesId);
            if (rep?.name) return rep.name;
        }
        // Ekstrak kode dari notes/form OCR
        let code: string | null = null;
        if (c.notes && typeof c.notes === 'object' && 'manual' in c.notes) {
            const m = (c.notes as any).manual?.match(/Sales: (\w+)/);
            if (m) code = m[1];
        }
        if (!code && c.formAnswers) {
            const fa = c.formAnswers.find(f => f.question.toLowerCase().includes('sales code'));
            if (fa?.answer) code = fa.answer;
        }
        if (code) return salesNameByCode.get(code.toUpperCase()) || code; // resolve, fallback ke kode
        return null;
    }, [salesTeam, salesNameByCode]);

    const eventOptions = useMemo(() => {
        const names = new Set<string>();
        customers?.forEach(c => { if (c.acquisitionContext?.eventName) names.add(c.acquisitionContext.eventName); });
        return [...names].sort();
    }, [customers]);

    const filteredCustomers = useMemo(() => {
        if (!customers) return [];
        const filtered = customers.filter(c => {
            const lowercasedTerm = searchTerm.toLowerCase();
            const cleanedSearchTerm = lowercasedTerm.replace(/[^0-9]/g, '');
            const nameMatch = c.name.toLowerCase().includes(lowercasedTerm);
            const companyMatch = c.company && c.company.toLowerCase().includes(lowercasedTerm);
            const emailMatch = c.email && c.email.toLowerCase().includes(lowercasedTerm);
            let phoneMatch = false;
            if (c.phone && cleanedSearchTerm) {
                const cleanedPhone = c.phone.replace(/[^0-9]/g, '');
                phoneMatch = cleanedPhone.includes(cleanedSearchTerm);
            }
            const searchMatch = searchTerm === '' || nameMatch || companyMatch || emailMatch || phoneMatch;
            const pipelineMatch = pipelineFilter === 'all' || c.pipelineStatus === pipelineFilter;
            const salesMatch = salesFilter === 'all' || (salesFilter === 'unassigned' ? !c.assignedSalesId : c.assignedSalesId === salesFilter);
            const eventMatch = eventFilter === 'all' || c.acquisitionContext?.eventName === eventFilter;
            let dateMatch = true;
            if (dateRange?.from) {
                const createdAt = new Date(c.createdAt);
                dateMatch = createdAt >= startOfDay(dateRange.from) && createdAt <= endOfDay(dateRange.to || dateRange.from);
            }
            return searchMatch && pipelineMatch && salesMatch && eventMatch && dateMatch;
        });

        if (sortOrder === 'default') return filtered;

        // Urutkan berdasarkan total lead per sales (bukan per-baris) —
        // sales dgn lead terbanyak/tersedikit dikelompokkan di atas.
        const countBySales = new Map<string, number>();
        filtered.forEach(c => {
            const key = c.assignedSalesId || 'unassigned';
            countBySales.set(key, (countBySales.get(key) || 0) + 1);
        });
        const direction = sortOrder === 'sales-desc' ? -1 : 1;
        return [...filtered].sort((a, b) => {
            const countA = countBySales.get(a.assignedSalesId || 'unassigned') || 0;
            const countB = countBySales.get(b.assignedSalesId || 'unassigned') || 0;
            return (countA - countB) * direction;
        });
    }, [customers, searchTerm, pipelineFilter, salesFilter, eventFilter, dateRange, sortOrder]);

    const paginatedCustomers = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredCustomers.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredCustomers, currentPage, itemsPerPage]);

    const pageCount = Math.ceil(filteredCustomers.length / itemsPerPage);
    const isAnyFilterActive = pipelineFilter !== 'all' || salesFilter !== 'all' || eventFilter !== 'all' || !!dateRange || sortOrder !== 'default';

    const resetFilters = () => {
        setPipelineFilter('all');
        setSalesFilter('all');
        setEventFilter('all');
        setDateRange(undefined);
        setSortOrder('default');
        setCurrentPage(1);
    };

    const handleDownload = () => {
        if (!customers || customers.length === 0) {
            toast({ variant: "destructive", title: "Tidak ada data untuk diunduh", description: "Silakan tambahkan pelanggan terlebih dahulu." });
            return;
        }
        const salesCodeByUid = new Map(salesTeam.map(s => [s.uid, s.salesCode || '']));
        const dataToExport = filteredCustomers.map(c => ({
            'Nama': c.name, 'Perusahaan': c.company, 'Email': c.email, 'Telepon': c.phone,
            'Status': c.pipelineStatus, 'Sales': c.assignedSalesName || '-',
            'Kode Sales': (c.assignedSalesId && salesCodeByUid.get(c.assignedSalesId)) || '',
            'Tanggal': new Date(c.createdAt).toLocaleDateString('id-ID'),
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Pelanggan');
        XLSX.writeFile(workbook, `Pelanggan_${new Date().toLocaleDateString('id-ID')}.xlsx`);
        toast({ title: "Unduh Berhasil", description: `${dataToExport.length} pelanggan telah diekspor.` });
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);
                const requiredHeaders = ['name', 'email', 'product_name', 'product_purchase_date'];
                const fileHeaders = Object.keys(json[0] || {});
                if (!requiredHeaders.every(h => fileHeaders.includes(h))) throw new Error(`Header Excel tidak valid.`);
                if (json.length === 0) throw new Error('Tidak ada data valid.');
                const customersToCreate = json.map((row: any) => {
                    if (typeof row.product_purchase_date === 'number') {
                        const jsDate = XLSX.SSF.parse_date_code(row.product_purchase_date);
                        row.product_purchase_date = new Date(jsDate.y, jsDate.m - 1, jsDate.d).toISOString().split('T')[0];
                    }
                    return row;
                });
                setPreviewData(customersToCreate);
                setIsPreviewOpen(true);
            } catch (error) {
                toast({ variant: 'destructive', title: 'Gagal', description: (error as Error).message });
            } finally {
                setIsUploading(false);
                if (event.target) event.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleUpdatePipelineStatus = useCallback(async (customerId: string, customerName: string, newStatus: PipelineStatus) => {
        if (!userProfile) return;
        try {
            await api.customers.update(customerId, { pipelineStatus: newStatus });
            await api.activities.create({ action: `mengubah status pipeline ${customerName} menjadi ${newStatus}`, targetId: customerId, targetName: customerName });
            refreshAllData();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal', description: (error as Error).message });
        }
    }, [userProfile, toast, refreshAllData]);

    const handleUpdatePriority = useCallback(async (customerId: string, newPriority: 'High' | 'Medium' | 'Low' | 'none') => {
        try {
            await api.customers.updatePriority(customerId, newPriority);
            refreshAllData();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal', description: (error as Error).message });
        }
    }, [toast, refreshAllData]);

    const getCustomerDayIndex = useCallback((c: Customer): number => {
        const ctx = c.acquisitionContext;
        if (!ctx?.eventName) return -1;
        const days = EVENT_DAYS[ctx.eventName];
        if (!days || days.length === 0) return -1;
        const idx = getEventDayIndex(ctx.eventName, new Date(ctx.eventDate || c.createdAt));
        return idx >= 0 ? idx : 0;
    }, []);

    const handleUpdateEventDay = useCallback(async (customerId: string, customerName: string, ctx: Customer['acquisitionContext'] | undefined, newDayIndex: number) => {
        const eventName = ctx?.eventName || '';
        try {
            await api.customers.update(customerId, {
                acquisitionContext: {
                    source: ctx?.source || 'Lainnya',
                    eventName,
                    eventDate: eventDateForDay(eventName, newDayIndex).toISOString(),
                },
            });
            await api.activities.create({ action: `mengubah hari event ${customerName} menjadi Day ${newDayIndex + 1}`, targetId: customerId, targetName: customerName });
            refreshAllData();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal', description: (error as Error).message });
        }
    }, [toast, refreshAllData]);

    const handleDeleteSingleCustomer = async (customerId: string) => {
        setIsDeleting(true);
        try { await handleBulkDelete([customerId]); } catch { } finally { setIsDeleting(false); }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) setSelectedCustomers(paginatedCustomers.map(c => c.id));
        else setSelectedCustomers([]);
    };

    const handleSelectRow = (customerId: string, checked: boolean) => {
        setSelectedCustomers(prev => checked ? [...prev, customerId] : prev.filter(id => id !== customerId));
    };

    const handleNavigateToDetail = (customerId: string) => {
        setNavigatingToId(customerId);
        router.push(`/dashboard/customer/${customerId}`);
    };

    const emailBtn = (email: string) => (
        <button onClick={() => setEmailClientState({ isOpen: true, email })} className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate">
            <Mail className="h-3 w-3 shrink-0" />{email || '-'}
        </button>
    );

    const phoneDisplay = (phone: string) => {
        const numbers = getValidPhoneNumbers(phone);
        return numbers.length > 0 ? (
            <div className="flex flex-col gap-0.5">
                {numbers.map((n, i) => n.isValid ? (
                    <a key={i} href={`https://wa.me/${n.number.replace('+', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-green-600 hover:underline font-medium">
                        <Phone className="h-3 w-3 shrink-0" />{n.number}
                    </a>
                ) : (
                    <span key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3 w-3 shrink-0" />{n.number}</span>
                ))}
            </div>
        ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3 w-3 shrink-0" />-</span>
        );
    };

    return (
        <FadeIn className="space-y-4">
            <ExcelPreviewDialog isOpen={isPreviewOpen} onOpenChange={setIsPreviewOpen} data={previewData} onImportSuccess={refreshAllData} creatorTeam={userProfile?.team} />
            <EmailClientDialog isOpen={emailClientState.isOpen} onOpenChange={(open) => setEmailClientState({ isOpen: open, email: '' })} email={emailClientState.email} />

            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">Customers</h1>
                    <p className="text-xs text-muted-foreground">{customers?.length || 0} pelanggan</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setIsOcrDialogOpen(true)}>
                        <ScanLine className="h-4 w-4" />
                    </Button>
                    <label className="cursor-pointer">
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled={isUploading} asChild>
                            <span>{isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}</span>
                        </Button>
                        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
                    </label>
                    <Button size="icon" className="h-8 w-8" onClick={() => openCustomerEditDialog(null)}>
                        <PlusCircle className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <OcrImportDialog isOpen={isOcrDialogOpen} onOpenChange={(open) => setIsOcrDialogOpen(open)} onCustomerAdded={refreshAllData} startInCameraMode={!isMobile} />

            {/* Search & Filter */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[140px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Cari..." className="w-full pl-8 h-8 text-sm" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
                </div>
                <Select value={pipelineFilter} onValueChange={(v) => { setPipelineFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[110px] h-8 text-xs">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Semua Status</SelectItem>
                        {PIPELINE_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={salesFilter} onValueChange={(v) => { setSalesFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                        <SelectValue placeholder="Sales" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Semua Sales</SelectItem>
                        <SelectItem value="unassigned">Belum Ditugaskan</SelectItem>
                        {salesTeam.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                {eventOptions.length > 0 && (
                    <Select value={eventFilter} onValueChange={(v) => { setEventFilter(v); setCurrentPage(1); }}>
                        <SelectTrigger className="w-[130px] h-8 text-xs">
                            <SelectValue placeholder="Event" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Semua Event</SelectItem>
                            {eventOptions.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                        </SelectContent>
                    </Select>
                )}
                {/* <DateRangePicker
                    range={dateRange}
                    onRangeChange={(v) => { setDateRange(v); setCurrentPage(1); }}
                    className="[&_button#date]:h-8 [&_button#date]:w-[190px] [&_button#date]:text-xs"
                /> */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 relative">
                            <ArrowUpDown className="h-3.5 w-3.5" />
                            {sortOrder !== 'default' && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => setSortOrder('default')} className={cn('text-sm', sortOrder === 'default' && 'bg-accent')}>
                            Urutan Default
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortOrder('sales-desc')} className={cn('text-sm', sortOrder === 'sales-desc' && 'bg-accent')}>
                            Sales Terbanyak Lead
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortOrder('sales-asc')} className={cn('text-sm', sortOrder === 'sales-asc' && 'bg-accent')}>
                            Sales Tersedikit Lead
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                {isAnyFilterActive && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={resetFilters}>
                        <X className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>

            {/* Bulk actions */}
            {selectedCustomers.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{selectedCustomers.length} dipilih</span>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={isDeleting}>
                                <Trash2 className="h-4 w-4 mr-1" />Hapus
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Hapus {selectedCustomers.length} pelanggan?</AlertDialogTitle>
                                <AlertDialogDescription>Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Batal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => { setIsDeleting(true); handleBulkDelete(selectedCustomers).then(() => setSelectedCustomers([])).finally(() => setIsDeleting(false)); }}>Ya, Hapus</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}

            {/* Mobile list */}
            {isMobile ? (
                <div className="space-y-2">
                    {isLoading ? (
                        [...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
                    ) : paginatedCustomers.length > 0 ? (
                        paginatedCustomers.map(c => (
                            <div
                                key={c.id}
                                className="p-3 border rounded-lg active:bg-muted/50 transition-colors cursor-pointer"
                                onClick={() => handleNavigateToDetail(c.id)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-2 min-w-0 flex-1">
                                        <Checkbox className="mt-0.5 shrink-0" checked={selectedCustomers.includes(c.id)} onCheckedChange={(ch) => handleSelectRow(c.id, !!ch)} onClick={(e) => e.stopPropagation()} />
                                        <div className="min-w-0">
                                            <div className="font-medium text-sm truncate">{c.name}</div>
                                            <div className="text-xs text-muted-foreground truncate">{c.company || '-'}</div>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mr-1" onClick={(e) => { e.stopPropagation(); openCustomerEditDialog(c); }}>
                                        <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2 mt-1.5 ml-7">
                                    <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{c.pipelineStatus}</span>
                                    {getSalesDisplayName(c) && (
                                        <span className="text-[11px] font-mono text-muted-foreground bg-primary/10 px-1.5 py-0.5 rounded">{getSalesDisplayName(c)}</span>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-muted-foreground py-12 border rounded-lg text-sm">Belum ada data pelanggan. Scan kartu nama atau import Excel untuk memulai.</div>
                    )}
                </div>
            ) : (
                /* Desktop table */
                <div className="border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10"><Checkbox onCheckedChange={handleSelectAll} checked={selectedCustomers.length === paginatedCustomers.length && paginatedCustomers.length > 0} /></TableHead>
                                <TableHead className="text-xs">Nama</TableHead>
                                <TableHead className="text-xs w-[130px]">Status</TableHead>
                                <TableHead className="text-xs w-[110px]">Sales</TableHead>
                                <TableHead className="text-xs w-[150px]">Event</TableHead>
                                <TableHead className="text-xs w-[140px]">Day</TableHead>
                                <TableHead className="text-xs">Kontak</TableHead>
                                <TableHead className="text-xs w-[80px]">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                [...Array(6)].map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-4 w-4 rounded" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                        <TableCell><Skeleton className="h-7 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-7 w-20" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                                        <TableCell><Skeleton className="h-7 w-16" /></TableCell>
                                    </TableRow>
                                ))
                            ) : paginatedCustomers.length > 0 ? (
                                paginatedCustomers.map(c => (
                                    <TableRow
                                        key={c.id}
                                        className="cursor-pointer"
                                        onClick={() => handleNavigateToDetail(c.id)}
                                    >
                                        <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={selectedCustomers.includes(c.id)} onCheckedChange={(ch) => handleSelectRow(c.id, !!ch)} /></TableCell>
                                        <TableCell>
                                            <div className="font-medium text-sm">{c.name}</div>
                                            <div className="text-xs text-muted-foreground">{c.company || '-'}</div>
                                        </TableCell>
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            <Select value={c.pipelineStatus} onValueChange={(v) => handleUpdatePipelineStatus(c.id, c.name, v as PipelineStatus)}>
                                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>{PIPELINE_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            {getSalesDisplayName(c) && (
                                                <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">{getSalesDisplayName(c)}</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs text-muted-foreground truncate block max-w-[140px]" title={c.acquisitionContext?.eventName || ''}>
                                                {c.acquisitionContext?.eventName || '-'}
                                            </span>
                                        </TableCell>
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            {c.acquisitionContext?.eventName && EVENT_DAYS[c.acquisitionContext.eventName] ? (
                                                <Select value={String(getCustomerDayIndex(c))} onValueChange={(v) => handleUpdateEventDay(c.id, c.name, c.acquisitionContext, Number(v))}>
                                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {EVENT_DAYS[c.acquisitionContext.eventName].map((dateStr, i) => (
                                                            <SelectItem key={i} value={String(i)}>Day {i + 1} ({eventDayDate(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                {emailBtn(c.email)}
                                                {phoneDisplay(c.phone)}
                                            </div>
                                        </TableCell>
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            <div className="flex gap-1">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCustomerEditDialog(c)}><Edit className="h-3.5 w-3.5" /></Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => e.stopPropagation()}><Trash2 className="h-3.5 w-3.5" /></Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader><AlertDialogTitle>Hapus {c.name}?</AlertDialogTitle><AlertDialogDescription>Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription></AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Batal</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDeleteSingleCustomer(c.id)}>Ya, Hapus</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground h-24 text-sm">Belum ada data pelanggan.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            <DataTablePagination totalItems={filteredCustomers.length} itemsPerPage={itemsPerPage} currentPage={currentPage} onPageChange={setCurrentPage} onItemsPerPageChange={(v) => { setItemsPerPage(v); setCurrentPage(1); }} />
        </FadeIn>
    );
};
