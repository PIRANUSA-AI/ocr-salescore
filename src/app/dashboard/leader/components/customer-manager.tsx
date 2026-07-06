



'use client';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Upload, Search, Download, Eye, Edit, ScanLine, Trash2, Mail, Phone, User, ShieldAlert, Users, UserPlus, Send, Filter, X, MoreVertical } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { type Customer, PIPELINE_STAGES, PipelineStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { useDashboard } from '../context/dashboard-context';
import { OcrImportDialog } from './ocr-import-dialog';
import * as XLSX from 'xlsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ExcelPreviewDialog } from './excel-preview-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmailBlastDialog } from './email-blast-dialog';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmailClientDialog } from '../../components/email-client-dialog';
import { updatePipelineStatus } from '@/app/actions/sales';
import { updateCustomerPriority } from '@/app/actions/customer';
import { FadeIn } from '@/components/ui/fade-in';
import { ExportButton } from '@/components/dashboard/export-button';
import { Skeleton } from '@/components/ui/skeleton';


const getInitials = (name: string) => {
    if (!name) return '??';
    const names = name.split(' ');
    if (names.length > 1) {
        return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

const getPriority = (customer: Customer): { level: 'High' | 'Medium' | 'Low' | 'none' | null, variant: 'destructive' | 'secondary' | 'outline' } => {
    const priorityAnswer = customer.formAnswers?.find(
        (qa) => qa.question.toLowerCase().includes('prioritas')
    )?.answer?.toLowerCase();

    switch (priorityAnswer) {
        case 'high':
            return { level: 'High', variant: 'destructive' };
        case 'medium':
            return { level: 'Medium', variant: 'secondary' };
        case 'low':
            return { level: 'Low', variant: 'outline' };
        case 'none':
            return { level: 'none', variant: 'outline' };
        default:
            return { level: null, variant: 'outline' };
    }
};

const getValidPhoneNumbers = (phone: string | undefined | null): { original: string, number: string; isValid: boolean }[] => {
    if (!phone) return [];

    const parts = phone.split(/[,/\n;&]+/);

    const results = parts.map(part => {
        let cleaned = part.replace(/[^0-9+]/g, '');

        if (cleaned.startsWith('+')) {
            cleaned = cleaned.substring(1);
        }

        if (cleaned.startsWith('0')) {
            cleaned = '62' + cleaned.substring(1);
        }
        else if (cleaned.startsWith('8') && cleaned.length >= 9 && cleaned.length <= 13 && !cleaned.startsWith('62')) {
            cleaned = '62' + cleaned;
        }

        if (!cleaned.startsWith('62')) {
            cleaned = '62' + cleaned;
        }

        const formattedNumber = `+${cleaned}`;
        const isValidWa = formattedNumber.startsWith('+628') && formattedNumber.length >= 12 && formattedNumber.length <= 16;

        return {
            original: part.trim(),
            number: formattedNumber,
            isValid: isValidWa
        };
    });

    return results.filter(r => r.number.length > 5);
};


export const CustomerManager = () => {
    const { toast } = useToast();
    const router = useRouter();
    const isMobile = useMediaQuery("(max-width: 768px)");
    const { customers, salesTeam, isLoading, refreshAllData, handleAssignSalesToEntity, openCustomerEditDialog, userProfile, handleBulkDelete, handleBulkAssign } = useDashboard();

    const [isOcrDialogOpen, setIsOcrDialogOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
    const [navigatingToId, setNavigatingToId] = useState<string | null>(null);
    const [isBlastEmailOpen, setIsBlastEmailOpen] = useState(false);
    const [emailClientState, setEmailClientState] = useState({ isOpen: false, email: '' });

    const searchParams = useSearchParams();

    // State for filters
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [pipelineFilter, setPipelineFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [salesFilter, setSalesFilter] = useState('all');

    // Sync search param from URL
    useEffect(() => {
        const query = searchParams.get('search');
        if (query !== null) {
            setSearchTerm(query);
            setCurrentPage(1);
        }
    }, [searchParams]);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

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

            const customerPriority = getPriority(c).level;
            const priorityMatch = priorityFilter === 'all' ||
                (priorityFilter === 'High' && customerPriority === 'High') ||
                (priorityFilter === 'Medium' && customerPriority === 'Medium') ||
                (priorityFilter === 'Low' && customerPriority === 'Low') ||
                (priorityFilter === 'None' && (customerPriority === null || customerPriority === 'none'));

            const salesMatch = salesFilter === 'all' ||
                (salesFilter === 'unassigned' && !c.assignedSalesId) ||
                c.assignedSalesId === salesFilter;

            return searchMatch && pipelineMatch && priorityMatch && salesMatch;
        });
    }, [customers, searchTerm, pipelineFilter, priorityFilter, salesFilter]);

    const paginatedCustomers = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return filteredCustomers.slice(startIndex, endIndex);
    }, [filteredCustomers, currentPage, itemsPerPage]);

    const pageCount = Math.ceil(filteredCustomers.length / itemsPerPage);

    const isAnyFilterActive = pipelineFilter !== 'all' || priorityFilter !== 'all' || salesFilter !== 'all';

    const resetFilters = () => {
        setPipelineFilter('all');
        setPriorityFilter('all');
        setSalesFilter('all');
        setCurrentPage(1);
    };

    const handleDownload = () => {
        if (!customers || customers.length === 0) {
            toast({
                variant: "destructive",
                title: "Tidak ada data untuk diunduh",
                description: "Silakan tambahkan pelanggan terlebih dahulu.",
            });
            return;
        }

        const dataToExport = filteredCustomers.map(c => {
            const formDetail = c.formAnswers && c.formAnswers.length > 0
                ? c.formAnswers.map(qa => `${qa.question}: ${qa.answer}`).join('\n')
                : 'Tidak ada data form.';

            return {
                'Nama': c.name,
                'Perusahaan': c.company,
                'Divisi/Jabatan': c.jobTitle,
                'Email': c.email,
                'Nomor Telfon': c.phone,
                'Form Detail': formDetail,
                'Nama Sales': c.assignedSalesName || 'Belum Ditugaskan',
                'Tanggal Input': new Date(c.createdAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);

        const range = XLSX.utils.decode_range(worksheet['!ref']!);
        worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };

        const columnWidths = [
            { wch: 30 }, { wch: 30 }, { wch: 25 }, { wch: 30 },
            { wch: 20 }, { wch: 50 }, { wch: 25 }, { wch: 20 }
        ];
        worksheet['!cols'] = columnWidths;


        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Pelanggan');

        XLSX.writeFile(workbook, `Data_Pelanggan_${userProfile?.team}_${new Date().toLocaleDateString('id-ID')}.xlsx`);

        toast({
            title: "Unduh Berhasil",
            description: `Data ${dataToExport.length} pelanggan telah diekspor ke Excel.`,
        });
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
                if (!requiredHeaders.every(h => fileHeaders.includes(h))) {
                    throw new Error(`Header Excel tidak valid. Pastikan berisi minimal: ${requiredHeaders.join(', ')}`);
                }

                if (json.length === 0) {
                    throw new Error('Tidak ada data pelanggan yang valid ditemukan di file Excel.');
                }

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
                toast({
                    variant: 'destructive',
                    title: 'Gagal Memproses File Excel',
                    description: (error as Error).message,
                });
            } finally {
                setIsUploading(false);
                if (event.target) event.target.value = '';
            }
        };
        reader.onerror = (error) => {
            toast({ variant: 'destructive', title: 'Error Membaca File', description: reader.error?.message });
            setIsUploading(false);
        }
        reader.readAsArrayBuffer(file);
    };

    const handleAssignSales = async (customerId: string, salesId: string) => {
        const salesName = salesTeam.find(s => s.id === salesId)?.name || '';
        await handleAssignSalesToEntity(customerId, salesId, salesName, 'customer');
    };

    const handleUpdatePipelineStatus = useCallback(async (customerId: string, customerName: string, newStatus: PipelineStatus) => {
        if (!userProfile) return;
        try {
            await updatePipelineStatus({
                customerId,
                customerName,
                newStatus,
                actorId: userProfile.uid,
                actorName: userProfile.name
            });
            toast({ title: 'Status Diperbarui', description: `Status untuk ${customerName} telah diubah.` })
            refreshAllData(); // Refresh to show new status
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal Memperbarui Status', description: (error as Error).message });
        }
    }, [userProfile, toast, refreshAllData]);

    const handleUpdatePriority = useCallback(async (customerId: string, newPriority: 'High' | 'Medium' | 'Low' | 'none') => {
        try {
            await updateCustomerPriority({ customerId, newPriority });
            toast({ title: 'Prioritas Diperbarui' });
            refreshAllData();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal Memperbarui Prioritas', description: (error as Error).message });
        }
    }, [toast, refreshAllData]);

    const handleDeleteSingleCustomer = async (customerId: string, customerName: string) => {
        setIsDeleting(true);
        try {
            await handleBulkDelete([customerId]);
        } catch (error) {
            // Toast for error is handled in context
        } finally {
            setIsDeleting(false);
        }
    }

    const onBulkDelete = () => {
        setIsDeleting(true);
        handleBulkDelete(selectedCustomers)
            .then(() => setSelectedCustomers([]))
            .finally(() => setIsDeleting(false));
    };

    const onBulkAssign = (salesId: string) => {
        handleBulkAssign(selectedCustomers, salesId)
            .then(() => setSelectedCustomers([]));
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedCustomers(paginatedCustomers.map(c => c.id));
        } else {
            setSelectedCustomers([]);
        }
    };

    const handleSelectRow = (customerId: string, checked: boolean) => {
        setSelectedCustomers(prev => {
            if (checked) {
                return [...prev, customerId];
            } else {
                return prev.filter(id => id !== customerId);
            }
        });
    };

    const handleNavigateToDetail = (customerId: string) => {
        setNavigatingToId(customerId);
        router.push(`/dashboard/customer/${customerId}`);
    };

    const handleEmailClick = (e: React.MouseEvent, email: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (email) {
            setEmailClientState({ isOpen: true, email: email });
        }
    };

    const selectedCustomerEmails = useMemo(() => {
        return customers.filter(c => selectedCustomers.includes(c.id)).map(c => c.email).filter(Boolean) as string[];
    }, [customers, selectedCustomers]);


    return (
        <FadeIn>
            <Card>
                <ExcelPreviewDialog
                    isOpen={isPreviewOpen}
                    onOpenChange={setIsPreviewOpen}
                    data={previewData}
                    onImportSuccess={refreshAllData}
                    creatorTeam={userProfile?.team}
                />
                <EmailBlastDialog
                    isOpen={isBlastEmailOpen}
                    onOpenChange={setIsBlastEmailOpen}
                    recipientEmails={selectedCustomerEmails}
                    recipientCount={selectedCustomers.length}
                />
                <EmailClientDialog
                    isOpen={emailClientState.isOpen}
                    onOpenChange={(isOpen) => setEmailClientState({ isOpen, email: '' })}
                    email={emailClientState.email}
                />
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="min-w-0">
                            <CardTitle className="flex flex-wrap items-center gap-2">
                                <span className="font-headline text-2xl sm:text-3xl font-bold">Customers</span>
                                {!isLoading && (
                                    <Badge variant="default">{customers.length} Customers</Badge>
                                )}
                            </CardTitle>
                            <CardDescription className="mt-1">
                                Kelola semua pelanggan tim Anda, tetapkan sales, dan impor data baru.
                            </CardDescription>
                        </div>
                        <div className='flex flex-wrap items-center gap-2 sm:flex-shrink-0'>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon" className="relative">
                                        <Filter className="h-4 w-4" />
                                        <span className="sr-only">Filter</span>
                                        {isAnyFilterActive && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-auto p-4 space-y-4" align="start">
                                    <div className='space-y-2'>
                                        <DropdownMenuLabel className='p-0'>Filter Status Pipeline</DropdownMenuLabel>
                                        <Select value={pipelineFilter} onValueChange={(value) => { setPipelineFilter(value); setCurrentPage(1); }}>
                                            <SelectTrigger className="w-full sm:w-[250px]">
                                                <SelectValue placeholder="Filter Status" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Semua Status</SelectItem>
                                                {PIPELINE_STAGES.map(stage => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className='space-y-2'>
                                        <DropdownMenuLabel className='p-0'>Filter Prioritas</DropdownMenuLabel>
                                        <Select value={priorityFilter} onValueChange={(value) => { setPriorityFilter(value); setCurrentPage(1); }}>
                                            <SelectTrigger className="w-full sm:w-[250px]">
                                                <SelectValue placeholder="Filter Prioritas" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Semua Prioritas</SelectItem>
                                                <SelectItem value="High">High</SelectItem>
                                                <SelectItem value="Medium">Medium</SelectItem>
                                                <SelectItem value="Low">Low</SelectItem>
                                                <SelectItem value="None">Tanpa Prioritas</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className='space-y-2'>
                                        <DropdownMenuLabel className='p-0'>Filter Sales</DropdownMenuLabel>
                                        <Select value={salesFilter} onValueChange={(value) => { setSalesFilter(value); setCurrentPage(1); }}>
                                            <SelectTrigger className="w-full sm:w-[250px]">
                                                <SelectValue placeholder="Filter Sales" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Semua Sales</SelectItem>
                                                <SelectItem value="unassigned">Belum Ditugaskan</SelectItem>
                                                {salesTeam.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {isAnyFilterActive && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <Button variant="ghost" size="sm" onClick={resetFilters} className="w-full">
                                                <X className="mr-2 h-4 w-4" />
                                                Hapus Semua Filter
                                            </Button>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <ExportButton team={userProfile?.team} iconOnly={isMobile} />
                            <Button
                                variant="outline"
                                size={isMobile ? "icon" : "default"}
                                onClick={() => openCustomerEditDialog(null)}
                            >
                                <PlusCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
                                {!isMobile && 'Tambah'}
                            </Button>
                        </div>
                    </div>

                    <div className="pt-4">
                        <Button
                            size="lg"
                            className="h-14 w-full text-base shadow-md shadow-primary/30 active:translate-y-px"
                            onClick={() => setIsOcrDialogOpen(true)}
                        >
                            <ScanLine className="h-5 w-5 mr-2" /> OCR
                        </Button>
                    </div>

                    <OcrImportDialog
                        isOpen={isOcrDialogOpen}
                        onOpenChange={setIsOcrDialogOpen}
                        onCustomerAdded={refreshAllData}
                        autoStartCamera
                    />

                    <div className='flex flex-col sm:flex-row items-start sm:items-center gap-2 pt-4'>
                        <div className="relative flex-grow w-full">
                            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                            <Input
                                placeholder='Cari pelanggan, perusahaan, atau telepon...'
                                className='w-full pl-9'
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                        </div>
                        {isAnyFilterActive && (
                            <Button variant="ghost" onClick={resetFilters}>
                                <X className="mr-2 h-4 w-4" /> Reset
                            </Button>
                        )}
                    </div>
                    <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-4'>
                        <div className='flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto'>
                            {selectedCustomers.length > 0 && (
                                <>
                                    <span className="text-sm font-medium text-muted-foreground self-center">{selectedCustomers.length} dipilih</span>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size={isMobile ? "icon" : "default"} className="w-full sm:w-auto flex-1">
                                                <UserPlus className={cn("h-4 w-4", !isMobile && "mr-2")} />
                                                {!isMobile && 'Bulk Assign'}
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>Tetapkan Sales</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            {salesTeam.map((sales) => (
                                                <DropdownMenuItem key={sales.id} onClick={() => onBulkAssign(sales.id)}>
                                                    {sales.name}
                                                </DropdownMenuItem>
                                            ))}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => onBulkAssign('')}>
                                                Lepas Penugasan
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" disabled={isDeleting} size={isMobile ? "icon" : "default"} className="w-full sm:w-auto flex-1">
                                                <Trash2 className={cn("h-4 w-4", !isMobile && "mr-2")} />
                                                {!isMobile && `Hapus (${selectedCustomers.length})`}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Anda Yakin?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Tindakan ini akan menghapus {selectedCustomers.length} pelanggan yang dipilih secara permanen. Tindakan ini tidak dapat dibatalkan.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
                                                <AlertDialogAction onClick={onBulkDelete} disabled={isDeleting}>
                                                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                    Ya, Hapus
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-2">
                    {/* Mobile View */}
                    <div className="md:hidden space-y-3">
                        {isLoading ? (
                            <div className="space-y-3">
                                {[...Array(4)].map((_, i) => (
                                    <Card key={i} className="p-4 space-y-3">
                                        <div className="flex items-start gap-3">
                                            <Skeleton className="h-5 w-5 rounded mt-1" />
                                            <div className="flex-1 space-y-2">
                                                <Skeleton className="h-4 w-2/5" />
                                                <Skeleton className="h-3 w-1/3" />
                                            </div>
                                            <Skeleton className="h-8 w-8 rounded" />
                                        </div>
                                        <div className="flex gap-2">
                                            <Skeleton className="h-6 w-16 rounded-full" />
                                            <Skeleton className="h-6 w-20 rounded-full" />
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : paginatedCustomers.length > 0 ? (
                            paginatedCustomers.map(c => {
                                const priority = getPriority(c);
                                const phoneNumbers = getValidPhoneNumbers(c.phone);
                                return (
                                    <Card key={c.id} className="p-4 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div className='flex items-start gap-3'>
                                                <Checkbox
                                                    className='mt-1'
                                                    checked={selectedCustomers.includes(c.id)}
                                                    onCheckedChange={(checked) => handleSelectRow(c.id, !!checked)}
                                                />
                                                <div>
                                                    <div className="font-semibold text-foreground">{c.name}</div>
                                                    <div className="text-xs text-muted-foreground">{c.company || '-'}</div>
                                                </div>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleNavigateToDetail(c.id)}>
                                                        <Eye className="mr-2 h-4 w-4" /> Lihat Detail
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openCustomerEditDialog(c)}>
                                                        <Edit className="mr-2 h-4 w-4" /> Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                                                <Trash2 className="mr-2 h-4 w-4" /> Hapus
                                                            </DropdownMenuItem>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Anda Yakin?</AlertDialogTitle>
                                                                <AlertDialogDescription>Tindakan ini akan menghapus "{c.name}" secara permanen.</AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Batal</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDeleteSingleCustomer(c.id, c.name)}>Ya, Hapus</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                        <div className="space-y-2 text-sm pl-8 mt-2">
                                            <Select
                                                value={priority.level || 'none'}
                                                onValueChange={(value) => handleUpdatePriority(c.id, value as 'High' | 'Medium' | 'Low' | 'none')}
                                            >
                                                <SelectTrigger className={cn('h-8 text-xs w-full sm:w-[150px]',
                                                    priority.variant === 'destructive' && 'bg-destructive text-destructive-foreground',
                                                    priority.variant === 'secondary' && 'bg-secondary text-secondary-foreground',
                                                )}>
                                                    <SelectValue placeholder="Atur Prioritas" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Tanpa Prioritas</SelectItem>
                                                    <SelectItem value="Low">Low</SelectItem>
                                                    <SelectItem value="Medium">Medium</SelectItem>
                                                    <SelectItem value="High">High</SelectItem>
                                                </SelectContent>
                                            </Select>

                                            <div className="flex flex-col gap-1">
                                                <button onClick={(e) => handleEmailClick(e, c.email)} className="flex items-center gap-2 text-primary hover:underline w-full text-left">
                                                    <Mail className='h-3.5 w-3.5 flex-shrink-0' />{c.email || '-'}
                                                </button>

                                                {phoneNumbers.length > 0 ? (
                                                    phoneNumbers.map((numInfo, i) => (
                                                        numInfo.isValid ? (
                                                            <a key={i} href={`https://wa.me/${numInfo.number.replace('+', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-green-600 hover:underline font-medium">
                                                                <Phone className='h-3.5 w-3.5 flex-shrink-0' /><span>{numInfo.number}</span>
                                                            </a>
                                                        ) : (
                                                            <div key={i} className="flex items-center gap-2 text-muted-foreground">
                                                                <Phone className='h-3.5 w-3.5 flex-shrink-0' /><span>{numInfo.number}</span>
                                                            </div>
                                                        )
                                                    ))
                                                ) : (
                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                        <Phone className='h-3.5 w-3.5' /><span>-</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2 text-muted-foreground pt-1">
                                                <Select
                                                    value={c.assignedSalesId || 'unassigned'}
                                                    onValueChange={(value) => handleAssignSales(c.id, value)}
                                                >
                                                    <SelectTrigger className='h-8 text-xs'>
                                                        <SelectValue placeholder="Tugaskan..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="unassigned">Belum Ditugaskan</SelectItem>
                                                        {salesTeam.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </Card>
                                )
                            })
                        ) : (
                            <div className="text-center text-muted-foreground h-24 flex items-center justify-center">Belum ada data pelanggan.</div>
                        )}
                    </div>

                    {/* Desktop View */}
                    <div className="hidden md:block border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">
                                        <Checkbox
                                            onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                            checked={selectedCustomers.length === paginatedCustomers.length && paginatedCustomers.length > 0}
                                            indeterminate={selectedCustomers.length > 0 && selectedCustomers.length < paginatedCustomers.length}
                                        />
                                    </TableHead>
                                    <TableHead>Nama</TableHead>
                                    <TableHead className="w-[180px]">Prioritas</TableHead>
                                    <TableHead>Info Kontak</TableHead>
                                    <TableHead className="w-[200px]">Status Pipeline</TableHead>
                                    <TableHead className="w-[200px]">Sales</TableHead>
                                    <TableHead className="w-[120px]">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    [...Array(6)].map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-5 w-5 rounded" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                            <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                            <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : paginatedCustomers.length > 0 ? (
                                    paginatedCustomers.map((c) => {
                                        const priority = getPriority(c);
                                        const phoneNumbers = getValidPhoneNumbers(c.phone);

                                        return (
                                            <TableRow key={c.id} data-state={selectedCustomers.includes(c.id) ? "selected" : ""}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedCustomers.includes(c.id)}
                                                        onCheckedChange={(checked) => handleSelectRow(c.id, !!checked)}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-semibold text-foreground">{c.name}</div>
                                                    <div className="text-xs text-muted-foreground">{c.company || '-'}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <Select
                                                        value={priority.level || 'none'}
                                                        onValueChange={(value) => handleUpdatePriority(c.id, value as 'High' | 'Medium' | 'Low' | 'none')}
                                                    >
                                                        <SelectTrigger className={cn('h-8 text-xs',
                                                            priority.variant === 'destructive' && 'bg-destructive text-destructive-foreground',
                                                            priority.variant === 'secondary' && 'bg-secondary text-secondary-foreground'
                                                        )}>
                                                            <SelectValue placeholder="Atur Prioritas" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">Tanpa Prioritas</SelectItem>
                                                            <SelectItem value="Low">Low</SelectItem>
                                                            <SelectItem value="Medium">Medium</SelectItem>
                                                            <SelectItem value="High">High</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col gap-1.5 text-sm">
                                                        <button onClick={(e) => handleEmailClick(e, c.email)} className="flex items-center gap-2 text-primary hover:underline w-full text-left truncate">
                                                            <Mail className='h-3.5 w-3.5 flex-shrink-0' />
                                                            <span className="truncate">{c.email || '-'}</span>
                                                        </button>
                                                        {phoneNumbers.length > 0 ? (
                                                            phoneNumbers.map((numInfo, i) => (
                                                                numInfo.isValid ? (
                                                                    <a
                                                                        key={i}
                                                                        href={`https://wa.me/${numInfo.number.replace('+', '')}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center gap-2 text-green-600 hover:text-green-700 hover:underline font-medium"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <Phone className='h-3.5 w-3.5 flex-shrink-0' />
                                                                        <span>{numInfo.number}</span>
                                                                    </a>
                                                                ) : (
                                                                    <div key={i} className="flex items-center gap-2 text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                                                                        <Phone className='h-3.5 w-3.5 flex-shrink-0' />
                                                                        <span>{numInfo.number}</span>
                                                                    </div>
                                                                )
                                                            ))
                                                        ) : (
                                                            <div className="flex items-center gap-2 text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                                                                <Phone className='h-3.5 w-3.5 flex-shrink-0' /><span>-</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Select
                                                        value={c.pipelineStatus}
                                                        onValueChange={(value) => handleUpdatePipelineStatus(c.id, c.name, value as PipelineStatus)}
                                                    >
                                                        <SelectTrigger className='h-8 text-xs'>
                                                            <SelectValue placeholder="Pilih status..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {PIPELINE_STAGES.map(stage => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell>
                                                    <Select
                                                        value={c.assignedSalesId || 'unassigned'}
                                                        onValueChange={(value) => handleAssignSales(c.id, value)}
                                                    >
                                                        <SelectTrigger className='h-8 text-xs'>
                                                            <SelectValue placeholder="Tugaskan..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="unassigned">Belum Ditugaskan</SelectItem>
                                                            {salesTeam.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell>
                                                    <div className='flex gap-1'>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleNavigateToDetail(c.id)} disabled={navigatingToId === c.id}>
                                                            {navigatingToId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openCustomerEditDialog(c)}>
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Anda Yakin?</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        Tindakan ini akan menghapus pelanggan "{c.name}" secara permanen. Tindakan ini tidak dapat dibatalkan.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
                                                                    <AlertDialogAction
                                                                        onClick={() => handleDeleteSingleCustomer(c.id, c.name)}
                                                                        disabled={isDeleting}
                                                                    >
                                                                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                                        Ya, Hapus Pelanggan
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-muted-foreground h-24">
                                            Belum ada data pelanggan yang cocok dengan filter.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <DataTablePagination
                        totalItems={filteredCustomers.length}
                        itemsPerPage={itemsPerPage}
                        currentPage={currentPage}
                        onPageChange={setCurrentPage}
                        onItemsPerPageChange={(value) => {
                            setItemsPerPage(value);
                            setCurrentPage(1);
                        }}
                    />
                </CardContent>
            </Card>
        </FadeIn>
    );
};






