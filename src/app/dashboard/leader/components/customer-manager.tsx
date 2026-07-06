'use client';
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Eye, Edit, ScanLine, Trash2, Mail, Phone, PlusCircle, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { type Customer, PIPELINE_STAGES, PipelineStatus } from '@/types';
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
import { EmailClientDialog } from '../../components/email-client-dialog';
import { updatePipelineStatus } from '@/app/actions/sales';
import { updateCustomerPriority } from '@/app/actions/customer';
import { FadeIn } from '@/components/ui/fade-in';
import { Skeleton } from '@/components/ui/skeleton';

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
    const { customers, isLoading, refreshAllData, handleAssignSalesToEntity, openCustomerEditDialog, userProfile, handleBulkDelete } = useDashboard();

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
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    useEffect(() => {
        const query = searchParams.get('search');
        if (query !== null) { setSearchTerm(query); setCurrentPage(1); }
    }, [searchParams]);

    const filteredCustomers = useMemo(() => {
        if (!customers) return [];
        return customers.filter(c => {
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
            return searchMatch && pipelineMatch;
        });
    }, [customers, searchTerm, pipelineFilter]);

    const paginatedCustomers = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredCustomers.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredCustomers, currentPage, itemsPerPage]);

    const pageCount = Math.ceil(filteredCustomers.length / itemsPerPage);
    const isAnyFilterActive = pipelineFilter !== 'all';

    const resetFilters = () => { setPipelineFilter('all'); setCurrentPage(1); };

    const handleDownload = () => {
        if (!customers || customers.length === 0) {
            toast({ variant: "destructive", title: "Tidak ada data untuk diunduh", description: "Silakan tambahkan pelanggan terlebih dahulu." });
            return;
        }
        const dataToExport = filteredCustomers.map(c => ({
            'Nama': c.name, 'Perusahaan': c.company, 'Email': c.email, 'Telepon': c.phone,
            'Status': c.pipelineStatus, 'Sales': c.assignedSalesName || '-',
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
            await updatePipelineStatus({ customerId, customerName, newStatus, actorId: userProfile.uid, actorName: userProfile.name });
            refreshAllData();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal', description: (error as Error).message });
        }
    }, [userProfile, toast, refreshAllData]);

    const handleUpdatePriority = useCallback(async (customerId: string, newPriority: 'High' | 'Medium' | 'Low' | 'none') => {
        try {
            await updateCustomerPriority({ customerId, newPriority });
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
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-lg font-semibold tracking-tight">Customers</h1>
                    <p className="text-xs text-muted-foreground">{customers?.length || 0} pelanggan terdaftar</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsOcrDialogOpen(true)}>
                        <ScanLine className="h-4 w-4 mr-1.5" />OCR
                    </Button>
                    <label className="cursor-pointer">
                        <Button variant="outline" size="sm" disabled={isUploading} asChild>
                            <span>{isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <PlusCircle className="h-4 w-4 mr-1.5" />}Import</span>
                        </Button>
                        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
                    </label>
                    <Button size="sm" onClick={() => openCustomerEditDialog(null)}>
                        <PlusCircle className="h-4 w-4 mr-1.5" />Tambah
                    </Button>
                </div>
            </div>

            <OcrImportDialog isOpen={isOcrDialogOpen} onOpenChange={(open) => setIsOcrDialogOpen(open)} onCustomerAdded={refreshAllData} startInCameraMode={!isMobile} />

            {/* Search & Filter */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Cari nama, perusahaan, telepon..." className="w-full pl-9 h-9 text-sm" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
                </div>
                <Select value={pipelineFilter} onValueChange={(v) => { setPipelineFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[140px] h-9 text-xs">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Semua Status</SelectItem>
                        {PIPELINE_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                </Select>
                {isAnyFilterActive && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={resetFilters}>
                        <X className="h-4 w-4" />
                    </Button>
                )}
                <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={handleDownload}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export
                </Button>
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
                        [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
                    ) : paginatedCustomers.length > 0 ? (
                        paginatedCustomers.map(c => (
                            <div key={c.id} className="p-3 border rounded-lg space-y-2">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-2">
                                        <Checkbox className="mt-0.5" checked={selectedCustomers.includes(c.id)} onCheckedChange={(ch) => handleSelectRow(c.id, !!ch)} />
                                        <div>
                                            <div className="font-medium text-sm">{c.name}</div>
                                            <div className="text-xs text-muted-foreground">{c.company || '-'}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleNavigateToDetail(c.id)}><Eye className="h-3.5 w-3.5" /></Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCustomerEditDialog(c)}><Edit className="h-3.5 w-3.5" /></Button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 pl-6">
                                    <Select value={c.pipelineStatus} onValueChange={(v) => handleUpdatePipelineStatus(c.id, c.name, v as PipelineStatus)}>
                                        <SelectTrigger className="h-7 text-[11px] w-[130px]"><SelectValue /></SelectTrigger>
                                        <SelectContent>{PIPELINE_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                    </Select>
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
                                        <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                                        <TableCell><Skeleton className="h-7 w-16" /></TableCell>
                                    </TableRow>
                                ))
                            ) : paginatedCustomers.length > 0 ? (
                                paginatedCustomers.map(c => (
                                    <TableRow key={c.id}>
                                        <TableCell><Checkbox checked={selectedCustomers.includes(c.id)} onCheckedChange={(ch) => handleSelectRow(c.id, !!ch)} /></TableCell>
                                        <TableCell>
                                            <div className="font-medium text-sm">{c.name}</div>
                                            <div className="text-xs text-muted-foreground">{c.company || '-'}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Select value={c.pipelineStatus} onValueChange={(v) => handleUpdatePipelineStatus(c.id, c.name, v as PipelineStatus)}>
                                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>{PIPELINE_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                {emailBtn(c.email)}
                                                {phoneDisplay(c.phone)}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-1">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleNavigateToDetail(c.id)}><Eye className="h-3.5 w-3.5" /></Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCustomerEditDialog(c)}><Edit className="h-3.5 w-3.5" /></Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
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
                                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground h-24 text-sm">Belum ada data pelanggan.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            <DataTablePagination totalItems={filteredCustomers.length} itemsPerPage={itemsPerPage} currentPage={currentPage} onPageChange={setCurrentPage} onItemsPerPageChange={(v) => { setItemsPerPage(v); setCurrentPage(1); }} />
        </FadeIn>
    );
};
